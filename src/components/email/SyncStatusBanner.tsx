/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Sync Status Banner Component
 *
 * Shows real-time feedback about email sync status to users.
 * Critical for first-time users to understand the system is working.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - idle: No sync in progress, shows last sync time
 * - syncing: Active sync, shows animated progress
 * - success: Sync completed successfully
 * - error: Sync failed with error details
 * - never_synced: Account never synced (first-time user)
 *
 * @module components/email/SyncStatusBanner
 */

'use client';

import * as React from 'react';
import { Button, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CloudOff,
  Mail,
  Clock,
  Sparkles,
  Zap,
  Brain,
  FileSearch,
  Tags,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SyncStatusBanner');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'never_synced';

export type AnalysisStatus = 'pending' | 'analyzing' | 'ready' | 'complete';

export interface AnalysisInfo {
  status: AnalysisStatus;
  analyzedCount: number;
  unanalyzedCount: number;
  categoryCounts: Record<string, number>;
  pendingActions: number;
}

export interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncAt: string | null;
  emailsCount: number;
  errorMessage?: string;
  accountEmail?: string;
  analysis?: AnalysisInfo;
}

export interface SyncStatusBannerProps {
  /** Callback when sync completes */
  onSyncComplete?: () => void;
  /** Show compact version */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Initial sync email count (from user settings) */
  initialSyncCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC PHASES - For progress indicator
// ═══════════════════════════════════════════════════════════════════════════════

interface SyncPhase {
  id: string;
  label: string;
  icon: React.ReactNode;
  duration: number; // estimated ms
}

const SYNC_PHASES: SyncPhase[] = [
  { id: 'fetch', label: 'Fetching emails', icon: <Mail className="h-3 w-3" />, duration: 5000 },
  { id: 'categorize', label: 'Categorizing', icon: <Tags className="h-3 w-3" />, duration: 15000 },
  { id: 'extract', label: 'Extracting actions', icon: <FileSearch className="h-3 w-3" />, duration: 10000 },
  { id: 'analyze', label: 'AI analysis', icon: <Brain className="h-3 w-3" />, duration: 10000 },
];

const TOTAL_ESTIMATED_DURATION = SYNC_PHASES.reduce((sum, p) => sum + p.duration, 0);

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Never synced';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function SyncProgressIndicator({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  // Calculate progress (0-100) with easing
  const linearProgress = Math.min(100, (elapsed / TOTAL_ESTIMATED_DURATION) * 100);
  // Use easing to slow down as we approach 100% (never quite reach it until done)
  const easedProgress = Math.min(95, linearProgress * (1 - Math.pow(linearProgress / 100, 2) * 0.3));

