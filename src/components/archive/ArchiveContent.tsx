/**
 * Archive Content Component
 *
 * Displays emails that have been archived (is_archived === true).
 * Supports search, category filtering, bulk restore, and permanent deletion.
 * Each email row is clickable to navigate to the full email detail view.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIX LOG (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - FIXED: Archive tab now fetches emails with `includeArchived: true` and
 *   filters for `is_archived === true` so it shows genuinely archived emails.
 *   Previously it showed non-archived emails in "archive-worthy" categories.
 *
 * - FIXED: "Restore" (unarchive) now sets `is_archived: false` to actually
 *   move the email back to the inbox. Previously it changed the category
 *   to 'personal_friends_family', which didn't unarchive.
 *
 * - FIXED: "Delete" button now performs a real Supabase delete (hard delete)
 *   with a clear confirmation dialog. Previously it called archive on an
 *   already-archived email (no-op).
 *
 * - ADDED: Clicking an archived email row navigates to the email detail
 *   page at `/inbox/{category}/{emailId}`. Previously, only the icon
 *   buttons were interactive.
 *
 * @module components/archive/ArchiveContent
 * @since February 2026 — Phase 4 Navigation Redesign
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Skeleton,
} from '@/components/ui';
import { useEmails, type Email, type EmailCategory } from '@/hooks';
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
  Mail,
  Calendar,
  Newspaper,
  Tag,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ArchiveContent');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 7)
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  if (diffWeeks < 4)
    return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  if (diffMonths < 12)
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/** Badge display config for all 12 life-bucket categories. */
function getCategoryBadge(category: EmailCategory | null) {
  const map: Record<
    string,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      label: string;
      icon: React.ReactNode;
    }
  > = {
    client_pipeline: {
      variant: 'destructive',
      label: 'Client',
      icon: <AlertCircle className="h-3 w-3" />,
    },
    business_work_general: {
      variant: 'default',
      label: 'Work',
      icon: <Mail className="h-3 w-3" />,
    },
    family_kids_school: {
      variant: 'default',
      label: 'School',
      icon: <Calendar className="h-3 w-3" />,
    },
    family_health_appointments: {
      variant: 'default',
      label: 'Health',
      icon: <Calendar className="h-3 w-3" />,
    },
    personal_friends_family: {
      variant: 'outline',
      label: 'Personal',
      icon: <Mail className="h-3 w-3" />,
    },
    finance: {
      variant: 'secondary',
      label: 'Finance',
      icon: <Mail className="h-3 w-3" />,
    },
    travel: {
      variant: 'default',
      label: 'Travel',
      icon: <Calendar className="h-3 w-3" />,
    },
    shopping: {
      variant: 'outline',
      label: 'Shopping',
      icon: <Tag className="h-3 w-3" />,
    },
    local: {
      variant: 'default',
      label: 'Local',
      icon: <Calendar className="h-3 w-3" />,
    },
    newsletters_general: {
      variant: 'secondary',
      label: 'Newsletter',
      icon: <Newspaper className="h-3 w-3" />,
    },
    news_politics: {
      variant: 'secondary',
      label: 'News',
      icon: <Newspaper className="h-3 w-3" />,
    },
    product_updates: {
      variant: 'outline',
      label: 'Updates',
      icon: <Archive className="h-3 w-3" />,
    },
  };
  return (
    map[category || ''] || {
      variant: 'outline' as const,
      label: 'Archived',
      icon: <Archive className="h-3 w-3" />,
    }
  );
}

