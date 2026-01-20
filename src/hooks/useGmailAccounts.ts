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

import { useState, useCallback, useEffect } from 'react';
import type { GmailAccount } from '@/types/database';

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
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforms a database GmailAccount row into a display-friendly format.
 *
 * @param account - Raw database account row
 * @param isPrimary - Whether this is the primary account
 * @returns Transformed account for UI display
 */
function transformAccount(
  account: GmailAccount,
  isPrimary: boolean
): GmailAccountDisplay {
  // Determine sync status based on sync_enabled and last_sync_at
  let syncStatus: 'active' | 'paused' | 'error' = 'active';
  if (!account.sync_enabled) {
    syncStatus = 'paused';
  } else if (account.last_sync_at) {
    // If last sync was more than 24 hours ago, consider it an error state
    const lastSync = new Date(account.last_sync_at);
    const hoursSinceSync =
      (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > 24) {
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Accounts
  // ─────────────────────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/gmail/accounts');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch accounts');
      }

      const data = await response.json();

      // Transform and sort accounts (primary first, then by creation date)
      const rawAccounts: GmailAccount[] = data.accounts || [];
      const sortedAccounts = rawAccounts.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const displayAccounts = sortedAccounts.map((account, index) =>
        transformAccount(account, index === 0)
      );

      setAccounts(displayAccounts);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch accounts';
      setError(message);
      console.error('Failed to fetch Gmail accounts:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Disconnect Account
  // ─────────────────────────────────────────────────────────────────────────────

  const disconnectAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/gmail/accounts/${accountId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to disconnect account');
        }

        // Remove from local state
        setAccounts((prev) => prev.filter((a) => a.id !== accountId));
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to disconnect account';
        setError(message);
        console.error('Failed to disconnect Gmail account:', err);
        return false;
      }
    },
    []
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

  return {
    accounts,
    isLoading,
    error,
    refetch,
    disconnectAccount,
    hasAccounts,
    primaryAccount,
  };
}

export default useGmailAccounts;
