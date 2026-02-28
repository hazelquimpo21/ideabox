/**
 * InboxFeed Component
 *
 * The primary inbox view — a unified, scannable email feed inspired by
 * Gmail / Spark Mail. Designed for rapid triage with "at a glance" metadata
 * surfaced in each row.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │  [Search input]                                                        │
 *   │  [Category filter pills — horizontal scroll]                           │
 *   ├────────────────────────────────────────────────┬────────────────────────┤
 *   │  ★ PRIORITY (top 5 high-score emails)          │  CATEGORIES sidebar   │
 *   │  ─────────────────────────────                  │  (desktop only, lg+)  │
 *   │  RECENT (remaining emails)                      │  counts + mini bars   │
 *   │  ─────────────────────────────                  │                       │
 *   │  [Load more] · [Footer: count, unread, refresh] │                      │
 *   └────────────────────────────────────────────────┴────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - `useEmails()` hook fetches lightweight email list fields (no body)
 * - Category filtering: server-side via hook param
 * - Search filtering: client-side on subject, sender, snippet, gist
 * - Priority split: client-side (top 5 with priority_score >= 50)
 * - Star toggle: optimistic update + Supabase mutation
 *
 * @module components/inbox/InboxFeed
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { RefreshCw, Inbox, Sparkles, Search, X, List, LayoutGrid, Loader2 } from 'lucide-react';
import { Button, Skeleton, Input, Badge } from '@/components/ui';
import { useEmails, useGmailAccounts, useEmailThumbnails, useInitialSyncProgress } from '@/hooks';
import { CategoryFilterBar } from './CategoryFilterBar';
import { CategorySummaryPanel } from './CategorySummaryPanel';
import { InboxFilterBar } from './InboxFilterBar';
import type { InboxFilters } from './InboxFilterBar';
import { InboxEmailRow } from './InboxEmailRow';
import { InboxEmailCard } from './InboxEmailCard';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxFeed');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Number of priority emails to show in the highlighted section */
const PRIORITY_COUNT = 5;

/** Minimum priority score to qualify for the priority section */
const PRIORITY_THRESHOLD = 50;

