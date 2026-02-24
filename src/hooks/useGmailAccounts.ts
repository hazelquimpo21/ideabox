/**
 * useGmailAccounts Hook
 *
 * Fetches and manages connected Gmail accounts for the current user.
 * Used in Settings to display real account data instead of mock data.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * const { accounts, isLoading, error, refetch, disconnectAccount } = useGmailAccounts();
 *
 * // Display accounts
 * accounts.map(account => (
 *   <div key={account.id}>
 *     {account.email} - Last synced: {account.lastSyncAt}
 *   </div>
 * ));
 *
 * // Disconnect an account
 * await disconnectAccount(accountId);
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each account includes:
 * - id: Unique identifier
 * - email: Gmail address
 * - displayName: User's name from Google
 * - lastSyncAt: When emails were last fetched
 * - syncEnabled: Whether sync is active
 * - isPrimary: If this is the primary account (first connected)
 *
 * @module hooks/useGmailAccounts
 * @since January 2026
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { GmailAccount } from '@/types/database';

const logger = createLogger('useGmailAccounts');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gmail account with derived fields for UI display.
 * Extends the database type with computed properties.
 */
export interface GmailAccountDisplay {
  /** Unique account identifier */
  id: string;
  /** Gmail email address */
  email: string;
  /** Display name from Google profile */
  displayName: string | null;
  /** When this account was last synced */
  lastSyncAt: Date | null;
  /** Whether sync is enabled for this account */
  syncEnabled: boolean;
  /** Whether this is the primary (first) account */
  isPrimary: boolean;
  /** Sync status: active, paused, or error */
  syncStatus: 'active' | 'paused' | 'error';
  /** When the account was connected */
  createdAt: Date;
  /** Number of emails synced from this account */
  emailCount: number;
}

/**
 * Latest sync info returned from the API
 */
export interface LatestSyncInfo {
  status: string;
  completed_at: string | null;
  emails_fetched: number;
  emails_analyzed: number;
  error_message: string | null;
  duration_ms: number;
}

/**
 * Return type for the useGmailAccounts hook.
 */
