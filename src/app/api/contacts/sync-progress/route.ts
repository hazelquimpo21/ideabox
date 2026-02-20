/**
 * Sync Progress API Route
 *
 * Lightweight endpoint for polling sync progress during Google contacts import.
 * Returns current progress information stored during the import process.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/contacts/sync-progress
 *   Returns current sync progress for the authenticated user.
 *
 *   Response:
 *   {
 *     status: 'idle' | 'in_progress' | 'completed' | 'error',
 *     progress: 0-100,
 *     imported: number,
 *     estimatedTotal: number,
 *     skipped: number,
 *     currentAccount?: string,
 *     message: string,
 *     startedAt?: string (ISO),
 *     completedAt?: string (ISO),
 *     error?: string
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STORAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Progress is stored in the user_profiles table in the sync_progress JSONB column.
 * This allows quick reads without complex queries.
 *
 * @module app/api/contacts/sync-progress/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:SyncProgress');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sync progress data structure stored in user_profiles.
 */
interface SyncProgressData {
  status: 'idle' | 'in_progress' | 'completed' | 'error';
  type?: 'contacts' | 'emails';
  progress: number;
  imported: number;
  estimatedTotal: number;
  skipped: number;
  currentAccount?: string;
  message: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Default progress when no sync is active.
 */
const DEFAULT_PROGRESS: SyncProgressData = {
  status: 'idle',
  progress: 0,
  imported: 0,
  estimatedTotal: 0,
  skipped: 0,
  message: 'No sync in progress',
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/sync-progress
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns current sync progress for the authenticated user.
 * This endpoint is designed to be called frequently during polling.
 */
export async function GET() {
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch sync progress from user_profiles
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('sync_progress')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // Profile might not exist yet - return default progress
      if (profileError.code === 'PGRST116') {
        logger.debug('No profile found, returning default progress', {
          userId: user.id.substring(0, 8),
        });
        return NextResponse.json(DEFAULT_PROGRESS);
      }

      logger.error('Failed to fetch sync progress', {
        error: profileError.message,
        userId: user.id.substring(0, 8),
      });
      return NextResponse.json(
        { error: 'Failed to fetch sync progress' },
        { status: 500 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Return progress data
    // ─────────────────────────────────────────────────────────────────────────────
    const progress: SyncProgressData = profile?.sync_progress || DEFAULT_PROGRESS;

    // Log only if sync is active (avoid spam during polling)
    if (progress.status === 'in_progress') {
      logger.debug('Sync progress polled', {
        userId: user.id.substring(0, 8),
        progress: progress.progress,
        imported: progress.imported,
      });
    }

    return NextResponse.json(progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching sync progress', { error: message });

    return NextResponse.json(
      { error: 'Failed to fetch sync progress' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Update Sync Progress
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Updates sync progress in user_profiles.
 * This function is exported for use by the import-google route.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to update progress for
 * @param progress - Progress data to store
 */
export async function updateSyncProgress(
  supabase: ReturnType<typeof createServerClient> extends Promise<infer T> ? T : never,
  userId: string,
  progress: Partial<SyncProgressData>
): Promise<void> {
  try {
    // Fetch current progress to merge
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('sync_progress')
      .eq('id', userId)
      .single();

    const currentProgress: SyncProgressData = profile?.sync_progress || DEFAULT_PROGRESS;

    // Merge with new progress
    const updatedProgress: SyncProgressData = {
      ...currentProgress,
      ...progress,
    };

    // Update in database (profile row already exists from signup)
    const { error } = await supabase
      .from('user_profiles')
      .update({
        sync_progress: updatedProgress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      logger.error('Failed to update sync progress', {
        error: error.message,
        userId: userId.substring(0, 8),
      });
    } else {
      logger.debug('Sync progress updated', {
        userId: userId.substring(0, 8),
        status: updatedProgress.status,
        progress: updatedProgress.progress,
      });
    }
  } catch (err) {
    logger.error('Error updating sync progress', {
      error: err instanceof Error ? err.message : 'Unknown',
      userId: userId.substring(0, 8),
    });
  }
}

/**
 * Resets sync progress to idle state.
 * Call this when sync completes or fails.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to reset progress for
 */
export async function resetSyncProgress(
  supabase: ReturnType<typeof createServerClient> extends Promise<infer T> ? T : never,
  userId: string
): Promise<void> {
  await updateSyncProgress(supabase, userId, {
    ...DEFAULT_PROGRESS,
  });
}
