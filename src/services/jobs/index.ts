/**
 * Background Jobs Module
 *
 * Re-exports all scheduled job services.
 * These jobs are designed to run periodically via cron (pg_cron or Edge Function).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE JOBS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Priority Reassessment - Runs 2-3x daily to recalculate priorities
 *    - Adjusts urgency based on approaching deadlines
 *    - Boosts items from VIP clients
 *    - Surfaces stale items that need attention
 *
 * 2. Summary Generation - Eagerly generates summaries for stale users
 *    - Queries user_summary_state for stale + >1hr since last
 *    - Processes sequentially with rate limiting
 *    - Also callable per-user after sync completes
 *
 * 3. Retry Failed Analyses - Retries emails with analysis_error
 *    - Picks up emails that failed within the last 7 days
 *    - 24-hour cooldown between retries of the same email
 *    - Caps at 25 emails per run
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCHEDULING RECOMMENDATIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Priority Reassessment:
 * - Run at 6 AM (morning boost before user checks email)
 * - Run at 12 PM (midday adjustment)
 * - Run at 5 PM (end-of-day prioritization)
 *
 * Example pg_cron schedule:
 * ```sql
 * SELECT cron.schedule('priority-reassessment-morning', '0 6 * * *', $$
 *   SELECT net.http_post(
 *     'https://your-app.com/api/jobs/priority-reassessment',
 *     '{}',
 *     '{"Authorization": "Bearer <secret>"}'
 *   );
 * $$);
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import {
 *   reassessPrioritiesForUser,
 *   reassessPrioritiesForAllUsers,
 *   generateSummaryForUser,
 *   generateSummariesForStaleUsers,
 *   retryFailedAnalyses,
 * } from '@/services/jobs';
 *
 * // Run for single user (e.g., after they log in)
 * await reassessPrioritiesForUser(userId);
 *
 * // Run for all users (cron job)
 * await reassessPrioritiesForAllUsers();
 *
 * // Generate summary for a specific user (e.g., after sync)
 * await generateSummaryForUser(userId);
 *
 * // Generate summaries for all stale users (cron job)
 * await generateSummariesForStaleUsers();
 *
 * // Retry failed analyses (cron job, daily)
 * await retryFailedAnalyses();
 * ```
 *
 * @module services/jobs
 * @version 1.0.0
 * @since January 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY REASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════════

export {
  reassessPrioritiesForUser,
  reassessPrioritiesForAllUsers,
  calculatePriority,
  PRIORITY_CONFIG,
  type ReassessmentResult,
} from './priority-reassessment';

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY GENERATION (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  generateSummaryForUser,
  generateSummariesForStaleUsers,
  SUMMARY_JOB_CONFIG,
  type UserSummaryJobResult,
  type BatchSummaryJobResult,
} from './summary-generation';

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY FAILED ANALYSES (NEW - Mar 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  retryFailedAnalyses,
  RETRY_JOB_CONFIG,
  type RetryJobResult,
  type RetryJobEmailResult,
} from './retry-failed-analyses';
