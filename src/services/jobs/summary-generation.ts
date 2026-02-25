/**
 * Summary Generation Job
 *
 * Batch job to generate email summaries for all users with stale summaries.
 * Designed to be called by a cron job, Edge Function, or HTTP trigger.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY A BATCH JOB?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Phase 1-2 summaries are generated lazily (on user visit). This job adds
 * eager/proactive generation so summaries are ready BEFORE the user opens
 * the app. Particularly useful for:
 *
 * 1. Users who get email throughout the day — summary is ready on next visit
 * 2. Users on mobile who want fast load times (no 2-3s generation wait)
 * 3. Scheduled digest emails (future) that need pre-generated content
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SAFEGUARDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Respects the 1-hour minimum interval (won't regenerate if < 1 hour old)
 * - Only generates for users with is_stale = true AND new emails
 * - Sequential processing per user to avoid overwhelming the AI API
 * - Comprehensive error handling — one user's failure doesn't block others
 * - Full logging with timing, cost tracking, and error reporting
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Run for all stale users (cron job)
 * import { generateSummariesForStaleUsers } from '@/services/jobs/summary-generation';
 * const results = await generateSummariesForStaleUsers();
 *
 * // Run for a single user (post-sync eager mode)
 * import { generateSummaryForUser } from '@/services/jobs/summary-generation';
 * const result = await generateSummaryForUser('user-123');
 * ```
 *
 * @module services/jobs/summary-generation
 * @since February 2026
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { generateSummary } from '@/services/summary';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SummaryGenerationJob');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the summary generation batch job.
 */
