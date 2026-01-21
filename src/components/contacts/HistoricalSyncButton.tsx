/**
 * Historical Sync Button Component
 *
 * A button that allows users to sync historical email metadata for CRM purposes.
 * This sync is metadata-only (no email bodies) and does not use AI analysis,
 * resulting in zero OpenAI costs.
 *
 * @module components/contacts/HistoricalSyncButton
 * @version 1.0.0
 * @since January 2026
 * @see docs/HISTORICAL_SYNC_PLAN.md
 */

'use client';

import * as React from 'react';
import {
  Button,
  useToast,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  History,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Users,
  Mail,
} from 'lucide-react';
import { HISTORICAL_SYNC_OPTIONS } from '@/config/historical-sync';
import type { AccountHistoricalSyncStatus } from '@/config/historical-sync';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('HistoricalSyncButton');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface HistoricalSyncButtonProps {
  /** Callback after successful sync */
  onSyncComplete?: (result: HistoricalSyncResult) => void;
  /** Optional variant for different contexts */
  variant?: 'default' | 'compact';
  /** Optional class name */
  className?: string;
}

export interface HistoricalSyncResult {
  success: boolean;
  message: string;
  results: Array<{
    accountId: string;
    accountEmail?: string;
    emailsSynced: number;
    contactsUpdated: number;
    oldestEmailDate: string | null;
  }>;
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function HistoricalSyncButton({
  onSyncComplete,
  variant = 'default',
  className = '',
}: HistoricalSyncButtonProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [monthsBack, setMonthsBack] = React.useState('12');
  const [syncState, setSyncState] = React.useState<SyncState>('idle');
  const [progress, setProgress] = React.useState(0);
  const [statusMessage, setStatusMessage] = React.useState('');
  const [accountStatuses, setAccountStatuses] = React.useState<AccountHistoricalSyncStatus[]>([]);
  const [lastResult, setLastResult] = React.useState<HistoricalSyncResult | null>(null);

  const { toast } = useToast();

  // ─────────────────────────────────────────────────────────────────────────────
  // Load existing status on dialog open
  // ─────────────────────────────────────────────────────────────────────────────

  const loadStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/contacts/historical-sync');
      if (response.ok) {
        const data = await response.json();
        setAccountStatuses(data.accounts || []);

        // Check if any account is already syncing
        const syncing = data.accounts?.find(
          (a: AccountHistoricalSyncStatus) => a.status === 'in_progress'
        );
        if (syncing) {
          setSyncState('syncing');
          setStatusMessage(`Resuming sync for ${syncing.accountEmail}...`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load historical sync status', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  React.useEffect(() => {
    if (dialogOpen) {
      loadStatus();
    }
  }, [dialogOpen, loadStatus]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Check if already synced
  // ─────────────────────────────────────────────────────────────────────────────

  const alreadySynced = React.useMemo(() => {
    return accountStatuses.length > 0 && accountStatuses.every((a) => a.status === 'completed');
  }, [accountStatuses]);

  const totalEmailsSynced = React.useMemo(() => {
    return accountStatuses.reduce((sum, a) => sum + (a.emailCount || 0), 0);
  }, [accountStatuses]);

  const totalContactsUpdated = React.useMemo(() => {
    return accountStatuses.reduce((sum, a) => sum + (a.contactsUpdated || 0), 0);
  }, [accountStatuses]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync Handler
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    logger.start('Starting historical sync', { monthsBack });

    setSyncState('syncing');
    setProgress(0);
    setStatusMessage('Starting historical sync...');

    try {
      const response = await fetch('/api/contacts/historical-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthsBack: parseInt(monthsBack, 10) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      const result: HistoricalSyncResult = await response.json();
      setLastResult(result);

      if (result.success) {
        setSyncState('success');
        setProgress(100);
        setStatusMessage(result.message);

        // Refresh status
        await loadStatus();

        toast({
          title: 'Historical sync complete!',
          description: result.message,
        });

        logger.success('Historical sync completed', {
          results: result.results,
        });

        onSyncComplete?.(result);
      } else {
        throw new Error(result.message || 'Sync failed');
      }
    } catch (error) {
      setSyncState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage(message);

      logger.error('Historical sync failed', { error: message });

      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: message,
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const getButtonIcon = () => {
    switch (syncState) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getButtonLabel = () => {
    if (alreadySynced && totalEmailsSynced > 0) {
      return `History Synced (${totalEmailsSynced.toLocaleString()})`;
    }
    return 'Sync History';
  };

  // Get current selection label
  const selectedOption = HISTORICAL_SYNC_OPTIONS.monthsBackChoices.find(
    (o) => o.value.toString() === monthsBack
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            title="Sync historical emails for CRM"
          >
            {getButtonIcon()}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 ${className}`}
          >
            {getButtonIcon()}
            <span>{getButtonLabel()}</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Sync Contact History
          </DialogTitle>
          <DialogDescription>
            Pull email metadata from the past to populate contact communication
            history. This is free — no AI analysis costs.
          </DialogDescription>
        </DialogHeader>

        {/* Already synced state */}
        {alreadySynced && totalEmailsSynced > 0 && syncState === 'idle' && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              History already synced
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{totalEmailsSynced.toLocaleString()} emails</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{totalContactsUpdated.toLocaleString()} contacts updated</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              You can sync again to extend the history further back.
            </p>
          </div>
        )}

        {/* Syncing state */}
        {syncState === 'syncing' && (
          <div className="space-y-4 py-4">
            {/* Simple progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{statusMessage}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This may take a few minutes for large mailboxes.
              You can close this dialog — sync will continue in the background.
            </p>
          </div>
        )}

        {/* Success state */}
        {syncState === 'success' && lastResult && (
          <div className="space-y-4 py-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                <Check className="h-4 w-4" />
                Sync complete!
              </div>
              <p className="text-sm">{lastResult.message}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {syncState === 'error' && (
          <div className="space-y-4 py-4">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                <AlertCircle className="h-4 w-4" />
                Sync failed
              </div>
              <p className="text-sm">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* Configuration (only show when idle) */}
        {syncState === 'idle' && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>How far back should we sync?</Label>
              <Select value={monthsBack} onValueChange={setMonthsBack}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedOption?.label || 'Select time range'}
                    {selectedOption?.recommended && ' (Recommended)'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HISTORICAL_SYNC_OPTIONS.monthsBackChoices.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      <div className="flex flex-col">
                        <span>
                          {option.label}
                          {option.recommended && (
                            <span className="ml-2 text-xs text-primary">(Recommended)</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>Estimated time: 2-5 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-green-600 dark:text-green-400">$0</span>
                <span>No AI costs — metadata only</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {syncState === 'idle' && (
            <>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSync}>
                Start Sync
              </Button>
            </>
          )}

          {syncState === 'syncing' && (
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close (sync continues)
            </Button>
          )}

          {(syncState === 'success' || syncState === 'error') && (
            <>
              {syncState === 'error' && (
                <Button variant="outline" onClick={handleSync}>
                  Retry
                </Button>
              )}
              <Button onClick={() => {
                setDialogOpen(false);
                setSyncState('idle');
              }}>
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HistoricalSyncButton;
