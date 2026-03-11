/**
 * Email Detail Component
 *
 * AI-first email detail view. The AI digest (gist, key points, actions,
 * nuggets, dates) is the primary content. The original email body is in a
 * collapsible below the digest. Deep-dive analysis sections follow.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 2 — March 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Data flow: EmailDetailModal (hooks) → EmailDetail (layout) → AIDigestView / AnalysisSummary
 *
 * Render order:
 *   EmailHeader → EmailSubject → AIDigestView → CollapsibleEmailBody → AnalysisSummary
 *
 * Performance:
 *   - Email body is lazy-rendered (only mounted on first expand).
 *   - AIDigestView and AnalysisSummary are memoized.
 *   - No new data fetching — everything comes from props.
 *
 * @module components/email/EmailDetail
 * @see AIDigestView — tier-1 editorial AI digest
 * @see AnalysisSummary — tier-2 deep-dive sections
 */

'use client';

import * as React from 'react';
import { Button, Badge } from '@/components/ui';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { ExtractedDate } from '@/hooks/useExtractedDates';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { getTimelinessAccent, type TimelinessNature } from '@/lib/utils/timeliness';
import { cn } from '@/lib/utils/cn';
import { AIDigestView } from './AIDigestView';
import { AnalysisSummary } from './AnalysisSummary';
import { getCategoryBadge } from './analysis/helpers';
import {
  X,
  Star,
  Archive,
  Mail,
  MailOpen,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailDetailProps {
  email: Email;
  onStar?: (emailId: string) => void;
  onArchive?: (emailId: string) => void;
  onToggleRead?: (emailId: string) => void;
  onAnalyze?: (emailId: string) => Promise<void>;
  onClose?: () => void;
  isLoading?: boolean;
  isAnalyzing?: boolean;
  // Hoisted analysis data (from EmailDetailModal)
  analysis?: NormalizedAnalysis | null;
  isLoadingAnalysis?: boolean;
  extractedDates?: ExtractedDate[];
  refetchAnalysis?: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

function sanitizeHtml(html: string): string {
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  clean = clean.replace(
    /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    '<a $1href="$2" target="_blank" rel="noopener noreferrer"$3>'
  );
  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function EmailHeader({
  email,
  contact,
  onStar,
  onArchive,
  onToggleRead,
  onClose,
}: {
  email: Email;
  contact?: Contact | null;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onClose?: () => void;
}) {
  // Build contact info line: "Product Manager at Acme Corp" or just one
  const contactInfoLine = React.useMemo(() => {
    if (!contact) return null;
    const parts: string[] = [];
    if (contact.job_title) parts.push(contact.job_title);
    if (contact.company) parts.push(contact.company);
    if (parts.length === 0) return null;
    return parts.length === 2 ? `${parts[0]} at ${parts[1]}` : parts[0];
  }, [contact]);

  return (
    <div className="flex items-start justify-between gap-4 p-6 border-b border-border bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-primary">
              {(email.sender_name || email.sender_email)?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{email.sender_name || email.sender_email}</p>
            <p className="text-sm text-muted-foreground truncate">{email.sender_email}</p>
            {contactInfoLine && (
              <p className="text-xs text-muted-foreground/70 truncate">{contactInfoLine}</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onStar?.(email.id)}
          className={email.is_starred ? 'text-yellow-500' : 'text-muted-foreground'}>
          <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onToggleRead?.(email.id)} className="text-muted-foreground">
          {email.is_read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onArchive?.(email.id)} className="text-muted-foreground">
          <Archive className="h-4 w-4" />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function EmailSubject({ email }: { email: Email }) {
  const categoryBadge = getCategoryBadge(email.category);
  return (
    <div className="px-6 py-4 border-b border-border">
      <h1 className="text-xl font-semibold mb-2">{email.subject || '(No subject)'}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDate(email.date)}</span>
        </div>
        <Badge variant={categoryBadge.variant} className="gap-1">
          {categoryBadge.icon}
          {categoryBadge.label}
        </Badge>
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

function EmailBody({ email }: { email: Email }) {
  const htmlRef = React.useRef<HTMLDivElement>(null);
  const hasHtml = email.body_html && email.body_html.trim().length > 0;
  const hasText = email.body_text && email.body_text.trim().length > 0;

  // Hide broken images
  React.useEffect(() => {
    if (!htmlRef.current) return;
    const imgs = htmlRef.current.querySelectorAll('img');
    const handler = (e: Event) => {
      (e.target as HTMLImageElement).style.display = 'none';
    };
    imgs.forEach(img => img.addEventListener('error', handler));
    return () => {
      imgs.forEach(img => img.removeEventListener('error', handler));
    };
  }, [email.id]);

  if (!hasHtml && !hasText) {
    return (
      <div className="px-6 py-4">
        <p className="text-muted-foreground italic">{email.snippet || 'No content available'}</p>
      </div>
    );
  }

  if (hasHtml) {
    return (
      <div className="px-6 py-4">
        <div
          ref={htmlRef}
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html || '') }}
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{email.body_text}</pre>
    </div>
  );
}

/**
 * Collapsible wrapper for the email body.
 * Lazy-renders: EmailBody is only mounted on first expand, then kept mounted.
 */
function CollapsibleEmailBody({
  email,
  defaultOpen = false,
}: {
  email: Email;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const everOpened = React.useRef(defaultOpen);

  const handleToggle = React.useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) everOpened.current = true;
      return next;
    });
  }, []);

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-6 py-3 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={handleToggle}
      >
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
        <span className="font-medium">Original email</span>
        {!isOpen && email.snippet && (
          <span className="text-muted-foreground truncate text-xs ml-1">
            {email.snippet.substring(0, 80)}...
          </span>
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className={`overflow-hidden transition-opacity duration-150 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
          {everOpened.current && <EmailBody email={email} />}
        </div>
      </div>
    </div>
  );
}


/**
 * Timeliness banner — shows late_after/expires dates from email.timeliness JSONB.
 * Past dates shown in red with past tense. Future dates in accent color.
 */
function TimelinessBanner({ email }: { email: Email }) {
  const timeliness = email.timeliness as Record<string, unknown> | null;
  if (!timeliness) return null;

  const now = new Date();
  const nature = (timeliness.nature as TimelinessNature) || 'reference';
  const accent = getTimelinessAccent(nature);
  const banners: Array<{ text: string; isPast: boolean }> = [];

  if (timeliness.late_after && typeof timeliness.late_after === 'string') {
    const date = new Date(timeliness.late_after);
    const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (date < now) {
      banners.push({ text: `This email became stale on ${dateStr}`, isPast: true });
    } else {
      banners.push({ text: `This email becomes stale after ${dateStr}`, isPast: false });
    }
  }

  if (timeliness.expires && typeof timeliness.expires === 'string') {
    const date = new Date(timeliness.expires);
    const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (date < now) {
      banners.push({ text: `Content expired on ${dateStr}`, isPast: true });
    } else {
      banners.push({ text: `Content expires ${dateStr}`, isPast: false });
    }
  }

  if (banners.length === 0) return null;

  return (
    <div className="px-6 pt-3">
      {banners.map((banner, i) => (
        <div
          key={i}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border',
            banner.isPast
              ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400'
              : cn(accent.bg, accent.text, 'border-current/20'),
          )}
        >
          {banner.isPast
            ? <AlertTriangle className="h-3 w-3 shrink-0" />
            : <Clock className="h-3 w-3 shrink-0" />
          }
          {banner.text}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EmailDetail({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onAnalyze,
  onClose,
  isLoading = false,
  isAnalyzing = false,
  analysis,
  isLoadingAnalysis,
  extractedDates,
  refetchAnalysis,
}: EmailDetailProps) {
  // Fetch contact data for sender info display (must be before early returns — React hooks rule)
  const { contacts: matchedContacts } = useContacts({
    search: email.sender_email,
    sortBy: 'email_count',
    sortOrder: 'desc',
  });
  const senderContact = matchedContacts.find(
    (c) => c.email.toLowerCase() === email.sender_email.toLowerCase()
  ) ?? null;

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

  // Show email body expanded when there's no analysis to display
  const hasAnalysis = !!email.analyzed_at && !!analysis;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <EmailHeader
        email={email}
        contact={senderContact}
        onStar={onStar}
        onArchive={onArchive}
        onToggleRead={onToggleRead}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto">
        <EmailSubject email={email} />

        {/* Timeliness banner — stale/expiring dates */}
        <TimelinessBanner email={email} />

        {/* AI Digest — the primary content */}
        <AIDigestView
          email={email}
          analysis={analysis}
          isLoadingAnalysis={isLoadingAnalysis}
          extractedDates={extractedDates}
          onAnalyze={onAnalyze}
          isAnalyzing={isAnalyzing}
          refetchAnalysis={refetchAnalysis}
        />

        {/* Original email — collapsible, collapsed when AI digest is shown */}
        <CollapsibleEmailBody email={email} defaultOpen={!hasAnalysis} />

        {/* Deep-dive analysis sections */}
        {hasAnalysis && (
          <AnalysisSummary
            email={email}
            analysis={analysis}
          />
        )}

        {email.gmail_id && (
          <div className="px-6 py-4 border-t border-border">
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

export default EmailDetail;
