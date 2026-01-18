/* eslint-disable max-lines */
/**
 * Settings Page for IdeaBox
 *
 * User preferences and account settings. Organized into sections:
 * - Profile: Display name, email preferences
 * - Accounts: Connected Gmail accounts management
 * - Notifications: Email and in-app notification settings
 * - AI Settings: Analysis preferences and categorization rules
 * - Danger Zone: Account deletion and data export
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CURRENT STATUS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Placeholder implementation with mock data. Requires:
 * - useUserSettings hook for data fetching
 * - API routes for settings CRUD operations
 * - Gmail account connection/disconnection logic
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
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock connected account data structure.
 * Will be replaced with actual GmailAccount type from database.
 */
interface MockConnectedAccount {
  id: string;
  email: string;
  isPrimary: boolean;
  lastSyncedAt: Date;
  syncStatus: 'active' | 'paused' | 'error';
}

/**
 * User notification preferences.
 */
interface NotificationSettings {
  emailDigest: boolean;
  emailDigestFrequency: 'daily' | 'weekly' | 'never';
  actionReminders: boolean;
  newClientAlerts: boolean;
  syncErrorAlerts: boolean;
}

/**
 * AI analysis preferences.
 */
interface AISettings {
  autoAnalyze: boolean;
  extractActions: boolean;
  categorizeEmails: boolean;
  detectClients: boolean;
  analysisDepth: 'basic' | 'standard' | 'thorough';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA (Remove when hooks are implemented)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_ACCOUNTS: MockConnectedAccount[] = [
  {
    id: '1',
    email: 'john.doe@gmail.com',
    isPrimary: true,
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 5), // 5 min ago
    syncStatus: 'active',
  },
  {
    id: '2',
    email: 'john.work@company.com',
    isPrimary: false,
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    syncStatus: 'active',
  },
];

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailDigest: true,
  emailDigestFrequency: 'daily',
  actionReminders: true,
  newClientAlerts: true,
  syncErrorAlerts: true,
};

