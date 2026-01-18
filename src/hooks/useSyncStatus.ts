/**
 * useSyncStatus Hook
 *
 * Provides real-time sync status information for email syncing.
 * Tracks last sync time, sync progress, and any errors.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Real-time sync status (idle, syncing, success, error, never_synced)
 * - Last sync timestamp
 * - Total synced email count
 * - Error message tracking
 * - Manual sync trigger with proper logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * const { status, lastSyncAt, triggerSync, isReady } = useSyncStatus();
 *
 * // Check if user has synced
 * if (status === 'never_synced') {
 *   return <FirstTimeUserPrompt onSync={triggerSync} />;
 * }
 *
 * // Show last sync time
 * <p>Last synced: {lastSyncAt}</p>
 * ```
 *
 * @module hooks/useSyncStatus
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logSync } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useSyncStatus');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Possible sync states
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'never_synced' | 'loading';

/**
 * Sync result from API
 */
export interface SyncResult {
  success: boolean;
  totals: {
    accountsSynced: number;
    totalFetched: number;
    totalCreated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  results: Array<{
    accountId: string;
    email: string;
    result: {
      success: boolean;
      messagesFetched: number;
      messagesCreated: number;
      messagesSkipped: number;
      messagesFailed: number;
      durationMs: number;
      errors: Array<{ messageId: string; error: string }>;
    };
  }>;
}

/**
 * Sync status information
 */
export interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncAt: string | null;
  emailsCount: number;
  accountEmail: string | null;
  errorMessage: string | null;
  lastSyncResult: SyncResult | null;
}

/**
 * Return type for useSyncStatus hook
 */
