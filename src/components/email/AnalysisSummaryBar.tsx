/**
 * AnalysisSummaryBar Component
 *
 * A compact horizontal bar showing key analysis indicators for an email.
 * Designed for contexts where the full EmailDetail isn't available
 * (e.g., EmailPreviewModal from calendar events).
 *
 * Shows: category badge, signal strength dot, quick action badge,
 * reply worthiness badge, and a "View full analysis" link.
 *
 * @module components/email/AnalysisSummaryBar
 * @since February 2026 — Phase 1: Surface analyzer data
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Eye,
  Calendar,
  Bookmark,
  CornerUpRight,
  Reply,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('AnalysisSummaryBar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Props for the AnalysisSummaryBar component */
export interface AnalysisSummaryBarProps {
  /** Email ID for the "View full analysis" link */
  emailId: string;
  /** AI-assigned category */
  category?: string | null;
  /** Signal strength rating */
  signalStrength?: string | null;
  /** Suggested quick action */
  quickAction?: string | null;
  /** Reply worthiness rating */
  replyWorthiness?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Signal strength dot color mapping */
const SIGNAL_DOT_COLORS: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
  noise: 'bg-slate-300',
};

/** Quick action icon mapping */
const ACTION_ICONS: Record<string, React.ElementType> = {
  respond: MessageSquare,
  review: Eye,
  calendar: Calendar,
  follow_up: CornerUpRight,
  save: Bookmark,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders a compact analysis summary bar with key email intelligence indicators.
 * Placed above email body content in preview contexts.
 */
export function AnalysisSummaryBar({
  emailId,
  category,
  signalStrength,
  quickAction,
  replyWorthiness,
}: AnalysisSummaryBarProps) {
  React.useEffect(() => {
    logger.debug('AnalysisSummaryBar mounted', {
      emailId,
      category,
      signalStrength,
      quickAction,
      replyWorthiness,
    });
  }, [emailId, category, signalStrength, quickAction, replyWorthiness]);

  // Don't render if there's no analysis data at all
  const hasData = category || signalStrength || quickAction || replyWorthiness;
  if (!hasData) return null;

  const signalDot = signalStrength ? SIGNAL_DOT_COLORS[signalStrength] : null;
  const ActionIcon = quickAction ? ACTION_ICONS[quickAction] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/50 text-xs">
      {/* Category badge */}
      {category && (
        <Badge variant="secondary" className="text-[10px]">
          {category.replace(/_/g, ' ')}
        </Badge>
      )}

      {/* Signal strength dot */}
      {signalDot && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <span className={cn('h-2 w-2 rounded-full', signalDot)} />
          <span className="capitalize">{signalStrength}</span>
        </span>
      )}

      {/* Quick action badge */}
      {ActionIcon && quickAction && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ActionIcon className="h-3 w-3" />
          <span className="capitalize">{quickAction.replace(/_/g, ' ')}</span>
        </span>
      )}

      {/* Reply worthiness badge */}
      {(replyWorthiness === 'must_reply' || replyWorthiness === 'should_reply') && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold',
            replyWorthiness === 'must_reply'
              ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
              : 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400',
          )}
        >
          <Reply className="h-2.5 w-2.5" />
          {replyWorthiness === 'must_reply' ? 'Must Reply' : 'Should Reply'}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* View full analysis link */}
      <Link
        href={`/inbox/${category || 'all'}/${emailId}`}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        View full analysis
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
