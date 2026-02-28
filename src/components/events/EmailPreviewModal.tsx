/**
 * 📧 Email Preview Modal Component
 *
 * A modal dialog for previewing the original email that an event was extracted from.
 * Allows users to see full email context without leaving the Events page.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When viewing events on the Events page, users often want to see the original
 * email for additional context (e.g., full event details, sender info, attachments).
 * This modal provides a "peek" at the email without navigating away.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Fetches email data on-demand when modal opens
 * - Shows loading skeleton while fetching
 * - Displays full email with sender, subject, date, and body
 * - Link to view in Gmail for additional actions
 * - Error handling with retry option
 * - Keyboard accessible (Escape to close)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { EmailPreviewModal } from '@/components/events';
 *
 * function EventCard({ event }) {
 *   const [showEmail, setShowEmail] = useState(false);
 *
 *   return (
 *     <>
 *       <Button onClick={() => setShowEmail(true)}>View Email</Button>
 *       <EmailPreviewModal
 *         emailId={event.email_id}
 *         isOpen={showEmail}
 *         onClose={() => setShowEmail(false)}
 *       />
 *     </>
 *   );
 * }
 * ```
 *
 * @module components/events/EmailPreviewModal
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Skeleton,
  Badge,
} from '@/components/ui';
import {
  Mail,
  Clock,
  User,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { AnalysisSummaryBar } from '@/components/email/AnalysisSummaryBar';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailPreviewModal');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email data structure for the preview modal.
 * Matches the response from GET /api/emails/[id].
 */
interface EmailData {
  /** Unique email identifier */
  id: string;
  /** Gmail message ID for external link */
  gmail_id: string | null;
  /** Email subject line */
  subject: string | null;
  /** Sender's display name */
  sender_name: string | null;
  /** Sender's email address */
  sender_email: string;
  /** Recipient email address */
  recipient_email: string | null;
  /** Email date/time */
  date: string;
  /** Short preview snippet */
  snippet: string | null;
  /** Plain text body */
  body_text: string | null;
  /** HTML body (sanitized before display) */
  body_html: string | null;
  /** Email category from AI analysis */
  category: string | null;
  /** Signal strength from Categorizer (denormalized) */
  signal_strength: string | null;
  /** Quick action suggestion from Categorizer (denormalized) */
  quick_action: string | null;
  /** Reply worthiness from Categorizer (denormalized) */
  reply_worthiness: string | null;
  /** Whether email has been read */
  is_read: boolean;
  /** Whether email is starred */
  is_starred: boolean;
}

/**
 * Props for the EmailPreviewModal component.
 */