export const SUMMARY_JOB_CONFIG = {
  /**
   * Minimum time since last summary before regenerating (in ms).
   * Matches the MIN_INTERVAL_MS in summary-generator.ts.
   */
  minIntervalMs: 60 * 60 * 1000, // 1 hour

  /**
   * Maximum number of users to process per batch run.
   * Prevents runaway jobs from consuming too many resources.
   */
  maxUsersPerRun: 50,

  /**
   * Delay between processing each user (in ms).
   * Prevents overwhelming the AI API with concurrent requests.
   */
  delayBetweenUsersMs: 500,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of generating a summary for a single user.
 */
export interface UserSummaryJobResult {
  success: boolean;
  userId: string;
  was_cached: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Aggregate result of the batch summary generation job.
 */
export interface BatchSummaryJobResult {
  success: boolean;
  usersProcessed: number;
  summariesGenerated: number;
  summariesCached: number;
  failedCount: number;
  totalDurationMs: number;
  results: UserSummaryJobResult[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a summary for a single user if their summary is stale.
 *
 * This is the per-user entry point, useful for eager generation
 * immediately after a sync completes for a specific user.
 *
 * @param userId - User ID to generate summary for
 * @returns Result with success status and timing info
 *
 * @example
 * ```typescript
 * // After email sync completes
 * const result = await generateSummaryForUser(account.user_id);
 * if (result.success) {
 *   logger.info('Summary ready', { userId: account.user_id });
 * }
 * ```
 */
export async function generateSummaryForUser(
  userId: string
): Promise<UserSummaryJobResult> {
  const startTime = Date.now();

  logger.start('Generating summary for user', { userId });

  try {
    // Fetch user context for personalization
    const supabase = await createServerClient();

    const [{ data: profile }, { data: userContext }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', userId)
        .single(),
      supabase
        .from('user_context')
        .select('role, company')
        .eq('user_id', userId)
        .single(),
    ]);

    // Generate (the generateSummary function handles staleness checks internally)
    const result = await generateSummary(userId, {
      userName: profile?.full_name?.split(' ')[0] || undefined,
      role: userContext?.role || undefined,
      company: userContext?.company || undefined,
    });

    const durationMs = Date.now() - startTime;

    if (!result.success) {
      logger.error('Summary generation failed for user', {
        userId,
        error: result.error,
        durationMs,
      });
      return {
        success: false,
        userId,
        was_cached: false,
        durationMs,
        error: result.error,
      };
    }

    logger.success('Summary generated for user', {
      userId,
      was_cached: result.was_cached,
      durationMs,
    });

    return {
      success: true,
      userId,
      was_cached: result.was_cached,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    logger.error('Summary generation threw for user', {
      userId,
      error: errorMessage,
      durationMs,
    });

    return {
      success: false,
      userId,
      was_cached: false,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Generates summaries for all users with stale summary state.
 *
 * Queries user_summary_state for rows where:
 * - is_stale = true (new emails have arrived since last summary)
 * - last_summary_at < NOW() - 1 hour (respects minimum interval)
 *
 * Processes users sequentially with a small delay between each
 * to avoid overwhelming the AI API.
 *
 * @returns Aggregate result with per-user details
 *
 * @example
 * ```typescript
 * // In a cron job or Edge Function
 * const results = await generateSummariesForStaleUsers();
 * console.log(`Generated ${results.summariesGenerated} summaries`);
 * console.log(`${results.failedCount} failures`);
 * ```
 */
export async function generateSummariesForStaleUsers(): Promise<BatchSummaryJobResult> {
  const startTime = Date.now();

  logger.start('Running batch summary generation for stale users');

  const supabase = await createServerClient();

  // ─── Find users with stale summaries ──────────────────────────────────
  const cutoffTime = new Date(Date.now() - SUMMARY_JOB_CONFIG.minIntervalMs).toISOString();

  const { data: staleUsers, error: queryError } = await supabase
    .from('user_summary_state')
    .select('user_id')
    .eq('is_stale', true)
    .or(`last_summary_at.is.null,last_summary_at.lt.${cutoffTime}`)
    .limit(SUMMARY_JOB_CONFIG.maxUsersPerRun);

  if (queryError) {
    logger.error('Failed to query stale users', { error: queryError.message });
    return {
      success: false,
      usersProcessed: 0,
      summariesGenerated: 0,
      summariesCached: 0,
      failedCount: 0,
      totalDurationMs: Date.now() - startTime,
      results: [],
      errors: [`Failed to query stale users: ${queryError.message}`],
    };
  }

  if (!staleUsers || staleUsers.length === 0) {
    logger.info('No stale users found — nothing to generate');
    return {
      success: true,
      usersProcessed: 0,
      summariesGenerated: 0,
      summariesCached: 0,
      failedCount: 0,
      totalDurationMs: Date.now() - startTime,
      results: [],
      errors: [],
    };
  }

  logger.info('Found stale users for summary generation', {
    userCount: staleUsers.length,
    maxAllowed: SUMMARY_JOB_CONFIG.maxUsersPerRun,
  });

  // ─── Process each user sequentially ───────────────────────────────────
  const results: UserSummaryJobResult[] = [];

  for (let i = 0; i < staleUsers.length; i++) {
    const user = staleUsers[i];

    try {
      const result = await generateSummaryForUser(user.user_id);
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error generating summary for user', {
        userId: user.user_id,
        error: errorMessage,
      });
      results.push({
        success: false,
        userId: user.user_id,
        was_cached: false,
        durationMs: 0,
        error: errorMessage,
      });
    }

    // Small delay between users to avoid API rate limits
    if (i < staleUsers.length - 1) {
      await delay(SUMMARY_JOB_CONFIG.delayBetweenUsersMs);
    }
  }

  // ─── Aggregate results ────────────────────────────────────────────────
  const totalDurationMs = Date.now() - startTime;
  const summariesGenerated = results.filter(r => r.success && !r.was_cached).length;
  const summariesCached = results.filter(r => r.success && r.was_cached).length;
  const failedCount = results.filter(r => !r.success).length;
  const errors = results.filter(r => r.error).map(r => `User ${r.userId}: ${r.error}`);

  logger.success('Batch summary generation complete', {
    usersProcessed: results.length,
    summariesGenerated,
    summariesCached,
    failedCount,
    totalDurationMs,
  });

  return {
    success: failedCount === 0,
    usersProcessed: results.length,
    summariesGenerated,
    summariesCached,
    failedCount,
    totalDurationMs,
    results,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Awaitable delay for rate limiting between user processing.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
