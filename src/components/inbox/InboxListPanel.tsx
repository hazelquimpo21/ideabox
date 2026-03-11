/**
 * InboxListPanel — left panel in the split-panel inbox.
 *
 * Contains search, filter tabs, and the email list (or secondary views).
 * Owns the useEmails() hook and all list-level state (search, filters).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * VIEWS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   'emails'       → DateGroupedEmailList (primary)
 *   'categories'   → CategoryOverview (from overflow menu)
 *   'discoveries'  → DiscoveriesFeed (from overflow menu)
 *   'archive'      → ArchiveContent (from overflow menu)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   - useEmails filter params are memoized to prevent unnecessary refetches
 *   - Search is local filtering (no API call) — same as previous InboxFeed
 *   - Handlers use useCallback with stable deps
 *   - Heavy child components (CategoryOverview, DiscoveriesFeed) render only
 *     when their view is active
 *
 * @module components/inbox/InboxListPanel
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { useEmails, useGmailAccounts, useInitialSyncProgress } from '@/hooks';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { cn } from '@/lib/utils/cn';

import { InboxListHeader } from './InboxListHeader';
import { InboxListFilters, type InboxFilter, type InboxView } from './InboxListFilters';
import { DateGroupedEmailList } from './DateGroupedEmailList';
import { CategoryOverview } from './CategoryOverview';
import { DiscoveriesFeed } from './DiscoveriesFeed';
import { ArchiveContent } from '@/components/archive';
import { InboxEmptyState } from './InboxEmptyState';

import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxListPanel');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxListPanelProps {
  /** Currently selected email ID (for highlight in list) */
  selectedEmailId: string | null;
  /** Callback when an email is clicked */
  onEmailSelect: (emailId: string, category?: string | null) => void;
  /** Callback when an email is updated (for optimistic updates from detail panel) */
  onEmailUpdated?: (emailId: string, updates: Partial<Email>) => void;
  /** Additional CSS classes */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxListPanel({
  selectedEmailId,
  onEmailSelect,
  onEmailUpdated,
  className,
}: InboxListPanelProps) {
  const supabase = React.useMemo(() => createClient(), []);

  // ─── Local state ──────────────────────────────────────────────────────────

  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<InboxFilter>('all');
  const [activeView, setActiveView] = React.useState<InboxView>('emails');

  // ─── Map filter state → useEmails params ──────────────────────────────────

  const emailsParams = React.useMemo(() => {
    const params: Record<string, unknown> = { limit: 50 };

    switch (activeFilter) {
      case 'unread':
        params.unread = true;
        break;
      case 'starred':
        params.starred = true;
        break;
      case 'priority':
        params.replyWorthiness = 'must_reply';
        break;
      default:
        break;
    }

    return params;
  }, [activeFilter]);

  const {
    emails,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    updateEmail,
  } = useEmails(emailsParams);

  // ─── Multi-account map ────────────────────────────────────────────────────

  const { accounts } = useGmailAccounts();
  const accountMap = React.useMemo(() => {
    if (!accounts || accounts.length <= 1) return undefined;
    const map: Record<string, string> = {};
    for (const acct of accounts) map[acct.id] = acct.email;
    return map;
  }, [accounts]);

  // ─── Initial sync progress ────────────────────────────────────────────────

  const {
    status: syncStatus,
    progress: syncProgress,
    currentStep: syncStep,
    discoveries: syncDiscoveries,
  } = useInitialSyncProgress({ autoStart: true, pollInterval: 2000 });

  const isSyncActive = syncStatus === 'in_progress' || syncStatus === 'pending';

  // Auto-refetch when initial sync completes
  const syncRefetchGuard = React.useRef({ sawInProgress: false, wasEmpty: false });
  React.useEffect(() => {
    if (syncStatus === 'in_progress' && !syncRefetchGuard.current.sawInProgress) {
      syncRefetchGuard.current = { sawInProgress: true, wasEmpty: emails.length === 0 };
    }
    if (syncRefetchGuard.current.sawInProgress && syncRefetchGuard.current.wasEmpty && syncStatus === 'completed') {
      logger.info('Initial sync completed — refetching emails');
      refetch();
      syncRefetchGuard.current = { sawInProgress: false, wasEmpty: false };
    }
  }, [syncStatus, emails.length, refetch]);

  // ─── Local search filtering ───────────────────────────────────────────────

  const filteredEmails = React.useMemo(() => {
    if (!searchQuery) return emails;
    const q = searchQuery.toLowerCase();
    return emails.filter((e) =>
      e.subject?.toLowerCase().includes(q) ||
      e.sender_name?.toLowerCase().includes(q) ||
      e.sender_email?.toLowerCase().includes(q) ||
      e.snippet?.toLowerCase().includes(q) ||
      e.gist?.toLowerCase().includes(q),
    );
  }, [emails, searchQuery]);

  // ─── Handlers (stable refs) ───────────────────────────────────────────────

  const handleSearchChange = React.useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSearchClear = React.useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleFilterChange = React.useCallback((filter: InboxFilter) => {
    logger.info('Filter changed', { from: activeFilter, to: filter });
    setActiveFilter(filter);
  }, [activeFilter]);

  const handleViewChange = React.useCallback((view: InboxView) => {
    logger.info('View changed', { from: activeView, to: view });
    setActiveView(view);
  }, [activeView]);

  const handleEmailClick = React.useCallback(
    (email: Email) => {
      logger.debug('Email row clicked', { emailId: email.id });
      onEmailSelect(email.id, email.category);
    },
    [onEmailSelect],
  );

  const handleToggleStar = React.useCallback(
    async (email: Email) => {
      const newStarred = !email.is_starred;
      updateEmail(email.id, { is_starred: newStarred });
      try {
        const { error: err } = await supabase
          .from('emails')
          .update({ is_starred: newStarred })
          .eq('id', email.id);
        if (err) throw err;
      } catch (err) {
        updateEmail(email.id, { is_starred: !newStarred });
        logger.error('Failed to toggle star — rolled back', {
          emailId: email.id,
          error: String(err),
        });
      }
    },
    [supabase, updateEmail],
  );

  /** Handle updates from the detail panel (e.g., archive, read status) */
  const handleEmailUpdated = React.useCallback(
    (emailId: string, updates: Partial<Email>) => {
      updateEmail(emailId, updates);
      onEmailUpdated?.(emailId, updates);
    },
    [updateEmail, onEmailUpdated],
  );

  /** Handle email selection from secondary views (CategoryOverview, Archive) */
  const handleSecondaryEmailSelect = React.useCallback(
    (email: { id: string; category?: string | null }) => {
      onEmailSelect(email.id, email.category);
    },
    [onEmailSelect],
  );

  // ─── Filter counts ────────────────────────────────────────────────────────

  const filterCounts = React.useMemo(() => ({
    all: stats.total,
    unread: stats.unread,
    starred: undefined, // Not tracked in current stats
    priority: stats.mustReplyCount,
  }), [stats.total, stats.unread, stats.mustReplyCount]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col h-full border-r border-border/60 bg-background', className)}>
      {/* Search bar */}
      <InboxListHeader
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchClear={handleSearchClear}
        emailCount={filteredEmails.length}
        unreadCount={stats.unread}
      />

      {/* Filter tabs */}
      <InboxListFilters
        activeFilter={activeFilter}
        activeView={activeView}
        onFilterChange={handleFilterChange}
        onViewChange={handleViewChange}
        counts={filterCounts}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Primary: email list view */}
        {activeView === 'emails' && (
          <>
            {/* Loading skeleton */}
            {isLoading && (
              <div className="px-3">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border/40">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <p className="text-destructive mb-4 text-sm">{error.message}</p>
                <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </Button>
              </div>
            )}

            {/* Empty states */}
            {!isLoading && !error && emails.length === 0 && (
              <>
                {isSyncActive ? (
                  <InboxEmptyState
                    variant="sync"
                    syncProgress={syncProgress}
                    syncStep={syncStep}
                    syncDiscoveries={syncDiscoveries}
                  />
                ) : (
                  <InboxEmptyState variant="empty" />
                )}
              </>
            )}

            {/* Search no results */}
            {!isLoading && !error && emails.length > 0 && filteredEmails.length === 0 && searchQuery && (
              <InboxEmptyState variant="search" searchQuery={searchQuery} />
            )}

            {/* Email list with date grouping */}
            {!isLoading && !error && filteredEmails.length > 0 && (
              <DateGroupedEmailList
                emails={filteredEmails}
                selectedEmailId={selectedEmailId}
                onEmailClick={handleEmailClick}
                onToggleStar={handleToggleStar}
                onUpdateEmail={handleEmailUpdated}
                accountMap={accountMap}
                hasMore={hasMore}
                onLoadMore={loadMore}
                searchQuery={searchQuery}
              />
            )}

            {/* Refresh button (bottom of list) */}
            {!isLoading && !error && filteredEmails.length > 0 && (
              <div className="flex justify-center py-3 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refetch}
                  className="gap-1.5 text-xs text-muted-foreground h-7"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>
            )}
          </>
        )}

        {/* Secondary: Category Overview */}
        {activeView === 'categories' && (
          <div className="p-3">
            <CategoryOverview onEmailSelect={handleSecondaryEmailSelect} />
          </div>
        )}

        {/* Secondary: Discoveries Feed */}
        {activeView === 'discoveries' && (
          <div className="p-3">
            <DiscoveriesFeed />
          </div>
        )}

        {/* Secondary: Archive */}
        {activeView === 'archive' && (
          <div className="p-3">
            <ArchiveContent onEmailSelect={handleSecondaryEmailSelect} />
          </div>
        )}
      </div>
    </div>
  );
}

export default InboxListPanel;