/** Category filter buttons shown above the archive list. */
const ARCHIVE_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'client_pipeline', label: 'Client' },
  { value: 'business_work_general', label: 'Work' },
  { value: 'newsletters_general', label: 'Newsletters' },
  { value: 'news_politics', label: 'News' },
  { value: 'product_updates', label: 'Updates' },
  { value: 'shopping', label: 'Shopping' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single archived email row.
 * Clicking the email body navigates to the detail page.
 * Checkbox, Restore, and Delete buttons are separate click targets.
 */
function ArchivedEmailItem({
  email,
  onUnarchive,
  onDelete,
  onClick,
  isSelected,
  onSelect,
}: {
  email: Email;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (email: Email) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const categoryBadge = getCategoryBadge(email.category);

  return (
    <div
      className={`flex items-start gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors ${
        isSelected ? 'bg-primary/5' : ''
      }`}
    >
      {/* Checkbox — stops propagation so click doesn't navigate */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onSelect(email.id)}
        className="mt-1.5 h-4 w-4 rounded border-gray-300"
        aria-label={`Select email from ${email.sender_email}`}
      />

      {/* Email content — clickable to navigate to detail */}
      <button
        type="button"
        onClick={() => onClick(email)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-medium truncate text-muted-foreground">
            {email.sender_name || email.sender_email}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(email.date)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm truncate">{email.subject}</span>
          <Badge
            variant={categoryBadge.variant}
            className="gap-1 text-xs shrink-0"
          >
            {categoryBadge.icon}
            {categoryBadge.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {email.snippet}
        </p>
      </button>

      {/* Action buttons — stop propagation to avoid navigating */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onUnarchive(email.id);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Restore to inbox"
        >
          <ArchiveRestore className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(email.id);
          }}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete permanently"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

function ArchiveListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-start gap-4 p-4 border-b border-border/50"
        >
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Archive className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">
        {hasFilter ? 'No matching emails' : 'Archive is empty'}
      </h3>
      <p className="text-muted-foreground max-w-sm">
        {hasFilter
          ? 'Try adjusting your filters to see more emails.'
          : 'Emails you archive from your inbox will appear here for reference.'}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ArchiveContent — list of archived emails with search, filtering, and bulk actions.
 *
 * Fetches emails with `includeArchived: true` so we get archived emails,
 * then filters client-side for `is_archived === true`.
 */
export function ArchiveContent() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // FIX #1: Fetch with includeArchived so we actually get archived emails
  const { emails, isLoading, error, refetch, updateEmail } = useEmails({
    limit: 100,
    category:
      categoryFilter !== 'all'
        ? (categoryFilter as EmailCategory)
        : undefined,
    includeArchived: true,
  });

  // FIX #1 continued: Filter to only show emails where is_archived === true,
  // then apply search query on top.
  const archivedEmails = React.useMemo(() => {
    return emails
      .filter((email) => email.is_archived)
      .filter((email) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          email.subject?.toLowerCase().includes(query) ||
          email.sender_email?.toLowerCase().includes(query) ||
          email.sender_name?.toLowerCase().includes(query) ||
          email.snippet?.toLowerCase().includes(query)
        );
      });
  }, [emails, searchQuery]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    logger.info('Refreshing archive list');
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    logger.success('Archive list refreshed');
  };

  // FIX #2: Unarchive sets is_archived to false (restores to inbox)
  const handleUnarchive = async (id: string) => {
    logger.info('Restoring email to inbox', { emailId: id });

    // Optimistic update — remove from local list
    updateEmail(id, { is_archived: false });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    // Persist to Supabase
    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: false })
        .eq('id', id);

      if (updateError) throw updateError;
      logger.success('Email restored to inbox', { emailId: id });
    } catch (err) {
      logger.error('Failed to restore email', {
        emailId: id,
        error: String(err),
      });
      // Revert on failure
      updateEmail(id, { is_archived: true });
    }
  };

  // FIX #3: Delete performs a real hard delete with clear confirmation
  const handleDelete = async (id: string) => {
    if (
      !confirm(
        'Permanently delete this email? This cannot be undone.'
      )
    ) {
      return;
    }

    logger.info('Permanently deleting email', { emailId: id });

    // Optimistic removal from UI
    updateEmail(id, { is_archived: true }); // keep in state briefly
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      const { error: deleteError } = await supabase
        .from('emails')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      logger.success('Email permanently deleted', { emailId: id });
      // Refetch to remove from list cleanly
      await refetch();
    } catch (err) {
      logger.error('Failed to delete email', {
        emailId: id,
        error: String(err),
      });
      // Refetch to restore correct state
      await refetch();
    }
  };

  // FIX #4: Navigate to email detail view when clicking an archived email
  const handleEmailClick = (email: Email) => {
    const category = email.category || 'uncategorized';
    logger.info('Navigating to archived email detail', {
      emailId: email.id,
      category,
    });
    router.push(`/inbox/${category}/${email.id}?from=archive`);
  };

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === archivedEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(archivedEmails.map((e) => e.id)));
    }
  };

  const handleBulkUnarchive = async () => {
    logger.info('Bulk restoring emails', { count: selectedIds.size });
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await handleUnarchive(id);
    }
    setSelectedIds(new Set());
    logger.success('Bulk restore complete', { count: ids.length });
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(
        `Permanently delete ${selectedIds.size} email${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`
      )
    ) {
      return;
    }
    logger.info('Bulk deleting emails', { count: selectedIds.size });
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        const { error: deleteError } = await supabase
          .from('emails')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;
      } catch (err) {
        logger.error('Failed to delete email in bulk operation', {
          emailId: id,
          error: String(err),
        });
      }
    }
    setSelectedIds(new Set());
    await refetch();
    logger.success('Bulk delete complete', { count: ids.length });
  };

  const hasFilter = searchQuery !== '' || categoryFilter !== 'all';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* ─── Filters & Search ───────────────────────────────────────────── */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search archived emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {ARCHIVE_CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={
                  categoryFilter === cat.value ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => setCategoryFilter(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* ─── Bulk Actions Bar ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleBulkUnarchive}
            >
              <ArchiveRestore className="h-4 w-4" />
              Restore to Inbox
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete Permanently
            </Button>
          </div>
        )}
      </div>

      {/* ─── Email List ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Archived ({archivedEmails.length})
            </CardTitle>
            {archivedEmails.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selectedIds.size === archivedEmails.length
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <ArchiveListSkeleton />
          ) : archivedEmails.length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div>
              {archivedEmails.map((email) => (
                <ArchivedEmailItem
                  key={email.id}
                  email={email}
                  onUnarchive={handleUnarchive}
                  onDelete={handleDelete}
                  onClick={handleEmailClick}
                  isSelected={selectedIds.has(email.id)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
