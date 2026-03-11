/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
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
 * Auth error info for accounts that need re-authentication
 */
export interface AccountAuthError {
  accountId: string;
  email: string;
  error: string;
}

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
  /** Accounts that failed due to expired/revoked credentials */
  authErrors?: AccountAuthError[];
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
  /** Accounts that need re-authentication (expired/revoked credentials) */
  accountsNeedingReauth: AccountAuthError[];
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
  /** Accounts that need re-authentication (expired/revoked credentials) */
  accountsNeedingReauth: AccountAuthError[];
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
    accountsNeedingReauth: [],
  });
  const [isReady, setIsReady] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Use a ref to store lastSyncResult to avoid dependency loop in fetchStatus
  const lastSyncResultRef = React.useRef<SyncResult | null>(null);

  // Guard against overlapping fetches
  const isFetchingRef = React.useRef(false);

  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch sync status from database
  // ───────────────────────────────────────────────────────────────────────────

  const fetchStatus = React.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

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
      // Use .maybeSingle() instead of .single() to avoid 406 HTTP errors
      // when no sync logs exist yet (e.g., new user post-onboarding)
      const { data: syncLog, error: syncLogError } = await supabase
        .from('sync_logs')
        .select('status, error_message, completed_at, emails_fetched, emails_analyzed')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (syncLogError) {
        logger.debug('Error fetching sync logs', { error: syncLogError.message });
      }

      // Check for auth errors in recent sync logs
      // Only consider failures that happened AFTER the account was last updated
      // (re-adding credentials updates the account's updated_at timestamp)
      const { data: authFailedLogs } = await supabase
        .from('sync_logs')
        .select('gmail_account_id, error_message, started_at')
        .eq('user_id', user.id)
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(10);

      // Cross-reference with gmail accounts to get emails and updated_at for failed accounts
      let accountsNeedingReauth: AccountAuthError[] = [];
      if (authFailedLogs && authFailedLogs.length > 0) {
        const authFailures = authFailedLogs.filter(
          (log: { error_message: string | null }) =>
            log.error_message?.includes('invalid_grant') ||
            log.error_message?.includes('invalid_client') ||
            log.error_message?.includes('access_denied')
        );

        if (authFailures.length > 0) {
          const failedAccountIds = [...new Set(authFailures.map(
            (log: { gmail_account_id: string }) => log.gmail_account_id
          ))];

          const { data: failedAccounts } = await supabase
            .from('gmail_accounts')
            .select('id, email, updated_at')
            .in('id', failedAccountIds);

          if (failedAccounts) {
            // Only include accounts where the auth failure happened AFTER last credential update
            const accountUpdatedMap = new Map(
              failedAccounts.map((acc: { id: string; updated_at: string }) => [acc.id, acc.updated_at])
            );

            // Filter auth failures to only include those after the account was last updated
            const relevantAccountIds = new Set<string>();
            for (const log of authFailures) {
              const accountUpdated = accountUpdatedMap.get(log.gmail_account_id);
              if (!accountUpdated || new Date(log.started_at) > new Date(accountUpdated)) {
                relevantAccountIds.add(log.gmail_account_id);
              }
            }

            accountsNeedingReauth = failedAccounts
              .filter((acc: { id: string }) => relevantAccountIds.has(acc.id))
              .map((acc: { id: string; email: string }) => ({
                accountId: acc.id,
                email: acc.email,
                error: 'Credentials expired. Please reconnect this account.',
              }));
          }
        }
      }

      // Preserve auth errors from the last sync result if available
      const lastResult = lastSyncResultRef.current;
      if (lastResult?.authErrors && lastResult.authErrors.length > 0) {
        // Merge with DB-detected auth errors, deduplicating by accountId
        const existingIds = new Set(accountsNeedingReauth.map(a => a.accountId));
        for (const authErr of lastResult.authErrors) {
          if (!existingIds.has(authErr.accountId)) {
            accountsNeedingReauth.push(authErr);
          }
        }
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
        if (accountsNeedingReauth.length > 0) {
          const emails = accountsNeedingReauth.map(a => a.email).join(', ');
          errorMessage = `Credentials expired for: ${emails}. Please reconnect.`;
        }
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
        lastSyncResult: lastSyncResultRef.current, // Preserve last result from ref
        accountsNeedingReauth,
      };

      setStatusInfo(newStatusInfo);
      setIsReady(true);

      // Only log on status changes to reduce noise
      logger.debug('Sync status fetched', { status });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error fetching sync status', { error: errorMessage });
      setStatusInfo(prev => ({ ...prev, status: 'error', errorMessage }));
      setIsReady(true);
    } finally {
      isFetchingRef.current = false;
    }
  }, [supabase]); // Removed statusInfo.lastSyncResult to fix infinite loop

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

      // Capture auth errors from sync result
      const newAuthErrors = result.authErrors || [];

      // Update ref first, then state
      lastSyncResultRef.current = result;

      if (newAuthErrors.length > 0) {
        const emails = newAuthErrors.map(a => a.email).join(', ');
        logger.warn('Accounts need re-authentication', { emails });

        setStatusInfo(prev => ({
          ...prev,
          status: 'error',
          lastSyncAt: new Date().toISOString(),
          emailsCount: prev.emailsCount + (result.totals?.totalCreated || 0),
          errorMessage: `Credentials expired for: ${emails}. Please reconnect.`,
          lastSyncResult: result,
          accountsNeedingReauth: newAuthErrors,
        }));
      } else {
        setStatusInfo(prev => ({
          ...prev,
          status: 'success',
          lastSyncAt: new Date().toISOString(),
          emailsCount: prev.emailsCount + (result.totals?.totalCreated || 0),
          lastSyncResult: result,
          accountsNeedingReauth: [],
        }));

        // Reset to idle after showing success
        setTimeout(() => {
          setStatusInfo(prev => ({ ...prev, status: 'idle' }));
        }, 3000);
      }

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
    accountsNeedingReauth: statusInfo.accountsNeedingReauth,
  };
}

export default useSyncStatus;
