/**
 * Initial Sync API Route
 *
 * POST /api/onboarding/initial-sync
 *
 * Triggers the initial email batch analysis for a new user.
 * This is called when the user clicks "Finish Setup" in onboarding.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUEST FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "maxEmails": 50,       // Optional, default: 50
 *   "includeRead": true    // Optional, default: true
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Success (200):
 * ```json
 * {
 *   "success": true,
 *   "stats": { ... },
 *   "categories": [ ... ],
 *   "clientInsights": [ ... ],
 *   "failures": [ ... ],
 *   "suggestedActions": [ ... ]
 * }
 * ```
 *
 * Error (4xx/5xx):
 * ```json
 * {
 *   "success": false,
 *   "error": "Error message",
 *   "canRetry": true
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * IMPORTANT NOTES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - This endpoint fetches emails from Gmail for ALL connected accounts first,
 *   then runs AI analysis on the fetched emails (fixed Feb 2026 - previously
 *   it only read from the database, which was empty after account reset)
 * - Progress updates are stored in user_profiles.sync_progress for polling
 * - The frontend should poll /api/onboarding/sync-status for progress
 *
 * @module app/api/onboarding/initial-sync/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { createInitialSyncOrchestrator } from '@/services/sync';
import { INITIAL_SYNC_CONFIG } from '@/config/initial-sync';
import {
  GmailService,
  TokenManager,
  EmailParser,
} from '@/lib/gmail';
import type {
  InitialSyncRequest,
  InitialSyncResponse,
  InitialSyncError,
} from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('API:InitialSync');

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_BODY_CHARS = parseInt(process.env.MAX_BODY_CHARS || '16000', 10);

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Validate request body.
 */
function isValidRequest(body: unknown): body is InitialSyncRequest {
  if (!body || typeof body !== 'object') {
    return true; // Empty body is valid (uses defaults)
  }

  const b = body as Record<string, unknown>;

  // maxEmails must be a positive integer if provided
  if (b.maxEmails !== undefined) {
    if (typeof b.maxEmails !== 'number' || b.maxEmails < 1 || b.maxEmails > 200) {
      return false;
    }
  }

  // includeRead must be a boolean if provided
  if (b.includeRead !== undefined && typeof b.includeRead !== 'boolean') {
    return false;
  }

  return true;
}

// =============================================================================
// POST HANDLER
// =============================================================================