export interface UseGmailAccountsReturn {
  /** List of connected Gmail accounts */
  accounts: GmailAccountDisplay[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch accounts from server */
  refetch: () => Promise<void>;
  /** Disconnect a Gmail account */
  disconnectAccount: (accountId: string) => Promise<boolean>;
  /** Check if user has any connected accounts */
  hasAccounts: boolean;
  /** Get the primary account */
  primaryAccount: GmailAccountDisplay | null;
  /** Latest sync info across all accounts */
  latestSync: LatestSyncInfo | null;
  /** Total email count across all accounts */
  totalEmails: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Extended GmailAccount type including email_count from API */
interface GmailAccountWithCount extends GmailAccount {
  email_count?: number;
}

/**
 * Transforms a database GmailAccount row into a display-friendly format.
 *
 * @param account - Raw database account row (with optional email_count)
 * @param isPrimary - Whether this is the primary account
 * @returns Transformed account for UI display
 */
function transformAccount(
  account: GmailAccountWithCount,
  isPrimary: boolean
): GmailAccountDisplay {
  // Determine sync status based on sync_enabled and last_sync_at
  let syncStatus: 'active' | 'paused' | 'error' = 'active';
  if (!account.sync_enabled) {
    syncStatus = 'paused';
  } else if (account.last_sync_at) {
    // If last sync was more than 7 days ago, consider it an error state
    // (24 hours was too aggressive - syncs run every 15 min but users may not use app daily)
    const lastSync = new Date(account.last_sync_at);
    const daysSinceSync =
      (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 7) {
      syncStatus = 'error';
    }
  }

  return {
    id: account.id,
    email: account.email,
    displayName: account.display_name,
    lastSyncAt: account.last_sync_at ? new Date(account.last_sync_at) : null,
    syncEnabled: account.sync_enabled,
    isPrimary,
    syncStatus,
    createdAt: new Date(account.created_at),
    emailCount: account.email_count || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch and manage connected Gmail accounts.
 *
 * Provides real account data from the database, replacing the mock data
 * previously used in the Settings page.
 *
 * @returns Object with accounts, loading state, and management functions
 *
 * @example
 * ```tsx
 * function AccountsSection() {
 *   const { accounts, isLoading, disconnectAccount } = useGmailAccounts();
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return accounts.map(account => (
 *     <AccountCard
 *       key={account.id}
 *       account={account}
 *       onDisconnect={() => disconnectAccount(account.id)}
 *     />
 *   ));
 * }
 * ```
 */
export function useGmailAccounts(): UseGmailAccountsReturn {
  const [accounts, setAccounts] = useState<GmailAccountDisplay[]>([]);
  const [latestSync, setLatestSync] = useState<LatestSyncInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use client-side Supabase directly (same as useSyncStatus) for reliable auth
  const supabase = useMemo(() => createClient(), []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Accounts
  // ─────────────────────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    logger.debug('Fetching Gmail accounts from database');

    try {
      setError(null);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        logger.error('Failed to get current user', { error: userError.message });
        throw userError;
      }

      if (!user) {
        logger.warn('No authenticated user found');
        setError('Not authenticated');
        return;
      }

      logger.debug('Fetching accounts for user', { userId: user.id.substring(0, 8) });

      // Fetch accounts (excluding sensitive token fields)
      const { data: rawAccounts, error: accountsError } = await supabase
        .from('gmail_accounts')
        .select(`
          id,
          email,
          display_name,
          last_sync_at,
          sync_enabled,
          created_at,
          updated_at
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (accountsError) {
        logger.error('Failed to fetch Gmail accounts', {
          userId: user.id.substring(0, 8),
          error: accountsError.message,
        });
        throw new Error(accountsError.message);
      }

      // Get email counts per account
      const accountsWithCounts = await Promise.all(
        (rawAccounts || []).map(async (account) => {
          const { count } = await supabase
            .from('emails')
            .select('*', { count: 'exact', head: true })
            .eq('gmail_account_id', account.id);

          return {
            ...account,
            email_count: count || 0,
          } as GmailAccountWithCount;
        })
      );

      // Get latest sync log for status info
      // Use .maybeSingle() to avoid 406 when no sync logs exist (e.g., new user)
      const { data: latestSyncData } = await supabase
        .from('sync_logs')
        .select('status, completed_at, emails_fetched, emails_analyzed, error_message, duration_ms')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      // Sort and transform accounts (primary first = first created)
      const sortedAccounts = accountsWithCounts.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const displayAccounts = sortedAccounts.map((account, index) =>
        transformAccount(account, index === 0)
      );

      setAccounts(displayAccounts);
      setLatestSync(latestSyncData || null);

      logger.success('Gmail accounts fetched', {
        userId: user.id.substring(0, 8),
        count: displayAccounts.length,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch accounts';
      setError(message);
      logger.error('Failed to fetch Gmail accounts', { error: message });
    }
  }, [supabase]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Disconnect Account
  // ─────────────────────────────────────────────────────────────────────────────

  const disconnectAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        // Check account count - cannot disconnect only account
        const { count: accountCount } = await supabase
          .from('gmail_accounts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (accountCount === 1) {
          throw new Error('Cannot disconnect your only account. Add another account first.');
        }

        // Check if this is the primary account (first created)
        const { data: firstAccount } = await supabase
          .from('gmail_accounts')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (firstAccount?.id === accountId) {
          throw new Error('Cannot disconnect your primary account. Disconnect other accounts first.');
        }

        // Delete the account (cascade will remove associated emails)
        const { error: deleteError } = await supabase
          .from('gmail_accounts')
          .delete()
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Remove from local state
        setAccounts((prev) => prev.filter((a) => a.id !== accountId));
        logger.success('Gmail account disconnected', { accountId: accountId.substring(0, 8) });
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to disconnect account';
        setError(message);
        logger.error('Failed to disconnect Gmail account', { error: message });
        return false;
      }
    },
    [supabase]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial Fetch
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchAccounts = async () => {
      setIsLoading(true);
      await refetch();
      setIsLoading(false);
    };

    fetchAccounts();
  }, [refetch]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived Values
  // ─────────────────────────────────────────────────────────────────────────────

  const hasAccounts = accounts.length > 0;
  const primaryAccount = accounts.find((a) => a.isPrimary) || null;
  const totalEmails = accounts.reduce((sum, a) => sum + a.emailCount, 0);

  return {
    accounts,
    isLoading,
    error,
    refetch,
    disconnectAccount,
    hasAccounts,
    primaryAccount,
    latestSync,
    totalEmails,
  };
}

export default useGmailAccounts;
