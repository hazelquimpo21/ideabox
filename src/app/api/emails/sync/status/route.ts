/**
 * Email Sync Status API Route
 *
 * Returns sync status information for the authenticated user.
 * Useful for checking sync state without triggering a new sync.
 *
 * @module app/api/emails/sync/status/route
 * @version 1.0.0
 */

import { createLogger, logPerformance } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, apiError, apiResponse } from '@/lib/api';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SyncStatusAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// GET HANDLER - Sync Status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emails/sync/status
 *
 * Returns sync status for the authenticated user's Gmail accounts.
 * Useful for checking sync state without triggering a new sync.
 *
 * Response:
 * ```json
 * {
 *   "status": "idle" | "syncing" | "never_synced" | "error",
 *   "accounts": [{
 *     "id": "uuid",
 *     "email": "user@gmail.com",
 *     "lastSyncAt": "2024-01-15T10:30:00Z",
 *     "syncEnabled": true
 *   }],
 *   "lastSync": {
 *     "status": "completed",
 *     "emailsFetched": 50,
 *     "emailsCreated": 10,
 *     "durationMs": 1234,
 *     "completedAt": "2024-01-15T10:30:00Z"
 *   },
 *   "totalEmails": 500
 * }
 * ```
 */
export async function GET() {
  const timer = logPerformance('SyncStatus.GET');

  try {
    // Initialize Supabase client
    const supabase = await createServerClient();

    // Require authentication
    const user = await requireAuth(supabase);

    logger.debug('Sync status requested', { userId: user.id });

    // Get Gmail accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('gmail_accounts')
      .select('id, email, display_name, last_sync_at, sync_enabled')
      .eq('user_id', user.id)
      .order('last_sync_at', { ascending: false, nullsFirst: false });

    if (accountsError) {
      logger.error('Failed to fetch Gmail accounts for status', {
        userId: user.id,
        error: accountsError.message,
      });
      throw new Error('Failed to fetch Gmail accounts');
    }

    // Get latest sync log
    const { data: lastSyncLog } = await supabase
      .from('sync_logs')
      .select('status, emails_fetched, emails_analyzed, errors_count, duration_ms, error_message, completed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get total email count
    const { count: totalEmails } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Determine overall status
    let overallStatus: 'idle' | 'syncing' | 'never_synced' | 'error' = 'idle';

    const enabledAccounts = accounts?.filter(a => a.sync_enabled) || [];
    const hasSyncedAccounts = enabledAccounts.some(a => a.last_sync_at);

    if (!hasSyncedAccounts) {
      overallStatus = 'never_synced';
    } else if (lastSyncLog?.status === 'started') {
      overallStatus = 'syncing';
    } else if (lastSyncLog?.status === 'failed') {
      overallStatus = 'error';
    }

    const durationMs = timer.end({ userId: user.id, status: overallStatus });

    logger.success('Sync status retrieved', {
      userId: user.id,
      status: overallStatus,
      accountCount: enabledAccounts.length,
      totalEmails,
      durationMs,
    });

    return apiResponse({
      status: overallStatus,
      accounts: (accounts || []).map(a => ({
        id: a.id,
        email: a.email,
        displayName: a.display_name,
        lastSyncAt: a.last_sync_at,
        syncEnabled: a.sync_enabled,
      })),
      lastSync: lastSyncLog ? {
        status: lastSyncLog.status,
        emailsFetched: lastSyncLog.emails_fetched,
        emailsCreated: lastSyncLog.emails_analyzed,
        errorsCount: lastSyncLog.errors_count,
        durationMs: lastSyncLog.duration_ms,
        errorMessage: lastSyncLog.error_message,
        completedAt: lastSyncLog.completed_at,
        startedAt: lastSyncLog.created_at,
      } : null,
      totalEmails: totalEmails || 0,
    });
  } catch (error) {
    timer.end({ error: 'status_failed' });

    // Handle auth error
    if (error instanceof Response) {
      return error;
    }

    logger.error('Failed to get sync status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return apiError(
      `Failed to get sync status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
}