  // Determine current phase
  let cumulativeDuration = 0;
  let currentPhaseIndex = 0;
  for (let i = 0; i < SYNC_PHASES.length; i++) {
    cumulativeDuration += SYNC_PHASES[i].duration;
    if (elapsed < cumulativeDuration) {
      currentPhaseIndex = i;
      break;
    }
    currentPhaseIndex = i;
  }
  const currentPhase = SYNC_PHASES[currentPhaseIndex];

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${easedProgress}%` }}
        />
      </div>

      {/* Phase indicator */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-primary font-medium">
            {currentPhase.icon}
            <span>{currentPhase.label}...</span>
          </div>
        </div>
        <span className="text-muted-foreground">
          {Math.round(easedProgress)}% complete
        </span>
      </div>

      {/* Phase dots */}
      <div className="flex justify-center gap-2">
        {SYNC_PHASES.map((phase, index) => (
          <div
            key={phase.id}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all
              ${index < currentPhaseIndex
                ? 'bg-primary/20 text-primary'
                : index === currentPhaseIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'}
            `}
          >
            {index < currentPhaseIndex ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : index === currentPhaseIndex ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              phase.icon
            )}
            <span className="hidden sm:inline">{phase.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SyncStatusBanner({
  onSyncComplete,
  compact = false,
  className = '',
  initialSyncCount = 50,
}: SyncStatusBannerProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [syncInfo, setSyncInfo] = React.useState<SyncStatusInfo>({
    status: 'idle',
    lastSyncAt: null,
    emailsCount: 0,
  });
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncStartTime, setSyncStartTime] = React.useState<number | null>(null);
  const [lastSyncResult, setLastSyncResult] = React.useState<{
    emailsFetched: number;
    emailsAnalyzed: number;
    actionsCreated: number;
  } | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch sync status from database
  // ───────────────────────────────────────────────────────────────────────────

  const fetchSyncStatus = React.useCallback(async () => {
    logger.debug('Fetching sync status');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No user found when fetching sync status');
        return;
      }

      const { data: account, error: accountError } = await supabase
        .from('gmail_accounts')
        .select('email, last_sync_at, sync_enabled')
        .eq('user_id', user.id)
        .eq('sync_enabled', true)
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      if (accountError && accountError.code !== 'PGRST116') {
        logger.error('Failed to fetch Gmail account', { error: accountError.message });
        throw accountError;
      }

      const { count: emailsCount } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { data: syncLog } = await supabase
        .from('sync_logs')
        .select('status, error_message, completed_at, emails_fetched')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      const { count: analyzedCount } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('analyzed_at', 'is', null);

      const { count: pendingActions } = await supabase
        .from('actions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending');

      let status: SyncStatus = 'idle';
      let errorMessage: string | undefined;

      if (!account?.last_sync_at) {
        status = 'never_synced';
      } else if (syncLog?.status === 'failed') {
        status = 'error';
        errorMessage = syncLog.error_message || 'Sync failed';
      } else if (syncLog?.status === 'started') {
        status = 'syncing';
      }

      const unanalyzedCount = (emailsCount || 0) - (analyzedCount || 0);
      let analysisStatus: AnalysisStatus = 'complete';
      if (unanalyzedCount > 0 && (analyzedCount || 0) === 0) {
        analysisStatus = 'pending';
      } else if (unanalyzedCount > 0) {
        analysisStatus = 'ready';
      }

      setSyncInfo({
        status,
        lastSyncAt: account?.last_sync_at || null,
        emailsCount: emailsCount || 0,
        errorMessage,
        accountEmail: account?.email,
        analysis: {
          status: analysisStatus,
          analyzedCount: analyzedCount || 0,
          unanalyzedCount,
          categoryCounts: {},
          pendingActions: pendingActions || 0,
        },
      });

      logger.success('Sync status fetched', {
        status,
        emailsCount,
        analyzedCount,
        unanalyzedCount,
        lastSyncAt: account?.last_sync_at,
      });
    } catch (err) {
      logger.error('Error fetching sync status', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [supabase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Trigger manual sync
  // ───────────────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStartTime(Date.now());
    setSyncInfo((prev) => ({ ...prev, status: 'syncing' }));
    setLastSyncResult(null);

    logger.start('Manual sync triggered');

    try {
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxResults: initialSyncCount,
          analysisMaxEmails: initialSyncCount,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      const analysisResult = result.analysis;
      logger.success('Manual sync completed', {
        totalCreated: result.totals?.totalCreated,
        totalFetched: result.totals?.totalFetched,
        analyzed: analysisResult?.successCount || 0,
        actionsCreated: analysisResult?.actionsCreated || 0,
      });

      // Store last sync result for display
      setLastSyncResult({
        emailsFetched: result.totals?.totalCreated || 0,
        emailsAnalyzed: analysisResult?.successCount || 0,
        actionsCreated: analysisResult?.actionsCreated || 0,
      });

      setSyncInfo((prev) => ({
        ...prev,
        status: 'success',
        lastSyncAt: new Date().toISOString(),
        emailsCount: prev.emailsCount + (result.totals?.totalCreated || 0),
        analysis: analysisResult ? {
          status: 'complete' as const,
          analyzedCount: (prev.analysis?.analyzedCount || 0) + (analysisResult.successCount || 0),
          unanalyzedCount: 0,
          categoryCounts: analysisResult.categorized || {},
          pendingActions: (prev.analysis?.pendingActions || 0) + (analysisResult.actionsCreated || 0),
        } : prev.analysis,
      }));

      onSyncComplete?.();

      setTimeout(() => {
        setSyncInfo((prev) => ({ ...prev, status: 'idle' }));
        setLastSyncResult(null);
      }, 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      logger.error('Manual sync failed', { error: errorMessage });

      setSyncInfo((prev) => ({
        ...prev,
        status: 'error',
        errorMessage,
      }));
    } finally {
      setIsSyncing(false);
      setSyncStartTime(null);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  React.useEffect(() => {
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  // ───────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ───────────────────────────────────────────────────────────────────────────

  const getStatusIcon = () => {
    switch (syncInfo.status) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'never_synced':
        return <CloudOff className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Mail className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusMessage = () => {
    switch (syncInfo.status) {
      case 'syncing':
        return 'Syncing and analyzing your emails...';
      case 'success':
        if (lastSyncResult) {
          const parts = [];
          if (lastSyncResult.emailsFetched > 0) {
            parts.push(`${lastSyncResult.emailsFetched} new emails`);
          }
          if (lastSyncResult.emailsAnalyzed > 0) {
            parts.push(`${lastSyncResult.emailsAnalyzed} analyzed`);
          }
          if (lastSyncResult.actionsCreated > 0) {
            parts.push(`${lastSyncResult.actionsCreated} action${lastSyncResult.actionsCreated !== 1 ? 's' : ''} found`);
          }
          return parts.length > 0 ? `Sync complete! ${parts.join(', ')}.` : 'Sync complete!';
        }
        return 'Sync complete!';
      case 'error':
        return `Sync failed: ${syncInfo.errorMessage}`;
      case 'never_synced':
        return 'Your emails haven\'t been synced yet. Click "Sync Now" to get started.';
      default:
        if (syncInfo.analysis?.analyzedCount) {
          return `${syncInfo.emailsCount} emails synced, ${syncInfo.analysis.analyzedCount} analyzed`;
        }
        return `${syncInfo.emailsCount} emails synced`;
    }
  };

  const getStatusColor = () => {
    switch (syncInfo.status) {
      case 'syncing':
        return 'bg-primary/10 border-primary/20 text-primary';
      case 'success':
        return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/50 dark:border-green-900 dark:text-green-300';
      case 'error':
        return 'bg-destructive/10 border-destructive/20 text-destructive';
      case 'never_synced':
        return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-900 dark:text-amber-300';
      default:
        return 'bg-muted/50 border-border/50 text-muted-foreground';
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render compact version
  // ───────────────────────────────────────────────────────────────────────────

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        {getStatusIcon()}
        <span className="text-muted-foreground">
          {syncInfo.status === 'idle'
            ? `Last sync: ${formatLastSync(syncInfo.lastSyncAt)}`
            : getStatusMessage()}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-7 px-2"
        >
          {isSyncing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render full banner
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`
        rounded-lg border p-4 transition-colors duration-200
        ${getStatusColor()}
        ${className}
      `}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Status info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {getStatusIcon()}
          <div className="min-w-0">
            <p className="font-medium text-sm">{getStatusMessage()}</p>
            {syncInfo.status !== 'never_synced' && syncInfo.status !== 'syncing' && (
              <div className="flex items-center gap-2 text-xs opacity-75 mt-0.5">
                <Clock className="h-3 w-3" />
                <span>Last sync: {formatLastSync(syncInfo.lastSyncAt)}</span>
                {syncInfo.accountEmail && (
                  <>
                    <span>-</span>
                    <span className="truncate">{syncInfo.accountEmail}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sync button - hide during syncing */}
        {!isSyncing && (
          <Button
            variant={syncInfo.status === 'never_synced' ? 'default' : 'outline'}
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="shrink-0"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Now
          </Button>
        )}
      </div>

      {/* Progress indicator during sync */}
      {syncInfo.status === 'syncing' && syncStartTime && (
        <div className="mt-4 pt-4 border-t border-current/10">
          <SyncProgressIndicator startTime={syncStartTime} />
        </div>
      )}

      {/* First-time user guidance */}
      {syncInfo.status === 'never_synced' && (
        <p className="text-xs mt-3 opacity-75">
          IdeaBox will fetch your recent emails and start categorizing them automatically.
          This usually takes 30-60 seconds.
        </p>
      )}

      {/* AI Analysis status bar - show for returning users with analysis data */}
      {syncInfo.status !== 'never_synced' && syncInfo.status !== 'syncing' && syncInfo.analysis && syncInfo.analysis.analyzedCount > 0 && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              <span className="font-medium">AI Analysis:</span>
            </div>
            <div className="flex items-center gap-3 text-xs opacity-75">
              <span>{syncInfo.analysis.analyzedCount} analyzed</span>
              {syncInfo.analysis.pendingActions > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {syncInfo.analysis.pendingActions} action{syncInfo.analysis.pendingActions !== 1 ? 's' : ''} pending
                </span>
              )}
              {syncInfo.analysis.unanalyzedCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {syncInfo.analysis.unanalyzedCount} pending analysis
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success state with detailed results */}
      {syncInfo.status === 'success' && lastSyncResult && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <div className="flex flex-wrap items-center gap-2">
            {lastSyncResult.emailsFetched > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Mail className="h-3 w-3 mr-1" />
                {lastSyncResult.emailsFetched} new
              </Badge>
            )}
            {lastSyncResult.emailsAnalyzed > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                {lastSyncResult.emailsAnalyzed} analyzed
              </Badge>
            )}
            {lastSyncResult.actionsCreated > 0 && (
              <Badge variant="default" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                {lastSyncResult.actionsCreated} action{lastSyncResult.actionsCreated !== 1 ? 's' : ''} found
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncStatusBanner;
