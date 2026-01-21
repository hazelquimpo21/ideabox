/**
 * Contacts Sync Status Context
 *
 * Global state management for Google contacts import operations.
 * Provides visibility into contacts sync progress across all pages.
 *
 * Note: This is separate from the email sync status (useSyncStatus hook)
 * which handles refreshing the inbox. This context specifically tracks
 * Google contacts import progress.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Global contacts sync status accessible from any component
 * - Progress tracking with percentage and counts
 * - Error state handling with retry capability
 * - Automatic polling for progress updates
 * - Dismissible status banner (sync continues in background)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Wrap your app with the provider:
 * ```tsx
 * // In app/(auth)/layout.tsx
 * import { ContactsSyncStatusProvider } from '@/lib/contexts/sync-status-context';
 *
 * export default function AuthLayout({ children }) {
 *   return (
 *     <ContactsSyncStatusProvider>
 *       <SyncStatusBanner />
 *       {children}
 *     </ContactsSyncStatusProvider>
 *   );
 * }
 * ```
 *
 * Use the hook in components:
 * ```tsx
 * import { useContactsSyncStatus } from '@/lib/contexts/sync-status-context';
 *
 * function SyncButton() {
 *   const { startSync, status, isActive } = useContactsSyncStatus();
 *
 *   return (
 *     <Button
 *       onClick={() => startSync('contacts')}
 *       disabled={isActive}
 *     >
 *       {isActive ? `Syncing... ${status.progress}%` : 'Sync Contacts'}
 *     </Button>
 *   );
 * }
 * ```
 *
 * @module lib/contexts/sync-status-context
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SyncStatusContext');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** How often to poll for sync progress (milliseconds) */
const POLL_INTERVAL = 1000;

/** How long to show success state before auto-dismissing (milliseconds) */
const SUCCESS_DISMISS_DELAY = 5000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of sync operations supported.
 */
export type SyncType = 'contacts' | 'emails';

/**
 * Status of a sync operation.
 */
export type SyncState = 'idle' | 'in_progress' | 'completed' | 'error';

/**
 * Detailed sync progress information.
 */
export interface SyncProgress {
  /** Number of items imported so far */
  imported: number;
  /** Estimated total items to import */
  estimatedTotal: number;
  /** Number of items skipped */
  skipped: number;
  /** Current account being synced (for multi-account syncs) */
  currentAccount?: string;
}

/**
 * Complete sync status state.
 */
export interface SyncStatus {
  /** Current state of the sync */
  state: SyncState;
  /** Type of sync operation */
  type: SyncType | null;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Detailed progress information */
  details: SyncProgress;
  /** When the sync started */
  startedAt: Date | null;
  /** When the sync completed */
  completedAt: Date | null;
  /** Error message if sync failed */
  error: string | null;
  /** Whether the status banner is visible */
  isVisible: boolean;
}

/**
 * Context value provided to consumers.
 */
