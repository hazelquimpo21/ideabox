/**
 * useInitialSyncProgress Hook
 *
 * React hook for tracking the progress of the initial email batch analysis.
 * Polls the sync-status API endpoint and provides real-time updates.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Automatic polling with configurable interval
 * - Real-time progress updates
 * - Discovery tracking (action items, events, clients)
 * - Automatic stop on completion or error
 * - Manual start/stop control
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * function InitialSyncScreen() {
 *   const {
 *     status,
 *     progress,
 *     currentStep,
 *     discoveries,
 *     result,
 *     error,
 *     isPolling,
 *     startPolling,
 *     stopPolling,
 *   } = useInitialSyncProgress();
 *
 *   useEffect(() => {
 *     startPolling();
 *     return () => stopPolling();
 *   }, [startPolling, stopPolling]);
 *
 *   if (status === 'completed' && result) {
 *     return <Navigate to="/inbox" state={{ result }} />;
 *   }
 *
 *   return (
 *     <div>
 *       <Progress value={progress} />
 *       <p>{currentStep}</p>
 *       <p>Found {discoveries.actionItems} action items</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @module hooks/useInitialSyncProgress
 */

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type {
  SyncStatus,
  SyncProgressResponse,
  SyncDiscoveries,
  InitialSyncResponse,
} from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration options for the hook.
 */
export interface UseInitialSyncProgressOptions {
  /** Polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Whether to start polling automatically (default: false) */
  autoStart?: boolean;
  /** Callback when sync completes */
  onComplete?: (result: InitialSyncResponse) => void;
  /** Callback when sync fails */
  onError?: (error: string) => void;
}

/**
 * Return type for the hook.
 */
export interface UseInitialSyncProgressReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable current step */
  currentStep: string;
  /** Discoveries found so far */
  discoveries: SyncDiscoveries;
  /** Final result (when completed) */
  result: InitialSyncResponse | null;
  /** Error message (when failed) */
  error: string | null;
  /** Whether polling is active */
  isPolling: boolean;
  /** Whether a fetch is currently in progress */
  isLoading: boolean;
  /** Start polling for progress */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
  /** Manually trigger a single fetch */
  refresh: () => Promise<void>;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_OPTIONS: Required<UseInitialSyncProgressOptions> = {
  pollInterval: 1000,
  autoStart: false,
  onComplete: () => {},
  onError: () => {},
};

const DEFAULT_DISCOVERIES: SyncDiscoveries = {
  actionItems: 0,
  events: 0,
  clientsDetected: [],
};

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for tracking initial sync progress.
 *
 * @param options - Configuration options
 * @returns Progress state and control functions
 */
export function useInitialSyncProgress(
  options: UseInitialSyncProgressOptions = {}
): UseInitialSyncProgressReturn {
  // Use refs for callbacks to avoid recreating fetchProgress on every render
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  });

  // Memoize pollInterval to avoid recreating functions when it hasn't changed
  const pollInterval = options.pollInterval ?? DEFAULT_OPTIONS.pollInterval;

  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [status, setStatus] = useState<SyncStatus>('pending');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Waiting to start...');
  const [discoveries, setDiscoveries] = useState<SyncDiscoveries>(DEFAULT_DISCOVERIES);
  const [result, setResult] = useState<InitialSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Progress
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fetch current progress from the API.
   */
  const fetchProgress = useCallback(async () => {
    if (!isMountedRef.current) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/onboarding/sync-status', {
        method: 'GET',
        credentials: 'include',
      });

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data: SyncProgressResponse = await response.json();

      // Update state
      setStatus(data.status);
      setProgress(data.progress);
      setCurrentStep(data.currentStep);
      setDiscoveries(data.discoveries);

      // Handle completion
      if (data.status === 'completed' && data.result) {
        setResult(data.result);
        onCompleteRef.current?.(data.result);
        // Stop polling on completion
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsPolling(false);
        }
      }

      // Handle failure
      if (data.status === 'failed') {
        const errorMsg = data.error || 'Sync failed';
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
        // Stop polling on failure
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsPolling(false);
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch progress';
      console.error('Failed to fetch sync progress:', errorMsg);

      // Don't stop polling on transient errors
      // The user can manually stop if needed
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []); // No dependencies - uses refs for callbacks

  // ───────────────────────────────────────────────────────────────────────────
  // Polling Control
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Start polling for progress updates.
   * @param skipInitialFetch - If true, skip the immediate first fetch
   *   (useful when the caller already has fresh data from its own fetch).
   */
  const startPolling = useCallback((skipInitialFetch?: boolean) => {
    // Don't start if already polling or if sync is done
    if (intervalRef.current || status === 'completed' || status === 'failed') {
      return;
    }

    setIsPolling(true);

    // Fetch immediately unless caller already has fresh data
    if (!skipInitialFetch) {
      fetchProgress();
    }

    // Then poll at interval
    intervalRef.current = setInterval(fetchProgress, pollInterval);
  }, [fetchProgress, pollInterval, status]);

  /**
   * Stop polling.
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Manually refresh (single fetch).
   */
  const refresh = useCallback(async () => {
    await fetchProgress();
  }, [fetchProgress]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Auto-start if configured
  useEffect(() => {
    if (options.autoStart) {
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    status,
    progress,
    currentStep,
    discoveries,
    result,
    error,
    isPolling,
    isLoading,
    startPolling,
    stopPolling,
    refresh,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useInitialSyncProgress;
