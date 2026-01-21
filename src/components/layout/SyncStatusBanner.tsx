/**
 * Sync Status Banner Component
 *
 * A sticky banner that displays sync progress across all pages.
 * Shows progress bar, real-time counts, and allows dismissing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Sticky positioning below navbar
 * - Animated progress bar
 * - Real-time count display (e.g., "Importing 127 of ~500 contacts...")
 * - Current account indicator for multi-account syncs
 * - Dismiss button (sync continues in background)
 * - Error state with retry option
 * - Success state with auto-dismiss
 * - Smooth slide animation for show/hide
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Add to your layout (must be within SyncStatusProvider):
 * ```tsx
 * import { SyncStatusBanner } from '@/components/layout/SyncStatusBanner';
 *
 * export default function AuthLayout({ children }) {
 *   return (
 *     <SyncStatusProvider>
 *       <Navbar />
 *       <SyncStatusBanner />
 *       <main>{children}</main>
 *     </SyncStatusProvider>
 *   );
 * }
 * ```
 *
 * @module components/layout/SyncStatusBanner
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useContactsSyncStatus } from '@/lib/contexts/sync-status-context';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Loader2,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SyncStatusBanner');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Animated progress bar component.
 */
function ProgressBar({ progress, variant }: { progress: number; variant: 'default' | 'success' | 'error' }) {
  const colors = {
    default: 'bg-primary',
    success: 'bg-green-500',
    error: 'bg-destructive',
  };

  return (
    <div className="h-1 bg-muted rounded-full overflow-hidden">
      <div
        className={cn(
          'h-full transition-all duration-500 ease-out',
          colors[variant]
        )}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

/**
 * Status icon based on current state.
 */
function StatusIcon({ state }: { state: 'idle' | 'in_progress' | 'completed' | 'error' }) {
  switch (state) {
    case 'in_progress':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    default:
      return <Users className="h-4 w-4 text-muted-foreground" />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sync status banner that displays progress across all pages.
 * Automatically shows/hides based on sync status context.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <SyncStatusProvider>
 *   <Navbar />
 *   <SyncStatusBanner />
 *   <main>{children}</main>
 * </SyncStatusProvider>
 * ```
 */
export function SyncStatusBanner() {
  const { status, isActive, dismiss, show, reset, startSync } = useContactsSyncStatus();

  // ─────────────────────────────────────────────────────────────────────────────
  // Don't render if not visible
  // ─────────────────────────────────────────────────────────────────────────────

  if (!status.isVisible) {
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Determine variant for styling
  // ─────────────────────────────────────────────────────────────────────────────

  const variant = status.state === 'completed' ? 'success' :
                  status.state === 'error' ? 'error' : 'default';

  const bgColors = {
    default: 'bg-background border-b',
    success: 'bg-green-50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-900',
    error: 'bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDismiss = () => {
    logger.debug('Banner dismissed', { state: status.state });
    dismiss();
  };

  const handleRetry = () => {
    logger.info('Retrying sync');
    reset();
    if (status.type) {
      startSync(status.type);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Build message
  // ─────────────────────────────────────────────────────────────────────────────

  const getMessage = () => {
    if (status.state === 'error') {
      return status.error || 'Sync failed';
    }

    if (status.state === 'completed') {
      return status.message;
    }

    if (status.state === 'in_progress') {
      const { imported, estimatedTotal, currentAccount } = status.details;

      let msg = 'Syncing';

      if (status.type === 'contacts') {
        msg = 'Importing contacts';
      }

      if (estimatedTotal > 0) {
        msg += ` (${imported.toLocaleString()} of ~${estimatedTotal.toLocaleString()})`;
      } else if (imported > 0) {
        msg += ` (${imported.toLocaleString()} imported)`;
      }

      if (currentAccount) {
        msg += ` from ${currentAccount}`;
      }

      return msg + '...';
    }

    return status.message;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'sticky top-0 z-40 w-full px-4 py-2',
        'animate-in slide-in-from-top-2 duration-300',
        bgColors[variant]
      )}
      role="status"
      aria-live="polite"
    >
      {/* Progress bar */}
      {status.state === 'in_progress' && (
        <ProgressBar progress={status.progress} variant={variant} />
      )}

      {/* Content */}
      <div className="flex items-center justify-between gap-4 mt-2">
        {/* Left: Icon and message */}
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon state={status.state} />

          <span className="text-sm font-medium truncate">
            {getMessage()}
          </span>

          {/* Progress percentage */}
          {status.state === 'in_progress' && status.progress > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {Math.round(status.progress)}%
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Retry button for errors */}
          {status.state === 'error' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-7 w-7"
            title={isActive ? 'Hide (sync continues)' : 'Dismiss'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Subtitle for additional info */}
      {status.state === 'in_progress' && status.details.skipped > 0 && (
        <p className="text-xs text-muted-foreground mt-1 ml-7">
          {status.details.skipped} skipped (no email address)
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default SyncStatusBanner;
