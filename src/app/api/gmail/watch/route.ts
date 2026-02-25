/**
 * Gmail Watch Management API Route
 *
 * Renews expiring Gmail push notification watches and sets up watches
 * for newly connected accounts. Called by the renew-watches Edge Function
 * (via pg_cron every 6 hours) or manually.
 *
 * POST /api/gmail/watch
 *   - Renews expiring watches + sets up missing watches
 *   - Auth: User session OR X-Service-Key (for Edge Function)
 *   - Returns: { renewed, setupNew, failed, results }
 *
 * @module app/api/gmail/watch/route
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';
import { gmailWatchService } from '@/lib/gmail/watch-service';

const logger = createLogger('WatchManager');

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Authenticate: support both user session and service key
    // ─────────────────────────────────────────────────────────────────────────
    const serviceKey = request.headers.get('X-Service-Key');
    const expectedServiceKey = process.env.INTERNAL_SERVICE_KEY;

    let isServiceCall = false;

    if (serviceKey && expectedServiceKey && serviceKey === expectedServiceKey) {
      isServiceCall = true;
      logger.start('Watch management triggered (service call)');
    } else {
      const authResult = await requireAuth(supabase);
      if (authResult instanceof Response) return authResult;
      logger.start('Watch management triggered (user)', { userId: authResult.id });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Renew expiring watches
    // ─────────────────────────────────────────────────────────────────────────
    let renewResults;
    try {
      renewResults = await gmailWatchService.renewExpiringWatches();
    } catch (error) {
      logger.error('Failed to renew watches', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      renewResults = [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Set up missing watches
    // ─────────────────────────────────────────────────────────────────────────
    let setupResults;
    try {
      setupResults = await gmailWatchService.setupMissingWatches();
    } catch (error) {
      logger.error('Failed to setup missing watches', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setupResults = [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Summarize results
    // ─────────────────────────────────────────────────────────────────────────
    const renewed = renewResults.filter(r => r.success).length;
    const setupNew = setupResults.filter(r => r.success).length;
    const failed =
      renewResults.filter(r => !r.success).length +
      setupResults.filter(r => !r.success).length;

    const durationMs = Date.now() - startTime;

    logger.success('Watch management completed', {
      renewed,
      setupNew,
      failed,
      durationMs,
    });

    return apiResponse({
      renewed,
      setupNew,
      failed,
      durationMs,
      results: {
        renewals: renewResults,
        setups: setupResults,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Watch management failed', { error: errorMessage });
    return apiError(errorMessage, 500);
  }
}
