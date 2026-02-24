/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 🔄 Retry Analysis API Route
 *
 * Re-analyzes emails that previously failed AI analysis.
 * Used by the Discovery Dashboard to retry failed emails.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/emails/retry-analysis
 *   Retry AI analysis for specified email IDs
 *   Body: { emailIds: string[] }
 *   Returns: {
 *     success: boolean,
 *     results: { succeeded: number, failed: number, skipped: number },
 *     details: { emailId, success, error? }[]
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Retry failed emails:
 *   POST /api/emails/retry-analysis
 *   { "emailIds": ["uuid-1", "uuid-2", "uuid-3"] }
 *
 * @module app/api/emails/retry-analysis/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { retryAnalysisSchema } from '@/lib/api/schemas';
import { createLogger, logAI, logPerformance } from '@/lib/utils/logger';
import { emailProcessor } from '@/services/processors/email-processor';
import type { Email, Client } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

const logger = createLogger('API:RetryAnalysis');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RetryResult {
  emailId: string;
  success: boolean;
  error?: string;
  category?: string;
  tokensUsed?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/emails/retry-analysis - Retry failed analyses
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const timer = logPerformance('RetryAnalysis.POST');
  logger.start('Retry analysis request received');

  try {
    // Initialize Supabase client with user context
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, retryAnalysisSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const { emailIds } = bodyResult;

    logger.info('Processing retry analysis', {
      userId: user.id,
      emailCount: emailIds.length,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Fetch emails to retry
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id)
      .in('id', emailIds);

    if (fetchError) {
      logger.error('Failed to fetch emails for retry', { error: fetchError.message });
      return apiError('Failed to fetch emails', 500);
    }

    if (!emails || emails.length === 0) {
      logger.warn('No emails found for retry', { emailIds });
      return apiError('No emails found with the provided IDs', 404);
    }

    logger.debug('Fetched emails for retry', {
      requested: emailIds.length,
      found: emails.length,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Get user's clients for context
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const context: UserContext = {
      userId: user.id,
      clients: (clients || []) as Client[],
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Clear previous error state so emails can be re-processed
    // ─────────────────────────────────────────────────────────────────────────────
    // FIXED (Feb 2026): Previously, emails with analysis_error set were permanently
    // skipped by the email processor (skipAnalyzed default=true, and analysis_error
    // being non-null was treated as "don't retry"). Now we clear both fields before
    // re-processing so the pipeline treats them as fresh unanalyzed emails.
    const emailIdsToReset = emails.map(e => e.id);
    const { error: resetError } = await supabase
      .from('emails')
      .update({
        analyzed_at: null,
        analysis_error: null,
      })
      .in('id', emailIdsToReset);

    if (resetError) {
      logger.error('Failed to reset error state for retry', {
        emailIds: emailIdsToReset,
        error: resetError.message,
      });
      return apiError('Failed to reset emails for retry', 500);
    }

    logger.info('Cleared error state for retry', {
      emailCount: emailIdsToReset.length,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Process each email
    // ─────────────────────────────────────────────────────────────────────────────
    const results: RetryResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let totalTokens = 0;

    logAI.callStart({
      model: 'gpt-4.1-mini',
      type: 'retry_batch_analysis',
      emailCount: emails.length,
      userId: user.id,
    });

    for (const email of emails) {
      const emailTimer = logPerformance(`RetryAnalysis.email.${email.id}`);

      try {
        logger.debug('Retrying analysis for email', {
          emailId: email.id,
          subject: email.subject?.substring(0, 50),
          previousError: email.analysis_error,
          hadAnalysis: !!email.analyzed_at,
        });

        // Run analysis with skipAnalyzed=false since we want to re-process
        const result = await emailProcessor.process(email as Email, context, {
          skipAnalyzed: false,
          saveToDatabase: true,
          createActions: true,
        });

        if (result.success) {
          succeeded++;
          totalTokens += result.tokensUsed || 0;
          results.push({
            emailId: email.id,
            success: true,
            category: result.analysis?.categorization?.category,
            tokensUsed: result.tokensUsed,
          });

          logger.info('Retry succeeded', {
            emailId: email.id,
            category: result.analysis?.categorization?.category,
            tokensUsed: result.tokensUsed,
          });
        } else {
          failed++;
          results.push({
            emailId: email.id,
            success: false,
            error: result.error || 'Analysis failed',
          });

          logger.warn('Retry failed', {
            emailId: email.id,
            error: result.error,
          });
        }

        emailTimer.end({ success: result.success });

      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          emailId: email.id,
          success: false,
          error: errorMessage,
        });

        logger.error('Retry threw exception', {
          emailId: email.id,
          error: errorMessage,
        });

        emailTimer.end({ error: errorMessage });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Log completion
    // ─────────────────────────────────────────────────────────────────────────────
    const durationMs = timer.end({
      userId: user.id,
      requested: emailIds.length,
      found: emails.length,
      succeeded,
      failed,
      skipped,
      totalTokens,
    });

    logAI.callComplete({
      model: 'gpt-4.1-mini',
      tokensUsed: totalTokens,
      durationMs,
    });

    logger.success('Retry analysis complete', {
      userId: user.id,
      succeeded,
      failed,
      skipped,
      totalTokens,
      durationMs,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Return results
    // ─────────────────────────────────────────────────────────────────────────────
    return apiResponse({
      success: true,
      summary: {
        requested: emailIds.length,
        found: emails.length,
        succeeded,
        failed,
        skipped,
        totalTokensUsed: totalTokens,
        processingTimeMs: durationMs,
      },
      details: results,
    });

  } catch (error) {
    timer.end({ error: 'retry_failed' });

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in retry analysis', { error: message });
    return apiError('Internal server error', 500);
  }
}
