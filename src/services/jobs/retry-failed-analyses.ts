/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Retry Failed Analyses Job
 *
 * Batch job that automatically retries emails whose AI analysis previously failed.
 * Designed to be called by a cron job, Edge Function, or HTTP trigger.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY AUTO-RETRY?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When an email hits a TokenLimitError or transient API failure during analysis,
 * it gets permanently marked with `analysis_error` and is never retried unless
 * the user manually triggers retry from the UI. This job periodically picks up
 * those emails and re-runs the analysis pipeline.
 *
 * Retry gating (no schema changes needed):
 * - Only retries emails with analysis_error set in the last 7 days
 * - Only retries if the email hasn't been retried in the last 24 hours
 * - This gives ~7 retry attempts before giving up
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SAFEGUARDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Caps at 25 emails per run to control costs and duration
 * - 24-hour cooldown between retries of the same email
 * - 7-day window prevents infinite retries of truly broken emails
 * - Sequential processing to avoid overwhelming the AI API
 * - Per-email error handling — one failure doesn't block others
 *
 * @module services/jobs/retry-failed-analyses
 * @since March 2026
 */

import { createLogger, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { emailProcessor } from '@/services/processors/email-processor';
import type { Email, Client } from '@/types/database';
import type { UserContext } from '@/services/analyzers/types';

const logger = createLogger('RetryFailedAnalysesJob');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const RETRY_JOB_CONFIG = {
  /** Maximum emails to retry per run. */
  maxEmailsPerRun: 25,

  /** Only retry emails whose error was set within this window (ms). */
  maxErrorAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days

  /** Minimum time between retries of the same email (ms). */
  retryCooldownMs: 24 * 60 * 60 * 1000, // 24 hours

  /** Delay between processing each email (ms). */
  delayBetweenEmailsMs: 500,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetryJobEmailResult {
  emailId: string;
  userId: string;
  success: boolean;
  error?: string;
}

export interface RetryJobResult {
  success: boolean;
  emailsFound: number;
  emailsRetried: number;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
  results: RetryJobEmailResult[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retries analysis for emails that previously failed.
 *
 * Finds emails where:
 * - analysis_error IS NOT NULL (failed previously)
 * - analyzed_at IS NULL (not yet successfully analyzed)
 * - updated_at < 24 hours ago (cooldown between retries)
 * - updated_at > 7 days ago (don't retry ancient failures)
 *
 * @returns Aggregate result with per-email details
 */
export async function retryFailedAnalyses(): Promise<RetryJobResult> {
  const timer = logPerformance('RetryFailedAnalysesJob');
  const startTime = Date.now();

  logger.start('Running batch retry for failed analyses');

  const supabase = await createServerClient();

  // ─── Find emails with analysis errors within the retry window ────────
  const cooldownCutoff = new Date(Date.now() - RETRY_JOB_CONFIG.retryCooldownMs).toISOString();
  const maxAgeCutoff = new Date(Date.now() - RETRY_JOB_CONFIG.maxErrorAgeMs).toISOString();

  const { data: failedEmails, error: queryError } = await supabase
    .from('emails')
    .select('id, user_id, subject')
    .not('analysis_error', 'is', null)
    .is('analyzed_at', null)
    .lt('updated_at', cooldownCutoff)       // At least 24h since last attempt
    .gt('updated_at', maxAgeCutoff)         // No older than 7 days
    .order('updated_at', { ascending: true }) // Oldest failures first
    .limit(RETRY_JOB_CONFIG.maxEmailsPerRun);

  if (queryError) {
    logger.error('Failed to query failed emails', { error: queryError.message });
    return {
      success: false,
      emailsFound: 0,
      emailsRetried: 0,
      succeeded: 0,
      failed: 0,
      totalDurationMs: Date.now() - startTime,
      results: [],
      errors: [`Query failed: ${queryError.message}`],
    };
  }

  if (!failedEmails || failedEmails.length === 0) {
    logger.info('No failed emails found to retry');
    return {
      success: true,
      emailsFound: 0,
      emailsRetried: 0,
      succeeded: 0,
      failed: 0,
      totalDurationMs: Date.now() - startTime,
      results: [],
      errors: [],
    };
  }

  logger.info('Found failed emails to retry', {
    emailCount: failedEmails.length,
    maxAllowed: RETRY_JOB_CONFIG.maxEmailsPerRun,
  });

  // ─── Group by user for efficient context loading ─────────────────────
  const emailsByUser = new Map<string, typeof failedEmails>();
  for (const email of failedEmails) {
    const existing = emailsByUser.get(email.user_id) || [];
    existing.push(email);
    emailsByUser.set(email.user_id, existing);
  }

  // ─── Process each user's failed emails ───────────────────────────────
  const results: RetryJobEmailResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const [userId, userEmails] of emailsByUser) {
    // Load full email data + user context once per user
    const emailIds = userEmails.map(e => e.id);

    const [{ data: fullEmails }, { data: clients }] = await Promise.all([
      supabase
        .from('emails')
        .select('*')
        .in('id', emailIds),
      supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active'),
    ]);

    if (!fullEmails || fullEmails.length === 0) {
      logger.warn('Could not fetch full email data for retry', { userId, emailIds });
      continue;
    }

    const context: UserContext = {
      userId,
      clients: (clients || []) as Client[],
    };

    // Clear analysis_error so the processor treats them as fresh
    const { error: resetError } = await supabase
      .from('emails')
      .update({ analyzed_at: null, analysis_error: null })
      .in('id', emailIds);

    if (resetError) {
      logger.error('Failed to reset error state', { userId, error: resetError.message });
      for (const email of userEmails) {
        failed++;
        results.push({ emailId: email.id, userId, success: false, error: `Reset failed: ${resetError.message}` });
      }
      continue;
    }

    // Process each email
    for (const email of fullEmails) {
      try {
        const result = await emailProcessor.process(email as Email, context, {
          skipAnalyzed: false,
          saveToDatabase: true,
          createActions: true,
        });

        if (result.success) {
          succeeded++;
          results.push({ emailId: email.id, userId, success: true });
          logger.info('Auto-retry succeeded', { emailId: email.id, userId });
        } else {
          failed++;
          results.push({ emailId: email.id, userId, success: false, error: result.error || 'Analysis failed' });
          logger.warn('Auto-retry failed', { emailId: email.id, error: result.error });
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ emailId: email.id, userId, success: false, error: msg });
        logger.error('Auto-retry threw', { emailId: email.id, error: msg });
      }

      // Rate limit between emails
      await delay(RETRY_JOB_CONFIG.delayBetweenEmailsMs);
    }
  }

  // ─── Aggregate results ───────────────────────────────────────────────
  const totalDurationMs = Date.now() - startTime;
  const errors = results.filter(r => r.error).map(r => `Email ${r.emailId}: ${r.error}`);

  timer.end({ emailsRetried: results.length, succeeded, failed });

  logger.success('Batch retry complete', {
    emailsFound: failedEmails.length,
    emailsRetried: results.length,
    succeeded,
    failed,
    totalDurationMs,
  });

  return {
    success: failed === 0,
    emailsFound: failedEmails.length,
    emailsRetried: results.length,
    succeeded,
    failed,
    totalDurationMs,
    results,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
