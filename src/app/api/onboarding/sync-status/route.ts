/**
 * Sync Status API Route
 *
 * GET /api/onboarding/sync-status
 *
 * Returns the current status of the initial sync operation.
 * Used by the frontend to poll for progress during the loading screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "status": "in_progress",
 *   "progress": 65,
 *   "currentStep": "Analyzing emails... (25/50)",
 *   "discoveries": {
 *     "actionItems": 5,
 *     "events": 1,
 *     "clientsDetected": ["Acme Corp"]
 *   },
 *   "result": null  // Only populated when status === "completed"
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - 401: User not authenticated
 * - 404: No sync progress found (hasn't started yet)
 * - 500: Server error
 *
 * @module app/api/onboarding/sync-status/route
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import type { SyncProgressResponse, StoredSyncProgress } from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('API:SyncStatus');

// =============================================================================
// GET HANDLER
// =============================================================================

/**
 * GET /api/onboarding/sync-status
 *
 * Returns the current sync progress for the authenticated user.
 */
export async function GET(): Promise<NextResponse<SyncProgressResponse | { error: string }>> {
  try {
    logger.debug('Sync status request received');

    // ─────────────────────────────────────────────────────────────────────────
    // Authentication
    // ─────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized sync status request', {
        error: authError?.message,
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fetch sync progress from user_profiles
    // ─────────────────────────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('sync_progress, onboarding_completed')
      .eq('id', user.id)
      .single();

    if (profileError) {
      logger.error('Failed to fetch user profile', {
        userId: user.id,
        error: profileError.message,
      });
      return NextResponse.json(
        { error: 'Failed to fetch sync status' },
        { status: 500 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Check if sync has started
    // ─────────────────────────────────────────────────────────────────────────
    const syncProgress = profile?.sync_progress as StoredSyncProgress | null;

    if (!syncProgress) {
      // Sync hasn't started yet - return pending status
      logger.debug('No sync progress found', { userId: user.id });

      return NextResponse.json({
        status: 'pending',
        progress: 0,
        currentStep: 'Waiting to start...',
        discoveries: {
          actionItems: 0,
          events: 0,
          clientsDetected: [],
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Return current progress
    // ─────────────────────────────────────────────────────────────────────────
    const response: SyncProgressResponse = {
      status: syncProgress.status,
      progress: syncProgress.progress,
      currentStep: syncProgress.currentStep,
      discoveries: syncProgress.discoveries,
    };

    // Include result only when completed
    if (syncProgress.status === 'completed' && syncProgress.result) {
      response.result = syncProgress.result;
    }

    // Include error message if failed
    if (syncProgress.status === 'failed' && syncProgress.error) {
      response.error = syncProgress.error;
    }

    logger.debug('Returning sync status', {
      userId: user.id,
      status: syncProgress.status,
      progress: syncProgress.progress,
    });

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Sync status request failed', { error: errorMessage });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