/** View mode for the email list — list (compact rows) or cards (richer cards) */
type ViewMode = 'list' | 'cards';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxFeedProps {
  /** Callback when an email is selected (opens detail modal in parent) */
  onEmailSelect?: (email: { id: string; category?: string | null }) => void;
  /** Optional initial category to filter by (e.g. from Category Overview click) */
  initialCategory?: EmailCategory | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxFeed({ onEmailSelect, initialCategory = null }: InboxFeedProps) {
  const supabase = React.useMemo(() => createClient(), []);

  // ─── Local State ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = React.useState<EmailCategory | null>(initialCategory);

  // Sync with initialCategory prop when it changes (e.g. navigating from CategoryOverview)
  React.useEffect(() => {
    if (initialCategory !== undefined) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [viewMode, setViewMode] = React.useState<ViewMode>('cards');

  // ─── Smart Filter State (Phase 2) ──────────────────────────────────────────
  const [smartFilters, setSmartFilters] = React.useState<InboxFilters>({
    mustReply: false,
    highSignal: false,
    hasNuggets: false,
    hasEvents: false,
  });

  /** Toggle a smart filter chip on/off */
  const handleSmartFilterToggle = React.useCallback((key: keyof InboxFilters) => {
    setSmartFilters((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      logger.debug('Smart filter toggled', { filter: key, active: updated[key] });
      return updated;
    });
  }, []);

  // ─── Gmail Accounts (for account indicator) ─────────────────────────────────
  // Builds a map of gmail_account_id → account email so we can show which
  // inbox an email belongs to. Only fetched once on mount.
  const { accounts } = useGmailAccounts();
  const accountMap = React.useMemo(() => {
    if (!accounts || accounts.length <= 1) return undefined; // No indicator needed for single account
    const map: Record<string, string> = {};
    for (const acct of accounts) {
      map[acct.id] = acct.email;
    }
    return map;
  }, [accounts]);

  // ─── Fetch Emails ────────────────────────────────────────────────────────────
  const {
    emails,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    updateEmail,
  } = useEmails({
    category: activeCategory || 'all',
    limit: 50,
    replyWorthiness: smartFilters.mustReply ? 'must_reply' : null,
    signalStrength: smartFilters.highSignal ? 'high' : null,
    hasNuggets: smartFilters.hasNuggets,
    hasEvents: smartFilters.hasEvents,
  });

  // ─── Initial Sync Progress (post-onboarding) ───────────────────────────────
  // Tracks whether the initial email sync is still running so we can show a
  // sync-aware empty state instead of the misleading "Your inbox is empty".
  const {
    status: syncStatus,
    progress: syncProgress,
    currentStep: syncStep,
    discoveries: syncDiscoveries,
  } = useInitialSyncProgress({ autoStart: true, pollInterval: 2000 });

  const isSyncActive = syncStatus === 'in_progress' || syncStatus === 'pending';

  // Auto-refetch emails when initial sync completes so newly synced emails appear.
  // Only fires when:
  // 1. We witnessed 'in_progress' during this component's mount lifetime
  // 2. The inbox was empty when we saw 'in_progress' (avoids stale DB state refetch)
  // 3. Status transitions to 'completed'
  const syncRefetchGuard = React.useRef({ sawInProgress: false, wasEmpty: false });
  React.useEffect(() => {
    if (syncStatus === 'in_progress' && !syncRefetchGuard.current.sawInProgress) {
      syncRefetchGuard.current = { sawInProgress: true, wasEmpty: emails.length === 0 };
    }
    if (
      syncRefetchGuard.current.sawInProgress &&
      syncRefetchGuard.current.wasEmpty &&
      syncStatus === 'completed'
    ) {
      logger.info('Initial sync completed — refetching emails');
      refetch();
      syncRefetchGuard.current = { sawInProgress: false, wasEmpty: false };
    }
  }, [syncStatus, emails.length, refetch]);

  // ─── Thumbnail Extraction (card mode only) ──────────────────────────────────
  // Extracts the first meaningful image from email HTML bodies for card thumbnails.
  const emailIds = React.useMemo(() => emails.map((e) => e.id), [emails]);
  const { thumbnails } = useEmailThumbnails(emailIds, viewMode === 'cards');

  // ─── Client-Side Search Filter ───────────────────────────────────────────────
  // Filters on subject, sender name/email, snippet, and AI gist.
  const filteredEmails = React.useMemo(() => {
    if (!searchQuery) return emails;
    const q = searchQuery.toLowerCase();
    return emails.filter(
      (e) =>
        e.subject?.toLowerCase().includes(q) ||
        e.sender_name?.toLowerCase().includes(q) ||
        e.sender_email?.toLowerCase().includes(q) ||
        e.snippet?.toLowerCase().includes(q) ||
        e.gist?.toLowerCase().includes(q)
    );
  }, [emails, searchQuery]);

  // ─── Priority / Recent Split ─────────────────────────────────────────────────
  // When viewing all categories, the top N high-scoring emails float to a
  // "Priority" section. When a category filter is active, show one flat list.
  const { priorityEmails, recentEmails } = React.useMemo(() => {
    if (activeCategory) {
      return { priorityEmails: [], recentEmails: filteredEmails };
    }

    const priority: Email[] = [];
    const rest: Email[] = [];

    for (const email of filteredEmails) {
      if (
        priority.length < PRIORITY_COUNT &&
        email.priority_score !== null &&
        email.priority_score !== undefined &&
        email.priority_score >= PRIORITY_THRESHOLD
      ) {
        priority.push(email);
      } else {
        rest.push(email);
      }
    }

    return { priorityEmails: priority, recentEmails: rest };
  }, [filteredEmails, activeCategory]);

  // ─── Event Handlers ──────────────────────────────────────────────────────────

  /** Update active category filter — triggers server-side refetch */
  const handleCategoryChange = React.useCallback(
    (category: EmailCategory | null) => {
      logger.info('Category filter changed', { from: activeCategory, to: category || 'all' });
      setActiveCategory(category);
    },
    [activeCategory]
  );

  /** Open the email detail modal in the parent InboxTabs component */
  const handleEmailClick = React.useCallback(
    (email: Email) => {
      logger.debug('Email row clicked', { emailId: email.id, subject: email.subject });
      onEmailSelect?.({ id: email.id, category: email.category });
    },
    [onEmailSelect]
  );

  /** Toggle star with optimistic update, rollback on Supabase error */
  const handleToggleStar = React.useCallback(
    async (email: Email) => {
      const newStarred = !email.is_starred;
      logger.info('Toggling star', { emailId: email.id, starred: newStarred });

      // Optimistic update
      updateEmail(email.id, { is_starred: newStarred });

      try {
        const { error: updateError } = await supabase
          .from('emails')
          .update({ is_starred: newStarred })
          .eq('id', email.id);

        if (updateError) throw updateError;
        logger.debug('Star persisted to Supabase', { emailId: email.id });
      } catch (err) {
        // Rollback on failure
        updateEmail(email.id, { is_starred: !newStarred });
        logger.error('Failed to toggle star — rolled back', {
          emailId: email.id,
          error: String(err),
        });
      }
    },
    [supabase, updateEmail]
  );

  /** Clear the search input */
  const handleClearSearch = React.useCallback(() => {
    logger.debug('Search cleared');
    setSearchQuery('');
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div>
        {/* Filter bar skeleton */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        {/* Two-column skeleton */}
        <div className="flex gap-6">
          <div className="flex-1">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/40">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          {/* Sidebar skeleton — desktop only */}
          <div className="hidden lg:block w-56 shrink-0 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (error) {
    logger.error('InboxFeed render error', { message: error.message });
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive mb-4">{error.message}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMPTY STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (emails.length === 0 && !activeCategory) {
    // ── Sync In Progress: show progress + skeleton preview ─────────────────────
    if (isSyncActive) {
      const hasDiscoveries =
        syncDiscoveries.actionItems > 0 ||
        syncDiscoveries.events > 0 ||
        syncDiscoveries.clientsDetected.length > 0;

      return (
        <div>
          {/* Compact sync status card */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium">Analyzing your emails</h3>
                <p className="text-xs text-muted-foreground truncate">{syncStep}</p>
              </div>
              {syncProgress > 0 && (
                <span className="text-sm font-medium tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                  {Math.round(syncProgress)}%
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, syncProgress))}%` }}
              />
            </div>

            {/* Discovery badges */}
            {hasDiscoveries && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Found so far:</span>
                {syncDiscoveries.actionItems > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {syncDiscoveries.actionItems} action item{syncDiscoveries.actionItems !== 1 ? 's' : ''}
                  </Badge>
                )}
                {syncDiscoveries.events > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {syncDiscoveries.events} event{syncDiscoveries.events !== 1 ? 's' : ''}
                  </Badge>
                )}
                {syncDiscoveries.clientsDetected.map((client) => (
                  <Badge key={client} variant="outline" className="text-xs">
                    {client}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Skeleton email rows — hints at what's coming */}
          <div className="rounded-lg border border-border/40 bg-card overflow-hidden opacity-50">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-b-0">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── True empty state: sync is done, inbox is legitimately empty ─────────────
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No emails yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Connect a Gmail account and sync your emails to get started.
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Renders an email list section (priority or recent) in either
   * list mode (InboxEmailRow) or card mode (InboxEmailCard).
   * Extracted to avoid duplicating the view-mode conditional.
   */
  const renderEmailSection = (sectionEmails: Email[], showCat: boolean) => {
    if (viewMode === 'cards') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sectionEmails.map((email: Email) => (
            <InboxEmailCard
              key={email.id}
              email={email}
              onClick={handleEmailClick}
              onToggleStar={handleToggleStar}
              showCategory={showCat}
              accountMap={accountMap}
              thumbnailUrl={thumbnails.get(email.id) || null}
            />
          ))}
        </div>
      );
    }

    // List mode (default)
    return (
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {sectionEmails.map((email: Email) => (
          <InboxEmailRow
            key={email.id}
            email={email}
            onClick={handleEmailClick}
            onToggleStar={handleToggleStar}
            showCategory={showCat}
            accountMap={accountMap}
          />
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* ── Search + View Toggle + Category Filter ─────────────────────────── */}
      <div className="space-y-3 mb-5">
        {/* Search + View toggle row */}
        <div className="flex items-center gap-2">
          {/* Search input with clear button */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm bg-muted/30 border-border/50 focus:bg-background transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* View mode toggle — List / Cards */}
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden shrink-0" role="radiogroup" aria-label="View mode">
            <button
              type="button"
              onClick={() => {
                logger.info('View mode changed', { mode: 'list' });
                setViewMode('list');
              }}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              aria-label="List view"
              aria-checked={viewMode === 'list'}
              role="radio"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                logger.info('View mode changed', { mode: 'cards' });
                setViewMode('cards');
              }}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'cards'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              aria-label="Card view"
              aria-checked={viewMode === 'cards'}
              role="radio"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category filter pills */}
        <CategoryFilterBar
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
          categoryCounts={stats.categoryStats as unknown as Partial<Record<string, number>>}
          totalCount={stats.total}
        />
      </div>

      {/* ── Smart Filter Bar (Phase 2) ─────────────────────────────────────── */}
      <InboxFilterBar
        stats={stats}
        activeFilters={smartFilters}
        onFilterToggle={handleSmartFilterToggle}
      />

      {/* ── Two-Column Layout ──────────────────────────────────────────────── */}
      <div className="flex gap-6 mt-3">
        {/* Left: Email list or card grid */}
        <div className="flex-1 min-w-0">

          {/* Empty category state */}
          {activeCategory && filteredEmails.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No emails in this category
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveCategory(null)}
                className="mt-2"
              >
                Show all emails
              </Button>
            </div>
          )}

          {/* Search results indicator */}
          {searchQuery && filteredEmails.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 mb-1">
              <span className="text-xs text-muted-foreground">
                {filteredEmails.length} result{filteredEmails.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
              </span>
            </div>
          )}

          {/* ── Priority Section ─────────────────────────────────────────── */}
          {priorityEmails.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-4 py-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Priority
                </span>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                  {priorityEmails.length}
                </span>
              </div>
              {renderEmailSection(priorityEmails, true)}
            </div>
          )}

          {/* ── Recent Section ───────────────────────────────────────────── */}
          {recentEmails.length > 0 && (
            <div>
              {/* Section header — only show when priority section is visible */}
              {priorityEmails.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {activeCategory ? 'Emails' : 'Recent'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {recentEmails.length}
                  </span>
                </div>
              )}

              {renderEmailSection(recentEmails, !activeCategory)}

              {/* Load more trigger */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={loadMore} className="gap-2">
                    Load more emails
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Footer: stats + refresh ──────────────────────────────────── */}
          {filteredEmails.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 mt-2">
              <p className="text-xs text-muted-foreground/70">
                {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
                {activeCategory && ' in this category'}
                {stats.unread > 0 && !activeCategory && ` · ${stats.unread} unread`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={refetch}
                className="gap-1.5 text-xs text-muted-foreground h-7"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>
          )}
        </div>

        {/* Right: Category summary sidebar — desktop only */}
        <div className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-4">
            <CategorySummaryPanel
              categoryCounts={stats.categoryStats as unknown as Partial<Record<string, number>>}
              activeCategory={activeCategory}
              onCategoryClick={handleCategoryChange}
              totalCount={stats.total}
              unreadCount={stats.unread}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default InboxFeed;