export interface UseSyncStatusReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Last sync timestamp */
  lastSyncAt: string | null;
  /** Total synced emails */
  emailsCount: number;
  /** Connected account email */
  accountEmail: string | null;
  /** Error message if sync failed */
  errorMessage: string | null;
  /** Whether initial loading is complete */
  isReady: boolean;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Trigger a manual sync */
  triggerSync: () => Promise<SyncResult | null>;
  /** Refresh status from database */
  refresh: () => Promise<void>;
  /** Last sync result details */
  lastSyncResult: SyncResult | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for tracking email sync status.
 *
 * Provides comprehensive sync state management including:
 * - Status tracking (idle, syncing, success, error, never_synced)
 * - Last sync time and email counts
 * - Manual sync trigger with proper error handling
 * - Automatic status refresh
 *
 * @returns Sync status information and control functions
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const { status, lastSyncAt, triggerSync, isSyncing } = useSyncStatus();
 *
 *   if (status === 'never_synced') {
 *     return (
 *       <Button onClick={triggerSync} disabled={isSyncing}>
 *         {isSyncing ? 'Syncing...' : 'Start First Sync'}
 *       </Button>
 *     );
 *   }
 *
 *   return <span>Last sync: {lastSyncAt}</span>;
 * }
 * ```
 */
export function useSyncStatus(): UseSyncStatusReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [statusInfo, setStatusInfo] = React.useState<SyncStatusInfo>({
    status: 'loading',
    lastSyncAt: null,
    emailsCount: 0,
    accountEmail: null,
    errorMessage: null,
    lastSyncResult: null,
  });
  const [isReady, setIsReady] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch sync status from database
  // ───────────────────────────────────────────────────────────────────────────

  const fetchStatus = React.useCallback(async () => {
    logger.debug('Fetching sync status from database');

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        logger.error('Failed to get current user', { error: userError.message });
        throw userError;
      }

      if (!user) {
        logger.warn('No authenticated user found');
        setStatusInfo(prev => ({ ...prev, status: 'error', errorMessage: 'Not authenticated' }));
        return;
      }

      logger.debug('Fetching Gmail account info', { userId: user.id });

      // Get Gmail account with latest sync info
      const { data: account, error: accountError } = await supabase
        .from('gmail_accounts')
        .select('email, last_sync_at, sync_enabled')
        .eq('user_id', user.id)
        .eq('sync_enabled', true)
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      if (accountError && accountError.code !== 'PGRST116') {
        logger.error('Failed to fetch Gmail account', {
          error: accountError.message,
          code: accountError.code,
        });
      }

      // Get email count
      const { count: emailsCount, error: countError } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        logger.warn('Failed to get email count', { error: countError.message });
      }

      // Get latest sync log
      const { data: syncLog, error: syncLogError } = await supabase
        .from('sync_logs')
        .select('status, error_message, completed_at, emails_fetched, emails_analyzed')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (syncLogError && syncLogError.code !== 'PGRST116') {
        logger.debug('No sync logs found or error', { error: syncLogError.message });
      }

      // Determine status
      let status: SyncStatus = 'idle';
      let errorMessage: string | null = null;

      if (!account?.last_sync_at) {
        status = 'never_synced';
        logger.info('Account has never been synced', { accountEmail: account?.email });
      } else if (syncLog?.status === 'failed') {
        status = 'error';
        errorMessage = syncLog.error_message || 'Sync failed';
        logger.warn('Last sync failed', { errorMessage });
      } else if (syncLog?.status === 'started') {
        status = 'syncing';
        logger.info('Sync currently in progress');
      }

      const newStatusInfo: SyncStatusInfo = {
        status,
        lastSyncAt: account?.last_sync_at || null,
        emailsCount: emailsCount || 0,
        accountEmail: account?.email || null,
        errorMessage,
        lastSyncResult: statusInfo.lastSyncResult, // Preserve last result
      };

      setStatusInfo(newStatusInfo);
      setIsReady(true);

      logger.success('Sync status fetched', {
        status,
        emailsCount: emailsCount || 0,
        lastSyncAt: account?.last_sync_at,
        accountEmail: account?.email,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error fetching sync status', { error: errorMessage });
      setStatusInfo(prev => ({ ...prev, status: 'error', errorMessage }));
      setIsReady(true);
    }
  }, [supabase, statusInfo.lastSyncResult]);

  // ───────────────────────────────────────────────────────────────────────────
  // Trigger manual sync
  // ───────────────────────────────────────────────────────────────────────────

  const triggerSync = React.useCallback(async (): Promise<SyncResult | null> => {
    if (isSyncing) {
      logger.warn('Sync already in progress, ignoring trigger');
      return null;
    }

    setIsSyncing(true);
    setStatusInfo(prev => ({ ...prev, status: 'syncing', errorMessage: null }));

    logSync.jobStart({ trigger: 'manual' });
    const startTime = performance.now();

    try {
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result: SyncResult = await response.json();

      if (!response.ok) {
        throw new Error(result.success === false ? 'Sync failed' : 'Unknown error');
      }

      const durationMs = Math.round(performance.now() - startTime);

      logSync.jobComplete({
        durationMs,
        accountsSynced: result.totals?.accountsSynced,
        totalCreated: result.totals?.totalCreated,
        totalFetched: result.totals?.totalFetched,
        totalSkipped: result.totals?.totalSkipped,
        totalFailed: result.totals?.totalFailed,
      });

      logger.success('Manual sync completed successfully', {
        durationMs,
        ...result.totals,
      });

      setStatusInfo(prev => ({
        ...prev,
        status: 'success',
        lastSyncAt: new Date().toISOString(),
        emailsCount: prev.emailsCount + (result.totals?.totalCreated || 0),
        lastSyncResult: result,
      }));

      // Reset to idle after showing success
      setTimeout(() => {
        setStatusInfo(prev => ({ ...prev, status: 'idle' }));
      }, 3000);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';

      logSync.jobError({
        error: errorMessage,
        durationMs: Math.round(performance.now() - startTime),
      });

      logger.error('Manual sync failed', { error: errorMessage });

      setStatusInfo(prev => ({
        ...prev,
        status: 'error',
        errorMessage,
      }));

      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Fetch status on mount
  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh status periodically (every 60 seconds when not syncing)
  React.useEffect(() => {
    if (isSyncing) return;

    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus, isSyncing]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    status: statusInfo.status,
    lastSyncAt: statusInfo.lastSyncAt,
    emailsCount: statusInfo.emailsCount,
    accountEmail: statusInfo.accountEmail,
    errorMessage: statusInfo.errorMessage,
    isReady,
    isSyncing,
    triggerSync,
    refresh: fetchStatus,
    lastSyncResult: statusInfo.lastSyncResult,
  };
}

export default useSyncStatus;
