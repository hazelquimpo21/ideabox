/**
 * Email Detail Modal Component
 *
 * Slide-over modal that displays full email detail without navigating away
 * from the inbox. Keeps the underlying list mounted so back-navigation
 * is instant (no refetch needed).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UX FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * User clicks email in list → Modal slides in from right with email detail
 *                            → Inbox stays mounted underneath
 *                            → Escape/backdrop closes modal instantly
 *                            → "Open Full Page" navigates to /inbox/[cat]/[id]
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE NOTES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Fetches email body (body_html/body_text) only when the modal opens,
 *   since list views use EMAIL_LIST_FIELDS which exclude heavy body fields.
 * - Wraps EmailDetail (existing component) in a Dialog for consistent UX.
 * - Star/archive actions optimistically update via onEmailUpdated callback
 *   so the parent list reflects changes immediately.
 *
 * @module components/email/EmailDetailModal
 * @since February 2026 — Inbox Performance Audit P0-A
 * @see INBOX_PERFORMANCE_AUDIT.md
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailDetail } from './EmailDetail';
import { ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailDetailModal');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailDetailModalProps {
  /** The email ID to display (fetches full email data including body) */
  emailId: string | null;
  /** The category of the email (for "Open Full Page" link) */
  category: string | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Callback when an email is updated (star, archive, read) for optimistic list updates */
  onEmailUpdated?: (emailId: string, updates: Partial<Email>) => void;
  /** The originating tab for "Open Full Page" link context */
  fromTab?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email detail modal — slide-over panel showing full email content.
 *
 * Fetches the complete email (including body_html/body_text) when opened.
 * Reuses the existing EmailDetail component for rendering.
 */
export function EmailDetailModal({
  emailId,
  category,
  isOpen,
  onClose,
  onEmailUpdated,
  fromTab,
}: EmailDetailModalProps) {
  const supabase = React.useMemo(() => createClient(), []);

  const [email, setEmail] = React.useState<Email | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  // ─── Fetch full email data when modal opens ─────────────────────────────────

  React.useEffect(() => {
    if (!isOpen || !emailId) {
      return;
    }

    let isMounted = true;

    async function fetchEmail() {
      setIsLoading(true);
      setError(null);
      logger.start('Fetching email for modal', { emailId });

      try {
        // Fetch full email including body_html/body_text
        const { data, error: queryError } = await supabase
          .from('emails')
          .select('*')
          .eq('id', emailId)
          .single();

        if (!isMounted) return;

        if (queryError) {
          if (queryError.code === 'PGRST116') {
            throw new Error('Email not found');
          }
          throw new Error(queryError.message);
        }

        setEmail(data);
        logger.success('Email fetched for modal', {
          emailId,
          subject: data?.subject,
        });

        // Mark as read if unread
        if (data && !data.is_read) {
          logger.info('Marking email as read', { emailId });
          await supabase
            .from('emails')
            .update({ is_read: true })
            .eq('id', emailId);

          if (isMounted) {
            setEmail((prev) => (prev ? { ...prev, is_read: true } : null));
            onEmailUpdated?.(emailId, { is_read: true });
          }
        }
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load email';
        setError(message);
        logger.error('Failed to fetch email for modal', {
          emailId,
          error: message,
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchEmail();
    return () => {
      isMounted = false;
    };
  }, [isOpen, emailId, supabase, onEmailUpdated]);

  // Clean up email state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      // Small delay to allow close animation before clearing
      const timeout = setTimeout(() => {
        setEmail(null);
        setError(null);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleStar = async () => {
    if (!email || !emailId) return;

    const newStarred = !email.is_starred;
    setEmail((prev) => (prev ? { ...prev, is_starred: newStarred } : null));
    onEmailUpdated?.(emailId, { is_starred: newStarred });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', emailId);

      if (updateError) throw updateError;
      logger.success('Star toggled in modal', {
        emailId,
        isStarred: newStarred,
      });
    } catch (err) {
      // Revert optimistic update
      setEmail((prev) => (prev ? { ...prev, is_starred: !newStarred } : null));
      onEmailUpdated?.(emailId, { is_starred: !newStarred });
      logger.error('Failed to toggle star in modal', { error: String(err) });
    }
  };

  const handleArchive = async () => {
    if (!email || !emailId) return;

    logger.info('Archiving email from modal', { emailId });
    onEmailUpdated?.(emailId, { is_archived: true });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', emailId);

      if (updateError) throw updateError;
      logger.success('Email archived from modal', { emailId });
      onClose();
    } catch (err) {
      onEmailUpdated?.(emailId, { is_archived: false });
      logger.error('Failed to archive from modal', { error: String(err) });
    }
  };

  const handleToggleRead = async () => {
    if (!email || !emailId) return;

    const newRead = !email.is_read;
    setEmail((prev) => (prev ? { ...prev, is_read: newRead } : null));
    onEmailUpdated?.(emailId, { is_read: newRead });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_read: newRead })
        .eq('id', emailId);

      if (updateError) throw updateError;
      logger.success('Read status toggled in modal', {
        emailId,
        isRead: newRead,
      });
    } catch (err) {
      setEmail((prev) => (prev ? { ...prev, is_read: !newRead } : null));
      onEmailUpdated?.(emailId, { is_read: !newRead });
      logger.error('Failed to toggle read in modal', { error: String(err) });
    }
  };

  const handleAnalyze = async () => {
    if (!emailId) return;

    setIsAnalyzing(true);
    logger.info('Analyzing email from modal', { emailId });

    try {
      const response = await fetch(`/api/emails/${emailId}/analyze`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      // Refetch email to get updated analysis
      const { data } = await supabase
        .from('emails')
        .select('*')
        .eq('id', emailId)
        .single();

      if (data) {
        setEmail(data);
        logger.success('Email re-analyzed in modal', { emailId });
      }
    } catch (err) {
      logger.error('Failed to analyze in modal', { error: String(err) });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Build the "Open Full Page" URL
  const fullPageUrl = emailId && category
    ? `/inbox/${category}/${emailId}${fromTab ? `?from=${fromTab}` : ''}`
    : null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden sm:max-h-[85vh]"
        aria-describedby={undefined}
        hideClose
      >
        {/* Accessible title (visually hidden when email subject is shown) */}
        <DialogTitle className="sr-only">
          {email?.subject || 'Email Detail'}
        </DialogTitle>

        {/* Loading State */}
        {isLoading && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="p-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {/* Email Content */}
        {email && !isLoading && !error && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <EmailDetail
              email={email}
              onStar={handleStar}
              onArchive={handleArchive}
              onToggleRead={handleToggleRead}
              onAnalyze={handleAnalyze}
              onClose={onClose}
              isAnalyzing={isAnalyzing}
            />

            {/* Footer with "Open Full Page" */}
            {fullPageUrl && (
              <div className="flex justify-end p-4 border-t bg-muted/30 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    logger.info('Opening full page from modal', {
                      emailId,
                      category,
                    });
                    window.location.href = fullPageUrl;
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Full Page
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EmailDetailModal;
