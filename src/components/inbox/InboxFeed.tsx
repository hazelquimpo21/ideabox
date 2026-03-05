/**
 * InboxFeed — thin orchestrator for the inbox email feed.
 * Implements §5 from VIEW_REDESIGN_PLAN.md.
 *
 * Responsibilities: data fetching (useEmails), search state, view toggle,
 * and composition of extracted subcomponents. All rendering logic has been
 * moved to EmailList, InboxSearchBar, InboxEmptyState, etc.
 *
 * @module components/inbox/InboxFeed
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { RefreshCw, List, LayoutGrid } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { useEmails, useGmailAccounts, useEmailThumbnails, useInitialSyncProgress } from '@/hooks';
import { CategoryFilterBar } from './CategoryFilterBar';
import { CategorySummaryPanel } from './CategorySummaryPanel';
import { InboxFilterBar } from './InboxFilterBar';
import type { InboxFilters } from './InboxFilterBar';
import { InboxSearchBar } from './InboxSearchBar';
import { InboxEmptyState } from './InboxEmptyState';
import { EmailList } from './EmailList';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';

const logger = createLogger('InboxFeed');

const PRIORITY_COUNT = 5;
const PRIORITY_THRESHOLD = 50;

type ViewMode = 'list' | 'cards';

export interface InboxFeedProps {
  onEmailSelect?: (email: { id: string; category?: string | null }) => void;
  initialCategory?: EmailCategory | null;
}

export function InboxFeed({ onEmailSelect, initialCategory = null }: InboxFeedProps) {
  const supabase = React.useMemo(() => createClient(), []);

  const [activeCategory, setActiveCategory] = React.useState<EmailCategory | null>(initialCategory);
  React.useEffect(() => {
    if (initialCategory !== undefined) setActiveCategory(initialCategory);
  }, [initialCategory]);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [viewMode, setViewMode] = React.useState<ViewMode>('cards');
  const [smartFilters, setSmartFilters] = React.useState<InboxFilters>({
    mustReply: false, highSignal: false, hasNuggets: false, hasEvents: false,
  });

  const handleSmartFilterToggle = React.useCallback((key: keyof InboxFilters) => {
    setSmartFilters((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      logger.debug('Smart filter toggled', { filter: key, active: updated[key] });
      return updated;
    });
  }, []);

  const { accounts } = useGmailAccounts();
  const accountMap = React.useMemo(() => {
    if (!accounts || accounts.length <= 1) return undefined;
    const map: Record<string, string> = {};
    for (const acct of accounts) map[acct.id] = acct.email;
    return map;
  }, [accounts]);

  const { emails, isLoading, error, refetch, loadMore, hasMore, stats, updateEmail } = useEmails({
    category: activeCategory || 'all',
    limit: 50,
    replyWorthiness: smartFilters.mustReply ? 'must_reply' : null,
    signalStrength: smartFilters.highSignal ? 'high' : null,
    hasNuggets: smartFilters.hasNuggets,
    hasEvents: smartFilters.hasEvents,
  });

  const { status: syncStatus, progress: syncProgress, currentStep: syncStep, discoveries: syncDiscoveries } =
    useInitialSyncProgress({ autoStart: true, pollInterval: 2000 });
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

  const emailIds = React.useMemo(() => emails.map((e) => e.id), [emails]);
  const { thumbnails } = useEmailThumbnails(emailIds, viewMode === 'cards');

  const filteredEmails = React.useMemo(() => {
    if (!searchQuery) return emails;
    const q = searchQuery.toLowerCase();
    return emails.filter((e) =>
      e.subject?.toLowerCase().includes(q) || e.sender_name?.toLowerCase().includes(q) ||
      e.sender_email?.toLowerCase().includes(q) || e.snippet?.toLowerCase().includes(q) ||
      e.gist?.toLowerCase().includes(q)
    );
  }, [emails, searchQuery]);

  const { priorityEmails, recentEmails } = React.useMemo(() => {
    if (activeCategory) return { priorityEmails: [] as Email[], recentEmails: filteredEmails };
    const priority: Email[] = [];
    const rest: Email[] = [];
    for (const email of filteredEmails) {
      if (priority.length < PRIORITY_COUNT && email.priority_score != null && email.priority_score >= PRIORITY_THRESHOLD) {
        priority.push(email);
      } else {
        rest.push(email);
      }
    }
    return { priorityEmails: priority, recentEmails: rest };
  }, [filteredEmails, activeCategory]);

  const handleCategoryChange = React.useCallback((category: EmailCategory | null) => {
    logger.info('Category filter changed', { from: activeCategory, to: category || 'all' });
    setActiveCategory(category);
  }, [activeCategory]);

  const handleEmailClick = React.useCallback((email: Email) => {
    logger.debug('Email row clicked', { emailId: email.id });
    onEmailSelect?.({ id: email.id, category: email.category });
  }, [onEmailSelect]);

  const handleToggleStar = React.useCallback(async (email: Email) => {
    const newStarred = !email.is_starred;
    updateEmail(email.id, { is_starred: newStarred });
    try {
      const { error: err } = await supabase.from('emails').update({ is_starred: newStarred }).eq('id', email.id);
      if (err) throw err;
    } catch (err) {
      updateEmail(email.id, { is_starred: !newStarred });
      logger.error('Failed to toggle star — rolled back', { emailId: email.id, error: String(err) });
    }
  }, [supabase, updateEmail]);

  const handleClearSearch = React.useCallback(() => { setSearchQuery(''); }, []);

  // Loading skeleton
  if (isLoading) {
    return (
      <div>
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
        </div>
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
          <div className="hidden lg:block w-56 shrink-0 space-y-3">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive mb-4">{error.message}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  // Empty states
  if (emails.length === 0 && !activeCategory) {
    if (isSyncActive) {
      return <InboxEmptyState variant="sync" syncProgress={syncProgress} syncStep={syncStep} syncDiscoveries={syncDiscoveries} />;
    }
    return <InboxEmptyState variant="empty" />;
  }

  return (
    <div>
      {/* Search + View Toggle + Category Filter */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2">
          <InboxSearchBar value={searchQuery} onChange={setSearchQuery} onClear={handleClearSearch} />
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden shrink-0" role="radiogroup" aria-label="View mode">
            <button type="button" onClick={() => { logger.info('View mode changed', { mode: 'list' }); setViewMode('list'); }}
              className={cn('p-2 transition-colors', viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}
              aria-label="List view" aria-checked={viewMode === 'list'} role="radio">
              <List className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { logger.info('View mode changed', { mode: 'cards' }); setViewMode('cards'); }}
              className={cn('p-2 transition-colors', viewMode === 'cards' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}
              aria-label="Card view" aria-checked={viewMode === 'cards'} role="radio">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
        <CategoryFilterBar activeCategory={activeCategory} onCategoryChange={handleCategoryChange}
          categoryCounts={stats.categoryStats as unknown as Partial<Record<string, number>>} totalCount={stats.total} />
      </div>

      <InboxFilterBar stats={stats} activeFilters={smartFilters} onFilterToggle={handleSmartFilterToggle} />

      {/* Two-Column Layout */}
      <div className="flex gap-6 mt-3">
        <div className="flex-1 min-w-0">
          {activeCategory && filteredEmails.length === 0 && (
            <InboxEmptyState variant="category" onClearCategory={() => setActiveCategory(null)} />
          )}
          {searchQuery && filteredEmails.length === 0 && !activeCategory && (
            <InboxEmptyState variant="search" searchQuery={searchQuery} />
          )}
          <EmailList
            priorityEmails={priorityEmails} recentEmails={recentEmails} viewMode={viewMode}
            activeCategory={activeCategory} onEmailClick={handleEmailClick} onToggleStar={handleToggleStar}
            onUpdateEmail={updateEmail} accountMap={accountMap} thumbnails={thumbnails}
            hasMore={hasMore} onLoadMore={loadMore} searchQuery={searchQuery} filteredCount={filteredEmails.length}
          />
          {filteredEmails.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 mt-2">
              <p className="text-xs text-muted-foreground/70">
                {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
                {activeCategory && ' in this category'}
                {stats.unread > 0 && !activeCategory && ` · ${stats.unread} unread`}
              </p>
              <Button variant="ghost" size="sm" onClick={refetch} className="gap-1.5 text-xs text-muted-foreground h-7">
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>
          )}
        </div>
        <div className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-4">
            <CategorySummaryPanel categoryCounts={stats.categoryStats as unknown as Partial<Record<string, number>>}
              activeCategory={activeCategory} onCategoryClick={handleCategoryChange} totalCount={stats.total} unreadCount={stats.unread} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default InboxFeed;
