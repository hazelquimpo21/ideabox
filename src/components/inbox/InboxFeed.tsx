/**
 * InboxFeed Component
 *
 * Unified inbox view inspired by Spark Mail / Gmail.
 * Replaces the old "Categories" tab grid-of-cards approach with a
 * scannable email list that feels familiar and human-friendly.
 *
 * Layout:
 *   - Top: Category filter pills (horizontal scroll)
 *   - Left (main): Email list with priority section at top
 *   - Right (desktop): Category summary sidebar with counts + mini bars
 *
 * All 12 categories are wired up. Click any category pill or sidebar
 * item to filter. Click an email to open the detail modal.
 *
 * @module components/inbox/InboxFeed
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { RefreshCw, Inbox, Sparkles, Search } from 'lucide-react';
import { Button, Skeleton, Input } from '@/components/ui';
import { useEmails } from '@/hooks';
import { CategoryFilterBar } from './CategoryFilterBar';
import { CategorySummaryPanel } from './CategorySummaryPanel';
import { InboxEmailRow } from './InboxEmailRow';
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

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxFeedProps {
  /** Callback when an email is selected (opens detail modal) */
  onEmailSelect?: (email: { id: string; category?: string | null }) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxFeed({ onEmailSelect }: InboxFeedProps) {
  const supabase = React.useMemo(() => createClient(), []);

  // ─── State ──────────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = React.useState<EmailCategory | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // ─── Fetch emails ───────────────────────────────────────────────────────────
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
  });

  // ─── Filter by search query (client-side) ─────────────────────────────────
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

  // ─── Split into priority + rest ─────────────────────────────────────────────
  const { priorityEmails, recentEmails } = React.useMemo(() => {
    if (activeCategory) {
      // When filtered by category, don't split - show all in one list
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

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCategoryChange = React.useCallback(
    (category: EmailCategory | null) => {
      logger.info('Category filter changed', { category: category || 'all' });
      setActiveCategory(category);
    },
    []
  );

  const handleEmailClick = React.useCallback(
    (email: Email) => {
      if (onEmailSelect) {
        onEmailSelect({ id: email.id, category: email.category });
      }
    },
    [onEmailSelect]
  );

  const handleToggleStar = React.useCallback(
    async (email: Email) => {
      const newStarred = !email.is_starred;
      updateEmail(email.id, { is_starred: newStarred });

      try {
        const { error: updateError } = await supabase
          .from('emails')
          .update({ is_starred: newStarred })
          .eq('id', email.id);

        if (updateError) throw updateError;
      } catch (err) {
        updateEmail(email.id, { is_starred: !newStarred });
        logger.error('Failed to toggle star', { emailId: email.id, error: String(err) });
      }
    },
    [supabase, updateEmail]
  );

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        {/* Filter bar skeleton */}
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        {/* Email list skeleton */}
        <div className="flex gap-6">
          <div className="flex-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          {/* Sidebar skeleton - hidden on mobile */}
          <div className="hidden lg:block w-56 shrink-0 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────

  if (error) {
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

  // ─── Empty State ────────────────────────────────────────────────────────────

  if (emails.length === 0 && !activeCategory) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Your inbox is empty</h3>
        <p className="text-muted-foreground max-w-sm">
          Emails will appear here once they have been synced and analyzed.
          Run an analysis from Settings to get started.
        </p>
      </div>
    );
  }

  // ─── Main View ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Search + Filter bar */}
      <div className="space-y-3 mb-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Category pills */}
        <CategoryFilterBar
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
          categoryCounts={stats.categoryStats as unknown as Partial<Record<string, number>>}
          totalCount={stats.total}
        />
      </div>

      {/* Two-column layout: email list + sidebar */}
      <div className="flex gap-6">
        {/* Main email list */}
        <div className="flex-1 min-w-0">
          {/* Active filter indicator */}
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

          {/* Priority section */}
          {priorityEmails.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-2 px-4 py-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Priority
                </span>
              </div>
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden mb-4">
                {priorityEmails.map((email: Email) => (
                  <InboxEmailRow
                    key={email.id}
                    email={email}
                    onClick={handleEmailClick}
                    onToggleStar={handleToggleStar}
                    showCategory
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent emails section */}
          {recentEmails.length > 0 && (
            <div>
              {priorityEmails.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {activeCategory ? 'Emails' : 'Recent'}
                  </span>
                </div>
              )}
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                {recentEmails.map((email: Email) => (
                  <InboxEmailRow
                    key={email.id}
                    email={email}
                    onClick={handleEmailClick}
                    onToggleStar={handleToggleStar}
                    showCategory={!activeCategory}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    className="gap-2"
                  >
                    Load more emails
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Footer info */}
          {filteredEmails.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 mt-2">
              <p className="text-xs text-muted-foreground">
                {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
                {activeCategory && ' in this category'}
                {stats.unread > 0 && !activeCategory && ` \u00b7 ${stats.unread} unread`}
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

        {/* Right sidebar - category summary (desktop only) */}
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
