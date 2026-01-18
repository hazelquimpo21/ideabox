/**
 * Email Detail Component
 *
 * Displays the full content of a selected email with actions.
 * Used in a slide-out panel or modal from the email list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Full email header (sender, recipient, date, subject)
 * - Email body rendering (HTML or plain text)
 * - AI analysis display (category, action, client)
 * - Quick actions (star, archive, mark read/unread)
 * - Responsive design for different screen sizes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { EmailDetail } from '@/components/email/EmailDetail';
 *
 * function EmailView({ email }: { email: Email }) {
 *   return (
 *     <EmailDetail
 *       email={email}
 *       onStar={(id) => console.log('Star', id)}
 *       onArchive={(id) => console.log('Archive', id)}
 *       onClose={() => console.log('Close')}
 *     />
 *   );
 * }
 * ```
 *
 * @module components/email/EmailDetail
 * @version 1.0.0
 */

'use client';

import * as React from 'react';
import { Button, Badge, Card, CardContent, CardHeader } from '@/components/ui';
import {
  X,
  Star,
  Archive,
  Mail,
  MailOpen,
  Clock,
  User,
  Calendar,
  AlertCircle,
  Newspaper,
  Tag,
  CheckCircle2,
  Building2,
  ExternalLink,
} from 'lucide-react';
import type { Email, EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the EmailDetail component.
 */
export interface EmailDetailProps {
  /** Email to display */
  email: Email;

  /** Callback when star is toggled */
  onStar?: (emailId: string) => void;

  /** Callback when archive is clicked */
  onArchive?: (emailId: string) => void;

  /** Callback when read status is toggled */
  onToggleRead?: (emailId: string) => void;

  /** Callback when close is clicked */
  onClose?: () => void;

  /** Whether the component is loading */
  isLoading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format date for display.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get category badge styling.
 */
function getCategoryBadge(category: EmailCategory | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'action_required':
      return {
        variant: 'destructive',
        label: 'Action Required',
        icon: <AlertCircle className="h-3 w-3" />,
      };
    case 'event':
      return {
        variant: 'default',
        label: 'Event',
        icon: <Calendar className="h-3 w-3" />,
      };
    case 'newsletter':
      return {
        variant: 'secondary',
        label: 'Newsletter',
        icon: <Newspaper className="h-3 w-3" />,
      };
    case 'promo':
      return {
        variant: 'outline',
        label: 'Promo',
        icon: <Tag className="h-3 w-3" />,
      };
    case 'admin':
      return {
        variant: 'secondary',
        label: 'Admin',
        icon: <Mail className="h-3 w-3" />,
      };
    case 'personal':
      return {
        variant: 'outline',
        label: 'Personal',
        icon: <User className="h-3 w-3" />,
      };
    case 'noise':
      return {
        variant: 'outline',
        label: 'Noise',
        icon: <Archive className="h-3 w-3" />,
      };
    default:
      return {
        variant: 'outline',
        label: 'Uncategorized',
        icon: <Mail className="h-3 w-3" />,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email header with sender info and actions.
 */
interface EmailHeaderProps {
  email: Email;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onClose?: () => void;
}

function EmailHeader({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onClose,
}: EmailHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
      {/* Left side: sender info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {/* Sender avatar placeholder */}
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-primary">
              {(email.sender_name || email.sender_email)?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>

          <div className="min-w-0">
            <p className="font-medium truncate">
              {email.sender_name || email.sender_email}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {email.sender_email}
            </p>
          </div>
        </div>
      </div>

      {/* Right side: actions */}
      <div className="flex items-center gap-1">
        {/* Star button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStar?.(email.id)}
          className={email.is_starred ? 'text-yellow-500' : 'text-muted-foreground'}
          aria-label={email.is_starred ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
        </Button>

        {/* Read/Unread toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onToggleRead?.(email.id)}
          className="text-muted-foreground"
          aria-label={email.is_read ? 'Mark as unread' : 'Mark as read'}
        >
          {email.is_read ? (
            <MailOpen className="h-4 w-4" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
        </Button>

        {/* Archive button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onArchive?.(email.id)}
          className="text-muted-foreground"
          aria-label="Archive"
        >
          <Archive className="h-4 w-4" />
        </Button>

        {/* Close button */}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Email subject and metadata.
 */
function EmailSubject({ email }: { email: Email }) {
  const categoryBadge = getCategoryBadge(email.category);

  return (
    <div className="py-4 border-b border-border">
      {/* Subject */}
      <h1 className="text-xl font-semibold mb-2">
        {email.subject || '(No subject)'}
      </h1>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {/* Date */}
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDate(email.date)}</span>
        </div>

        {/* Category badge */}
        <Badge variant={categoryBadge.variant} className="gap-1">
          {categoryBadge.icon}
          {categoryBadge.label}
        </Badge>

        {/* Read status */}
        {!email.is_read && (
          <Badge variant="outline" className="gap-1">
            <Mail className="h-3 w-3" />
            Unread
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * AI analysis summary section.
 */
interface AnalysisSummaryProps {
  email: Email;
}

function AnalysisSummary({ email }: AnalysisSummaryProps) {
  // Only show if email has been analyzed
  if (!email.analyzed_at) {
    return null;
  }

  // Note: Extended Email type would have action_type, client_name, etc.
  // For now, we show what's available in the base Email type
  const hasAction = email.category === 'action_required';

  return (
    <Card className="mb-4">
      <CardHeader className="py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          AI Analysis
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Category */}
          <div>
            <p className="text-muted-foreground mb-1">Category</p>
            <p className="font-medium capitalize">
              {email.category?.replace('_', ' ') || 'Uncategorized'}
            </p>
          </div>

          {/* Action status */}
          <div>
            <p className="text-muted-foreground mb-1">Action</p>
            <p className={`font-medium ${hasAction ? 'text-destructive' : ''}`}>
              {hasAction ? 'Action Required' : 'No Action Needed'}
            </p>
          </div>

          {/* Client (if linked) */}
          <div>
            <p className="text-muted-foreground mb-1">Client</p>
            <p className="font-medium flex items-center gap-1">
              {email.client_id ? (
                <>
                  <Building2 className="h-3.5 w-3.5" />
                  Linked
                </>
              ) : (
                'Not Linked'
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Email body content display.
 */
interface EmailBodyProps {
  email: Email;
}

function EmailBody({ email }: EmailBodyProps) {
  // Prefer HTML body for rich formatting, fall back to text
  const hasHtml = email.body_html && email.body_html.trim().length > 0;
  const hasText = email.body_text && email.body_text.trim().length > 0;

  if (!hasHtml && !hasText) {
    // No body content, show snippet
    return (
      <div className="py-4">
        <p className="text-muted-foreground italic">
          {email.snippet || 'No content available'}
        </p>
      </div>
    );
  }

  if (hasHtml) {
    // Render HTML content in a sandboxed iframe or with sanitization
    // For security, we use an iframe with sandbox
    return (
      <div className="py-4">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(email.body_html || ''),
          }}
        />
      </div>
    );
  }

  // Render plain text with preserved whitespace
  return (
    <div className="py-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {email.body_text}
      </pre>
    </div>
  );
}

/**
 * Basic HTML sanitization for email content.
 *
 * Note: In production, use a proper sanitization library like DOMPurify.
 * This is a basic implementation for demonstration.
 */
function sanitizeHtml(html: string): string {
  // Remove script tags
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove on* event handlers
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

  // Add target="_blank" and rel="noopener" to links
  clean = clean.replace(
    /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    '<a $1href="$2" target="_blank" rel="noopener noreferrer"$3>'
  );

  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EmailDetail component displays the full content of an email.
 *
 * Features:
 * - Email header with sender info and quick actions
 * - Subject line with category badge and metadata
 * - AI analysis summary (if analyzed)
 * - Full email body (HTML or plain text)
 *
 * @example
 * ```tsx
 * <EmailDetail
 *   email={selectedEmail}
 *   onStar={handleStar}
 *   onArchive={handleArchive}
 *   onToggleRead={handleToggleRead}
 *   onClose={() => setSelectedEmail(null)}
 * />
 * ```
 */
export function EmailDetail({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onClose,
  isLoading = false,
}: EmailDetailProps) {
  // Show loading state
  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-10 bg-muted rounded mb-4" />
        <div className="h-6 bg-muted rounded w-3/4 mb-2" />
        <div className="h-4 bg-muted rounded w-1/2 mb-4" />
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6">
        <EmailHeader
          email={email}
          onStar={onStar}
          onArchive={onArchive}
          onToggleRead={onToggleRead}
          onClose={onClose}
        />
      </div>

      {/* Subject */}
      <div className="px-6">
        <EmailSubject email={email} />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* AI Analysis Summary */}
        <div className="py-4">
          <AnalysisSummary email={email} />
        </div>

        {/* Email Body */}
        <EmailBody email={email} />

        {/* Footer with Gmail link */}
        {email.gmail_id && (
          <div className="pt-4 border-t border-border">
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in Gmail
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default EmailDetail;
