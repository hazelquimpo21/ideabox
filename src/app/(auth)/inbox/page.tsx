/**
 * 📬 Inbox Page for IdeaBox
 *
 * The main email inbox view. Displays a list of emails organized by
 * category with filtering, sorting, and search capabilities.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Email list with category badges
 * - Quick actions (archive, star, mark read)
 * - Real-time stats for unread, starred, and action required
 * - Optimistic UI updates
 * - Loading skeletons and empty states
 *
 * @module app/(auth)/inbox/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import { Card, CardContent, Button, Badge, Skeleton } from '@/components/ui';
import { SyncStatusBanner } from '@/components/email';
import { useEmails, type Email, type EmailCategory } from '@/hooks';
import { createLogger } from '@/lib/utils/logger';
import {
  Mail,
  Inbox,
  AlertCircle,
  Calendar,
  Newspaper,
  Tag,
  Archive,
  Star,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxPage');


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format relative time (e.g., "5 min ago", "2 hours ago").
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Get category badge variant and label.
 */
function getCategoryInfo(category: EmailCategory | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'action_required':
      return {
        variant: 'destructive',
        label: 'Action Required',
        icon: <AlertCircle className="h-3 w-3" />,
      };
    case 'event':
      return {
        variant: 'default',
        label: 'Event',
        icon: <Calendar className="h-3 w-3" />,
      };
    case 'newsletter':
      return {
        variant: 'secondary',
        label: 'Newsletter',
        icon: <Newspaper className="h-3 w-3" />,
      };
    case 'promo':
      return {
        variant: 'outline',
        label: 'Promo',
        icon: <Tag className="h-3 w-3" />,
      };
    case 'admin':
      return {
        variant: 'secondary',
        label: 'Admin',
        icon: <Mail className="h-3 w-3" />,
      };
    case 'personal':
      return {
        variant: 'outline',
        label: 'Personal',
        icon: <Mail className="h-3 w-3" />,
      };
    case 'noise':
      return {
        variant: 'outline',
        label: 'Noise',
        icon: <Archive className="h-3 w-3" />,
      };
    default:
      return {
        variant: 'outline',
        label: 'Uncategorized',
        icon: <Mail className="h-3 w-3" />,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailListItemProps {
  email: Email;
  onToggleStar: (id: string) => void;
  onMarkRead: (id: string) => void;
}

/**
 * Email list item component.
 * Displays a single email with star toggle and category badge.
 */
function EmailListItem({ email, onToggleStar, onMarkRead }: EmailListItemProps) {
  const categoryInfo = getCategoryInfo(email.category);

  /** Handle click on email row to mark as read */
  const handleClick = () => {
    if (!email.is_read) {
      onMarkRead(email.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        flex items-start gap-4 p-4 border-b border-border/50
        hover:bg-muted/30 transition-colors cursor-pointer
        ${!email.is_read ? 'bg-muted/10' : ''}
      `}
    >
      {/* Star button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(email.id);
        }}
        className={`
          mt-1 p-1 rounded hover:bg-muted transition-colors
          ${email.is_starred ? 'text-yellow-500' : 'text-muted-foreground'}
        `}
        aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
      >
        <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
      </button>

      {/* Email content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`font-medium truncate ${!email.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
            {email.sender_name || email.sender_email}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(email.date)}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm truncate ${!email.is_read ? 'font-medium' : ''}`}>
            {email.subject}
          </span>
          {categoryInfo && (
            <Badge variant={categoryInfo.variant} className="gap-1 text-xs shrink-0">
              {categoryInfo.icon}
              {categoryInfo.label}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground truncate">
          {email.snippet}
        </p>
      </div>

      {/* Actions */}
      <button
        onClick={(e) => e.stopPropagation()}
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Loading skeleton for email list.
 */
function EmailListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-6 w-6 rounded" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state with sync status - shown when no emails exist yet.
 */
interface EmptyStateProps {
  onSyncComplete: () => void;
}

function EmptyState({ onSyncComplete }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">Welcome to your inbox!</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Let&apos;s sync your Gmail emails to get started. IdeaBox will automatically
        categorize them and extract action items.
      </p>
      <SyncStatusBanner onSyncComplete={onSyncComplete} className="max-w-md w-full" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox page component.
 *
 * Displays emails from Supabase with real-time stats and optimistic updates.
 * Includes sync status feedback for first-time users.
 */
export default function InboxPage() {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncSuccess, setSyncSuccess] = React.useState(false);

  // Fetch emails using the useEmails hook
  const {
    emails,
    isLoading,
    error,
    refetch,
    updateEmail,
    stats,
  } = useEmails({ limit: 50 });

  /** Handle sync button click - actually triggers the sync API */
  const handleSync = React.useCallback(async () => {
    setIsSyncing(true);
    setSyncSuccess(false);

    logger.start('Manual sync triggered from inbox');

    try {
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      logger.success('Manual sync completed', {
        totalCreated: result.totals?.totalCreated,
        totalFetched: result.totals?.totalFetched,
      });

      // Refetch emails to show new ones
      await refetch();
      setSyncSuccess(true);

      // Clear success indicator after 3 seconds
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      logger.error('Manual sync failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [refetch]);

  /** Handle sync completion from SyncStatusBanner */
  const handleSyncComplete = React.useCallback(() => {
    logger.info('Sync completed, refreshing email list');
    refetch();
  }, [refetch]);

  /** Toggle email starred status */
  const handleToggleStar = (id: string) => {
    const email = emails.find((e) => e.id === id);
    if (email) {
      updateEmail(id, { is_starred: !email.is_starred });
    }
  };

  /** Mark email as read */
  const handleMarkRead = (id: string) => {
    updateEmail(id, { is_read: true });
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
        title="Inbox"
        description="Your unified email inbox with AI-powered categorization"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Inbox' },
        ]}
        actions={
          <Button
            variant={syncSuccess ? 'default' : 'outline'}
            size="sm"
            className={`gap-2 transition-colors ${syncSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : syncSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isSyncing ? 'Syncing...' : syncSuccess ? 'Synced!' : 'Sync'}
          </Button>
        }
      />

      {/* ─────────────────────────────────────────────────────────────────────
          Error Banner
          ───────────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Email Stats Banner
          ───────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">{stats.actionRequired}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Action Required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Emails</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.unread}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unread</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.starred}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Starred</p>
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Sync Status Banner (for returning users)
          ───────────────────────────────────────────────────────────────────── */}
      {!isLoading && emails.length > 0 && (
        <div className="mb-6">
          <SyncStatusBanner onSyncComplete={handleSyncComplete} compact />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Email List
          ───────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <EmailListSkeleton />
          ) : emails.length === 0 ? (
            <EmptyState onSyncComplete={handleSyncComplete} />
          ) : (
            <div>
              {emails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  onToggleStar={handleToggleStar}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
