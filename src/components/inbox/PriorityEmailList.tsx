/**
 * PriorityEmailList Component
 *
 * Displays emails ranked by AI priority score, highest first.
 * This is the content for the "Priority" tab in InboxTabs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches directly from Supabase `emails` table (not using useEmails hook)
 * because it needs a different sort order (priority_score DESC) and only
 * includes emails that have been scored.
 *
 * Fields fetched: id, sender_name, sender_email, subject, category,
 * priority_score, date, snippet, gist, quick_action, signal_strength
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROW LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   [Score Badge] [Sender] [Subject] [Gist snippet] [Category] [Action] [Date] [→]
 *
 * Score badge is color-coded:
 *   - 80+ = red (critical)
 *   - 60+ = orange (high)
 *   - 40+ = yellow (medium)
 *   - <40 = green (low)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MODAL vs NAVIGATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When `onEmailSelect` prop is provided, clicking a row opens the email
 * in a modal (keeps the priority list mounted for instant back-navigation).
 * Otherwise falls back to Link-based full-page navigation.
 *
 * @module components/inbox/PriorityEmailList
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Inbox,
  MessageSquare,
  Eye,
  Calendar,
  CornerUpRight,
  Bookmark,
  Reply,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_BADGE_COLORS, CATEGORY_SHORT_LABELS } from '@/types/discovery';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { EmailHoverCard } from '@/components/email/EmailHoverCard';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PriorityEmailList');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Lightweight email fields needed for the priority list display */