/**
 * POST /api/onboarding/initial-sync
 *
 * Triggers the initial email batch analysis.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<InitialSyncResponse | InitialSyncError>> {
  const startTime = Date.now();

  try {
    logger.info('Initial sync request received');

    // ─────────────────────────────────────────────────────────────────────────
    // Authentication
    // ─────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized initial sync request', {
        error: authError?.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          canRetry: false,
        },
        { status: 401 }
      );
    }

    logger.info('Authenticated user for initial sync', { userId: user.id });

    // ─────────────────────────────────────────────────────────────────────────
    // Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────
    let body: InitialSyncRequest = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      logger.warn('Invalid JSON in request body');
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    if (!isValidRequest(body)) {
      logger.warn('Invalid request body', { body });
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request parameters. maxEmails must be 1-200, includeRead must be boolean.',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Check if onboarding already completed
    // ─────────────────────────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed, initial_sync_completed_at')
      .eq('id', user.id)
      .single();

    if (profile?.initial_sync_completed_at) {
      logger.warn('Initial sync already completed', { userId: user.id });
      return NextResponse.json(
        {
          success: false,
          error: 'Initial sync has already been completed. Use settings to re-analyze.',
          canRetry: false,
        },
        { status: 409 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Get user's Gmail accounts (ALL sync-enabled, not just first)
    // ─────────────────────────────────────────────────────────────────────────
    const { data: gmailAccounts, error: accountError } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('sync_enabled', true);

    if (accountError || !gmailAccounts || gmailAccounts.length === 0) {
      logger.error('No Gmail account found', {
        userId: user.id,
        error: accountError?.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'No Gmail account connected. Please connect your Gmail account first.',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    logger.info('Found Gmail accounts for sync', {
      userId: user.id,
      accountCount: gmailAccounts.length,
      emails: gmailAccounts.map((a: { id: string; email: string }) => a.email),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Set initial sync progress so frontend polling sees activity immediately
    // (Without this, sync_progress is null during the entire Gmail fetch phase,
    // causing the frontend to show "Waiting to start..." at 0% for a long time)
    // ─────────────────────────────────────────────────────────────────────────
    await supabase
      .from('user_profiles')
      .update({
        sync_progress: {
          status: 'in_progress',
          progress: 2,
          currentStep: 'Fetching emails from Gmail...',
          discoveries: { actionItems: 0, events: 0, clientsDetected: [] },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
      .eq('id', user.id);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Fetch emails from Gmail for ALL accounts
    //
    // The orchestrator only reads from the database, so we must
    // first fetch emails from Gmail and store them in the DB.
    // This was the root cause of the "0 emails" bug after account reset.
    // ─────────────────────────────────────────────────────────────────────────
    const maxEmails = body.maxEmails ?? INITIAL_SYNC_CONFIG.maxEmails;
    const tokenManager = new TokenManager(supabase);
    const emailParser = new EmailParser();
    let totalEmailsFetched = 0;

    for (const account of gmailAccounts) {
      try {
        logger.info('Fetching emails from Gmail for account', {
          accountId: account.id,
          email: account.email,
        });

        // Get valid access token (handles refresh automatically)
        const accessToken = await tokenManager.getValidToken(account);
        const gmailService = new GmailService(accessToken, account.id);

        // Fetch message list from Gmail
        const listResponse = await gmailService.listMessages({
          maxResults: maxEmails,
          query: INITIAL_SYNC_CONFIG.excludeQuery,
        });

        const messageIds = listResponse.messages?.map((m) => m.id) || [];

        if (messageIds.length === 0) {
          logger.info('No messages found in Gmail for account', {
            accountId: account.id,
            email: account.email,
          });
          continue;
        }

        // Check which messages we already have in the database
        const { data: existing } = await supabase
          .from('emails')
          .select('gmail_id')
          .eq('user_id', user.id)
          .in('gmail_id', messageIds);

        const existingIds = new Set(
          existing?.map((e: { gmail_id: string }) => e.gmail_id) || []
        );
        const newMessageIds = messageIds.filter((id) => !existingIds.has(id));

        if (newMessageIds.length === 0) {
          logger.info('All messages already in database for account', {
            accountId: account.id,
            email: account.email,
            total: messageIds.length,
          });
          continue;
        }

        // Fetch full message content
        const messages = await gmailService.getMessages(newMessageIds);

        // Parse and store each message
        let stored = 0;
        for (const message of messages) {
          try {
            const parsed = emailParser.parse(message, MAX_BODY_CHARS);
            const insertData = emailParser.toInsertData(parsed, user.id, account.id);

            const { error: insertError } = await supabase
              .from('emails')
              .insert(insertData);

            if (insertError) {
              if (insertError.code === '23505') {
                // Unique constraint violation - already exists
                continue;
              }
              logger.warn('Failed to insert email', {
                messageId: message.id,
                error: insertError.message,
              });
            } else {
              stored++;
            }
          } catch (parseErr) {
            logger.warn('Failed to parse email', {
              messageId: message.id,
              error: parseErr instanceof Error ? parseErr.message : 'Unknown',
            });
          }
        }

        totalEmailsFetched += stored;

        // Update account sync metadata
        await supabase
          .from('gmail_accounts')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', account.id);

        logger.info('Gmail fetch complete for account', {
          accountId: account.id,
          email: account.email,
          fetched: messageIds.length,
          newStored: stored,
        });
      } catch (fetchErr) {
        // Don't fail the whole sync if one account fails - try the next one
        logger.warn('Failed to fetch emails for account, continuing with next', {
          accountId: account.id,
          email: account.email,
          error: fetchErr instanceof Error ? fetchErr.message : 'Unknown',
        });
      }
    }

    logger.info('Gmail fetch phase complete', {
      userId: user.id,
      totalEmailsFetched,
      accountsProcessed: gmailAccounts.length,
    });

    // Update progress after Gmail fetch so frontend sees we're moving forward
    await supabase
      .from('user_profiles')
      .update({
        sync_progress: {
          status: 'in_progress',
          progress: 8,
          currentStep: `Fetched ${totalEmailsFetched} emails, starting analysis...`,
          discoveries: { actionItems: 0, events: 0, clientsDetected: [] },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
      .eq('id', user.id);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Run the analysis orchestrator
    // ─────────────────────────────────────────────────────────────────────────
    const primaryAccount = gmailAccounts[0];

    const orchestrator = createInitialSyncOrchestrator({
      userId: user.id,
      gmailAccountId: primaryAccount.id,
      gmailAccountIds: gmailAccounts.map((a: { id: string; email: string }) => a.id),
      maxEmails,
      includeRead: body.includeRead ?? INITIAL_SYNC_CONFIG.includeRead,
    });

    logger.info('Starting initial sync orchestrator', {
      userId: user.id,
      accountCount: gmailAccounts.length,
      maxEmails,
      totalEmailsFetched,
    });

    // Execute the analysis
    const result = await orchestrator.execute();

    const totalTime = Date.now() - startTime;

    logger.info('Initial sync completed successfully', {
      userId: user.id,
      stats: result.stats,
      totalTimeMs: totalTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const totalTime = Date.now() - startTime;

    logger.error('Initial sync failed', {
      error: errorMessage,
      totalTimeMs: totalTime,
    });

    // Determine if error is retryable
    const isRetryable =
      errorMessage.includes('timeout') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('network');

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        canRetry: isRetryable,
        retryAfterMs: isRetryable ? 5000 : undefined,
      },
      { status: 500 }
    );
  }
}
