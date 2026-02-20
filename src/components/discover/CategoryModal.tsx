/**
 * CategoryModal Component
 *
 * Modal for quick email triage within a category. Opens when clicking a
 * CategoryCard on the Discover dashboard. Supports bulk actions (mark read,
 * archive read) and links to full category page for deeper exploration.
 *
 * UPDATED (Feb 2026): Added support for legacy category values. The modal now
 * uses normalizeCategory() to handle old category values (action_required, event,
 * newsletter, etc.) that may exist in the database or cached sync_progress data.
 * Legacy categories are mapped to their new life-bucket equivalents before querying.
 *
 * @module components/discover/CategoryModal
 * @since Jan 2026
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, MailOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalBulkActions } from './ModalBulkActions';
import { ModalEmailItem } from './ModalEmailItem';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logDiscover } from '@/lib/utils/logger';
import {
  type EmailCategory,
  CATEGORY_DISPLAY,
  EMAIL_CATEGORIES_SET,
  normalizeCategory,
  isLegacyCategory,
} from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryModal');

/** Maximum emails to show in the modal */
const MODAL_EMAIL_LIMIT = 15;

/**
 * Fields needed for the modal list view.
 * Excludes body_html/body_text since modal only shows summaries.
 *
 * @see INBOX_PERFORMANCE_AUDIT.md — P0-B
 */
