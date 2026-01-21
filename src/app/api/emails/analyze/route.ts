/**
 * Email Analysis API Route
 *
 * Triggers AI analysis for unanalyzed emails. This is the critical endpoint
 * that connects the sync flow to the AI analyzer system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/emails/analyze
 *   - Triggers AI analysis for unanalyzed emails
 *   - Body: { maxEmails?: number, batchSize?: number, skipAlreadyAnalyzed?: boolean }
 *   - Returns: { success: boolean, analyzed: number, results: AnalysisStats }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Analyze up to 50 unanalyzed emails
 * const response = await fetch('/api/emails/analyze', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ maxEmails: 50 }),
 * });
 *
 * // Result:
 * {
 *   success: true,
 *   analyzed: 45,
 *   results: {
 *     successCount: 43,
 *     failureCount: 2,
 *     categorized: { action_required: 10, newsletter: 15, ... },
 *     actionsCreated: 8,
 *     tokensUsed: 15000,
 *     estimatedCost: 0.0045
 *   }
 * }
 * ```
 *
 * @module app/api/emails/analyze/route
 * @version 1.0.0
 */

import { z } from 'zod';
import { createLogger, logAI, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';
import { batchProcessor } from '@/services/processors/batch-processor';
import type { Email, Client, EmailCategory } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailAnalyzeAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema for analyze request body.
 */
const analyzeRequestSchema = z.object({
  /** Maximum emails to analyze in this request */
  maxEmails: z.number().int().min(1).max(200).optional().default(50),

  /** Batch size for parallel processing */
  batchSize: z.number().int().min(1).max(20).optional().default(10),

  /** Whether to skip already-analyzed emails (default: true) */
  skipAlreadyAnalyzed: z.boolean().optional().default(true),
});

type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AnalysisStats {
  /** Number of emails successfully analyzed */
  successCount: number;

  /** Number of emails that failed analysis */
  failureCount: number;

  /** Number of emails skipped (already analyzed) */
  skippedCount: number;

  /** Breakdown by category */
  categorized: Partial<Record<EmailCategory, number>>;

  /** Number of action items created */
  actionsCreated: number;

  /** Total tokens used */
  tokensUsed: number;

  /** Estimated cost in USD */
  estimatedCost: number;

  /** Total processing time in ms */
  processingTimeMs: number;

  /** Errors encountered */
  errors: Array<{ emailId: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER - Trigger Analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles POST requests to trigger email AI analysis.
 *
 * This endpoint:
 * 1. Authenticates the user
 * 2. Fetches unanalyzed emails from the database
 * 3. Gets user's clients for context
 * 4. Runs AI analysis on each email using batch processor
 * 5. Returns detailed analysis statistics
 */
export async function POST(request: Request) {
  const timer = logPerformance('EmailAnalyze.POST');

  try {
    // Initialize Supabase client
    const supabase = await createServerClient();

    // Require authentication
    const user = await requireAuth(supabase);
    if (user instanceof Response) return user;

    logger.start('AI analysis triggered', { userId: user.id });
    logAI.callStart({
      model: 'gpt-4.1-mini',
      type: 'batch_analysis',
      userId: user.id,
    });

    // Parse and validate request body
    let analyzeConfig: AnalyzeRequest = {
      maxEmails: 50,
      batchSize: 10,
      skipAlreadyAnalyzed: true,
    };

    try {
      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const body = await request.json();
        analyzeConfig = analyzeRequestSchema.parse(body);
      }
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        const fieldErrors: Record<string, string[]> = {};
        for (const zodError of parseError.errors) {
          const path = zodError.path.join('.') || 'body';
          if (!fieldErrors[path]) fieldErrors[path] = [];
          fieldErrors[path].push(zodError.message);
        }
        return apiError('Invalid request body', 400, fieldErrors);
      }
    }

    // Get unanalyzed emails
    const emails = await getUnanalyzedEmails(
      supabase,
      user.id,
      analyzeConfig.maxEmails,
      analyzeConfig.skipAlreadyAnalyzed
    );

    if (emails.length === 0) {
      logger.info('No emails to analyze', { userId: user.id });
      return apiResponse({
        success: true,
        analyzed: 0,
        message: 'No unanalyzed emails found',
        results: createEmptyStats(),
      });
    }

    logger.info('Found emails to analyze', {
      userId: user.id,
      emailCount: emails.length,
      batchSize: analyzeConfig.batchSize,
    });

    // Get user's clients for context
    const clients = await getActiveClients(supabase, user.id);

    // Create user context
    const context: UserContext = {
      userId: user.id,
      clients,
    };

    // Track category counts
    const categoryCounts: Partial<Record<EmailCategory, number>> = {};
    let actionsCreated = 0;

    // Run batch analysis
    const batchResult = await batchProcessor.processBatch(emails, context, {
      batchSize: analyzeConfig.batchSize,
      skipAnalyzed: analyzeConfig.skipAlreadyAnalyzed,
      onProgress: (completed, total) => {
        logger.debug('Analysis progress', { completed, total, userId: user.id });
      },
      onError: (emailId, error) => {
        logger.warn('Email analysis failed', { emailId, error, userId: user.id });
      },
    });

    // Process results to count categories and actions
    for (const [, result] of batchResult.results) {
      if (result.success && result.analysis.categorization) {
        const category = result.analysis.categorization.category;
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
      if (result.success && result.analysis.actionExtraction?.hasAction) {
        actionsCreated++;
      }
    }

    // Build statistics
    const stats: AnalysisStats = {
      successCount: batchResult.successCount,
      failureCount: batchResult.failureCount,
      skippedCount: batchResult.skippedCount,
      categorized: categoryCounts,
      actionsCreated,
      tokensUsed: batchResult.totalTokensUsed,
      estimatedCost: batchResult.estimatedCost,
      processingTimeMs: batchResult.totalTimeMs,
      errors: batchResult.errors,
    };

    // Update the analysis log
    const firstError = batchResult.errors[0];
    await createAnalysisLog(
      supabase,
      user.id,
      emails.length,
      batchResult.successCount,
      batchResult.failureCount,
      batchResult.totalTimeMs,
      firstError?.error ?? null
    );

    const durationMs = timer.end({
      userId: user.id,
      emailsAnalyzed: batchResult.successCount,
      tokensUsed: batchResult.totalTokensUsed,
    });

    logAI.callComplete({
      model: 'gpt-4.1-mini',
      tokensUsed: batchResult.totalTokensUsed,
      durationMs,
    });

    logger.success('AI analysis complete', {
      userId: user.id,
      analyzed: batchResult.successCount,
      failed: batchResult.failureCount,
      skipped: batchResult.skippedCount,
      actionsCreated,
      tokensUsed: batchResult.totalTokensUsed,
      estimatedCost: batchResult.estimatedCost,
      durationMs,
    });

    return apiResponse({
      success: true,
      analyzed: batchResult.successCount,
      results: stats,
    });

  } catch (error) {
    timer.end({ error: 'analysis_failed' });

    // Handle auth error
    if (error instanceof Response) {
      return error;
    }

    logger.error('Email analysis failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return apiError(`Email analysis failed: ${errorMessage}`, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets unanalyzed emails for a user.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param maxEmails - Maximum emails to fetch
 * @param skipAnalyzed - Whether to skip already-analyzed emails
 * @returns Array of emails to analyze
 */
async function getUnanalyzedEmails(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  maxEmails: number,
  skipAnalyzed: boolean
): Promise<Email[]> {
  let query = supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('date', { ascending: false })
    .limit(maxEmails);

  // Filter to unanalyzed emails (per DECISIONS.md: "Do NOT retry on next sync")
  if (skipAnalyzed) {
    query = query
      .is('analyzed_at', null)
      .is('analysis_error', null); // Exclude emails that previously failed analysis
  }

  const { data: emails, error } = await query;

  if (error) {
    logger.error('Failed to fetch emails for analysis', {
      userId,
      error: error.message,
    });
    throw new Error('Failed to fetch emails for analysis');
  }

  return (emails || []) as Email[];
}

/**
 * Gets active clients for a user.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Array of active clients
 */
async function getActiveClients(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string
): Promise<Client[]> {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    logger.warn('Failed to fetch clients, proceeding without client context', {
      userId,
      error: error.message,
    });
    return [];
  }

  return (clients || []) as Client[];
}

/**
 * Creates an analysis log entry.
 */
async function createAnalysisLog(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  emailsProcessed: number,
  successCount: number,
  failureCount: number,
  durationMs: number,
  errorMessage: string | null
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('sync_logs').insert({
    user_id: userId,
    sync_type: 'analysis',
    status: failureCount > 0 && successCount === 0 ? 'failed' : 'completed',
    emails_fetched: emailsProcessed,
    emails_analyzed: successCount,
    errors_count: failureCount,
    duration_ms: durationMs,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn('Failed to create analysis log', {
      userId,
      error: error.message,
    });
  }
}

/**
 * Creates empty stats for when there's nothing to analyze.
 */
function createEmptyStats(): AnalysisStats {
  return {
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    categorized: {},
    actionsCreated: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    processingTimeMs: 0,
    errors: [],
  };
}
