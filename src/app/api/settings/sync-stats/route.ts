/**
 * Sync Statistics API Route
 *
 * Returns statistics about the scheduled email sync job for the settings page.
 * Shows whether cron is running, recent sync history, and overall health.
 *
 * @module app/api/settings/sync-stats/route
 * @since January 2026
 */

import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:SyncStats');

/**
 * GET /api/settings/sync-stats
 *
 * Returns sync statistics including:
 * - Whether scheduled sync is healthy (ran in last 30 minutes)
 * - Last sync run time and status
 * - Sync counts from last 24 hours
 */
export async function GET() {
  logger.debug('Fetching sync statistics');

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }

    // Get sync statistics from the database function
    const { data: stats, error: statsError } = await supabase.rpc('get_sync_statistics', {
      p_hours: 24,
    });

    if (statsError) {
      logger.warn('Failed to fetch sync statistics', { error: statsError.message });
      // Return default stats if the function doesn't exist yet
      return apiResponse({
        isHealthy: true,
        lastRunAt: null,
        lastRunStatus: null,
        stats: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          partialRuns: 0,
          totalAccountsProcessed: 0,
          totalEmailsCreated: 0,
          avgDurationMs: 0,
        },
        syncInterval: '15 minutes',
      });
    }

    // Parse the statistics
    const statRow = Array.isArray(stats) ? stats[0] : stats;
    const lastRunAt = statRow?.last_run_at;
    const lastRunStatus = statRow?.last_run_status;

    // Determine if cron is healthy (ran successfully in last 30 minutes)
    let isHealthy = false;
    if (lastRunAt) {
      const lastRunTime = new Date(lastRunAt);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      isHealthy = lastRunTime > thirtyMinutesAgo && lastRunStatus !== 'failed';
    }

    logger.success('Sync statistics fetched', {
      isHealthy,
      lastRunAt,
      totalRuns: statRow?.total_runs || 0,
    });

    return apiResponse({
      isHealthy,
      lastRunAt,
      lastRunStatus,
      stats: {
        totalRuns: statRow?.total_runs || 0,
        successfulRuns: statRow?.successful_runs || 0,
        failedRuns: statRow?.failed_runs || 0,
        partialRuns: statRow?.partial_runs || 0,
        totalAccountsProcessed: statRow?.total_accounts_processed || 0,
        totalEmailsCreated: statRow?.total_emails_created || 0,
        avgDurationMs: Math.round(statRow?.avg_duration_ms || 0),
      },
      syncInterval: '15 minutes',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch sync statistics', { error: message });
    return apiError('Failed to fetch sync statistics', 500);
  }
}
