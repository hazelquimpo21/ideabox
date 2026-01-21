/* eslint-disable max-lines */
/**
 * Settings Page for IdeaBox
 *
 * Comprehensive user settings organized into tabs for better navigation.
 * This page allows users to manage their profile, connected accounts,
 * AI analysis preferences, costs, notifications, and personal context.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Account & Sync   - Profile info, connected Gmail accounts, sync controls
 * 2. AI Analysis      - Analysis toggles, limits, categorization preferences
 * 3. Cost Control     - Usage tracking, daily/monthly limits, budget alerts
 * 4. Notifications    - Email digests, reminders, alerts configuration
 * 5. About Me         - Personal context for AI (role, VIPs, schedule, etc.)
 * 6. Danger Zone      - Data export, account deletion
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page pulls data from multiple sources:
 * - useSettings()      - user_settings table (AI config, costs, notifications)
 * - useUserContext()   - user_context table (role, VIPs, schedule, etc.)
 * - useGmailAccounts() - gmail_accounts table (connected accounts)
 * - useSyncStatus()    - sync state and triggers
 *
 * @module app/(auth)/settings/page
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
  Skeleton,
  Badge,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import {
  User,
  Mail,
  Bell,
  Sparkles,
  Trash2,
  Plus,
  Check,
  AlertTriangle,
  Download,
  LogOut,
  DollarSign,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Briefcase,
  MapPin,
  Clock,
  Star,
  Target,
  FolderKanban,
  Heart,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSettings, useUserContext, useGmailAccounts, useSyncStatus } from '@/hooks';
import type { UserSettings } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tab configuration for the settings page.
 * Each tab has an id, label, icon, and description.
 */
const SETTINGS_TABS = [
  { id: 'account', label: 'Account & Sync', icon: Mail, description: 'Profile and connected accounts' },
  { id: 'ai', label: 'AI Analysis', icon: Sparkles, description: 'Analysis preferences' },
  { id: 'costs', label: 'Costs', icon: DollarSign, description: 'Usage and limits' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alert preferences' },
  { id: 'about', label: 'About Me', icon: User, description: 'Personal context for AI' },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, description: 'Destructive actions' },
] as const;

type SettingsTab = typeof SETTINGS_TABS[number]['id'];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date as a relative time string (e.g., "5 min ago").
 */