export interface SyncStatusContextValue {
  /** Current sync status */
  status: SyncStatus;
  /** Whether a sync is currently active */
  isActive: boolean;
  /** Start a new sync operation */
  startSync: (type: SyncType, options?: { accountId?: string }) => Promise<void>;
  /** Update sync progress (called by sync operations) */
  updateProgress: (progress: Partial<SyncStatus>) => void;
  /** Mark sync as complete */
  completeSync: (result: { imported: number; skipped: number; errors?: string[] }) => void;
  /** Mark sync as failed */
  failSync: (error: string) => void;
  /** Dismiss the status banner (sync continues) */
  dismiss: () => void;
  /** Show the status banner again */
  show: () => void;
  /** Reset to idle state */
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default sync status (idle state).
 */
const initialStatus: SyncStatus = {
  state: 'idle',
  type: null,
  progress: 0,
  message: '',
  details: {
    imported: 0,
    estimatedTotal: 0,
    skipped: 0,
  },
  startedAt: null,
  completedAt: null,
  error: null,
  isVisible: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * React context for contacts sync status.
 * Default value is undefined - must be used within provider.
 */
const ContactsSyncStatusContext = React.createContext<SyncStatusContextValue | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Provider component for contacts sync status context.
 * Manages global contacts import state and provides methods to update it.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ContactsSyncStatusProvider>
 *       <MainContent />
 *     </ContactsSyncStatusProvider>
 *   );
 * }
 * ```
 */
export function ContactsSyncStatusProvider({ children }: { children: React.ReactNode }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [status, setStatus] = React.useState<SyncStatus>(initialStatus);

  // Refs for polling and auto-dismiss timers
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const dismissTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed Values
  // ─────────────────────────────────────────────────────────────────────────────

  const isActive = status.state === 'in_progress';

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup function
  // ─────────────────────────────────────────────────────────────────────────────

  const clearTimers = React.useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, []);

  // Clean up timers on unmount
  React.useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Poll for progress updates
  // ─────────────────────────────────────────────────────────────────────────────

  const startPolling = React.useCallback((syncType: SyncType) => {
    logger.debug('Starting progress polling', { syncType });

    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/contacts/sync-progress`);
        if (response.ok) {
          const data = await response.json();

          // Only update if still syncing
          setStatus((prev) => {
            if (prev.state !== 'in_progress') {
              // Sync ended elsewhere, stop polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              return prev;
            }

            // Update with polled data
            return {
              ...prev,
              progress: data.progress || prev.progress,
              message: data.message || prev.message,
              details: {
                imported: data.imported ?? prev.details.imported,
                estimatedTotal: data.estimatedTotal ?? prev.details.estimatedTotal,
                skipped: data.skipped ?? prev.details.skipped,
                currentAccount: data.currentAccount ?? prev.details.currentAccount,
              },
            };
          });
        }
      } catch (err) {
        // Polling failed - log but don't stop (could be temporary)
        logger.warn('Progress poll failed', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }, POLL_INTERVAL);
  }, []);

  const stopPolling = React.useCallback(() => {
    logger.debug('Stopping progress polling');
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Start Sync
  // ─────────────────────────────────────────────────────────────────────────────

  const startSync = React.useCallback(async (type: SyncType, options?: { accountId?: string }) => {
    logger.start('Starting sync', { type, accountId: options?.accountId?.substring(0, 8) });

    // Clear any existing timers
    clearTimers();

    // Update state to in_progress
    setStatus({
      state: 'in_progress',
      type,
      progress: 0,
      message: type === 'contacts' ? 'Starting Google contacts sync...' : 'Starting sync...',
      details: {
        imported: 0,
        estimatedTotal: 0,
        skipped: 0,
        currentAccount: undefined,
      },
      startedAt: new Date(),
      completedAt: null,
      error: null,
      isVisible: true,
    });

    // Start polling for progress
    startPolling(type);

    // Note: The actual sync API call should be made by the caller
    // This context just manages the state
  }, [clearTimers, startPolling]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Progress
  // ─────────────────────────────────────────────────────────────────────────────

  const updateProgress = React.useCallback((progress: Partial<SyncStatus>) => {
    logger.debug('Updating sync progress', {
      progress: progress.progress,
      imported: progress.details?.imported,
    });

    setStatus((prev) => ({
      ...prev,
      ...progress,
      details: {
        ...prev.details,
        ...progress.details,
      },
    }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Complete Sync
  // ─────────────────────────────────────────────────────────────────────────────

  const completeSync = React.useCallback((result: { imported: number; skipped: number; errors?: string[] }) => {
    logger.success('Sync completed', result);

    // Stop polling
    stopPolling();

    // Update state to completed
    setStatus((prev) => ({
      ...prev,
      state: 'completed',
      progress: 100,
      message: `Imported ${result.imported} contacts${result.skipped ? `, skipped ${result.skipped}` : ''}`,
      details: {
        ...prev.details,
        imported: result.imported,
        skipped: result.skipped,
      },
      completedAt: new Date(),
    }));

    // Auto-dismiss after delay
    dismissTimeoutRef.current = setTimeout(() => {
      setStatus((prev) => ({
        ...prev,
        isVisible: false,
      }));
    }, SUCCESS_DISMISS_DELAY);
  }, [stopPolling]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fail Sync
  // ─────────────────────────────────────────────────────────────────────────────

  const failSync = React.useCallback((error: string) => {
    logger.error('Sync failed', { error });

    // Stop polling
    stopPolling();

    // Update state to error
    setStatus((prev) => ({
      ...prev,
      state: 'error',
      message: 'Sync failed',
      error,
      completedAt: new Date(),
    }));

    // Don't auto-dismiss errors - user should acknowledge
  }, [stopPolling]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Dismiss / Show / Reset
  // ─────────────────────────────────────────────────────────────────────────────

  const dismiss = React.useCallback(() => {
    logger.debug('Dismissing sync status banner');
    setStatus((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const show = React.useCallback(() => {
    logger.debug('Showing sync status banner');
    setStatus((prev) => ({ ...prev, isVisible: true }));
  }, []);

  const reset = React.useCallback(() => {
    logger.debug('Resetting sync status');
    clearTimers();
    setStatus(initialStatus);
  }, [clearTimers]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Value
  // ─────────────────────────────────────────────────────────────────────────────

  const contextValue = React.useMemo<SyncStatusContextValue>(() => ({
    status,
    isActive,
    startSync,
    updateProgress,
    completeSync,
    failSync,
    dismiss,
    show,
    reset,
  }), [status, isActive, startSync, updateProgress, completeSync, failSync, dismiss, show, reset]);

  return (
    <ContactsSyncStatusContext.Provider value={contextValue}>
      {children}
    </ContactsSyncStatusContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to access contacts sync status context.
 * Must be used within a ContactsSyncStatusProvider.
 *
 * @throws Error if used outside of ContactsSyncStatusProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, isActive, startSync } = useContactsSyncStatus();
 *
 *   if (isActive) {
 *     return <p>Syncing... {status.progress}%</p>;
 *   }
 *
 *   return <button onClick={() => startSync('contacts')}>Sync</button>;
 * }
 * ```
 */
export function useContactsSyncStatus(): SyncStatusContextValue {
  const context = React.useContext(ContactsSyncStatusContext);

  if (context === undefined) {
    throw new Error('useContactsSyncStatus must be used within a ContactsSyncStatusProvider');
  }

  return context;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { ContactsSyncStatusContext };
export type { SyncType, SyncState, SyncProgress, SyncStatus, SyncStatusContextValue };
