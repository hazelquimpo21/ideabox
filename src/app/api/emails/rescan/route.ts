/**
 * Email Rescan API Route
 *
 * Triggers a rescan (re-analysis) of the most recent emails.
 * This endpoint clears previous analysis results and forces re-analysis,
 * useful for testing AI analyzer changes or re-processing emails after
 * updating user context.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/emails/rescan
 *   - Clears analysis data and re-analyzes recent emails
 *   - Body: { maxEmails?: number } (default: 50)
 *   - Returns: { success: boolean, results: RescanStats }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Rescan the 50 most recent emails
 * const response = await fetch('/api/emails/rescan', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ maxEmails: 50 }),
 * });
 * ```
 *
 * @module app/api/emails/rescan/route
 * @version 1.0.0
 */

import { z } from 'zod';
import { createLogger, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';
import { batchProcessor } from '@/services/processors/batch-processor';
import type { Email, Client, EmailCategory } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailRescanAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema for rescan request body.
 */
const rescanRequestSchema = z.object({
  /** Maximum emails to rescan (default: 50) */
  maxEmails: z.number().int().min(1).max(100).optional().default(50),
});

type RescanRequest = z.infer<typeof rescanRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RescanStats {
  /** Number of emails that had analysis cleared */
  clearedCount: number;

  /** Number of emails successfully re-analyzed */
  successCount: number;

  /** Number of emails that failed re-analysis */
  failureCount: number;

  /** Breakdown by category after re-analysis */
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
// POST HANDLER - Trigger Rescan
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles POST requests to trigger email rescan.
 *
 * This endpoint:
 * 1. Authenticates the user
 * 2. Fetches the most recent emails (regardless of analysis status)
 * 3. Clears their analysis data (analyzed_at, analysis_error, category, etc.)
 * 4. Runs AI analysis on all of them
 * 5. Returns detailed rescan statistics
 */
export async function POST(request: Request) {
  const timer = logPerformance('EmailRescan.POST');

  try {
    // Initialize Supabase client
    const supabase = await createServerClient();

    // Require authentication
    const user = await requireAuth(supabase);
    if (user instanceof Response) return user;

    logger.start('Email rescan triggered', { userId: user.id });

    // Parse and validate request body
    let rescanConfig: RescanRequest = {
      maxEmails: 50,
    };

    try {
      const contentType = request.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const body = await request.json();
        rescanConfig = rescanRequestSchema.parse(body);
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

    // Step 1: Get the most recent emails (regardless of analysis status)
    const { data: recentEmails, error: fetchError } = await supabase
      .from('emails')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('date', { ascending: false })
      .limit(rescanConfig.maxEmails);

    if (fetchError) {
      logger.error('Failed to fetch emails for rescan', {
        userId: user.id,
        error: fetchError.message,
      });
      return apiError('Failed to fetch emails', 500);
    }

    if (!recentEmails || recentEmails.length === 0) {
      logger.info('No emails to rescan', { userId: user.id });
      return apiResponse({
        success: true,
        rescanned: 0,
        message: 'No emails found to rescan',
        results: createEmptyStats(),
      });
    }

    const emailIds = recentEmails.map((e) => e.id);

    logger.info('Found emails to rescan', {
      userId: user.id,
      emailCount: emailIds.length,
    });

    // Step 2: Clear analysis data for these emails
    // Category is temporarily null during re-analysis — the analyzer always assigns a valid one.
    // This resets analyzed_at, analysis_error, category, summary, quick_action, labels
    const { error: clearError } = await supabase
      .from('emails')
      .update({
        analyzed_at: null,
        analysis_error: null,
        category: null,
        summary: null,
        quick_action: null,
        labels: [],
      })
      .in('id', emailIds);

    if (clearError) {
      logger.error('Failed to clear analysis data', {
        userId: user.id,
        error: clearError.message,
      });
      return apiError('Failed to clear previous analysis', 500);
    }

    logger.info('Cleared analysis data', {
      userId: user.id,
      clearedCount: emailIds.length,
    });

    // Step 3: Delete existing actions for these emails so they can be re-created
    const { error: deleteActionsError } = await supabase
      .from('actions')
      .delete()
      .in('email_id', emailIds);

    if (deleteActionsError) {
      logger.warn('Failed to delete existing actions', {
        userId: user.id,
        error: deleteActionsError.message,
      });
      // Continue anyway - non-critical
    }

    // Step 4: Delete existing extracted_dates for these emails
    const { error: deleteDatesError } = await supabase
      .from('extracted_dates')
      .delete()
      .in('email_id', emailIds);

    if (deleteDatesError) {
      logger.warn('Failed to delete existing extracted dates', {
        userId: user.id,
        error: deleteDatesError.message,
      });
      // Continue anyway - non-critical
    }

    // Step 5: Fetch full email data for analysis
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('*')
      .in('id', emailIds)
      .order('date', { ascending: false });

    if (emailsError || !emails) {
      logger.error('Failed to fetch full email data', {
        userId: user.id,
        error: emailsError?.message,
      });
      return apiError('Failed to fetch emails for analysis', 500);
    }

    // Step 6: Get user's clients for context
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    // Create user context
    const context: UserContext = {
      userId: user.id,
      clients: (clients || []) as Client[],
    };

    // Step 7: Run batch analysis (with skipAnalyzed: false to force re-analysis)
    const categoryCounts: Partial<Record<EmailCategory, number>> = {};
    let actionsCreated = 0;

    const batchResult = await batchProcessor.processBatch(
      emails as Email[],
      context,
      {
        batchSize: 10,
        skipAnalyzed: false, // Force re-analysis
        onProgress: (completed, total) => {
          logger.debug('Rescan progress', { completed, total, userId: user.id });
        },
        onError: (emailId, error) => {
          logger.warn('Email rescan failed', { emailId, error, userId: user.id });
        },
      }
    );

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
    const stats: RescanStats = {
      clearedCount: emailIds.length,
      successCount: batchResult.successCount,
      failureCount: batchResult.failureCount,
      categorized: categoryCounts,
      actionsCreated,
      tokensUsed: batchResult.totalTokensUsed,
      estimatedCost: batchResult.estimatedCost,
      processingTimeMs: batchResult.totalTimeMs,
      errors: batchResult.errors,
    };

    const durationMs = timer.end({
      userId: user.id,
      emailsRescanned: batchResult.successCount,
      tokensUsed: batchResult.totalTokensUsed,
    });

    logger.success('Email rescan complete', {
      userId: user.id,
      cleared: emailIds.length,
      analyzed: batchResult.successCount,
      failed: batchResult.failureCount,
      actionsCreated,
      durationMs,
    });

    return apiResponse({
      success: true,
      rescanned: batchResult.successCount,
      results: stats,
    });
  } catch (error) {
    timer.end({ error: 'rescan_failed' });

    // Handle auth error
    if (error instanceof Response) {
      return error;
    }

    logger.error('Email rescan failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return apiError(`Email rescan failed: ${errorMessage}`, 500);
  }
}

/**
 * Creates empty stats for when there's nothing to rescan.
 */
function createEmptyStats(): RescanStats {
  return {
    clearedCount: 0,
    successCount: 0,
    failureCount: 0,
    categorized: {},
    actionsCreated: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    processingTimeMs: 0,
    errors: [],
  };
}
