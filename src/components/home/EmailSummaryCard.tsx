/**
 * EmailSummaryCard Component
 *
 * Home page widget displaying the AI-synthesized email summary.
 * Shows a narrative headline, themed sections with collapsible items,
 * quick stats, and a refresh button.
 *
 * The summary auto-generates when stale (new emails + >1 hour since last).
 * Shows loading/generating/empty states appropriately.
 *
 * NEW (Feb 2026): Core component for the email summaries feature.
 *
 * @module components/home/EmailSummaryCard
 * @since February 2026
 */

'use client';

import React, { memo, useState } from 'react';
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
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Mail,
  Clock,
  CheckSquare,
  Calendar,
  AlertCircle,
  Users,
  Newspaper,
  Info,
  Plane,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import type { EmailSummary, SummarySection, SummaryItem } from '@/services/summary';

// ═══════════════════════════════════════════════════════════════════════════════
// ICON MAP
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

export interface EmailSummaryCardProps {
  summary: EmailSummary | null;
  isLoading: boolean;
  isGenerating: boolean;
  isStale: boolean;
  error: Error | null;
  onRefresh: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY SECTION ITEM
// ═══════════════════════════════════════════════════════════════════════════════

const SummaryItemRow = memo(function SummaryItemRow({ item }: { item: SummaryItem }) {
  return (
    <li className={`pl-3 py-1.5 text-sm border-l-2 ${item.action_needed ? URGENCY_STYLES[item.urgency] || '' : 'border-l-transparent'}`}>
      <span className={item.action_needed ? 'font-medium' : 'text-muted-foreground'}>
        {item.text}
      </span>
      {item.action_needed && (
        <span className="ml-1.5 inline-block text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-1 py-0.5 rounded">
          Action
        </span>
      )}
    </li>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const SummarySectionBlock = memo(function SummarySectionBlock({
  section,
  defaultOpen,
}: {
  section: SummarySection;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const IconComponent = ICON_MAP[section.icon] || Info;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
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
            <SummaryItemRow key={i} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const EmailSummaryCard = memo(function EmailSummaryCard({
  summary,
  isLoading,
  isGenerating,
  isStale,
  error,
  onRefresh,
}: EmailSummaryCardProps) {
  // ─── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-3" />
          <Skeleton className="h-4 w-3/4 mb-6" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────
  if (error && !summary) {
    return (
      <Card className="mb-8 border-destructive/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Failed to load summary</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Generating state (no existing summary) ────────────────────────────
  if (isGenerating && !summary) {
    return (
      <Card className="mb-8">
        <CardContent className="flex items-center gap-3 py-6">
          <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
          <div>
            <p className="text-sm font-medium">Summarizing your latest emails...</p>
            <p className="text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────────
  if (!summary) {
    return (
      <Card className="mb-8 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg mb-1">No summary yet</CardTitle>
          <p className="text-sm text-muted-foreground mb-3">
            A summary will be generated once you have new emails.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Summary display ──────────────────────────────────────────────────
  const timeAgo = getTimeAgo(summary.created_at);

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Email Summary</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isGenerating && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onRefresh}
              disabled={isGenerating}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Headline */}
        <p className="text-sm leading-relaxed mb-4">{summary.headline}</p>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />
            {summary.stats.new_emails} emails
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {summary.stats.threads_active} threads
          </span>
          {summary.stats.actions_pending > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <CheckSquare className="h-3.5 w-3.5" />
              {summary.stats.actions_pending} actions
            </span>
          )}
          {summary.stats.deadlines_upcoming > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <Clock className="h-3.5 w-3.5" />
              {summary.stats.deadlines_upcoming} deadlines
            </span>
          )}
        </div>

        {/* Themed sections */}
        <div className="space-y-2">
          {summary.sections.map((section, i) => (
            <SummarySectionBlock
              key={section.theme}
              section={section}
              defaultOpen={i < 2} // First 2 sections open by default
            />
          ))}
        </div>

        {/* Footer with timestamp */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Updated {timeAgo}
            {isStale && ' · New emails since'}
          </span>
          <span>
            {summary.emails_included} emails across {summary.threads_included} threads
          </span>
        </div>
      </CardContent>
    </Card>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converts a timestamp to a human-readable "time ago" string.
 */
function getTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
