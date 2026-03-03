/**
 * Email Detail Component
 *
 * Displays the full content of a selected email with rich AI analysis.
 * Used in a slide-out panel from the email list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 2 Redesign — March 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Data flow: EmailDetailModal (hooks) → EmailDetail (layout) → AnalysisSummary → sections
 *
 * - useEmailAnalysis and useExtractedDates are hoisted to EmailDetailModal so
 *   they fire in parallel with the email fetch (no more request waterfall).
 * - This component receives analysis/extractedDates/refetchAnalysis as props.
 * - AISummaryBar renders between subject and body for at-a-glance insights.
 * - AnalysisSummary is extracted to its own file. Each analysis section is an
 *   independent, collapsible, memoized component under analysis/.
 *
 * Render order: EmailHeader → EmailSubject → AISummaryBar → EmailBody → AnalysisSummary
 *
 * @module components/email/EmailDetail
 * @see EmailDetailModal — data boundary (hook calls live there)
 * @see AISummaryBar — compact summary bar above email body
 * @see AnalysisSummary — orchestrator for analysis sections
 */

'use client';

import * as React from 'react';
import { Button, Badge } from '@/components/ui';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { ExtractedDate } from '@/hooks/useExtractedDates';
import { AISummaryBar } from './AISummaryBar';
import { AnalysisSummary } from './AnalysisSummary';
import { getCategoryBadge } from './analysis/helpers';
import { createLogger } from '@/lib/utils/logger';
import {
  X,
  Star,
  Archive,
  Mail,
  MailOpen,
  Clock,
  ExternalLink,
  CheckCircle2,
  Loader2,
  ListChecks,
} from 'lucide-react';
import type { Email, EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailDetail');

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
  onStar,
  onArchive,
  onToggleRead,
  onClose,
}: {
  email: Email;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onClose?: () => void;
}) {
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

  // Hide broken images (e.g. favicon 404s embedded in email HTML) to suppress console noise
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

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL QUICK ACTIONS BAR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick Actions Bar — shown between email content and AI analysis.
 *
 * Provides one-click "Create Task" and "Save Idea" actions so users can
 * act on an email without navigating away. Uses inline fetch() calls
 * consistent with the existing nugget/spark save buttons elsewhere in
 * this component.
 *
 * @since March 2026
 */
function EmailQuickActions({ email }: { email: Email }) {
  const [taskCreated, setTaskCreated] = React.useState(false);
  const [isCreatingTask, setIsCreatingTask] = React.useState(false);

  /** Create a task/action linked to this email via POST /api/actions */
  const handleCreateTask = async () => {
    setIsCreatingTask(true);
    logger.start('Creating task from email quick action', { emailId: email.id.substring(0, 8) });

    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: email.subject || 'Follow up',
          description: email.gist || email.snippet || undefined,
          email_id: email.id,
          priority: 'medium',
          action_type: 'follow_up',
        }),
      });

      if (!response.ok) throw new Error(`Failed to create task: ${response.status}`);

      setTaskCreated(true);
      logger.success('Task created from email', { emailId: email.id.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to create task from email', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsCreatingTask(false);
    }
  };

  return (
    <div className="px-6 py-3 border-b border-border bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Quick actions</span>
        {taskCreated ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded-md">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Task created
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleCreateTask}
            disabled={isCreatingTask}
            title="Create a follow-up task from this email"
          >
            {isCreatingTask ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ListChecks className="h-3.5 w-3.5" />
            )}
            Create Task
          </Button>
        )}
      </div>
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
    <div className="flex flex-col h-full overflow-hidden">
      <EmailHeader
        email={email}
        onStar={onStar}
        onArchive={onArchive}
        onToggleRead={onToggleRead}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto">
        <EmailSubject email={email} />
        {/* AI Summary Bar — above the body */}
        <div className="px-6 pb-2">
          <AISummaryBar
            email={email}
            analysis={analysis ?? null}
            isLoading={isLoadingAnalysis ?? false}
          />
        </div>
        <EmailBody email={email} />
        <AnalysisSummary
          email={email}
          onAnalyze={onAnalyze}
          isAnalyzing={isAnalyzing}
          analysis={analysis}
          isLoadingAnalysis={isLoadingAnalysis}
          extractedDates={extractedDates}
          refetchAnalysis={refetchAnalysis}
        />
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