function formatLastSync(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

/**
 * Gets the badge variant and label for a sync status.
 */
function getSyncStatusBadge(status: 'active' | 'paused' | 'error') {
  switch (status) {
    case 'active':
      return { variant: 'default' as const, label: 'Active' };
    case 'paused':
      return { variant: 'secondary' as const, label: 'Paused' };
    case 'error':
      return { variant: 'destructive' as const, label: 'Error' };
    default:
      return { variant: 'secondary' as const, label: 'Unknown' };
  }
}

/**
 * Formats a cost value as USD.
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Formats a percentage value.
 */
function formatPercent(percent: number): string {
  return `${Math.min(100, percent).toFixed(1)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT & SYNC TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Profile section within the Account tab.
 * Allows editing display name - actually saves to database.
 */
function ProfileSection({ displayName }: { displayName: string }) {
  const [name, setName] = React.useState(displayName);
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const { toast } = useToast();

  // Track changes
  React.useEffect(() => {
    setHasChanges(name !== displayName);
  }, [name, displayName]);

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      toast({ title: 'Profile updated', description: 'Your display name has been saved.' });
      setHasChanges(false);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save profile. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile
        </CardTitle>
        <CardDescription>Manage your display name and profile settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasChanges) {
                handleSave();
              }
            }}
          />
        </div>
        <Button onClick={handleSave} disabled={isSaving || !hasChanges} size="sm">
          {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Connected Gmail accounts section.
 * Shows real account data from useGmailAccounts hook.
 *
 * NOTE: Previously used mock data. Now uses real data from gmail_accounts table.
 */
function AccountsSection() {
  const { accounts, isLoading, error, disconnectAccount, refetch, totalEmails } = useGmailAccounts();
  const { triggerSync, isSyncing } = useSyncStatus();
  const { connectAdditionalAccount } = useAuth();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = React.useState(false);

  const handleDisconnect = async (accountId: string, email: string) => {
    const success = await disconnectAccount(accountId);
    if (success) {
      toast({ title: 'Account disconnected', description: `${email} has been removed.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to disconnect account.' });
    }
  };

  const handleRefresh = async () => {
    // Trigger a full sync (fetch new emails + analyze)
    const result = await triggerSync();
    if (result?.success) {
      toast({ title: 'Refresh started', description: 'Fetching new emails from Gmail...' });
      refetch(); // Refresh account data to update lastSyncAt
    } else {
      toast({ variant: 'destructive', title: 'Refresh failed', description: 'Unknown error' });
    }
  };

  const handleConnectAccount = async () => {
    setIsConnecting(true);
    try {
      await connectAdditionalAccount();
      // Will redirect to OAuth flow, so we won't reach here
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to connect',
        description: err instanceof Error ? err.message : 'Could not initiate account connection.',
      });
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Connected Accounts
            </CardTitle>
            <CardDescription>
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length > 1 ? 's' : ''} connected • ${totalEmails.toLocaleString()} emails synced`
                : 'Gmail accounts synced with IdeaBox'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isSyncing}
            title="Refresh: Fetch new emails from Gmail and analyze them"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Refreshing...' : 'Refresh All'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No Gmail accounts connected</p>
            <p className="text-sm">Connect an account to start syncing emails.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const statusBadge = getSyncStatusBadge(account.syncStatus);
              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{account.email}</span>
                        {account.isPrimary && (
                          <Badge variant="outline" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{account.emailCount.toLocaleString()} emails</span>
                        <span>•</span>
                        <span>
                          {account.lastSyncAt ? `Synced ${formatLastSync(account.lastSyncAt)}` : 'Never synced'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    {account.syncStatus === 'error' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-600 hover:text-amber-700"
                        onClick={handleConnectAccount}
                        disabled={isConnecting}
                        title="Reconnect this account to refresh access"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {!account.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDisconnect(account.id, account.email)}
                        title="Disconnect this account"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleConnectAccount}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Connect Another Account
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Sync Statistics from API
 */
interface SyncStats {
  isHealthy: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  stats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    partialRuns: number;
    totalAccountsProcessed: number;
    totalEmailsCreated: number;
    avgDurationMs: number;
  };
  syncInterval: string;
}

/**
 * Sync Status Card - Shows detailed sync status, schedule info, and last sync results.
 */
function SyncStatusCard() {
  const { status, lastSyncAt, emailsCount, isSyncing, triggerSync, lastSyncResult, errorMessage } = useSyncStatus();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [cronStats, setCronStats] = React.useState<SyncStats | null>(null);

  // Fetch cron statistics
  React.useEffect(() => {
    async function fetchCronStats() {
      try {
        const response = await fetch('/api/settings/sync-stats');
        if (response.ok) {
          const data = await response.json();
          setCronStats(data);
        }
      } catch {
        // Silently fail - cron stats are optional
      }
    }
    fetchCronStats();
  }, [lastSyncResult]); // Re-fetch after a sync completes

  const handleManualSync = async () => {
    const result = await triggerSync();
    if (result?.success) {
      const { totals } = result;
      toast({
        title: 'Sync completed',
        description: `Fetched ${totals.totalFetched} emails, added ${totals.totalCreated} new.`,
      });
    } else if (result === null && errorMessage) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: errorMessage,
      });
    }
  };

  // Calculate next sync time (every 15 minutes)
  const getNextSyncTime = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    // Next sync at :00, :15, :30, or :45
    const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
    const minutesUntil = nextQuarter - minutes;
    return minutesUntil <= 15 ? `~${minutesUntil} min` : `~${minutesUntil} min`;
  };

  // Status display configuration
  const statusConfig = {
    idle: { label: 'Ready', color: 'bg-green-500', icon: Check },
    syncing: { label: 'Syncing...', color: 'bg-blue-500', icon: RefreshCw },
    success: { label: 'Completed', color: 'bg-green-500', icon: Check },
    error: { label: 'Error', color: 'bg-destructive', icon: AlertCircle },
    never_synced: { label: 'Not synced', color: 'bg-yellow-500', icon: AlertTriangle },
    loading: { label: 'Loading...', color: 'bg-muted', icon: RefreshCw },
  };

  const currentStatus = statusConfig[status] || statusConfig.idle;
  const StatusIcon = currentStatus.icon;

  // Get sync limits from settings
  const maxEmailsPerSync = settings?.max_emails_per_sync || 100;
  const maxAnalysisPerSync = settings?.max_analysis_per_sync || 50;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sync Status
            </CardTitle>
            <CardDescription>Email synchronization status and controls</CardDescription>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync Schedule Info */}
        <div className={`p-3 rounded-lg border ${
          cronStats?.isHealthy === false
            ? 'bg-yellow-500/5 border-yellow-500/20'
            : 'bg-primary/5 border-primary/20'
        }`}>
          <div className="flex items-start gap-3">
            <Clock className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
              cronStats?.isHealthy === false ? 'text-yellow-600' : 'text-primary'
            }`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Automatic Sync</span>
                {cronStats === null ? (
                  <Badge variant="outline" className="text-xs">
                    Checking...
                  </Badge>
                ) : cronStats.isHealthy ? (
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                    Healthy
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                    {cronStats.stats?.totalRuns === 0 ? 'No runs yet' : 'Delayed'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Syncs every 15 min • Up to {maxEmailsPerSync} emails fetched • {maxAnalysisPerSync} analyzed per sync
              </p>
              {cronStats?.lastRunAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last cron run: {formatLastSync(new Date(cronStats.lastRunAt))}
                  {cronStats.lastRunStatus && ` (${cronStats.lastRunStatus})`}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                Next automatic sync in {getNextSyncTime()}
              </p>
              {cronStats?.stats && cronStats.stats.totalRuns > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last 24h: {cronStats.stats.totalRuns} runs, {cronStats.stats.totalEmailsCreated} emails created
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${currentStatus.color} ${status === 'syncing' ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium">Status</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
              <span className="text-lg font-semibold">{currentStatus.label}</span>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm font-medium text-muted-foreground mb-2">Last Sync</div>
            <div className="text-lg font-semibold">
              {lastSyncAt ? formatLastSync(new Date(lastSyncAt)) : 'Never'}
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm font-medium text-muted-foreground mb-2">Total Emails</div>
            <div className="text-lg font-semibold">{emailsCount.toLocaleString()}</div>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Last Sync Results */}
        {lastSyncResult && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Last Sync Results
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{lastSyncResult.totals.totalFetched}</div>
                <div className="text-xs text-muted-foreground">Fetched</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{lastSyncResult.totals.totalCreated}</div>
                <div className="text-xs text-muted-foreground">New</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-600">{lastSyncResult.totals.totalSkipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-destructive">{lastSyncResult.totals.totalFailed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </div>
        )}

        {/* Sync Tip */}
        {status === 'never_synced' && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
            <p className="font-medium text-yellow-700 dark:text-yellow-400">Get started!</p>
            <p className="text-muted-foreground mt-1">
              Click &quot;Sync Now&quot; to fetch your emails from Gmail and start analyzing them.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sync Settings Card - Allows users to configure sync limits.
 */
interface SyncSettingsCardProps {
  settings: UserSettings | null;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  isUpdating: boolean;
}

function SyncSettingsCard({ settings, onUpdate, isUpdating }: SyncSettingsCardProps) {
  if (!settings) return null;

  const handleChange = async (key: keyof UserSettings, value: number) => {
    await onUpdate({ [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5" />
          Sync Settings
        </CardTitle>
        <CardDescription>Configure how many emails are processed during each sync</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="maxEmailsPerSync">Max Emails Fetched Per Sync</Label>
            <div className="flex items-center gap-3">
              <Input
                id="maxEmailsPerSync"
                type="number"
                min={10}
                max={500}
                value={settings.max_emails_per_sync}
                onChange={(e) => handleChange('max_emails_per_sync', parseInt(e.target.value) || 100)}
                className="w-24"
                disabled={isUpdating}
              />
              <span className="text-sm text-muted-foreground">emails (10-500)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum number of recent emails to fetch from Gmail during each sync cycle.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxAnalysisPerSync">Max Emails Analyzed Per Sync</Label>
            <div className="flex items-center gap-3">
              <Input
                id="maxAnalysisPerSync"
                type="number"
                min={10}
                max={200}
                value={settings.max_analysis_per_sync}
                onChange={(e) => handleChange('max_analysis_per_sync', parseInt(e.target.value) || 50)}
                className="w-24"
                disabled={isUpdating}
              />
              <span className="text-sm text-muted-foreground">emails (10-200)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum number of emails to analyze with AI during each sync. Affects AI costs.
            </p>
          </div>
        </div>

        <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p>
            <strong>Tip:</strong> Higher limits mean more emails processed but longer sync times and higher AI costs.
            The default values (100 fetch / 50 analyze) balance coverage with cost efficiency.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * How Sync Works Card - Explains the sync process to users.
 */
function HowSyncWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          How Email Sync Works
        </CardTitle>
        <CardDescription>Understanding the IdeaBox email sync process</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Automatic Sync (Every 15 min)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                IdeaBox automatically checks for new emails every 15 minutes using a scheduled background job.
                No action needed from you.
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-green-500" />
                <span className="font-medium">Incremental Fetching</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Only new emails are fetched each sync. Duplicates are automatically skipped to save time and resources.
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <span className="font-medium">AI Analysis</span>
              </div>
              <p className="text-sm text-muted-foreground">
                New emails are analyzed by AI to extract action items, categorize content, and identify clients.
              </p>
            </div>
          </div>

          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Sync is fully automatic</p>
                <p className="text-muted-foreground mt-0.5">
                  Your emails are synced every 15 minutes in the background. Use &quot;Sync Now&quot; only if you need immediate updates.
                  Each sync fetches up to your configured limit of recent emails and analyzes them.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Restart Onboarding Card
 *
 * Allows users to go back through the onboarding wizard to:
 * - Update their personal context (About Me)
 * - Re-run initial email analysis
 * - Connect additional Gmail accounts
 *
 * This does NOT delete any existing data - it just opens the wizard again.
 */
function RestartOnboardingCard() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = React.useState(false);

  const handleRestartOnboarding = async () => {
    setIsResetting(true);

    try {
      // Reset onboarding_completed flag in user_profiles
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: false }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset onboarding status');
      }

      toast({
        title: 'Redirecting to setup...',
        description: 'Taking you back to the onboarding wizard.',
      });

      // Small delay to show toast, then redirect
      setTimeout(() => {
        window.location.href = '/onboarding';
      }, 500);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to restart onboarding.',
      });
      setIsResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Setup Wizard
        </CardTitle>
        <CardDescription>
          Go back through the initial setup to update your preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Restart the onboarding wizard to:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>Update your personal context for better AI analysis</li>
          <li>Re-run the initial email analysis with different settings</li>
          <li>Review your connected Gmail accounts</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Note: This won&apos;t delete any of your existing data.
        </p>
        <Button
          variant="outline"
          onClick={handleRestartOnboarding}
          disabled={isResetting}
          className="gap-2"
        >
          {isResetting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Restart Setup Wizard
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI ANALYSIS TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface AISettingsSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  isUpdating: boolean;
}

/**
 * AI analysis settings section.
 * Controls auto-analyze, action extraction, categorization, and client detection.
 */
function AISettingsSection({ settings, onUpdate, isUpdating }: AISettingsSectionProps) {
  const handleToggle = async (key: keyof UserSettings, value: boolean) => {
    await onUpdate({ [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Analysis Settings
        </CardTitle>
        <CardDescription>Configure how IdeaBox analyzes your emails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Analysis Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoAnalyze">Auto-Analyze New Emails</Label>
              <p className="text-sm text-muted-foreground">
                Automatically analyze emails as they arrive
              </p>
            </div>
            <Switch
              id="autoAnalyze"
              checked={settings.auto_analyze}
              onCheckedChange={(checked) => handleToggle('auto_analyze', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="extractActions">Extract Action Items</Label>
              <p className="text-sm text-muted-foreground">
                Find tasks and to-dos in your emails
              </p>
            </div>
            <Switch
              id="extractActions"
              checked={settings.extract_actions}
              onCheckedChange={(checked) => handleToggle('extract_actions', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="categorizeEmails">Categorize Emails</Label>
              <p className="text-sm text-muted-foreground">
                Sort emails into categories (action, event, newsletter, etc.)
              </p>
            </div>
            <Switch
              id="categorizeEmails"
              checked={settings.categorize_emails}
              onCheckedChange={(checked) => handleToggle('categorize_emails', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="detectClients">Detect Clients</Label>
              <p className="text-sm text-muted-foreground">
                Identify and suggest new client relationships
              </p>
            </div>
            <Switch
              id="detectClients"
              checked={settings.detect_clients}
              onCheckedChange={(checked) => handleToggle('detect_clients', checked)}
              disabled={isUpdating}
            />
          </div>
        </div>

        {/* Analysis Limits */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Analysis Limits</h4>
          <p className="text-xs text-muted-foreground mb-4">
            These control how many emails are processed during sync operations.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialSyncCount">Initial Sync</Label>
              <select
                id="initialSyncCount"
                className="w-full h-10 px-3 py-2 text-sm border rounded-md bg-background"
                value={settings.initial_sync_email_count}
                onChange={(e) => onUpdate({ initial_sync_email_count: Number(e.target.value) })}
                disabled={isUpdating}
              >
                <option value={25}>25 emails</option>
                <option value={50}>50 emails (recommended)</option>
                <option value={100}>100 emails</option>
                <option value={200}>200 emails</option>
              </select>
              <p className="text-xs text-muted-foreground">For new account setup</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPerSync">Max Fetch Per Refresh</Label>
              <select
                id="maxPerSync"
                className="w-full h-10 px-3 py-2 text-sm border rounded-md bg-background"
                value={settings.max_emails_per_sync}
                onChange={(e) => onUpdate({ max_emails_per_sync: Number(e.target.value) })}
                disabled={isUpdating}
              >
                <option value={50}>50 emails</option>
                <option value={100}>100 emails</option>
                <option value={200}>200 emails</option>
                <option value={500}>500 emails</option>
              </select>
              <p className="text-xs text-muted-foreground">Emails to fetch from Gmail</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAnalysis">Max Analyze Per Refresh</Label>
              <select
                id="maxAnalysis"
                className="w-full h-10 px-3 py-2 text-sm border rounded-md bg-background"
                value={settings.max_analysis_per_sync}
                onChange={(e) => onUpdate({ max_analysis_per_sync: Number(e.target.value) })}
                disabled={isUpdating}
              >
                <option value={25}>25 emails</option>
                <option value={50}>50 emails</option>
                <option value={100}>100 emails</option>
                <option value={200}>200 emails</option>
              </select>
              <p className="text-xs text-muted-foreground">Emails to run AI on</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Dev Tools Section - Rescan Recent Emails
 *
 * Testing tool that forces re-analysis of already-analyzed emails.
 * This clears previous analysis results and runs AI analysis fresh.
 * Useful for:
 * - Testing AI analyzer changes
 * - Re-processing emails after updating user context
 * - Debugging analysis issues
 *
 * @since January 2026
 */
function DevToolsSection() {
  const { toast } = useToast();
  const [emailCount, setEmailCount] = React.useState(50);
  const [isRunning, setIsRunning] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{
    rescanned: number;
    results: {
      clearedCount: number;
      successCount: number;
      failureCount: number;
      actionsCreated: number;
      estimatedCost: number;
      processingTimeMs: number;
    };
  } | null>(null);

  const handleRescan = async () => {
    setIsRunning(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/emails/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxEmails: emailCount }),
      });

      const result = await response.json();

      if (result.success) {
        setLastResult(result);
        toast({
          title: 'Rescan complete',
          description: `Re-analyzed ${result.rescanned ?? 0} emails. ${result.results?.actionsCreated ?? 0} actions created.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Rescan failed',
          description: result.error || 'Could not complete rescan. Please try again.',
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const estimatedTime = emailCount <= 25 ? '~30 seconds' : emailCount <= 50 ? '~1-2 minutes' : '~2-3 minutes';
  const estimatedCost = `~$${(emailCount * 0.0006).toFixed(2)}`;

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Dev Tools: Rescan Emails
        </CardTitle>
        <CardDescription>
          Force re-analysis of already-analyzed emails (clears previous results)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Testing Only</p>
          <p className="text-muted-foreground mt-1">
            This will clear existing analysis results (category, summary, actions, extracted dates)
            for your most recent emails and re-run AI analysis. Use this for testing analyzer changes
            or debugging.
          </p>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs space-y-2">
            <Label htmlFor="rescanEmailCount">Emails to rescan</Label>
            <select
              id="rescanEmailCount"
              className="w-full h-10 px-3 py-2 text-sm border rounded-md bg-background"
              value={emailCount}
              onChange={(e) => setEmailCount(Number(e.target.value))}
              disabled={isRunning}
            >
              <option value={10}>10 emails (Quick test)</option>
              <option value={25}>25 emails</option>
              <option value={50}>50 emails (Default)</option>
              <option value={100}>100 emails (Max)</option>
            </select>
          </div>
          <Button
            onClick={handleRescan}
            disabled={isRunning}
            variant="outline"
            className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-500/10"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Rescanning...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Rescan Emails
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Estimated time: {estimatedTime}</span>
          <span>&middot;</span>
          <span>Estimated cost: {estimatedCost}</span>
        </div>

        {/* Last Result Summary */}
        {lastResult?.results && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Last Rescan Results
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{lastResult.results.clearedCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">Cleared</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{lastResult.results.successCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">Re-analyzed</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{lastResult.results.actionsCreated ?? 0}</div>
                <div className="text-xs text-muted-foreground">Actions</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">${(lastResult.results.estimatedCost ?? 0).toFixed(4)}</div>
                <div className="text-xs text-muted-foreground">Cost</div>
              </div>
            </div>
            {(lastResult.results.failureCount ?? 0) > 0 && (
              <p className="text-xs text-destructive mt-2">
                {lastResult.results.failureCount} emails failed to analyze
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Re-run Analysis Section
 *
 * Allows users to trigger a new initial analysis with a chosen email count.
 * Useful for users who:
 * - Started with a small sample and want to analyze more
 * - Want to re-analyze with updated settings
 * - Skipped initial analysis and want to run it now
 *
 * @since January 2026
 */
function RerunAnalysisSection() {
  const { isSyncing } = useSyncStatus();
  const { toast } = useToast();
  const [emailCount, setEmailCount] = React.useState(50);
  const [isRunning, setIsRunning] = React.useState(false);

  const handleRerunAnalysis = async () => {
    setIsRunning(true);

    try {
      // Call the sync API directly with custom parameters
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxResults: emailCount,
          analysisMaxEmails: emailCount,
          runAnalysis: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Analysis started',
          description: `Analyzing your last ${emailCount} emails. This may take a minute.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Analysis failed',
          description: result.error || 'Could not start analysis. Please try again.',
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const estimatedTime = emailCount <= 25 ? '~30 seconds' : emailCount <= 50 ? '~1 minute' : '~2 minutes';
  const estimatedCost = `~$${(emailCount * 0.0006).toFixed(2)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Re-run Analysis
        </CardTitle>
        <CardDescription>
          Run AI analysis on a fresh batch of emails with your current settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This will fetch your most recent emails and run them through AI analysis.
          Use this if you want to expand your analyzed email history or re-analyze
          with updated settings.
        </p>

        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs space-y-2">
            <Label htmlFor="rerunEmailCount">Emails to analyze</Label>
            <select
              id="rerunEmailCount"
              className="w-full h-10 px-3 py-2 text-sm border rounded-md bg-background"
              value={emailCount}
              onChange={(e) => setEmailCount(Number(e.target.value))}
              disabled={isRunning || isSyncing}
            >
              <option value={25}>25 emails (Quick)</option>
              <option value={50}>50 emails (Recommended)</option>
              <option value={100}>100 emails (Comprehensive)</option>
              <option value={200}>200 emails (Deep)</option>
            </select>
          </div>
          <Button
            onClick={handleRerunAnalysis}
            disabled={isRunning || isSyncing}
            className="gap-2"
          >
            {isRunning || isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Start Analysis
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Estimated time: {estimatedTime}</span>
          <span>&middot;</span>
          <span>Estimated cost: {estimatedCost}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COST CONTROL TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface CostControlSectionProps {
  settings: UserSettings;
  usage: {
    daily: { cost: number; limit: number; percent: number; remaining: number };
    monthly: { cost: number; limit: number; percent: number; remaining: number };
    is_over_daily_limit: boolean;
    is_over_monthly_limit: boolean;
    breakdown: Record<string, { count: number; cost: number; tokens: number }>;
  } | null;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  onRefreshUsage: () => Promise<void>;
  isUpdating: boolean;
}

/**
 * Cost control and usage tracking section.
 * Shows current usage, limits, and allows setting budget caps.
 */
function CostControlSection({
  settings,
  usage,
  onUpdate,
  onRefreshUsage,
  isUpdating,
}: CostControlSectionProps) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshUsage();
    setIsRefreshing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Cost Control
            </CardTitle>
            <CardDescription>Monitor and limit your AI API usage costs</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage Summary */}
        {usage && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Usage */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Today&apos;s Usage</span>
                {usage.is_over_daily_limit && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Over Limit
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatCost(usage.daily.cost)}</span>
                <span className="text-sm text-muted-foreground">
                  / {formatCost(usage.daily.limit)}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usage.daily.percent > 80
                      ? 'bg-destructive'
                      : usage.daily.percent > 50
                      ? 'bg-yellow-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, usage.daily.percent)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatPercent(usage.daily.percent)} used &middot; {formatCost(usage.daily.remaining)} remaining
              </p>
            </div>

            {/* Monthly Usage */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">This Month</span>
                {usage.is_over_monthly_limit && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Over Limit
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatCost(usage.monthly.cost)}</span>
                <span className="text-sm text-muted-foreground">
                  / {formatCost(usage.monthly.limit)}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usage.monthly.percent > 80
                      ? 'bg-destructive'
                      : usage.monthly.percent > 50
                      ? 'bg-yellow-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, usage.monthly.percent)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatPercent(usage.monthly.percent)} used &middot; {formatCost(usage.monthly.remaining)} remaining
              </p>
            </div>
          </div>
        )}

        {/* Breakdown by Analyzer */}
        {usage && Object.keys(usage.breakdown).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Usage Breakdown
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(usage.breakdown).map(([analyzer, data]) => (
                <div key={analyzer} className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium capitalize">{analyzer.replace('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.count} calls &middot; {formatCost(data.cost)} &middot; {data.tokens.toLocaleString()} tokens
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost Limits */}
        <div className="pt-4 border-t space-y-4">
          <h4 className="text-sm font-medium">Cost Limits</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dailyLimit">Daily Limit (USD)</Label>
              <Input
                id="dailyLimit"
                type="number"
                step="0.10"
                min="0.10"
                max="100"
                value={settings.daily_cost_limit}
                onChange={(e) => onUpdate({ daily_cost_limit: Number(e.target.value) })}
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground">
                Recommended: $1.00 for ~1,600 emails/day
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthlyLimit">Monthly Limit (USD)</Label>
              <Input
                id="monthlyLimit"
                type="number"
                step="1"
                min="1"
                max="500"
                value={settings.monthly_cost_limit}
                onChange={(e) => onUpdate({ monthly_cost_limit: Number(e.target.value) })}
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground">
                Recommended: $10.00 for typical usage
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="space-y-0.5">
              <Label htmlFor="pauseOnLimit">Pause Analysis When Limit Reached</Label>
              <p className="text-sm text-muted-foreground">
                Stop AI analysis when daily or monthly limit is hit
              </p>
            </div>
            <Switch
              id="pauseOnLimit"
              checked={settings.pause_on_limit_reached}
              onCheckedChange={(checked) => onUpdate({ pause_on_limit_reached: checked })}
              disabled={isUpdating}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface NotificationsSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  isUpdating: boolean;
}

/**
 * Notification preferences section.
 * Controls email digests, reminders, and various alert types.
 */
function NotificationsSection({ settings, onUpdate, isUpdating }: NotificationsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>Configure how and when you receive notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Digest Toggle and Frequency */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="emailDigest">Email Digest</Label>
              <p className="text-sm text-muted-foreground">
                Receive a summary of your action items
              </p>
            </div>
            <Switch
              id="emailDigest"
              checked={settings.email_digest_enabled}
              onCheckedChange={(checked) => onUpdate({ email_digest_enabled: checked })}
              disabled={isUpdating}
            />
          </div>

          {settings.email_digest_enabled && (
            <div className="pl-4 border-l-2 border-muted">
              <Label htmlFor="digestFrequency" className="text-sm">Digest Frequency</Label>
              <select
                id="digestFrequency"
                className="mt-1 w-full max-w-xs h-10 px-3 py-2 text-sm border rounded-md bg-background"
                value={settings.email_digest_frequency}
                onChange={(e) => onUpdate({ email_digest_frequency: e.target.value as 'daily' | 'weekly' | 'never' })}
                disabled={isUpdating}
              >
                <option value="daily">Daily (every morning)</option>
                <option value="weekly">Weekly (every Monday)</option>
                <option value="never">Never</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {settings.email_digest_frequency === 'daily'
                  ? 'You\'ll receive a digest every morning at 8 AM in your timezone'
                  : settings.email_digest_frequency === 'weekly'
                  ? 'You\'ll receive a weekly summary every Monday morning'
                  : 'Email digests are disabled'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="actionReminders">Action Reminders</Label>
            <p className="text-sm text-muted-foreground">
              Get reminded about upcoming deadlines
            </p>
          </div>
          <Switch
            id="actionReminders"
            checked={settings.action_reminders}
            onCheckedChange={(checked) => onUpdate({ action_reminders: checked })}
            disabled={isUpdating}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="newClientAlerts">New Client Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Notify when AI detects a potential new client
            </p>
          </div>
          <Switch
            id="newClientAlerts"
            checked={settings.new_client_alerts}
            onCheckedChange={(checked) => onUpdate({ new_client_alerts: checked })}
            disabled={isUpdating}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="syncErrorAlerts">Sync Error Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Alert when email sync encounters issues
            </p>
          </div>
          <Switch
            id="syncErrorAlerts"
            checked={settings.sync_error_alerts}
            onCheckedChange={(checked) => onUpdate({ sync_error_alerts: checked })}
            disabled={isUpdating}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="costLimitAlerts">Cost Limit Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Alert when approaching cost limits
            </p>
          </div>
          <Switch
            id="costLimitAlerts"
            checked={settings.cost_limit_alerts}
            onCheckedChange={(checked) => onUpdate({ cost_limit_alerts: checked })}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABOUT ME TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * About Me section - Personal context for AI personalization.
 *
 * This is the content from UserContextWizard, but editable in Settings.
 * Allows users who skipped onboarding to fill in their context later.
 *
 * NOTE: This data goes to user_context table, NOT user_settings.
 */
function AboutMeSection() {
  const { context, updateContext, isLoading, isUpdating, completionPercent, incompleteSections } = useUserContext();
  const { toast } = useToast();

  // Local state for form fields
  const [role, setRole] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [locationCity, setLocationCity] = React.useState('');
  const [workStart, setWorkStart] = React.useState('09:00');
  const [workEnd, setWorkEnd] = React.useState('17:00');
  const [workDays, setWorkDays] = React.useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [vipInput, setVipInput] = React.useState('');
  const [vipDomainInput, setVipDomainInput] = React.useState('');
  const [priorityInput, setPriorityInput] = React.useState('');
  const [projectInput, setProjectInput] = React.useState('');
  const [interestInput, setInterestInput] = React.useState('');

  // Work days configuration
  const DAYS_OF_WEEK = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];

  // Sync local state with context when loaded
  React.useEffect(() => {
    if (context) {
      setRole(context.role || '');
      setCompany(context.company || '');
      // @ts-expect-error - industry may exist in context
      setIndustry(context.industry || '');
      setLocationCity(context.location_city || '');
      setWorkStart(context.work_hours_start || '09:00');
      setWorkEnd(context.work_hours_end || '17:00');
      setWorkDays(context.work_days || [1, 2, 3, 4, 5]);
    }
  }, [context]);

  const handleSaveField = async (field: string, value: unknown) => {
    const success = await updateContext({ [field]: value });
    if (success) {
      toast({ title: 'Saved', description: `Your ${field.replace('_', ' ')} has been updated.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save. Please try again.' });
    }
  };

  const handleAddToArray = async (field: string, value: string, currentArray: string[]) => {
    if (!value.trim()) return;
    const newArray = [...currentArray, value.trim()];
    const success = await updateContext({ [field]: newArray });
    if (success) {
      // Clear input
      if (field === 'vip_emails') setVipInput('');
      if (field === 'vip_domains') setVipDomainInput('');
      if (field === 'priorities') setPriorityInput('');
      if (field === 'projects') setProjectInput('');
      if (field === 'interests') setInterestInput('');
    }
  };

  const handleToggleWorkDay = async (dayValue: number) => {
    const newDays = workDays.includes(dayValue)
      ? workDays.filter(d => d !== dayValue)
      : [...workDays, dayValue].sort((a, b) => a - b);
    setWorkDays(newDays);
    await updateContext({ work_days: newDays });
  };

  const handleRemoveFromArray = async (field: string, index: number, currentArray: string[]) => {
    const newArray = currentArray.filter((_, i) => i !== index);
    await updateContext({ [field]: newArray });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Completion Progress */}
      <Card className={completionPercent < 50 ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" />
            Profile Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full bg-secondary rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    completionPercent >= 80 ? 'bg-green-500' : completionPercent >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
            <span className="text-lg font-bold">{completionPercent}%</span>
          </div>
          {incompleteSections.length > 0 && completionPercent < 80 && (
            <p className="text-sm text-muted-foreground mt-2">
              Missing: {incompleteSections.slice(0, 3).join(', ')}
              {incompleteSections.length > 3 && ` +${incompleteSections.length - 3} more`}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            A complete profile helps AI better understand and prioritize your emails.
          </p>
        </CardContent>
      </Card>

      {/* Role, Company & Industry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Professional Identity
          </CardTitle>
          <CardDescription>Your professional context helps AI understand and prioritize your emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Your Role</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onBlur={() => role !== context?.role && handleSaveField('role', role)}
                placeholder="e.g., Product Manager"
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                onBlur={() => company !== context?.company && handleSaveField('company', company)}
                placeholder="e.g., Acme Corp"
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                onBlur={() => {
                  // @ts-expect-error - industry may exist in context
                  if (industry !== context?.industry) handleSaveField('industry', industry);
                }}
                placeholder="e.g., Technology, Finance"
                disabled={isUpdating}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VIP Contacts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            VIP Contacts
          </CardTitle>
          <CardDescription>Emails from these addresses get higher priority</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={vipInput}
              onChange={(e) => setVipInput(e.target.value)}
              placeholder="Enter email address"
              disabled={isUpdating}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddToArray('vip_emails', vipInput, context?.vip_emails || []);
                }
              }}
            />
            <Button
              onClick={() => handleAddToArray('vip_emails', vipInput, context?.vip_emails || [])}
              disabled={isUpdating || !vipInput.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {context?.vip_emails && context.vip_emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {context.vip_emails.map((email, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {email}
                  <button
                    onClick={() => handleRemoveFromArray('vip_emails', i, context.vip_emails)}
                    className="ml-1 hover:text-destructive"
                    disabled={isUpdating}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* VIP Domains - emails from entire domains */}
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium">VIP Domains</Label>
            <p className="text-xs text-muted-foreground mb-2">
              All emails from these domains get higher priority (e.g., @important-client.com)
            </p>
            <div className="flex gap-2">
              <Input
                value={vipDomainInput}
                onChange={(e) => setVipDomainInput(e.target.value)}
                placeholder="e.g., @important-client.com"
                disabled={isUpdating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddToArray('vip_domains', vipDomainInput, context?.vip_domains || []);
                  }
                }}
              />
              <Button
                onClick={() => handleAddToArray('vip_domains', vipDomainInput, context?.vip_domains || [])}
                disabled={isUpdating || !vipDomainInput.trim()}
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {context?.vip_domains && context.vip_domains.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {context.vip_domains.map((domain, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {domain}
                    <button
                      onClick={() => handleRemoveFromArray('vip_domains', i, context.vip_domains)}
                      className="ml-1 hover:text-destructive"
                      disabled={isUpdating}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Priorities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Priorities
          </CardTitle>
          <CardDescription>What matters most to you (helps rank emails)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={priorityInput}
              onChange={(e) => setPriorityInput(e.target.value)}
              placeholder="e.g., Client work, Team meetings, Learning"
              disabled={isUpdating}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddToArray('priorities', priorityInput, context?.priorities || []);
                }
              }}
            />
            <Button
              onClick={() => handleAddToArray('priorities', priorityInput, context?.priorities || [])}
              disabled={isUpdating || !priorityInput.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {context?.priorities && context.priorities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {context.priorities.map((priority, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  {i + 1}. {priority}
                  <button
                    onClick={() => handleRemoveFromArray('priorities', i, context.priorities)}
                    className="ml-1 hover:text-destructive"
                    disabled={isUpdating}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Active Projects
          </CardTitle>
          <CardDescription>Track your current projects to tag related emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="e.g., Website Redesign, Q1 Launch, Client ABC Project"
              disabled={isUpdating}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddToArray('projects', projectInput, context?.projects || []);
                }
              }}
            />
            <Button
              onClick={() => handleAddToArray('projects', projectInput, context?.projects || [])}
              disabled={isUpdating || !projectInput.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {context?.projects && context.projects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {context.projects.map((project, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {project}
                  <button
                    onClick={() => handleRemoveFromArray('projects', i, context.projects)}
                    className="ml-1 hover:text-destructive"
                    disabled={isUpdating}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            AI will automatically tag emails that mention these projects
          </p>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Interests
          </CardTitle>
          <CardDescription>Topics you want to stay informed about</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              placeholder="e.g., AI/ML, Design, Marketing"
              disabled={isUpdating}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddToArray('interests', interestInput, context?.interests || []);
                }
              }}
            />
            <Button
              onClick={() => handleAddToArray('interests', interestInput, context?.interests || [])}
              disabled={isUpdating || !interestInput.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {context?.interests && context.interests.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {context.interests.map((interest, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {interest}
                  <button
                    onClick={() => handleRemoveFromArray('interests', i, context.interests)}
                    className="ml-1 hover:text-destructive"
                    disabled={isUpdating}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location & Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Location & Schedule
          </CardTitle>
          <CardDescription>Helps with timezone-aware priority scoring and scheduling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              id="location"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
              onBlur={() => locationCity !== context?.location_city && handleSaveField('location_city', locationCity)}
              placeholder="e.g., Milwaukee, WI"
              disabled={isUpdating}
            />
          </div>

          {/* Work Days */}
          <div className="space-y-2">
            <Label>Work Days</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select the days you typically work
            </p>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <Button
                  key={day.value}
                  variant={workDays.includes(day.value) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleWorkDay(day.value)}
                  disabled={isUpdating}
                  className="w-12"
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Work Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workStart">Work Day Starts</Label>
              <Input
                id="workStart"
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                onBlur={() => workStart !== context?.work_hours_start && handleSaveField('work_hours_start', workStart)}
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workEnd">Work Day Ends</Label>
              <Input
                id="workEnd"
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                onBlur={() => workEnd !== context?.work_hours_end && handleSaveField('work_hours_end', workEnd)}
                disabled={isUpdating}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Emails arriving outside work hours may be deprioritized for immediate attention
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DANGER ZONE TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Danger zone section with destructive actions.
 * Includes data export and account deletion.
 */
function DangerZoneSection() {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>Irreversible actions that affect your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <p className="font-medium">Export Your Data</p>
            <p className="text-sm text-muted-foreground">
              Download all your data including emails, actions, and settings
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        <div className="flex items-center justify-between p-3 border border-destructive/50 rounded-lg bg-destructive/5">
          <div>
            <p className="font-medium text-destructive">Delete Account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data
            </p>
          </div>
          <Button variant="destructive" className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-xl" />
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Settings Page
 *
 * Main settings page with tabbed navigation. Supports deep linking via
 * URL query parameter (e.g., /settings?tab=about).
 *
 * @example URL: /settings?tab=about  -> Opens "About Me" tab
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { settings, usage, isLoading, isUpdating, error, updateSettings, refreshUsage } =
    useSettings();
  const { toast } = useToast();
  const { refetch: refetchAccounts } = useGmailAccounts();

  // Get initial tab from URL or default to 'account'
  const initialTab = (searchParams.get('tab') as SettingsTab) || 'account';
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(initialTab);

  // Handle "account_added" success and errors from OAuth callback
  React.useEffect(() => {
    const accountAdded = searchParams.get('account_added');
    const oauthError = searchParams.get('error');

    if (accountAdded === 'true') {
      toast({
        title: 'Account connected',
        description: 'Your new Gmail account has been added successfully.',
      });
      // Refresh accounts to show the new one
      refetchAccounts();
    } else if (oauthError === 'session_restore_failed') {
      toast({
        variant: 'destructive',
        title: 'Connection failed',
        description: 'Could not add the account while preserving your session. Please try again.',
      });
    } else if (oauthError === 'oauth_failed') {
      toast({
        variant: 'destructive',
        title: 'Connection failed',
        description: 'OAuth authorization failed. Please try again.',
      });
    } else if (oauthError === 'oauth_denied') {
      toast({
        variant: 'destructive',
        title: 'Connection cancelled',
        description: 'You cancelled the account connection. Try again when ready.',
      });
    } else if (oauthError === 'account_exists') {
      toast({
        variant: 'destructive',
        title: 'Account already connected',
        description: 'This Gmail account is already connected to another IdeaBox user.',
      });
    } else if (oauthError === 'invalid_state') {
      toast({
        variant: 'destructive',
        title: 'Security error',
        description: 'The connection request expired. Please try again.',
      });
    } else if (oauthError === 'missing_code' || oauthError === 'missing_user') {
      toast({
        variant: 'destructive',
        title: 'Connection failed',
        description: 'Something went wrong. Please try again.',
      });
    }

    // Remove the query params from URL to prevent showing toast on refresh
    if (accountAdded || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('account_added');
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, toast, refetchAccounts]);

  // Handle update with toast feedback
  const handleUpdate = async (updates: Partial<UserSettings>) => {
    try {
      await updateSettings(updates);
      toast({ title: 'Settings saved', description: 'Your preferences have been updated.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to save',
        description: 'Could not save your settings. Please try again.',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account, preferences, and personal context"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
        actions={
          isUpdating ? (
            <Button variant="outline" size="sm" disabled>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-2">
              <Check className="h-4 w-4" />
              Auto-Saved
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </p>
        </div>
      )}

      {isLoading || !settings ? (
        <SettingsSkeleton />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
          {/* Tab Navigation */}
          <TabsList variant="underline" className="mb-6">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                variant="underline"
                icon={<tab.icon className="h-4 w-4" />}
                className={tab.id === 'danger' ? 'text-destructive data-[state=active]:text-destructive' : ''}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Account & Sync Tab */}
          <TabsContent value="account" className="space-y-6">
            <ProfileSection displayName={user?.name || 'User'} />
            <AccountsSection />
            <SyncStatusCard />
            <SyncSettingsCard
              settings={settings}
              onUpdate={handleUpdate}
              isUpdating={isUpdating}
            />
            <HowSyncWorksCard />
            <RestartOnboardingCard />
          </TabsContent>

          {/* AI Analysis Tab */}
          <TabsContent value="ai" className="space-y-6">
            <AISettingsSection
              settings={settings}
              onUpdate={handleUpdate}
              isUpdating={isUpdating}
            />
            <RerunAnalysisSection />
            <DevToolsSection />
          </TabsContent>

          {/* Cost Control Tab */}
          <TabsContent value="costs" className="space-y-6">
            <CostControlSection
              settings={settings}
              usage={usage}
              onUpdate={handleUpdate}
              onRefreshUsage={refreshUsage}
              isUpdating={isUpdating}
            />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <NotificationsSection
              settings={settings}
              onUpdate={handleUpdate}
              isUpdating={isUpdating}
            />
          </TabsContent>

          {/* About Me Tab */}
          <TabsContent value="about">
            <AboutMeSection />
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-6">
            <DangerZoneSection />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
