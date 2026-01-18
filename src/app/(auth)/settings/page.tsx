/* eslint-disable max-lines */
/**
 * Settings Page for IdeaBox
 *
 * User preferences and account settings. Organized into sections:
 * - Profile: Display name, email preferences
 * - Accounts: Connected Gmail accounts management
 * - AI Settings: Analysis preferences and categorization rules
 * - Cost Control: Daily/monthly limits and usage tracking
 * - Notifications: Email and in-app notification settings
 * - Danger Zone: Account deletion and data export
 *
 * @module app/(auth)/settings/page
 */

'use client';

import * as React from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/hooks/useSettings';
import type { UserSettings } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface MockConnectedAccount {
  id: string;
  email: string;
  isPrimary: boolean;
  lastSyncedAt: Date;
  syncStatus: 'active' | 'paused' | 'error';
}

// Mock accounts (will be replaced with real data later)
const MOCK_ACCOUNTS: MockConnectedAccount[] = [
  {
    id: '1',
    email: 'user@gmail.com',
    isPrimary: true,
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 5),
    syncStatus: 'active',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

function getSyncStatusBadge(status: MockConnectedAccount['syncStatus']) {
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

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatPercent(percent: number): string {
  return `${Math.min(100, percent).toFixed(1)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileSection({ displayName }: { displayName: string }) {
  const [name, setName] = React.useState(displayName);
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
    toast({ title: 'Profile updated', description: 'Your display name has been saved.' });
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
          />
        </div>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardContent>
    </Card>
  );
}

function AccountsSection({ accounts }: { accounts: MockConnectedAccount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>Manage your Gmail accounts connected to IdeaBox</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {accounts.map((account) => {
            const statusBadge = getSyncStatusBadge(account.syncStatus);
            return (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{account.email}</span>
                      {account.isPrimary && (
                        <Badge variant="outline" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last synced: {formatLastSync(account.lastSyncedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  {!account.isPrimary && (
                    <Button variant="ghost" size="sm" className="text-destructive">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Connect Another Account
        </Button>
      </CardContent>
    </Card>
  );
}

interface AISettingsSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  isUpdating: boolean;
}

function AISettingsSection({ settings, onUpdate, isUpdating }: AISettingsSectionProps) {
  const handleToggle = async (key: keyof UserSettings, value: boolean) => {
    await onUpdate({ [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Analysis
        </CardTitle>
        <CardDescription>Configure how IdeaBox analyzes your emails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="autoAnalyze">Auto-Analyze</Label>
            <p className="text-sm text-muted-foreground">
              Automatically analyze new emails as they arrive
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
              Automatically sort emails into categories
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

        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Analysis Limits</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialSyncCount">Initial Sync Emails</Label>
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
              <p className="text-xs text-muted-foreground">Emails analyzed on first sync</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPerSync">Max Per Sync</Label>
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
              <p className="text-xs text-muted-foreground">Max emails to fetch per sync</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAnalysis">Max Analysis Per Sync</Label>
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
              <p className="text-xs text-muted-foreground">Max emails to analyze per sync</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

interface NotificationsSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
  isUpdating: boolean;
}

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

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4, 5].map((i) => (
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

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings, usage, isLoading, isUpdating, error, updateSettings, refreshUsage } =
    useSettings();
  const { toast } = useToast();

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
        description="Manage your account and preferences"
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
              All Changes Auto-Save
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
        <div className="space-y-6">
          <ProfileSection displayName={user?.name || 'User'} />
          <AccountsSection accounts={MOCK_ACCOUNTS} />
          <AISettingsSection
            settings={settings}
            onUpdate={handleUpdate}
            isUpdating={isUpdating}
          />
          <CostControlSection
            settings={settings}
            usage={usage}
            onUpdate={handleUpdate}
            onRefreshUsage={refreshUsage}
            isUpdating={isUpdating}
          />
          <NotificationsSection
            settings={settings}
            onUpdate={handleUpdate}
            isUpdating={isUpdating}
          />
          <DangerZoneSection />
        </div>
      )}
    </div>
  );
}
