/**
 * InboxSummaryBanner Component
 *
 * A compact, collapsible summary banner shown at the top of the inbox.
 * Gives users a quick "at a glance" digest of recent email activity
 * without leaving the inbox view.
 *
 * Features:
 * - Headline from the latest summary
 * - Key stats (emails, threads, actions, deadlines)
 * - Expandable themed sections with clickable email links
 * - "Summarizing..." state when generating
 * - Dismissible (collapses to a thin bar)
 *
 * @module components/inbox/InboxSummaryBanner
 * @since February 2026
 */

'use client';

import React, { memo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Mail,
  Users,
  CheckSquare,
  Clock,
  Newspaper,
  Info,
  Plane,
  DollarSign,
  Briefcase,
  Calendar,
  ExternalLink,
  X,
} from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { useSummary } from '@/hooks';
import type { SummarySection, SummaryItem, SummaryEmailIndex } from '@/services/summary';

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

const URGENCY_STYLES: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50/50',
  medium: 'border-l-amber-500 bg-amber-50/30',
  low: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM ROW
// ═══════════════════════════════════════════════════════════════════════════════

const BannerItemRow = memo(function BannerItemRow({
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
    <li className={`pl-2 py-1 text-xs border-l-2 ${item.action_needed ? URGENCY_STYLES[item.urgency] || '' : 'border-l-transparent'}`}>
      <span className={item.action_needed ? 'font-medium' : 'text-muted-foreground'}>
        {item.text}
      </span>
      {item.action_needed && (
        <span className="ml-1 inline-block text-[9px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-1 py-0.5 rounded">
          Action
        </span>
      )}
      {emailHref && (
        <Link
          href={emailHref}
          className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-blue-600 hover:text-blue-700 hover:underline"
          title={emailRef?.subject || 'View email'}
        >
          <ExternalLink className="h-2 w-2" />
          View
        </Link>
      )}
    </li>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION BLOCK
// ═══════════════════════════════════════════════════════════════════════════════

const BannerSectionBlock = memo(function BannerSectionBlock({
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
    <div className="border rounded overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <IconComponent className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium flex-1">{section.theme}</span>
        <span className="text-[10px] text-muted-foreground">{section.items.length}</span>
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <ul className="px-2 pb-2 space-y-0.5">
          {section.items.map((item, i) => (
            <BannerItemRow key={i} item={item} emailIndex={emailIndex} />
          ))}
        </ul>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const InboxSummaryBanner = memo(function InboxSummaryBanner() {
  const {
    summary,
    isLoading,
    isGenerating,
    isStale,
    regenerate,
  } = useSummary({ autoGenerate: false, refreshInterval: 0 });

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't render anything if dismissed, loading, or no summary
  if (isDismissed) return null;

  if (isLoading) {
    return (
      <div className="mb-4 rounded-lg border bg-blue-50/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  if (isGenerating && !summary) {
    return (
      <div className="mb-4 rounded-lg border bg-blue-50/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          <span className="text-muted-foreground">Summarizing your latest emails...</span>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mb-4 rounded-lg border bg-blue-50/30 overflow-hidden">
      {/* Compact header — always visible */}
      <div className="flex items-start gap-2 px-4 py-3">
        <button
          type="button"
          className="flex items-start gap-2 flex-1 text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <FileText className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed line-clamp-2">{summary.headline}</p>
            {/* Inline stats */}
            <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Mail className="h-3 w-3" />
                {summary.stats.new_emails}
              </span>
              <span className="flex items-center gap-0.5">
                <Users className="h-3 w-3" />
                {summary.stats.threads_active} threads
              </span>
              {summary.stats.actions_pending > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600">
                  <CheckSquare className="h-3 w-3" />
                  {summary.stats.actions_pending} actions
                </span>
              )}
              {summary.stats.deadlines_upcoming > 0 && (
                <span className="flex items-center gap-0.5 text-red-600">
                  <Clock className="h-3 w-3" />
                  {summary.stats.deadlines_upcoming} deadlines
                </span>
              )}
              {isStale && (
                <span className="text-blue-600">New emails since</span>
              )}
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </button>

        {/* Dismiss / refresh */}
        <div className="flex items-center gap-1 shrink-0">
          {isGenerating && (
            <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); setIsDismissed(true); }}
            title="Dismiss summary"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Expanded: themed sections */}
      {isExpanded && summary.sections.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5 border-t pt-2">
          {summary.sections.map((section, i) => (
            <BannerSectionBlock
              key={section.theme}
              section={section}
              defaultOpen={i < 2}
              emailIndex={summary.email_index}
            />
          ))}

          {/* Footer with refresh + history link */}
          <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
            <span>
              {summary.emails_included} emails across {summary.threads_included} threads
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={regenerate}
                disabled={isGenerating}
              >
                <RefreshCw className={`h-2.5 w-2.5 mr-0.5 ${isGenerating ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link
                href="/summaries"
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                History
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default InboxSummaryBanner;
