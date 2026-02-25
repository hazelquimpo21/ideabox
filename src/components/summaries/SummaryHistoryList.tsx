/**
 * SummaryHistoryList Component
 *
 * Renders a chronological list of past email summaries, grouped by date.
 * Each summary is expandable to show themed sections and items.
 *
 * Shows "Today", "Yesterday", then date headers for older summaries.
 * Includes pagination controls and loading/empty states.
 *
 * @module components/summaries/SummaryHistoryList
 * @since February 2026
 */

'use client';

import React, { memo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Mail,
  Clock,
  CheckSquare,
  Users,
  Calendar,
  Newspaper,
  Info,
  Plane,
  DollarSign,
  Briefcase,
  ExternalLink,
} from 'lucide-react';
import type { EmailSummary, SummarySection, SummaryItem, SummaryEmailIndex } from '@/services/summary';

// ═══════════════════════════════════════════════════════════════════════════════
// ICON MAP (shared with EmailSummaryCard)
// ═══════════════════════════════════════════════════════════════════════════════

const ICON_MAP: Record<string, React.ElementType> = {
  mail: Mail,
  clock: Clock,
  users: Users,
  newspaper: Newspaper,
  info: Info,
  plane: Plane,
  'dollar-sign': DollarSign,
  briefcase: Briefcase,
  calendar: Calendar,
  'check-square': CheckSquare,
};

// ═══════════════════════════════════════════════════════════════════════════════
// URGENCY STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const URGENCY_STYLES: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50/50',
  medium: 'border-l-amber-500 bg-amber-50/30',
  low: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SummaryHistoryListProps {
  /** List of summaries for the current page */
  items: EmailSummary[];
  /** Total summaries across all pages */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Whether more pages exist */
  hasMore: boolean;
  /** True during fetch */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Navigate to previous page */
  onPrevPage: () => void;
  /** Navigate to next page */
  onNextPage: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single item row within a summary section.
 */
const HistoryItemRow = memo(function HistoryItemRow({
  item,
  emailIndex,
}: {
  item: SummaryItem;
  emailIndex?: SummaryEmailIndex;
}) {
  const primaryEmailId = item.email_ids?.[0];
  const emailRef = primaryEmailId && emailIndex ? emailIndex[primaryEmailId] : null;
  const emailHref = primaryEmailId && emailRef?.category
    ? `/inbox/${emailRef.category}/${primaryEmailId}`
    : null;

  return (
    <li
      className={`pl-3 py-1.5 text-sm border-l-2 ${
        item.action_needed ? URGENCY_STYLES[item.urgency] || '' : 'border-l-transparent'
      }`}
    >
      <span className={item.action_needed ? 'font-medium' : 'text-muted-foreground'}>
        {item.text}
      </span>
      {item.action_needed && (
        <span className="ml-1.5 inline-block text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-1 py-0.5 rounded">
          Action
        </span>
      )}
      {emailHref && (
        <Link
          href={emailHref}
          className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700 hover:underline"
          title={emailRef?.subject || 'View email'}
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View
        </Link>
      )}
    </li>
  );
});

/**
 * Collapsible themed section within a summary.
 */
const HistorySectionBlock = memo(function HistorySectionBlock({
  section,
  defaultOpen,
  emailIndex,
}: {
  section: SummarySection;
  defaultOpen: boolean;
  emailIndex?: SummaryEmailIndex;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const IconComponent = ICON_MAP[section.icon] || Info;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1">{section.theme}</span>
        <span className="text-xs text-muted-foreground">{section.items.length}</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <ul className="px-3 pb-3 space-y-0.5">
          {section.items.map((item, i) => (
            <HistoryItemRow key={i} item={item} emailIndex={emailIndex} />
          ))}
        </ul>
      )}
    </div>
  );
});

/**
 * A single summary card in the history list.
 * Expandable: click to reveal full sections.
 */
const SummaryHistoryCard = memo(function SummaryHistoryCard({
  summary,
}: {
  summary: EmailSummary;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const timeStr = formatDateTime(summary.created_at);

  return (
    <Card className="overflow-hidden">
      {/* Clickable header: headline + stats */}
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{summary.headline}</p>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 pb-3">
          {/* Stats + timestamp row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeStr}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {summary.stats.new_emails} emails
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {summary.stats.threads_active} threads
            </span>
            {summary.stats.actions_pending > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <CheckSquare className="h-3 w-3" />
                {summary.stats.actions_pending} actions
              </span>
            )}
          </div>
        </CardContent>
      </button>

      {/* Expandable: themed sections */}
      {isExpanded && summary.sections.length > 0 && (
        <CardContent className="pt-0 pb-4 border-t">
          <div className="space-y-2 mt-3">
            {summary.sections.map((section, i) => (
              <HistorySectionBlock
                key={section.theme}
                section={section}
                defaultOpen={i < 2}
                emailIndex={summary.email_index}
              />
            ))}
          </div>

          {/* Coverage info */}
          <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
            Covering {summary.emails_included} emails across{' '}
            {summary.threads_included} threads
            {summary.period_start && summary.period_end && (
              <span>
                {' '}
                &middot; {formatDateRange(summary.period_start, summary.period_end)}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const SummaryHistoryList = memo(function SummaryHistoryList({
  items,
  total,
  page,
  hasMore,
  isLoading,
  error,
  onPrevPage,
  onNextPage,
}: SummaryHistoryListProps) {
  // ─── Loading state ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-destructive font-medium">
            Failed to load summary history
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  // ─── Empty state ─────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg mb-1">No summaries yet</CardTitle>
          <p className="text-sm text-muted-foreground">
            Summaries will appear here as your emails are analyzed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Group items by date ─────────────────────────────────────────────
  const grouped = groupByDate(items);

  return (
    <div>
      {/* Date-grouped summary list */}
      <div className="space-y-6">
        {grouped.map(({ label, summaries }) => (
          <div key={label}>
            {/* Date group header */}
            <h3 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background py-1">
              {label}
            </h3>

            {/* Summaries within this date group */}
            <div className="space-y-3">
              {summaries.map((summary) => (
                <SummaryHistoryCard key={summary.id} summary={summary} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      {total > items.length && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={page <= 1}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <span className="text-xs text-muted-foreground">
            Page {page} &middot; {total} total summaries
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!hasMore}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface DateGroup {
  label: string;
  summaries: EmailSummary[];
}

/**
 * Groups summaries by date, with "Today", "Yesterday", and formatted dates.
 */
function groupByDate(items: EmailSummary[]): DateGroup[] {
  const groups = new Map<string, EmailSummary[]>();
  const today = new Date();
  const todayStr = toDateString(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  for (const item of items) {
    const dateStr = toDateString(new Date(item.created_at));

    let label: string;
    if (dateStr === todayStr) {
      label = 'Today';
    } else if (dateStr === yesterdayStr) {
      label = 'Yesterday';
    } else {
      label = formatDateLabel(new Date(item.created_at));
    }

    const existing = groups.get(label);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(label, [item]);
    }
  }

  return Array.from(groups.entries()).map(([label, summaries]) => ({
    label,
    summaries,
  }));
}

/**
 * Formats a date to YYYY-MM-DD for comparison.
 */
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Formats a date for display as a group header (e.g. "Monday, Feb 24").
 */
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a timestamp for display (e.g. "2:30 PM").
 */
function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a date range for the coverage line (e.g. "Feb 24 - Feb 25").
 */
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // If same day, just show one date
  if (toDateString(startDate) === toDateString(endDate)) {
    return startStr;
  }

  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startStr} – ${endStr}`;
}
