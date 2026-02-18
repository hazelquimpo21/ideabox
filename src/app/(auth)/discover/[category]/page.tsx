/**
 * Category Detail Page
 *
 * Full-page view of all emails in a single category with bulk actions,
 * filters, and pagination. Accessible from CategoryModal or direct navigation.
 *
 * UPDATED (Feb 2026): Added support for legacy category values in URL params.
 * The page now uses normalizeCategory() to handle old category values that may
 * appear in URLs from bookmarks, shared links, or cached navigation state.
 * Legacy categories are normalized for display but queried as-is in the database.
 *
 * @module app/(auth)/discover/[category]/page
 * @since Jan 2026
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MailOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryPageHeader } from '@/components/discover/CategoryPageHeader';
import { CategoryPageToolbar } from '@/components/discover/CategoryPageToolbar';
import { ModalEmailItem } from '@/components/discover/ModalEmailItem';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logDiscover } from '@/lib/utils/logger';
import {
  type EmailCategory,
  CATEGORY_DISPLAY,
  normalizeCategory,
  isLegacyCategory,
} from '@/types/discovery';
import type { Email } from '@/types/database';

const logger = createLogger('CategoryDetailPage');
const PAGE_SIZE = 25;

export default function CategoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const category = params.category as string;
  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Category Normalization
  // ───────────────────────────────────────────────────────────────────────────
  // The URL may contain legacy category values (action_required, newsletter, etc.)
  // from old bookmarks or shared links. We normalize for display config lookup,
  // but query the database with the original value since that's what's stored.
  // ───────────────────────────────────────────────────────────────────────────

  const normalizedCategory = normalizeCategory(category);
  const isLegacy = isLegacyCategory(category);
  const isValidCategory = normalizedCategory !== null;

  // Use normalized category for display config
  const categoryDisplay = normalizedCategory
    ? CATEGORY_DISPLAY[normalizedCategory]
    : null;

  // Log legacy category detection
  React.useEffect(() => {
    if (isLegacy) {
      logger.warn('Legacy category detected in URL', {
        urlCategory: category,
        normalizedCategory,
        hint: 'Consider running migration 028_category_cleanup.sql to update database',
      });
    }
  }, [category, isLegacy, normalizedCategory]);

  // State
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

  const unreadCount = emails.filter(e => !e.is_read).length;
  const readCount = emails.filter(e => e.is_read).length;

  const fetchEmails = React.useCallback(async (reset = true) => {
    if (!isValidCategory) {
      logDiscover.invalidCategory({ category });
      logger.error('Cannot fetch emails - invalid category', {
        providedCategory: category,
        normalizedResult: normalizedCategory,
      });
      setError('Invalid category');
      setIsLoading(false);
      return;
    }

    if (reset) {
      setIsLoading(true);
    }
    setError(null);

    // Query with the original category value (that's what's stored in DB)
    // Legacy categories like 'newsletter' will match DB until migration runs
    logger.start('Fetching emails for category page', {
      category,
      isLegacy,
      queryCategory: category,
    });

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
  }, [category, isValidCategory, isLegacy, normalizedCategory, showUnreadOnly, showStarredOnly, supabase]);

  // Load More

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

  // Effects

  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Handlers

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

  // Invalid Category

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

  // Render

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <CategoryPageHeader
        categoryDisplay={categoryDisplay}
        category={category}
        totalCount={totalCount}
        unreadCount={unreadCount}
        onBack={handleBack}
      />

      {/* Toolbar */}
      <CategoryPageToolbar
        unreadCount={unreadCount}
        readCount={readCount}
        isBulkActionLoading={isBulkActionLoading}
        isRefreshing={isLoading}
        showUnreadOnly={showUnreadOnly}
        showStarredOnly={showStarredOnly}
        onMarkAllRead={handleMarkAllRead}
        onArchiveAllRead={handleArchiveAllRead}
        onRefresh={() => fetchEmails()}
        onUnreadFilterChange={setShowUnreadOnly}
        onStarredFilterChange={setShowStarredOnly}
      />

      {/* Email List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg space-y-2">
              <Skeleton className="h-4 w-40" />
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MailOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {showUnreadOnly || showStarredOnly ? 'No matching emails' : 'No emails'}
            </p>
          </div>
        ) : (
          // Email list
          <>
            {emails.map((email) => (
              <ModalEmailItem
                key={email.id}
                email={email}
                onClick={() => handleEmailClick(email)}
                onToggleStar={() => handleToggleStar(email)}
                onArchive={() => handleArchiveEmail(email)}
              />
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