interface PriorityEmail {
  id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  category: string | null;
  priority_score: number | null;
  date: string;
  snippet: string | null;
  gist: string | null;
  quick_action: string | null;
  signal_strength: string | null;
  reply_worthiness: string | null;
  email_type: string | null;
  analyzed_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum number of emails to fetch for the priority list */
const MAX_EMAILS = 50;

// Category colors and labels — using centralized constants from @/types/discovery
// CATEGORY_BADGE_COLORS and CATEGORY_SHORT_LABELS are imported above

/**
 * Quick action icons for priority list — shows what action the AI suggests.
 * Only the most common actions are mapped; others are hidden.
 */
const ACTION_ICONS: Record<string, React.ElementType> = {
  respond: MessageSquare,
  review: Eye,
  calendar: Calendar,
  follow_up: CornerUpRight,
  save: Bookmark,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a color class for the priority score badge.
 * Higher scores get warmer (more urgent) colors.
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (score >= 60) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (score >= 40) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

/**
 * Formats a date string into a compact relative format.
 * "Today" → "Yesterday" → "3d ago" → "2w ago" → "Jan 15"
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: PriorityEmailRow
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Memoized priority email row.
 * Extracted to enable React.memo and prevent re-renders of all rows
 * when a single row changes.
 *
 * When `onEmailSelect` is provided, renders as a <button> that opens
 * the modal. Otherwise renders as a <Link> for full-page navigation.
 */
const PriorityEmailRow = React.memo(function PriorityEmailRow({
  email,
  onEmailSelect,
}: {
  email: PriorityEmail;
  onEmailSelect?: (email: PriorityEmail) => void;
}) {
  const category = email.category || 'personal_friends_family';
  const categoryColor = CATEGORY_BADGE_COLORS[category as keyof typeof CATEGORY_BADGE_COLORS] || 'bg-gray-50 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
  const categoryLabel = CATEGORY_SHORT_LABELS[category as keyof typeof CATEGORY_SHORT_LABELS] || category.replace(/_/g, ' ');

  // Determine quick action icon (if any)
  const ActionIcon = email.quick_action ? ACTION_ICONS[email.quick_action] : null;

  // Prefer gist over snippet for the preview text
  const previewText = email.gist || email.snippet;

  const rowContent = (
    <>
      {/* Priority score badge */}
      {email.priority_score !== null && (
        <Badge className={cn('shrink-0 gap-1 font-semibold tabular-nums', getScoreColor(email.priority_score))}>
          <TrendingUp className="h-3 w-3" />
          {email.priority_score}
        </Badge>
      )}

      {/* Email info — sender, subject, gist */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">
            {email.sender_name || email.sender_email}
          </span>
          {/* Quick action icon hint */}
          {ActionIcon && (
            <ActionIcon
              className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
              aria-label={`Suggested action: ${email.quick_action}`}
            />
          )}
          {/* Reply worthiness indicator */}
          {(email.reply_worthiness === 'must_reply' || email.reply_worthiness === 'should_reply') && (
            <Reply
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                email.reply_worthiness === 'must_reply' ? 'text-red-500' : 'text-orange-400',
              )}
              aria-label={email.reply_worthiness === 'must_reply' ? 'Must reply' : 'Should reply'}
            />
          )}
          {/* Idea spark indicator — only shown for high-signal analyzed emails (noise emails don't generate sparks) */}
          {email.analyzed_at && email.signal_strength && email.signal_strength !== 'noise' && email.signal_strength !== 'low' && (
            <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-label="Has idea sparks" />
          )}
        </div>
        <EmailHoverCard email={email as unknown as import('@/types/database').Email}>
          <p className="text-sm truncate">
            {email.subject || '(No subject)'}
          </p>
        </EmailHoverCard>
        {/* AI gist preview — the key "at a glance" addition */}
        {previewText && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
            {previewText}
          </p>
        )}
      </div>

      {/* Category badge */}
      <Badge className={cn('text-[10px] shrink-0 border-0 font-medium', categoryColor)}>
        {categoryLabel}
      </Badge>

      {/* Email type indicator — helps distinguish personal vs newsletter vs notification */}
      {email.email_type && email.email_type !== 'personal' && email.email_type !== 'needs_response' && (
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {email.email_type.replace(/_/g, ' ')}
        </span>
      )}

      {/* Date */}
      <span className="text-xs text-muted-foreground/70 whitespace-nowrap shrink-0 tabular-nums">
        {formatRelativeDate(email.date)}
      </span>

      {/* Arrow indicator */}
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
    </>
  );

  // Modal mode — button that keeps the priority list mounted
  if (onEmailSelect) {
    return (
      <button
        type="button"
        onClick={() => {
          logger.debug('Priority row clicked (modal)', { emailId: email.id });
          onEmailSelect(email);
        }}
        className={cn(
          'flex items-center gap-4 p-4 border-b border-border/40',
          'hover:bg-muted/30 transition-colors last:border-b-0',
          'w-full text-left',
        )}
      >
        {rowContent}
      </button>
    );
  }

  // Fallback: Link navigation (full page route)
  return (
    <Link
      href={`/inbox/${category}/${email.id}?from=priority`}
      className={cn(
        'flex items-center gap-4 p-4 border-b border-border/40',
        'hover:bg-muted/30 transition-colors last:border-b-0',
      )}
    >
      {rowContent}
    </Link>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PriorityEmailList — emails ranked by AI priority score.
 *
 * Fetches emails from Supabase sorted by priority_score descending.
 * Each row shows sender, subject, gist, score badge, category, and date.
 * Clicking a row opens the email detail modal (or navigates via Link fallback).
 */
export function PriorityEmailList({ onEmailSelect }: { onEmailSelect?: (email: PriorityEmail) => void } = {}) {
  const [emails, setEmails] = React.useState<PriorityEmail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Memoize Supabase client at component level to avoid recreating per render
  const supabase = React.useMemo(() => createClient(), []);

  /**
   * Fetch priority-ranked emails from Supabase.
   * Selects only lightweight fields needed for list display.
   */
  const fetchEmails = React.useCallback(async () => {
    logger.start('Fetching priority-ranked emails', { limit: MAX_EMAILS });
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('emails')
        .select('id, sender_name, sender_email, subject, category, priority_score, date, snippet, gist, quick_action, signal_strength, reply_worthiness, email_type, analyzed_at')
        .not('priority_score', 'is', null)
        .order('priority_score', { ascending: false })
        .limit(MAX_EMAILS);

      if (queryError) {
        throw new Error(queryError.message);
      }

      const results = (data || []) as PriorityEmail[];
      setEmails(results);
      logger.success('Fetched priority emails', { count: results.length });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch emails');
      logger.error('Failed to fetch priority emails', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Fetch on mount
  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border/40">
            <Skeleton className="h-6 w-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────
  if (error) {
    logger.error('Rendering error state', { message: error.message });
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Failed to load priority emails</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{error.message}</p>
          <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────────
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No scored emails yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Emails will appear here once they have been analyzed and scored by AI.
          Run an analysis from Settings to get started.
        </p>
      </div>
    );
  }

  // ─── Email List ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header with count and refresh */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{emails.length}</span>
          {' '}emails ranked by AI priority
        </p>
        <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {emails.map((email) => (
            <PriorityEmailRow
              key={email.id}
              email={email}
              onEmailSelect={onEmailSelect}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default PriorityEmailList;
