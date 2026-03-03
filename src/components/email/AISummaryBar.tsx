/**
 * AISummaryBar Component
 *
 * A compact horizontal bar showing the most useful analysis at a glance:
 * category, signal strength, reply worthiness, quick action, and gist.
 * Rendered between EmailSubject and EmailBody in the detail modal.
 *
 * Returns null for unanalyzed emails. Shows a shaped skeleton while loading.
 *
 * @module components/email/AISummaryBar
 * @since March 2026 — Phase 1: Email Detail Redesign
 */

'use client';

import * as React from 'react';
import {
  MessageSquare,
  Eye,
  Calendar,
  Bookmark,
  CornerUpRight,
  Reply,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AISummaryBar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AISummaryBarProps {
  email: Email;
  analysis: NormalizedAnalysis | null;
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_DOT_COLORS: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
  noise: 'bg-slate-300',
};

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

export function AISummaryBar({ email, analysis, isLoading }: AISummaryBarProps) {
  React.useEffect(() => {
    if (analysis) {
      logger.debug('AISummaryBar rendered', {
        emailId: email.id,
        category: analysis.categorization?.category,
        hasGist: !!analysis.contentDigest?.gist,
      });
    }
  }, [email.id, analysis]);

  // Don't render anything for unanalyzed emails — the "Analyze Now" card
  // in AnalysisSummary handles the CTA for unanalyzed emails.
  if (!email.analyzed_at) return null;

  // Shaped skeleton while analysis hook is still loading
  if (isLoading && !analysis) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg h-14 animate-pulse">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 flex-1 max-w-xs" />
      </div>
    );
  }

  // No analysis data yet (shouldn't happen for analyzed emails, but guard)
  if (!analysis) return null;

  const category = analysis.categorization?.category;
  const signalStrength = analysis.categorization?.signalStrength;
  const quickAction = analysis.categorization?.quickAction;
  const replyWorthiness = analysis.categorization?.replyWorthiness;
  const gist = analysis.contentDigest?.gist;

  const signalDotColor = signalStrength ? SIGNAL_DOT_COLORS[signalStrength] : null;
  const ActionIcon = quickAction ? ACTION_ICONS[quickAction] : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg min-h-[3.5rem]">
      {/* Category badge */}
      {category && (
        <Badge variant="outline" className="shrink-0 text-xs">
          {category.replace(/_/g, ' ')}
        </Badge>
      )}

      {/* Signal strength dot */}
      {signalStrength && signalDotColor && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <span className={cn('h-2 w-2 rounded-full', signalDotColor)} />
          {signalStrength}
        </span>
      )}

      {/* Reply worthiness — only must_reply and should_reply */}
      {(replyWorthiness === 'must_reply' || replyWorthiness === 'should_reply') && (
        <span className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0',
          replyWorthiness === 'must_reply'
            ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
        )}>
          <Reply className="h-2.5 w-2.5" />
          {replyWorthiness === 'must_reply' ? 'Must Reply' : 'Should Reply'}
        </span>
      )}

      {/* Quick action */}
      {quickAction && ActionIcon && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <ActionIcon className="h-3 w-3" />
          {quickAction.replace(/_/g, ' ')}
        </span>
      )}

      {/* Gist — the crown jewel */}
      {gist && (
        <p className="text-sm text-muted-foreground line-clamp-1 min-w-0">
          {gist}
        </p>
      )}
    </div>
  );
}
