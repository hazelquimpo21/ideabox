/**
 * Retry Failed Analyses Job — HTTP Trigger
 *
 * POST /api/jobs/retry-failed-analyses
 *
 * Triggers the auto-retry job that re-processes emails with analysis_error.
 * Designed to be called by pg_cron via net.http_post.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUTHENTICATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Uses CRON_SECRET Bearer token authentication (same pattern as Edge Functions).
 * Header: Authorization: Bearer {CRON_SECRET}
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCHEDULING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Recommended: Run once daily (e.g., 3 AM when traffic is low).
 *
 * ```sql
 * SELECT cron.schedule('retry-failed-analyses', '0 3 * * *', $$
 *   SELECT net.http_post(
 *     'https://your-app.com/api/jobs/retry-failed-analyses',
 *     '{}',
 *     '{"Authorization": "Bearer <CRON_SECRET>"}'
 *   );
 * $$);
 * ```
 *
 * @module app/api/jobs/retry-failed-analyses/route
 * @since March 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { retryFailedAnalyses } from '@/services/jobs';

const logger = createLogger('API:RetryFailedAnalysesJob');

export async function POST(request: NextRequest) {
  // ─── Authenticate via CRON_SECRET ──────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn('Unauthorized job trigger attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Run the job ───────────────────────────────────────────────────────
  logger.start('Retry failed analyses job triggered via HTTP');

  try {
    const result = await retryFailedAnalyses();

    logger.success('Retry failed analyses job completed', {
      emailsFound: result.emailsFound,
      succeeded: result.succeeded,
      failed: result.failed,
      totalDurationMs: result.totalDurationMs,
    });

    return NextResponse.json({
      success: result.success,
      emailsFound: result.emailsFound,
      emailsRetried: result.emailsRetried,
      succeeded: result.succeeded,
      failed: result.failed,
      totalDurationMs: result.totalDurationMs,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Retry failed analyses job threw', { error: message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