const MODAL_LIST_FIELDS = 'id, gmail_id, subject, sender_name, sender_email, date, snippet, category, is_read, is_starred, is_archived, quick_action, urgency_score, gist, summary, key_points, topics, labels, relationship_signal, analyzed_at' as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryModalProps {
  /** The category to display emails for */
  category: EmailCategory | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when an email is clicked for full view */
  onEmailClick?: (email: Email) => void;
  /** Callback when email is archived (for optimistic updates) */
  onEmailArchived?: (emailId: string) => void;
  /** Callback when email is starred/unstarred */
  onEmailStarred?: (emailId: string, isStarred: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Modal for quick email triage within a category.
 */
export function CategoryModal({
  category,
  isOpen,
  onClose,
  onEmailClick,
  onEmailArchived,
  onEmailStarred,
}: CategoryModalProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  // State
  const [emails, setEmails] = React.useState<Email[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isBulkActionLoading, setIsBulkActionLoading] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Category Normalization
  // ───────────────────────────────────────────────────────────────────────────
  // The category prop might contain legacy values (action_required, newsletter, etc.)
  // from cached sync_progress data. We normalize it to get the display config,
  // but query with the ORIGINAL value since that's what's in the database.
  // ───────────────────────────────────────────────────────────────────────────

  const normalizedCategory = category ? normalizeCategory(category) : null;
  const isLegacy = category ? isLegacyCategory(category) : false;

  // Use normalized category for display config, fall back to original if needed
  const categoryDisplay = normalizedCategory ? CATEGORY_DISPLAY[normalizedCategory] : null;
  const unreadCount = emails.filter(e => !e.is_read).length;
  const hasMoreEmails = totalCount > emails.length;

  // Log legacy category detection for debugging
  React.useEffect(() => {
    if (isLegacy && category) {
      logger.warn('Legacy category detected in modal', {
        originalCategory: category,
        normalizedCategory,
        hint: 'Consider running migration 028_category_cleanup.sql to update database',
      });
    }
  }, [category, isLegacy, normalizedCategory]);

  // Fetch emails for this category
  const fetchEmails = React.useCallback(async () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Validate category: accept both new categories and legacy categories
    // Legacy categories will be queried as-is since that's the DB value
    // ─────────────────────────────────────────────────────────────────────────
    const effectiveCategory = normalizeCategory(category);
    if (!category || !effectiveCategory) {
      logDiscover.invalidCategory({ category: category || 'null' });
      logger.warn('Invalid category - cannot fetch emails', {
        providedCategory: category,
        normalizedResult: effectiveCategory,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    const isLegacyCat = isLegacyCategory(category);
    logDiscover.modalOpen({ category, emailCount: 0 });
    logger.start('Fetching emails for modal', {
      category,
      isLegacy: isLegacyCat,
      queryCategory: category, // Query with original value (that's what's in DB)
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Query Strategy:
      // - Use the ORIGINAL category value for the query (matches DB)
      // - Legacy categories like 'newsletter' are still in the DB until migrated
      // - After migration 028 runs, all values will be new categories
      // ─────────────────────────────────────────────────────────────────────────
      // Select only list-view fields (no body_html/body_text)
      const { data, error: queryError, count } = await supabase
        .from('emails')
        .select(MODAL_LIST_FIELDS, { count: 'exact' })
        .eq('category', category) // Use original value - that's what's stored
        .eq('is_archived', false)
        .order('date', { ascending: false })
        .limit(MODAL_EMAIL_LIMIT);

      if (queryError) {
        throw new Error(queryError.message);
      }

      setEmails(data || []);
      setTotalCount(count || 0);

      logger.success('Emails fetched for modal', {
        category,
        isLegacy: isLegacyCat,
        count: data?.length || 0,
        total: count,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load emails';
      setError(message);
      logger.error('Failed to fetch emails for modal', { category, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [category, supabase]);

  // Fetch when modal opens or category changes
  React.useEffect(() => {
    if (isOpen && category) {
      fetchEmails();
    }
  }, [isOpen, category, fetchEmails]);

  // Log when modal closes
  React.useEffect(() => {
    if (!isOpen && category) {
      logDiscover.modalClose({ category });
    }
  }, [isOpen, category]);

  // Handlers
  const handleEmailClick = (email: Email) => {
    logDiscover.navigateToEmail({ category, emailId: email.id });

    if (onEmailClick) {
      onEmailClick(email);
    } else {
      // Default: navigate to email detail page
      // Use normalized category for clean URLs (new category names)
      // UPDATED (Feb 2026): /discover → /inbox per Navigation Redesign
      const urlCategory = normalizedCategory || category;
      router.push(`/inbox/${urlCategory}/${email.id}`);
      onClose();
    }
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

      onEmailStarred?.(email.id, newStarred);
      logger.success('Email star toggled', { emailId: email.id, isStarred: newStarred });
    } catch (err) {
      // Revert optimistic update
      setEmails(prev =>
        prev.map(e => (e.id === email.id ? { ...e, is_starred: !newStarred } : e))
      );
      logger.error('Failed to toggle star', { emailId: email.id, error: String(err) });
    }
  };

  const handleArchiveEmail = async (email: Email) => {
    // Optimistic update - remove from list
    setEmails(prev => prev.filter(e => e.id !== email.id));
    setTotalCount(prev => prev - 1);

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', email.id);

      if (updateError) throw updateError;

      onEmailArchived?.(email.id);
      logDiscover.emailAction({ category, emailId: email.id, action: 'archive' });
    } catch (err) {
      // Revert - refetch
      fetchEmails();
      logger.error('Failed to archive email', { emailId: email.id, error: String(err) });
    }
  };

  const handleMarkAllRead = async () => {
    const unreadEmails = emails.filter(e => !e.is_read);
    if (unreadEmails.length === 0) return;

    setIsBulkActionLoading(true);

    // Optimistic update
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
      // Revert
      fetchEmails();
      logger.error('Failed to mark all as read', { category, error: String(err) });
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleArchiveAllRead = async () => {
    const readEmails = emails.filter(e => e.is_read);
    if (readEmails.length === 0) return;

    setIsBulkActionLoading(true);

    // Optimistic update
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

      readEmails.forEach(e => onEmailArchived?.(e.id));
    } catch (err) {
      // Revert
      fetchEmails();
      logger.error('Failed to archive all read', { category, error: String(err) });
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleViewFullPage = () => {
    // Use normalized category for clean URLs (new category names)
    const urlCategory = normalizedCategory || category;
    logDiscover.navigateToDetail({ category: urlCategory });
    // UPDATED (Feb 2026): /discover → /inbox per Navigation Redesign
    router.push(`/inbox/${urlCategory}`);
    onClose();
  };

  if (!category) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryDisplay?.icon || '📧'}</span>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {categoryDisplay?.label || category}
                <Badge variant="secondary" className="ml-2">
                  {totalCount} emails
                </Badge>
                {unreadCount > 0 && (
                  <Badge variant="default" className="bg-blue-500">
                    {unreadCount} unread
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {categoryDisplay?.description || 'Emails in this category'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Bulk Actions */}
        <ModalBulkActions
          unreadCount={unreadCount}
          readCount={emails.filter(e => e.is_read).length}
          isLoading={isBulkActionLoading}
          isRefreshing={isLoading}
          onMarkAllRead={handleMarkAllRead}
          onArchiveAllRead={handleArchiveAllRead}
          onRefresh={fetchEmails}
        />

        {/* Email List */}
        <div className="flex-1 overflow-y-auto py-2 space-y-2 min-h-0">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))
          ) : error ? (
            // Error state
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-destructive mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchEmails}>
                Try Again
              </Button>
            </div>
          ) : emails.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MailOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No emails in this category</p>
            </div>
          ) : (
            // Email cards
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

              {/* Show more indicator */}
              {hasMoreEmails && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Showing {emails.length} of {totalCount} emails
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t flex-shrink-0">
          <Button onClick={handleViewFullPage} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            View Full Page
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryModal;
