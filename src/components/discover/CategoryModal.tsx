/**
 * CategoryModal Component
 *
 * Modal for quick email triage within a category. Opens when clicking a
 * CategoryCard on the Discover dashboard. Supports bulk actions (mark read,
 * archive read) and links to full category page for deeper exploration.
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
} from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryModal');

/** Maximum emails to show in the modal */
const MODAL_EMAIL_LIMIT = 15;

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

  // Derived
  const categoryDisplay = category ? CATEGORY_DISPLAY[category] : null;
  const unreadCount = emails.filter(e => !e.is_read).length;
  const hasMoreEmails = totalCount > emails.length;

  // Fetch emails for this category
  const fetchEmails = React.useCallback(async () => {
    if (!category || !EMAIL_CATEGORIES_SET.has(category)) {
      logDiscover.invalidCategory({ category: category || 'null' });
      return;
    }

    setIsLoading(true);
    setError(null);

    logDiscover.modalOpen({ category, emailCount: 0 });
    logger.start('Fetching emails for modal', { category });

    try {
      const { data, error: queryError, count } = await supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .eq('category', category)
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
      router.push(`/discover/${category}/${email.id}`);
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
    logDiscover.navigateToDetail({ category });
    router.push(`/discover/${category}`);
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
