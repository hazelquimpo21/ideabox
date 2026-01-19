/* eslint-disable max-lines, @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Email Sync API Route
 *
 * Triggers a Gmail sync operation for the authenticated user.
 * Fetches new emails from connected Gmail accounts and stores them
 * in the database for processing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/emails/sync
 *   - Triggers sync for all connected accounts
 *   - Body: { accountId?: string, fullSync?: boolean, maxResults?: number }
 *   - Returns: { success: boolean, results: SyncResult[] }
 *
 * GET /api/emails/sync/status
 *   - Gets sync status for connected accounts
 *   - Returns: { accounts: AccountSyncStatus[] }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Trigger sync for all accounts
 * const response = await fetch('/api/emails/sync', {
 *   method: 'POST',
 * });
 * const { results } = await response.json();
 *
 * // Sync specific account with full sync
 * const response = await fetch('/api/emails/sync', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     accountId: 'account-123',
 *     fullSync: true,
 *   }),
 * });
 * ```
 *
 * @module app/api/emails/sync/route
 * @version 1.0.0
 */

import { z } from 'zod';
import { createLogger, logSync, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';
import {
  GmailService,
  TokenManager,
  EmailParser,
  GmailSyncError,
} from '@/lib/gmail';
import { runAIAnalysis } from '@/lib/services/email-analysis';
import type { SyncResult } from '@/lib/gmail';
import type { GmailAccount } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailSyncAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema for sync request body.
 */
const syncRequestSchema = z.object({
  /** Optional: Sync only a specific account */
  accountId: z.string().uuid().optional(),

  /** Whether to do a full sync (ignore history ID) */
  fullSync: z.boolean().optional().default(false),

  /** Maximum messages to fetch per account */
  maxResults: z.number().int().min(1).max(500).optional().default(100),

  /** Query filter for messages (Gmail search syntax) */
  query: z.string().optional(),

  /** Whether to trigger AI analysis after sync (default: true for new users) */
  runAnalysis: z.boolean().optional().default(true),

  /** Maximum emails to analyze (only used if runAnalysis is true) */
  analysisMaxEmails: z.number().int().min(1).max(200).optional().default(50),
});

type SyncRequest = z.infer<typeof syncRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum body characters to store.
 * This is a cost optimization for AI analysis.
 */
const MAX_BODY_CHARS = parseInt(process.env.MAX_BODY_CHARS || '16000', 10);

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER - Trigger Sync
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles POST requests to trigger email sync.
 *
 * This endpoint:
 * 1. Authenticates the user (or validates service key for cron/webhook calls)
 * 2. Gets connected Gmail accounts
 * 3. For each account, fetches new messages from Gmail
 * 4. Parses and stores messages in the database
 * 5. Returns sync results
 *
 * AUTHENTICATION MODES:
 * - Normal users: Uses Supabase session authentication
 * - Service calls: Uses X-Service-Key header (for Edge Functions, cron jobs)
 *
 * SERVICE CALL FORMAT:
 * ```
 * POST /api/emails/sync
 * Headers: { "X-Service-Key": "your-internal-service-key" }
 * Body: { "accountId": "uuid-of-specific-account" }
 * ```
 */
export async function POST(request: Request) {
  const timer = logPerformance('EmailSync.POST');

  try {
    // Initialize Supabase client
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────────
    // AUTHENTICATION: Support both user session and service key
    // ─────────────────────────────────────────────────────────────────────────────
    const serviceKey = request.headers.get('X-Service-Key');
    const expectedServiceKey = process.env.INTERNAL_SERVICE_KEY;

    let userId: string;
    let isServiceCall = false;
    let preloadedBody: Record<string, unknown> | null = null;

    if (serviceKey && expectedServiceKey && serviceKey === expectedServiceKey) {
      // ─────────────────────────────────────────────────────────────────────────
      // Service-to-service call (from Edge Function or cron job)
      // ─────────────────────────────────────────────────────────────────────────
      isServiceCall = true;

      // For service calls, we need to get the accountId from the request body
      // Clone the request so we can read the body twice
      const clonedRequest = request.clone();

      try {
        const contentType = clonedRequest.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          preloadedBody = await clonedRequest.json();
        }
      } catch {
        // Empty body - will fail validation below
      }

      const accountId = preloadedBody?.accountId as string | undefined;

      if (!accountId) {
        logger.warn('Service call missing accountId in request body');
        return apiError('accountId is required for service calls', 400);
      }

      // Fetch the account to get the user_id (service role bypasses RLS)
      const { data: account, error: accountError } = await supabase
        .from('gmail_accounts')
        .select('user_id, email')
        .eq('id', accountId)
        .single();

      if (accountError || !account) {
        logger.warn('Account not found for service call', {
          accountId,
          error: accountError?.message,
        });
        return apiError('Account not found', 404);
      }

      userId = account.user_id;
      logger.start('Email sync triggered (service call)', {
        userId: userId.substring(0, 8) + '...',
        accountId,
        email: account.email,
      });

    } else {
      // ─────────────────────────────────────────────────────────────────────────
      // Normal user authentication via Supabase session
      // ─────────────────────────────────────────────────────────────────────────
      const authResult = await requireAuth(supabase);
      if (authResult instanceof Response) return authResult;

      userId = authResult.id;
      logger.start('Email sync triggered', { userId });
    }

    // Create a user object for backwards compatibility with existing code
    const user = { id: userId };

    // ─────────────────────────────────────────────────────────────────────────────
    // PARSE REQUEST BODY
    // ─────────────────────────────────────────────────────────────────────────────
    let syncConfig: SyncRequest = {
      fullSync: false,
      maxResults: 100,
      runAnalysis: true,
      analysisMaxEmails: 50,
    };

    try {
      // Use preloaded body if available (service call), otherwise parse fresh
      if (preloadedBody) {
        syncConfig = syncRequestSchema.parse(preloadedBody);
      } else {
        const contentType = request.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const body = await request.json();
          syncConfig = syncRequestSchema.parse(body);
        }
      }
    } catch (parseError: unknown) {
      // If body parsing fails, continue with defaults
      if (parseError instanceof z.ZodError) {
        // Convert Zod errors to our error format
        const fieldErrors: Record<string, string[]> = {};
        for (const zodError of parseError.errors) {
          const path = zodError.path.join('.') || 'body';
          if (!fieldErrors[path]) fieldErrors[path] = [];
          fieldErrors[path].push(zodError.message);
        }
        return apiError('Invalid request body', 400, fieldErrors);
      }
      // For non-Zod errors, continue with defaults (likely JSON parse error)
    }

    // Log if this is a service call for monitoring
    if (isServiceCall) {
      logger.debug('Service call sync config', {
        accountId: syncConfig.accountId,
        maxResults: syncConfig.maxResults,
        runAnalysis: syncConfig.runAnalysis,
      });
    }

    // Get Gmail accounts for this user
    const accounts = await getGmailAccounts(supabase, user.id, syncConfig.accountId);

    if (accounts.length === 0) {
      return apiError('No Gmail accounts found', 404);
    }

    logger.info('Found Gmail accounts to sync', {
      userId: user.id,
      accountCount: accounts.length,
    });

    // Initialize managers
    const tokenManager = new TokenManager(supabase);
    const emailParser = new EmailParser();

    // Sync each account
    const results: Array<{ accountId: string; email: string; result: SyncResult }> = [];

    for (const account of accounts) {
      logSync.accountStart({
        accountId: account.id,
        email: account.email,
      });

      try {
        const result = await syncAccount(
          supabase,
          account,
          user.id,
          tokenManager,
          emailParser,
          syncConfig
        );

        results.push({
          accountId: account.id,
          email: account.email,
          result,
        });

        logSync.accountComplete({
          accountId: account.id,
          email: account.email,
          count: result.messagesCreated,
          durationMs: result.durationMs,
        });
      } catch (error) {
        logger.error('Account sync failed', {
          accountId: account.id,
          email: account.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Create a failure result for this account
        results.push({
          accountId: account.id,
          email: account.email,
          result: {
            success: false,
            messagesFetched: 0,
            messagesCreated: 0,
            messagesSkipped: 0,
            messagesFailed: 0,
            durationMs: 0,
            errors: [{
              messageId: 'N/A',
              error: error instanceof Error ? error.message : 'Unknown error',
            }],
          },
        });
      }
    }

    // Calculate totals
    const totals = {
      success: results.every((r) => r.result.success),
      accountsSynced: results.length,
      totalFetched: results.reduce((sum, r) => sum + r.result.messagesFetched, 0),
      totalCreated: results.reduce((sum, r) => sum + r.result.messagesCreated, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.result.messagesSkipped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.result.messagesFailed, 0),
    };

    logger.success('Email sync complete', {
      userId: user.id,
      ...totals,
    });

    // Run AI analysis if requested and we have new emails
    let analysisResult = null;
    if (syncConfig.runAnalysis && totals.totalCreated > 0) {
      logger.start('Starting AI analysis after sync', {
        userId: user.id,
        emailsToAnalyze: Math.min(totals.totalCreated, syncConfig.analysisMaxEmails),
      });

      try {
        analysisResult = await runAIAnalysis(
          user.id,
          syncConfig.analysisMaxEmails
        );

        logger.success('AI analysis complete after sync', {
          userId: user.id,
          analyzed: analysisResult.successCount,
          actionsCreated: analysisResult.actionsCreated,
        });
      } catch (analysisError) {
        // Don't fail the sync if analysis fails - just log it
        logger.error('AI analysis failed after sync', {
          userId: user.id,
          error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        });

        analysisResult = {
          error: analysisError instanceof Error ? analysisError.message : 'Analysis failed',
          successCount: 0,
          failureCount: 0,
          actionsCreated: 0,
        };
      }
    }

    const durationMs = timer.end({
      userId: user.id,
      ...totals,
      analysisRun: !!analysisResult,
    });

    return apiResponse({
      success: totals.success,
      totals,
      results,
      analysis: analysisResult,
      durationMs,
    });
  } catch (error) {
    timer.end({ error: 'sync_failed' });

    // Handle specific error types
    if (error instanceof Response) {
      // This is an auth error from requireAuth
      return error;
    }

    logger.error('Email sync failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return apiError(`Email sync failed: ${errorMessage}`, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets Gmail accounts for a user.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param accountId - Optional specific account ID
 * @returns Array of Gmail accounts
 */
async function getGmailAccounts(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  accountId?: string
): Promise<GmailAccount[]> {
  let query = supabase
    .from('gmail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('sync_enabled', true);

  // Filter to specific account if provided
  if (accountId) {
    query = query.eq('id', accountId);
  }

  const { data: accounts, error } = await query;

  if (error) {
    logger.error('Failed to fetch Gmail accounts', {
      userId,
      error: error.message,
    });
    throw new Error('Failed to fetch Gmail accounts');
  }

  return accounts || [];
}

/**
 * Syncs a single Gmail account.
 *
 * This function:
 * 1. Gets a valid access token
 * 2. Fetches message list from Gmail
 * 3. Fetches full message content
 * 4. Parses and saves to database
 * 5. Updates sync metadata
 *
 * @param supabase - Supabase client
 * @param account - Gmail account
 * @param userId - User ID
 * @param tokenManager - Token manager instance
 * @param emailParser - Email parser instance
 * @param config - Sync configuration
 * @returns Sync result
 */
async function syncAccount(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  account: GmailAccount,
  userId: string,
  tokenManager: TokenManager,
  emailParser: EmailParser,
  config: SyncRequest
): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: Array<{ messageId: string; error: string }> = [];

  let messagesFetched = 0;
  let messagesCreated = 0;
  let messagesSkipped = 0;
  let messagesFailed = 0;
  let newHistoryId: string | undefined;

  try {
    // Step 1: Get valid access token
    // The token manager handles refresh if needed
    const accessToken = await tokenManager.getValidToken(account);

    // Step 2: Create Gmail service
    const gmailService = new GmailService(accessToken, account.id);

    // Step 3: Fetch message list from All Mail
    // We use an empty labelIds to get all mail (not just inbox)
    // The default query excludes spam, trash, and drafts
    const listResponse = await gmailService.listMessages({
      maxResults: config.maxResults,
      query: config.query,
      // Empty labelIds = All Mail (default behavior)
    });

    const messageIds = listResponse.messages?.map((m) => m.id) || [];
    messagesFetched = messageIds.length;

    logger.info('Fetched message list', {
      accountId: account.id,
      messageCount: messagesFetched,
    });

    if (messagesFetched === 0) {
      // No messages to process
      return {
        success: true,
        messagesFetched: 0,
        messagesCreated: 0,
        messagesSkipped: 0,
        messagesFailed: 0,
        durationMs: Date.now() - startTime,
        errors: [],
      };
    }

    // Step 4: Check which messages we already have
    const existingGmailIds = await getExistingGmailIds(
      supabase,
      userId,
      messageIds
    );

    const newMessageIds = messageIds.filter(
      (id) => !existingGmailIds.has(id)
    );
    messagesSkipped = messagesFetched - newMessageIds.length;

    logger.info('Filtering new messages', {
      accountId: account.id,
      total: messagesFetched,
      existing: messagesSkipped,
      new: newMessageIds.length,
    });

    // Step 5: Fetch full content for new messages
    if (newMessageIds.length > 0) {
      const messages = await gmailService.getMessages(newMessageIds);

      // Step 6: Parse and save messages
      for (const message of messages) {
        try {
          // Parse the Gmail message
          const parsed = emailParser.parse(message, MAX_BODY_CHARS);

          // Convert to database format
          const insertData = emailParser.toInsertData(
            parsed,
            userId,
            account.id
          );

          // Insert into database
          const { error: insertError } = await supabase
            .from('emails')
            .insert(insertData);

          if (insertError) {
            // Check if it's a duplicate error (might have been synced by another process)
            if (insertError.code === '23505') {
              // Unique violation
              messagesSkipped++;
              logger.debug('Message already exists, skipping', {
                messageId: message.id,
              });
            } else {
              throw insertError;
            }
          } else {
            messagesCreated++;
          }

          // Track history ID for incremental sync
          if (message.historyId) {
            if (!newHistoryId || message.historyId > newHistoryId) {
              newHistoryId = message.historyId;
            }
          }
        } catch (parseError) {
          messagesFailed++;
          errors.push({
            messageId: message.id,
            error: parseError instanceof Error ? parseError.message : 'Parse failed',
          });

          logger.warn('Failed to process message', {
            accountId: account.id,
            messageId: message.id,
            error: parseError instanceof Error ? parseError.message : 'Unknown',
          });
        }
      }
    }

    // Step 7: Update account sync metadata
    await updateAccountSyncStatus(
      supabase,
      account.id,
      newHistoryId || account.last_history_id || undefined
    );

    // Step 8: Create sync log entry
    await createSyncLog(
      supabase,
      userId,
      account.id,
      'incremental',
      'completed',
      messagesFetched,
      messagesCreated,
      errors.length,
      Date.now() - startTime
    );

    return {
      success: true,
      messagesFetched,
      messagesCreated,
      messagesSkipped,
      messagesFailed,
      historyId: newHistoryId,
      durationMs: Date.now() - startTime,
      errors,
    };
  } catch (error) {
    // Log the sync failure
    await createSyncLog(
      supabase,
      userId,
      account.id,
      config.fullSync ? 'full' : 'incremental',
      'failed',
      messagesFetched,
      messagesCreated,
      errors.length + 1,
      Date.now() - startTime,
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Wrap in GmailSyncError for proper error handling
    throw new GmailSyncError(
      error instanceof Error ? error.message : 'Sync failed',
      { accountId: account.id },
      messagesFetched,
      'fetch'
    );
  }
}

/**
 * Gets set of Gmail IDs that already exist in the database.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param gmailIds - Gmail message IDs to check
 * @returns Set of existing Gmail IDs
 */
async function getExistingGmailIds(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  gmailIds: string[]
): Promise<Set<string>> {
  if (gmailIds.length === 0) {
    return new Set();
  }

  const { data: existing } = await supabase
    .from('emails')
    .select('gmail_id')
    .eq('user_id', userId)
    .in('gmail_id', gmailIds);

  return new Set(existing?.map((e: { gmail_id: string }) => e.gmail_id) || []);
}

/**
 * Updates the Gmail account sync status.
 *
 * @param supabase - Supabase client
 * @param accountId - Account ID
 * @param historyId - New history ID for incremental sync
 */
async function updateAccountSyncStatus(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  accountId: string,
  historyId?: string
): Promise<void> {
  const { error } = await supabase
    .from('gmail_accounts')
    .update({
      last_sync_at: new Date().toISOString(),
      ...(historyId && { last_history_id: historyId }),
    })
    .eq('id', accountId);

  if (error) {
    logger.warn('Failed to update account sync status', {
      accountId,
      error: error.message,
    });
  }
}

/**
 * Creates a sync log entry.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param accountId - Gmail account ID
 * @param syncType - Type of sync (full or incremental)
 * @param status - Sync status
 * @param emailsFetched - Number of emails fetched
 * @param emailsAnalyzed - Number of emails saved
 * @param errorsCount - Number of errors
 * @param durationMs - Duration in milliseconds
 * @param errorMessage - Optional error message
 */
async function createSyncLog(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  accountId: string,
  syncType: 'full' | 'incremental',
  status: 'started' | 'completed' | 'failed',
  emailsFetched: number,
  emailsAnalyzed: number,
  errorsCount: number,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase.from('sync_logs').insert({
    user_id: userId,
    gmail_account_id: accountId,
    sync_type: syncType,
    status,
    emails_fetched: emailsFetched,
    emails_analyzed: emailsAnalyzed,
    errors_count: errorsCount,
    duration_ms: durationMs,
    error_message: errorMessage || null,
    completed_at: status !== 'started' ? new Date().toISOString() : null,
  });

  if (error) {
    logger.warn('Failed to create sync log', {
      userId,
      accountId,
      error: error.message,
    });
  }
}