export interface EmailPreviewModalProps {
  /** ID of the email to preview */
  emailId: string | null;
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Optional title override (defaults to "Original Email") */
  title?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string for display.
 *
 * @param dateStr - ISO date string
 * @returns Formatted date string (e.g., "Mon, Jan 20, 2026, 2:30 PM")
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (error) {
    logger.warn('Failed to format date', { dateStr, error });
    return dateStr;
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Removes scripts, event handlers, and javascript: URLs.
 *
 * @param html - Raw HTML string
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their contents
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers (onclick, onload, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

  // Remove form action attributes to prevent submissions
  clean = clean.replace(/<form\b([^>]*)action\s*=\s*["'][^"']*["']([^>]*)>/gi, '<form $1$2>');

  // Convert submit buttons to regular buttons to prevent form submission
  clean = clean.replace(/type\s*=\s*["']submit["']/gi, 'type="button"');

  // Make external links open in new tab
  clean = clean.replace(
    /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    '<a $1href="$2" target="_blank" rel="noopener noreferrer"$3>'
  );

  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loading skeleton shown while email data is being fetched.
 */
function EmailLoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Subject skeleton */}
      <Skeleton className="h-6 w-3/4" />

      {/* Date skeleton */}
      <Skeleton className="h-4 w-40" />

      {/* Body skeleton */}
      <div className="space-y-2 pt-4 border-t">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error state shown when email fetch fails.
 */
function EmailErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Failed to Load Email</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{error}</p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the email content (header, subject, body).
 */
function EmailContent({ email }: { email: EmailData }) {
  const hasHtml = email.body_html && email.body_html.trim().length > 0;
  const hasText = email.body_text && email.body_text.trim().length > 0;

  logger.debug('Rendering email content', {
    emailId: email.id.substring(0, 8),
    hasHtml,
    hasText,
    subject: email.subject?.substring(0, 30),
  });

  // Prevent any form submissions within email content
  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // If clicking a submit button or form element, prevent default
    if (target.closest('form') || target.getAttribute('type') === 'submit') {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('Prevented form interaction in email content');
    }
  };

  return (
    <div className="space-y-4" onClick={handleContentClick}>
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Sender Info */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-primary">
            {(email.sender_name || email.sender_email)?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">
            {email.sender_name || email.sender_email}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {email.sender_email}
          </p>
        </div>
        {email.is_starred && (
          <Badge variant="outline" className="shrink-0 text-yellow-600">
            Starred
          </Badge>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Subject */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <h2 className="text-lg font-semibold leading-tight">
        {email.subject || '(No subject)'}
      </h2>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Date and Category */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDate(email.date)}</span>
        </div>
        {email.category && (
          <Badge variant="secondary" className="text-xs">
            {email.category.replace(/_/g, ' ')}
          </Badge>
        )}
        {!email.is_read && (
          <Badge variant="outline" className="text-xs gap-1">
            <Mail className="h-3 w-3" />
            Unread
          </Badge>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Analysis Summary Bar — shows why IdeaBox flagged this email */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <AnalysisSummaryBar
        emailId={email.id}
        category={email.category}
        signalStrength={email.signal_strength}
        quickAction={email.quick_action}
        replyWorthiness={email.reply_worthiness}
      />

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Email Body */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="pt-4 border-t">
        {hasHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert break-words"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html || '') }}
          />
        ) : hasText ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {email.body_text}
          </pre>
        ) : (
          <p className="text-muted-foreground italic">
            {email.snippet || 'No content available'}
          </p>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* View in Gmail Link */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {email.gmail_id && (
        <div className="pt-4 border-t">
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() =>
              logger.info('View in Gmail clicked', {
                emailId: email.id.substring(0, 8),
              })
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View in Gmail
          </a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email Preview Modal
 *
 * A modal dialog that fetches and displays the full content of an email.
 * Used on the Events page to let users "peek" at the original email
 * that an event was extracted from.
 *
 * The modal:
 * - Fetches email data when opened (not on mount)
 * - Shows loading skeleton during fetch
 * - Handles errors gracefully with retry option
 * - Displays full email with formatted body
 * - Provides link to view in Gmail for additional actions
 *
 * @example
 * ```tsx
 * <EmailPreviewModal
 *   emailId={event.email_id}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 * />
 * ```
 */
export function EmailPreviewModal({
  emailId,
  isOpen,
  onClose,
  title = 'Original Email',
}: EmailPreviewModalProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [email, setEmail] = React.useState<EmailData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Email Data
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchEmail = React.useCallback(async () => {
    if (!emailId) {
      logger.warn('Cannot fetch email: no emailId provided');
      setError('No email ID provided');
      return;
    }

    logger.start('Fetching email for preview', { emailId: emailId.substring(0, 8) });
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/emails/${emailId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch email', {
          emailId: emailId.substring(0, 8),
          status: response.status,
          error: errorMessage,
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || 'Invalid response from server');
      }

      logger.success('Email fetched successfully', {
        emailId: emailId.substring(0, 8),
        subject: data.data.subject?.substring(0, 30),
      });

      setEmail(data.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch email';
      logger.error('Email fetch error', {
        emailId: emailId.substring(0, 8),
        error: message,
      });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [emailId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch when modal opens
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (isOpen && emailId) {
      logger.debug('Modal opened, fetching email', { emailId: emailId.substring(0, 8) });
      fetchEmail();
    }

    // Reset state when modal closes
    if (!isOpen) {
      setEmail(null);
      setError(null);
    }
  }, [isOpen, emailId, fetchEmail]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handle close with logging
  // ─────────────────────────────────────────────────────────────────────────────

  const handleClose = React.useCallback(() => {
    logger.debug('Modal closed', { emailId: emailId?.substring(0, 8) });
    onClose();
  }, [emailId, onClose]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Header */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>
            View the full email that this event was extracted from.
          </DialogDescription>
        </DialogHeader>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Content */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="min-h-0">
          {isLoading ? (
            <EmailLoadingSkeleton />
          ) : error ? (
            <EmailErrorState error={error} onRetry={fetchEmail} />
          ) : email ? (
            <EmailContent email={email} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No email selected</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EmailPreviewModal;
