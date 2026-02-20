/**
 * Superadmin Dashboard
 *
 * A developer-only page for managing accounts during development and testing.
 * Access is restricted to email addresses in the SUPERADMIN_EMAILS list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - View all users in the system with their onboarding status
 * - Reset any user's account (wipe data + retrigger onboarding)
 * - Reset own account with one click
 * - Detailed results showing exactly what was deleted
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Requires Supabase authentication
 * - Checks authenticated user's email against SUPERADMIN_EMAILS list
 * - Non-superadmin users see an "Access Denied" message
 * - All reset operations are logged server-side with full audit trail
 *
 * @module app/admin/page
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth';
import { isSuperAdmin } from '@/config/superadmin';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  FullPageLoader,
  useToast,
} from '@/components/ui';
import {
  Shield,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Users,
  ArrowLeft,
  Mail,
  Clock,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AdminPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User record displayed in the admin user list.
 */
interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Result from a single table deletion during account reset.
 */
interface TableDeleteResult {
  table: string;
  deletedCount: number;
  error?: string;
}

/**
 * Full response from the reset API endpoint.
 */
interface ResetResult {
  success: boolean;
  data?: {
    targetUserId: string;
    resetBy: string;
    tablesCleared: TableDeleteResult[];
    profileReset: boolean;
    gmailAccountsReset: boolean;
    totalRowsDeleted: number;
    durationMs: number;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Format relative time
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string as a human-readable relative time.
 * Example: "2 hours ago", "3 days ago"
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => createClient(), []);

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  /** All users fetched from the database */
  const [users, setUsers] = React.useState<AdminUserRecord[]>([]);

  /** Whether the user list is loading */
  const [isLoadingUsers, setIsLoadingUsers] = React.useState(true);

  /** Which user ID is currently being reset (null = none) */
  const [resettingUserId, setResettingUserId] = React.useState<string | null>(null);

  /** The result of the most recent reset operation */
  const [lastResetResult, setLastResetResult] = React.useState<ResetResult | null>(null);

  /** Whether the user has confirmed a reset (two-step confirmation) */
  const [confirmingResetId, setConfirmingResetId] = React.useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch all users on mount
  // ─────────────────────────────────────────────────────────────────────────

