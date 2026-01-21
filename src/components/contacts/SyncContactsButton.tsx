/**
 * Sync Contacts Button Component
 *
 * A smart button that allows users to sync their Google contacts at any time.
 * Integrates with the ContactsSyncStatusContext to show progress in the global banner.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - One-click sync from Google
 * - Progress shown in global SyncStatusBanner
 * - Visual feedback during sync
 * - Success/error states with helpful messages
 * - Handles missing permissions gracefully
 *
 * @module components/contacts/SyncContactsButton
 * @version 2.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import {
  Button,
  useToast,
} from '@/components/ui';
import {
  Cloud,
  CloudOff,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useContactsSyncStatus } from '@/lib/contexts/sync-status-context';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SyncContactsButton');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SyncContactsButtonProps {
  /** Callback after successful sync */
  onSyncComplete?: (result: SyncResult) => void;
  /** Optional variant for different contexts */
  variant?: 'default' | 'compact' | 'full';
  /** Optional class name */
  className?: string;
}

export interface SyncResult {
  imported: number;
  starred: number;
  skipped: number;
  errors: string[];
}

type LocalSyncState = 'idle' | 'success' | 'error' | 'needs-permission';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SyncContactsButton({
  onSyncComplete,
  variant = 'default',
  className = '',
}: SyncContactsButtonProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State and Context
  // ─────────────────────────────────────────────────────────────────────────────

  const [localState, setLocalState] = React.useState<LocalSyncState>('idle');
  const [lastResult, setLastResult] = React.useState<SyncResult | null>(null);
  const { toast } = useToast();

  // Get sync status from context - provides global progress tracking
  const {
    isActive: isSyncing,
    startSync,
    completeSync,
    failSync,
  } = useContactsSyncStatus();

  // Reset success/error state after a delay
  React.useEffect(() => {
    if (localState === 'success' || localState === 'error') {
      const timer = setTimeout(() => setLocalState('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [localState]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync Handler
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    // Don't start new sync if one is already in progress
    if (isSyncing) {
      logger.debug('Sync already in progress, ignoring request');
      return;
    }

    logger.start('Syncing Google contacts');

    // Start sync in context - this shows the banner
    await startSync('contacts');

    try {
      const response = await fetch('/api/contacts/import-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxContacts: 500, // Sync more contacts for a full sync
          starredOnly: false,
        }),
      });

      // Handle permission issues
      if (response.status === 403) {
        const data = await response.json();
        if (data.needsReauthorization) {
          setLocalState('needs-permission');
          failSync('Contacts permission not granted');

          toast({
            title: 'Permission needed',
            description: 'Please grant contacts access to sync from Google.',
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = '/api/auth/add-contacts-scope?returnTo=/contacts';
                }}
              >
                Grant Access
              </Button>
            ),
          });
          return;
        }
      }

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const result: SyncResult = await response.json();
      setLastResult(result);
      setLocalState('success');

      // Complete sync in context - this updates the banner
      completeSync({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      });

      // Show friendly feedback via toast
      if (result.imported > 0) {
        toast({
          title: 'Contacts synced!',
          description: `Added ${result.imported} contacts${result.starred > 0 ? ` (${result.starred} starred)` : ''}`,
        });
      } else if (result.skipped > 0) {
        toast({
          title: 'Already up to date',
          description: 'No new contacts to import.',
        });
      } else {
        toast({
          title: 'Sync complete',
          description: 'Your contacts are up to date.',
        });
      }

      logger.success('Google contacts synced', {
        imported: result.imported,
        starred: result.starred,
        skipped: result.skipped,
      });

      onSyncComplete?.(result);
    } catch (error) {
      setLocalState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Fail sync in context
      failSync(message);

      logger.error('Failed to sync contacts', { error: message });

      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: 'Could not sync contacts. Please try again.',
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const getIcon = () => {
    if (isSyncing) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }

    switch (localState) {
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'needs-permission':
        return <CloudOff className="h-4 w-4 text-amber-500" />;
      default:
        return <Cloud className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    if (isSyncing) {
      return 'Syncing...';
    }

    switch (localState) {
      case 'success':
        return lastResult?.imported ? `+${lastResult.imported}` : 'Synced';
      case 'error':
        return 'Retry';
      case 'needs-permission':
        return 'Grant Access';
      default:
        return 'Sync Google';
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  // Compact variant - icon only with title tooltip
  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSync}
        disabled={isSyncing}
        className={className}
        title="Sync contacts from Google"
        data-sync-button
      >
        {getIcon()}
      </Button>
    );
  }

  // Full variant - detailed button with stats
  if (variant === 'full') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button
          variant="outline"
          onClick={handleSync}
          disabled={isSyncing}
          className="gap-2"
          data-sync-button
        >
          {getIcon()}
          <span>{getLabel()}</span>
        </Button>
        {lastResult && localState === 'success' && (
          <span className="text-xs text-muted-foreground">
            {lastResult.imported} new, {lastResult.starred} starred
          </span>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing}
      className={`gap-2 ${className}`}
      data-sync-button
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </Button>
  );
}

export default SyncContactsButton;