const DEFAULT_AI_SETTINGS: AISettings = {
  autoAnalyze: true,
  extractActions: true,
  categorizeEmails: true,
  detectClients: true,
  analysisDepth: 'standard',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format relative time for last sync display.
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
 * Get sync status badge variant.
 */
function getSyncStatusBadge(status: MockConnectedAccount['syncStatus']): {
  variant: 'default' | 'secondary' | 'destructive';
  label: string;
} {
  switch (status) {
    case 'active':
      return { variant: 'default', label: 'Active' };
    case 'paused':
      return { variant: 'secondary', label: 'Paused' };
    case 'error':
      return { variant: 'destructive', label: 'Error' };
    default:
      return { variant: 'secondary', label: 'Unknown' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Profile settings section.
 */
function ProfileSection({ displayName }: { displayName: string }) {
  const [name, setName] = React.useState(displayName);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Implement save logic
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile
        </CardTitle>
        <CardDescription>
          Manage your display name and profile settings
        </CardDescription>
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

/**
 * Connected accounts section.
 */
function AccountsSection({ accounts }: { accounts: MockConnectedAccount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Manage your Gmail accounts connected to IdeaBox
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account list */}
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
                        <Badge variant="outline" className="text-xs">
                          Primary
                        </Badge>
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

        {/* Add account button */}
        <Button variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Connect Another Account
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Notification settings section.
 */
function NotificationsSection({
  settings,
  onUpdate,
}: {
  settings: NotificationSettings;
  onUpdate: (key: keyof NotificationSettings, value: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>
          Configure how and when you receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email digest */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="emailDigest">Email Digest</Label>
            <p className="text-sm text-muted-foreground">
              Receive a summary of your action items
            </p>
          </div>
          <Switch
            id="emailDigest"
            checked={settings.emailDigest}
            onCheckedChange={(checked) => onUpdate('emailDigest', checked)}
          />
        </div>

        {/* Action reminders */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="actionReminders">Action Reminders</Label>
            <p className="text-sm text-muted-foreground">
              Get reminded about upcoming deadlines
            </p>
          </div>
          <Switch
            id="actionReminders"
            checked={settings.actionReminders}
            onCheckedChange={(checked) => onUpdate('actionReminders', checked)}
          />
        </div>

        {/* New client alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="newClientAlerts">New Client Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Notify when AI detects a potential new client
            </p>
          </div>
          <Switch
            id="newClientAlerts"
            checked={settings.newClientAlerts}
            onCheckedChange={(checked) => onUpdate('newClientAlerts', checked)}
          />
        </div>

        {/* Sync error alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="syncErrorAlerts">Sync Error Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Alert when email sync encounters issues
            </p>
          </div>
          <Switch
            id="syncErrorAlerts"
            checked={settings.syncErrorAlerts}
            onCheckedChange={(checked) => onUpdate('syncErrorAlerts', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AI settings section.
 */
function AISettingsSection({
  settings,
  onUpdate,
}: {
  settings: AISettings;
  onUpdate: (key: keyof AISettings, value: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Analysis
        </CardTitle>
        <CardDescription>
          Configure how IdeaBox analyzes your emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto analyze */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="autoAnalyze">Auto-Analyze</Label>
            <p className="text-sm text-muted-foreground">
              Automatically analyze new emails as they arrive
            </p>
          </div>
          <Switch
            id="autoAnalyze"
            checked={settings.autoAnalyze}
            onCheckedChange={(checked) => onUpdate('autoAnalyze', checked)}
          />
        </div>

        {/* Extract actions */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="extractActions">Extract Action Items</Label>
            <p className="text-sm text-muted-foreground">
              Find tasks and to-dos in your emails
            </p>
          </div>
          <Switch
            id="extractActions"
            checked={settings.extractActions}
            onCheckedChange={(checked) => onUpdate('extractActions', checked)}
          />
        </div>

        {/* Categorize emails */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="categorizeEmails">Categorize Emails</Label>
            <p className="text-sm text-muted-foreground">
              Automatically sort emails into categories
            </p>
          </div>
          <Switch
            id="categorizeEmails"
            checked={settings.categorizeEmails}
            onCheckedChange={(checked) => onUpdate('categorizeEmails', checked)}
          />
        </div>

        {/* Detect clients */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="detectClients">Detect Clients</Label>
            <p className="text-sm text-muted-foreground">
              Identify and suggest new client relationships
            </p>
          </div>
          <Switch
            id="detectClients"
            checked={settings.detectClients}
            onCheckedChange={(checked) => onUpdate('detectClients', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Danger zone section.
 */
function DangerZoneSection() {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Irreversible actions that affect your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Export data */}
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

        {/* Delete account */}
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

/**
 * Loading skeleton for settings page.
 */
function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
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
 * Settings page component.
 *
 * Currently displays mock data. Will be connected to:
 * - useUserSettings hook for real data
 * - API routes for settings operations
 */
export default function SettingsPage() {
  const { user } = useAuth();

  // TODO: Replace with useUserSettings hook
  const [isLoading, setIsLoading] = React.useState(true);
  const [accounts, setAccounts] = React.useState<MockConnectedAccount[]>([]);
  const [notificationSettings, setNotificationSettings] =
    React.useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [aiSettings, setAISettings] = React.useState<AISettings>(DEFAULT_AI_SETTINGS);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setAccounts(MOCK_ACCOUNTS);
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Handlers
  const handleNotificationUpdate = (key: keyof NotificationSettings, value: boolean) => {
    setNotificationSettings((prev) => ({ ...prev, [key]: value }));
    // TODO: Save to backend
  };

  const handleAIUpdate = (key: keyof AISettings, value: boolean) => {
    setAISettings((prev) => ({ ...prev, [key]: value }));
    // TODO: Save to backend
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────
          Page Header
          ───────────────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Settings"
        description="Manage your account and preferences"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Settings' },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Check className="h-4 w-4" />
            Save All
          </Button>
        }
      />

      {/* ─────────────────────────────────────────────────────────────────────
          Settings Sections
          ───────────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <div className="space-y-6">
          <ProfileSection displayName={user?.name || 'User'} />
          <AccountsSection accounts={accounts} />
          <NotificationsSection
            settings={notificationSettings}
            onUpdate={handleNotificationUpdate}
          />
          <AISettingsSection settings={aiSettings} onUpdate={handleAIUpdate} />
          <DangerZoneSection />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Developer Note
          ───────────────────────────────────────────────────────────────────── */}
      <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Developer Note:</strong> This page displays mock data.
          Next steps: Create useUserSettings hook, API routes, and
          implement actual save/update logic.
        </p>
      </div>
    </div>
  );
}