  const fetchUsers = React.useCallback(async () => {
    logger.start('Fetching all users for admin dashboard');
    setIsLoadingUsers(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('user_profiles')
        .select('id, email, full_name, onboarding_completed, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch users', { error: error.message });
        toast({
          variant: 'destructive',
          title: 'Failed to load users',
          description: error.message,
        });
        return;
      }

      const userList = (data ?? []) as AdminUserRecord[];
      setUsers(userList);
      logger.success('Users loaded', { count: userList.length });
    } catch (err) {
      logger.error('Unexpected error fetching users', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [supabase, toast]);

  React.useEffect(() => {
    // Only fetch users if the logged-in user is a superadmin
    if (!authLoading && user && isSuperAdmin(user.email)) {
      fetchUsers();
    }
  }, [authLoading, user, fetchUsers]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handle account reset
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiates an account reset for the specified user.
   * Calls POST /api/admin/reset-account and shows results.
   */
  const handleReset = async (targetUserId: string, targetEmail: string) => {
    logger.start('Initiating account reset from admin page', {
      targetUserId,
      targetEmail,
    });

    setResettingUserId(targetUserId);
    setLastResetResult(null);
    setConfirmingResetId(null);

    try {
      const response = await fetch('/api/admin/reset-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      });

      const result: ResetResult = await response.json();

      if (result.success) {
        logger.success('Account reset completed', {
          targetUserId,
          totalRowsDeleted: result.data?.totalRowsDeleted,
          durationMs: result.data?.durationMs,
        });

        toast({
          title: 'Account reset successful',
          description: `Deleted ${result.data?.totalRowsDeleted ?? 0} rows for ${targetEmail}. Onboarding will retrigger on next login.`,
        });

        // If the user reset their own account, refresh session so the auth
        // context picks up onboarding_completed = false
        if (targetUserId === user?.id) {
          logger.info('Reset own account — refreshing session to retrigger onboarding');
          try {
            await refreshSession();
          } catch (err) {
            logger.warn('Session refresh after self-reset failed', {
              error: err instanceof Error ? err.message : 'Unknown',
            });
          }
        }

        // Refresh the user list to show updated onboarding status
        await fetchUsers();
      } else {
        logger.error('Account reset failed', {
          targetUserId,
          error: result.error,
        });

        toast({
          variant: 'destructive',
          title: 'Reset failed',
          description: result.error ?? 'Unknown error occurred.',
        });
      }

      setLastResetResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      logger.error('Reset request failed', {
        targetUserId,
        error: errorMessage,
      });

      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: errorMessage,
      });

      setLastResetResult({
        success: false,
        error: errorMessage,
      });
    } finally {
      setResettingUserId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return <FullPageLoader message="Checking access..." />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Not authenticated
  // ─────────────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground mb-4">
              You must be logged in to access the admin dashboard.
            </p>
            <Button onClick={() => window.location.href = '/'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Not a superadmin
  // ─────────────────────────────────────────────────────────────────────────

  if (!isSuperAdmin(user.email)) {
    logger.warn('Non-superadmin tried to access admin page', {
      userId: user.id,
      email: user.email,
    });

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              This page is restricted to superadmin accounts.
              Your email ({user.email}) is not on the access list.
            </p>
            <Button variant="outline" onClick={() => window.location.href = '/inbox'}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Inbox
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Superadmin dashboard
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container max-w-5xl py-6 px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Superadmin Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Development tools for account management and testing
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Mail className="h-3 w-3" />
                {user.email}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/inbox'}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to App
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container max-w-5xl py-6 px-4 md:px-6 space-y-6">

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Quick Actions Card */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Common development and testing operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {/* Reset own account */}
              {confirmingResetId === user.id ? (
                <div className="flex items-center gap-2 p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                  <span className="text-sm font-medium">
                    This will delete ALL your data and restart onboarding. Are you sure?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleReset(user.id, user.email)}
                    disabled={resettingUserId === user.id}
                  >
                    {resettingUserId === user.id ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      'Yes, Reset My Account'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingResetId(null)}
                    disabled={resettingUserId === user.id}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => setConfirmingResetId(user.id)}
                  disabled={!!resettingUserId}
                >
                  <Trash2 className="h-4 w-4" />
                  Reset My Account & Retrigger Onboarding
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Last Reset Result */}
        {/* ───────────────────────────────────────────────────────────────── */}
        {lastResetResult && (
          <Card className={lastResetResult.success ? 'border-green-500/30' : 'border-destructive/30'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {lastResetResult.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Reset Completed Successfully
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Reset Failed
                  </>
                )}
              </CardTitle>
              {lastResetResult.data && (
                <CardDescription>
                  Deleted {lastResetResult.data.totalRowsDeleted} total rows
                  in {lastResetResult.data.durationMs}ms
                </CardDescription>
              )}
            </CardHeader>
            {lastResetResult.data && (
              <CardContent>
                <div className="space-y-3">
                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={lastResetResult.data.profileReset ? 'default' : 'destructive'}>
                      Profile: {lastResetResult.data.profileReset ? 'Reset' : 'Failed'}
                    </Badge>
                    <Badge variant={lastResetResult.data.gmailAccountsReset ? 'default' : 'destructive'}>
                      Gmail Accounts: {lastResetResult.data.gmailAccountsReset ? 'Reset' : 'Failed'}
                    </Badge>
                  </div>

                  {/* Per-table breakdown */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Table-by-table breakdown:
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {lastResetResult.data.tablesCleared.map((table) => (
                        <div
                          key={table.table}
                          className="flex items-center justify-between text-xs px-2 py-1 bg-background rounded"
                        >
                          <span className="font-mono text-muted-foreground truncate">
                            {table.table}
                          </span>
                          {table.error ? (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">
                              err
                            </Badge>
                          ) : (
                            <span className={table.deletedCount > 0 ? 'font-medium text-primary' : 'text-muted-foreground'}>
                              {table.deletedCount}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dismiss button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLastResetResult(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            )}
            {lastResetResult.error && !lastResetResult.data && (
              <CardContent>
                <p className="text-sm text-destructive">{lastResetResult.error}</p>
              </CardContent>
            )}
          </Card>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Users List */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Users ({users.length})
                </CardTitle>
                <CardDescription>
                  Manage accounts, reset data, and retrigger onboarding
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchUsers}
                disabled={isLoadingUsers}
                className="gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users found in the database.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {u.full_name || 'Unnamed User'}
                        </span>
                        {u.id === user.id && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            you
                          </Badge>
                        )}
                        <Badge
                          variant={u.onboarding_completed ? 'default' : 'secondary'}
                          className="text-[10px] h-4 px-1"
                        >
                          {u.onboarding_completed ? 'Onboarded' : 'Pending'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Joined {formatRelativeTime(u.created_at)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {u.id}
                        </span>
                      </div>
                    </div>

                    {/* Reset action */}
                    <div className="flex items-center gap-2 ml-4">
                      {confirmingResetId === u.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReset(u.id, u.email)}
                            disabled={!!resettingUserId}
                            className="text-xs"
                          >
                            {resettingUserId === u.id ? (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                Resetting...
                              </>
                            ) : (
                              'Confirm Reset'
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmingResetId(null)}
                            disabled={!!resettingUserId}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmingResetId(u.id)}
                          disabled={!!resettingUserId}
                          className="gap-1 text-xs"
                        >
                          <Trash2 className="h-3 w-3" />
                          Reset Account
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Info Card */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              What &quot;Reset Account&quot; Does
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <div>
              <p className="font-medium text-foreground mb-1">Deletes all synced data:</p>
              <p>
                Emails, AI analyses, actions, contacts, extracted dates, events,
                campaigns, templates, sent emails, open tracking, sync logs,
                API usage logs, and push notification logs.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Resets to pre-onboarding state:</p>
              <p>
                Clears onboarding_completed flag, sync progress, sender patterns,
                and Gmail sync history. OAuth tokens are preserved so you don&apos;t
                need to re-authenticate with Google.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Preserves:</p>
              <p>
                Your login, profile name, timezone, user settings (AI toggles,
                cost limits), and Gmail OAuth tokens.
              </p>
            </div>
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="font-medium text-foreground mb-1">After reset:</p>
              <p>
                Next time the user visits the app, they will be redirected to the
                onboarding wizard. The full initial sync and AI analysis will run
                again from scratch.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
