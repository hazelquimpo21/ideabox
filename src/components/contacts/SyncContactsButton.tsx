/**
 * Sync Contacts Button Component
 *
 * A smart button that allows users to sync their Google contacts at any time.
 * Shows sync status, progress, and results with friendly feedback.
 *
 * Features:
 * - One-click sync from Google
 * - Visual feedback during sync
 * - Success/error states with helpful messages
 * - Shows last sync time
 * - Handles missing permissions gracefully
 *
 * @module components/contacts/SyncContactsButton
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

type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'needs-permission';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SyncContactsButton({
  onSyncComplete,
  variant = 'default',
  className = '',
}: SyncContactsButtonProps) {
  const [syncState, setSyncState] = React.useState<SyncState>('idle');
  const [lastResult, setLastResult] = React.useState<SyncResult | null>(null);
  const { toast } = useToast();

  // Reset success state after a delay
  React.useEffect(() => {
    if (syncState === 'success' || syncState === 'error') {
      const timer = setTimeout(() => setSyncState('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncState]);

  const handleSync = async () => {
    if (syncState === 'syncing') return;

    setSyncState('syncing');
    logger.start('Syncing Google contacts');

    try {
      const response = await fetch('/api/contacts/import-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxContacts: 500, // Sync more contacts for a full sync
          starredOnly: false,
        }),
      });

      if (response.status === 403) {
        const data = await response.json();
        if (data.needsReauthorization) {
          setSyncState('needs-permission');
          toast({
            title: 'Permission needed',
            description: 'Please grant contacts access to sync from Google.',
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = '/api/auth/google?scope=contacts';
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
      setSyncState('success');

      // Show friendly feedback
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
      });

      onSyncComplete?.(result);
    } catch (error) {
      setSyncState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to sync contacts', { error: message });

      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: 'Could not sync contacts. Please try again.',
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render based on variant
  // ─────────────────────────────────────────────────────────────────────────────

  const getIcon = () => {
    switch (syncState) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
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
    switch (syncState) {
      case 'syncing':
        return 'Syncing...';
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

  // Compact variant - icon only with title tooltip
  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSync}
        disabled={syncState === 'syncing'}
        className={className}
        title="Sync contacts from Google"
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
          disabled={syncState === 'syncing'}
          className="gap-2"
        >
          {getIcon()}
          <span>{getLabel()}</span>
        </Button>
        {lastResult && syncState === 'success' && (
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
      disabled={syncState === 'syncing'}
      className={`gap-2 ${className}`}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </Button>
  );
}

export default SyncContactsButton;
