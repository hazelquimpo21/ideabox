/**
 * Category Detail Page
 *
 * Full-page view of all emails in a single category.
 * Accessible from:
 * - Clicking "View Full Page" in CategoryModal
 * - Direct navigation to /discover/[category]
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Full list of emails in the category with AI summaries
 * - Bulk actions: Archive all read, Mark all read
 * - Filter by unread/starred
 * - Click email to open detail view
 * - Back navigation to Discover dashboard
 *
 * @module app/(auth)/discover/[category]/page
 * @since Jan 2026 - Discover-first architecture
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Archive,
  CheckCheck,
  Filter,
  Loader2,
  MailOpen,
  RefreshCw,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmailCard } from '@/components/categories/EmailCard';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logDiscover } from '@/lib/utils/logger';
import {
  type EmailCategory,
  CATEGORY_DISPLAY,
  EMAIL_CATEGORIES_SET,
} from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryDetailPage');

/** Number of emails per page */
const PAGE_SIZE = 25;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CategoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const category = params.category as string;
  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Validate Category
  // ───────────────────────────────────────────────────────────────────────────

  const isValidCategory = EMAIL_CATEGORIES_SET.has(category);
  const categoryDisplay = isValidCategory
    ? CATEGORY_DISPLAY[category as EmailCategory]
    : null;

  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [emails, setEmails] = React.useState<Email[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isBulkActionLoading, setIsBulkActionLoading] = React.useState(false);

  // Filters
  const [showUnreadOnly, setShowUnreadOnly] = React.useState(false);
  const [showStarredOnly, setShowStarredOnly] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived
  // ───────────────────────────────────────────────────────────────────────────

  const unreadCount = emails.filter(e => !e.is_read).length;
  const readCount = emails.filter(e => e.is_read).length;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Emails
  // ───────────────────────────────────────────────────────────────────────────

  const fetchEmails = React.useCallback(async (reset = true) => {
    if (!isValidCategory) {
      logDiscover.invalidCategory({ category });
      setError('Invalid category');
      setIsLoading(false);
      return;
    }

    if (reset) {
      setIsLoading(true);
    }
    setError(null);

    logger.start('Fetching emails for category page', { category });

    try {
      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .eq('category', category)
        .eq('is_archived', false)
        .order('date', { ascending: false })
        .limit(PAGE_SIZE);

      // Apply filters
      if (showUnreadOnly) {
        query = query.eq('is_read', false);
      }
      if (showStarredOnly) {
        query = query.eq('is_starred', true);
      }

      const { data, error: queryError, count } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      setEmails(data || []);
      setTotalCount(count || 0);
      setHasMore((data?.length || 0) >= PAGE_SIZE && (count || 0) > PAGE_SIZE);

      logDiscover.statsFetched({
        category,
        count: data?.length || 0,
        total: count || 0,
      });

      logger.success('Emails fetched for category page', {
        category,
        count: data?.length || 0,
        total: count,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load emails';
      setError(message);
      logger.error('Failed to fetch emails', { category, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [category, isValidCategory, showUnreadOnly, showStarredOnly, supabase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load More
  // ───────────────────────────────────────────────────────────────────────────

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      let query = supabase
        .from('emails')
        .select('*')
        .eq('category', category)
        .eq('is_archived', false)
        .order('date', { ascending: false })
        .range(emails.length, emails.length + PAGE_SIZE - 1);

      if (showUnreadOnly) {
        query = query.eq('is_read', false);
      }
      if (showStarredOnly) {
        query = query.eq('is_starred', true);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      const newEmails = data || [];
      setEmails(prev => [...prev, ...newEmails]);
      setHasMore(newEmails.length >= PAGE_SIZE);

      logger.debug('Loaded more emails', {
        category,
        newCount: newEmails.length,
        totalLoaded: emails.length + newEmails.length,
      });
    } catch (err) {
      logger.error('Failed to load more', { error: String(err) });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleBack = () => {
    router.push('/discover');
  };

  const handleEmailClick = (email: Email) => {
    logDiscover.navigateToEmail({ category, emailId: email.id });
    router.push(`/discover/${category}/${email.id}`);
  };

  const handleToggleStar = async (email: Email) => {
    const newStarred = !email.is_starred;

    // Optimistic update
    setEmails(prev =>
      prev.map(e => (e.id === email.id ? { ...e, is_starred: newStarred } : e))
    );

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', email.id);

      if (updateError) throw updateError;
    } catch (err) {
      // Revert
      setEmails(prev =>
        prev.map(e => (e.id === email.id ? { ...e, is_starred: !newStarred } : e))
      );
      logger.error('Failed to toggle star', { error: String(err) });
    }
  };

  const handleArchiveEmail = async (email: Email) => {
    // Optimistic update
    setEmails(prev => prev.filter(e => e.id !== email.id));
    setTotalCount(prev => prev - 1);

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', email.id);

      if (updateError) throw updateError;

      logDiscover.emailAction({ category, emailId: email.id, action: 'archive' });
    } catch (err) {
      fetchEmails();
      logger.error('Failed to archive', { error: String(err) });
    }
  };

  const handleMarkAllRead = async () => {
    const unreadEmails = emails.filter(e => !e.is_read);
    if (unreadEmails.length === 0) return;

    setIsBulkActionLoading(true);
    setEmails(prev => prev.map(e => ({ ...e, is_read: true })));

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_read: true })
        .in('id', unreadEmails.map(e => e.id));

      if (updateError) throw updateError;

      logDiscover.bulkAction({
        category,
        action: 'mark_all_read',
        count: unreadEmails.length,
      });
    } catch (err) {
      fetchEmails();
      logger.error('Failed to mark all read', { error: String(err) });
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleArchiveAllRead = async () => {
    const readEmails = emails.filter(e => e.is_read);
    if (readEmails.length === 0) return;

    setIsBulkActionLoading(true);
    setEmails(prev => prev.filter(e => !e.is_read));
    setTotalCount(prev => prev - readEmails.length);

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .in('id', readEmails.map(e => e.id));

      if (updateError) throw updateError;

      logDiscover.bulkAction({
        category,
        action: 'archive_all_read',
        count: readEmails.length,
      });
    } catch (err) {
      fetchEmails();
      logger.error('Failed to archive all read', { error: String(err) });
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Invalid Category
  // ───────────────────────────────────────────────────────────────────────────

  if (!isValidCategory) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4">🤔</span>
          <h1 className="text-2xl font-bold mb-2">Category Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The category &ldquo;{category}&rdquo; doesn&apos;t exist.
          </p>
          <Button onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      {/* ─────────────────────────────────────────────────────────────────────
          HEADER
      ───────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <span className="text-3xl">{categoryDisplay?.icon || '📧'}</span>
          <div>
            <h1 className="text-2xl font-bold">
              {categoryDisplay?.label || category}
            </h1>
            <p className="text-sm text-muted-foreground">
              {categoryDisplay?.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {totalCount} emails
          </Badge>
          {unreadCount > 0 && (
            <Badge variant="default" className="bg-blue-500 text-lg px-3 py-1">
              {unreadCount} unread
            </Badge>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          TOOLBAR
      ───────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-3 border-y mb-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isBulkActionLoading || unreadCount === 0}
          >
            {isBulkActionLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-1" />
            )}
            Mark All Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchiveAllRead}
            disabled={isBulkActionLoading || readCount === 0}
          >
            {isBulkActionLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Archive className="h-4 w-4 mr-1" />
            )}
            Archive Read ({readCount})
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-1" />
                Filter
                {(showUnreadOnly || showStarredOnly) && (
                  <Badge variant="secondary" className="ml-1 px-1">
                    {[showUnreadOnly && 'Unread', showStarredOnly && 'Starred']
                      .filter(Boolean)
                      .length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={showUnreadOnly}
                onCheckedChange={setShowUnreadOnly}
              >
                <MailOpen className="h-4 w-4 mr-2" />
                Unread only
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showStarredOnly}
                onCheckedChange={setShowStarredOnly}
              >
                <Star className="h-4 w-4 mr-2" />
                Starred only
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchEmails()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          EMAIL LIST
      ───────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : error ? (
          // Error state
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={() => fetchEmails()}>
              Try Again
            </Button>
          </div>
        ) : emails.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MailOpen className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No emails found</h2>
            <p className="text-muted-foreground mb-4">
              {showUnreadOnly || showStarredOnly
                ? 'Try adjusting your filters'
                : 'No emails in this category'}
            </p>
            {(showUnreadOnly || showStarredOnly) && (
              <Button
                variant="outline"
                onClick={() => {
                  setShowUnreadOnly(false);
                  setShowStarredOnly(false);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          // Email list
          <>
            {emails.map((email) => (
              <div key={email.id} className="relative group">
                <EmailCard
                  email={email}
                  onClick={() => handleEmailClick(email)}
                  onToggleStar={() => handleToggleStar(email)}
                  enhanced
                />
                {/* Quick archive on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveEmail(email);
                  }}
                  className="absolute top-3 right-12 p-1.5 rounded-md bg-background/80 border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                  title="Archive"
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${emails.length} of ${totalCount})`
                  )}
                </Button>
              </div>
            )}

            {/* End of list */}
            {!hasMore && emails.length > 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Showing all {emails.length} emails
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
