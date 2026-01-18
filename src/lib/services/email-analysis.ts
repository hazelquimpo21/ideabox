/**
 * Email Analysis Service
 *
 * Provides AI analysis functionality for emails.
 * Used by the sync and analyze API routes.
 *
 * @module lib/services/email-analysis
 * @version 1.0.0
 */

import { createLogger, logAI } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { batchProcessor } from '@/services/processors/batch-processor';
import type { Email, Client } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailAnalysisService');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analysis result returned after running AI analysis.
 */
export interface AnalysisResult {
  successCount: number;
  failureCount: number;
  skippedCount: number;
  actionsCreated: number;
  tokensUsed: number;
  estimatedCost: number;
  processingTimeMs: number;
  categorized: Record<string, number>;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runs AI analysis on unanalyzed emails.
 *
 * This function:
 * 1. Fetches unanalyzed emails from the database
 * 2. Gets user's clients for context
 * 3. Runs batch AI analysis on the emails
 * 4. Returns analysis statistics
 *
 * @param userId - User ID
 * @param maxEmails - Maximum emails to analyze
 * @returns Analysis result statistics
 */
export async function runAIAnalysis(
  userId: string,
  maxEmails: number
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const supabase = await createServerClient();

  logAI.callStart({
    model: 'gpt-4.1-mini',
    type: 'sync_analysis',
    userId,
  });

  // Get unanalyzed emails
  const { data: emails, error: emailsError } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .is('analyzed_at', null)
    .eq('is_archived', false)
    .order('date', { ascending: false })
    .limit(maxEmails);

  if (emailsError) {
    logger.error('Failed to fetch emails for analysis', {
      userId,
      error: emailsError.message,
    });
    throw new Error('Failed to fetch emails for analysis');
  }

  if (!emails || emails.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      actionsCreated: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      processingTimeMs: 0,
      categorized: {},
    };
  }

  logger.info('Analyzing emails after sync', {
    userId,
    emailCount: emails.length,
  });

  // Get user's clients for context
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  const context: UserContext = {
    userId,
    clients: (clients || []) as Client[],
  };

  // Track category counts
  const categoryCounts: Record<string, number> = {};
  let actionsCreated = 0;

  // Run batch analysis
  const batchResult = await batchProcessor.processBatch(
    emails as Email[],
    context,
    {
      batchSize: 10,
      skipAnalyzed: true,
      onProgress: (completed, total) => {
        logger.debug('Analysis progress', { completed, total, userId });
      },
      onError: (emailId, error) => {
        logger.warn('Email analysis failed', { emailId, error, userId });
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

  const processingTimeMs = Date.now() - startTime;

  logAI.callComplete({
    model: 'gpt-4.1-mini',
    tokensUsed: batchResult.totalTokensUsed,
    durationMs: processingTimeMs,
  });

  logger.success('AI analysis completed', {
    userId,
    successCount: batchResult.successCount,
    failureCount: batchResult.failureCount,
    actionsCreated,
    tokensUsed: batchResult.totalTokensUsed,
    cost: batchResult.estimatedCost,
  });

  return {
    successCount: batchResult.successCount,
    failureCount: batchResult.failureCount,
    skippedCount: batchResult.skippedCount,
    actionsCreated,
    tokensUsed: batchResult.totalTokensUsed,
    estimatedCost: batchResult.estimatedCost,
    processingTimeMs,
    categorized: categoryCounts,
  };
}
