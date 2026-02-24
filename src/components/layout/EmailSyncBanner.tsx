/**
 * Email Sync Progress Banner
 *
 * A compact, sticky banner that shows initial email sync progress after
 * onboarding. Appears at the top of the page (below navbar) and dismisses
 * automatically when sync completes.
 *
 * This banner polls /api/onboarding/sync-status for real-time progress
 * during the initial sync that runs after the user finishes onboarding.
 *
 * @module components/layout/EmailSyncBanner
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  X,
  Mail,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('EmailSyncBanner');

// =============================================================================
// TYPES
// =============================================================================

interface SyncProgressData {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  discoveries: {
    actionItems: number;
    events: number;
    clientsDetected: string[];
  };
  error?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * EmailSyncBanner — compact progress banner for initial email sync.
 *
 * Automatically detects whether an initial sync is in progress by polling
 * the sync-status endpoint. Shows progress, auto-hides on completion.
 */
export function EmailSyncBanner() {
  const [syncData, setSyncData] = React.useState<SyncProgressData | null>(null);
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const pollRef = React.useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = React.useRef(true);

  // ─── Poll for sync progress ─────────────────────────────────────────────────
  const fetchSyncStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/onboarding/sync-status', {
        credentials: 'include',
      });

      if (!isMountedRef.current) return;

      if (!response.ok) {
        // No sync in progress or error — hide banner
        return;
      }

      const data: SyncProgressData = await response.json();

      if (!isMountedRef.current) return;

      // Only show banner when sync is actively running or just completed/failed
      if (data.status === 'in_progress' || data.status === 'pending') {
        setSyncData(data);
        setIsVisible(true);
      } else if (data.status === 'completed') {
        setSyncData(data);
        setIsVisible(true);
        // Auto-hide after showing success
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsVisible(false);
          }
        }, 4000);
        // Stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (data.status === 'failed') {
        setSyncData(data);
        setIsVisible(true);
        // Stop polling on failure
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      logger.debug('Failed to fetch sync status', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }, []);

  // Start polling on mount
  React.useEffect(() => {
    isMountedRef.current = true;

    // Initial check
    fetchSyncStatus();

    // Poll every 5 seconds
    pollRef.current = setInterval(fetchSyncStatus, 5000);

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchSyncStatus]);

  // Stop polling once sync is no longer in progress
  React.useEffect(() => {
    if (syncData && syncData.status !== 'in_progress' && syncData.status !== 'pending') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [syncData]);

  // ─── Don't render if dismissed or not visible ───────────────────────────────
  if (isDismissed || !isVisible || !syncData) {
    return null;
  }

  // ─── Determine styling variant ──────────────────────────────────────────────
  const isComplete = syncData.status === 'completed';
  const isFailed = syncData.status === 'failed';
  const isActive = syncData.status === 'in_progress' || syncData.status === 'pending';

  const bgColor = isComplete
    ? 'bg-green-50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-900'
    : isFailed
      ? 'bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900'
      : 'bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900';

  // ─── Build message ──────────────────────────────────────────────────────────
  const getMessage = () => {
    if (isComplete) {
      return 'Email sync complete! Your inbox is ready.';
    }
    if (isFailed) {
      return syncData.error || 'Email sync encountered an error.';
    }

    // In progress
    const step = syncData.currentStep || 'Syncing emails...';
    return step;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'sticky top-0 z-40 w-full animate-in slide-in-from-top-2 duration-300',
        bgColor
      )}
      role="status"
      aria-live="polite"
    >
      {/* Progress bar */}
      {isActive && (
        <div className="h-1 bg-blue-100 dark:bg-blue-900/30">
          <div
            className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, syncData.progress))}%` }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex items-center justify-between gap-4 px-4 py-2">
        {/* Left: Icon and message */}
        <div className="flex items-center gap-3 min-w-0">
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />}
          {isComplete && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />}
          {isFailed && <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />}

          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />

          <span className="text-sm font-medium truncate">
            {getMessage()}
          </span>

          {/* Progress percentage */}
          {isActive && syncData.progress > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {Math.round(syncData.progress)}%
            </span>
          )}
        </div>

        {/* Right: Dismiss button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            logger.debug('Email sync banner dismissed');
            setIsDismissed(true);
          }}
          className="h-7 w-7 shrink-0"
          title={isActive ? 'Hide (sync continues in background)' : 'Dismiss'}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default EmailSyncBanner;
