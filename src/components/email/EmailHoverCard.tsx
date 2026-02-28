/**
 * EmailHoverCard Component
 *
 * Quick intelligence preview on hover over email subject/row.
 * Shows signal strength, gist, golden nuggets, deadlines, idea sparks,
 * and quick action buttons — all without clicking into the email.
 *
 * Desktop-only (uses window.matchMedia guard). On mobile, renders children directly.
 *
 * @module components/email/EmailHoverCard
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Badge,
  Skeleton,
} from '@/components/ui';
import {
  Gem,
  Calendar,
  Lightbulb,
  Link2,
  MessageSquare,
  Star,
  Archive,
  CheckCircle2,
  CircleHelp,
} from 'lucide-react';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import { getConfidenceStyle } from '@/lib/utils/confidence';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailHoverCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailHoverCardProps {
  /** The email to show intelligence for */
  email: Pick<Email, 'id' | 'subject' | 'sender_email' | 'signal_strength' | 'reply_worthiness' | 'category' | 'gist' | 'golden_nugget_count'>;
  /** Trigger element to wrap */
  children: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Signal strength display config */
const SIGNAL_COLORS: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
  noise: 'bg-gray-300',
};

const SIGNAL_LABELS: Record<string, string> = {
  high: 'High Signal',
  medium: 'Medium Signal',
  low: 'Low Signal',
  noise: 'Noise',
};

/**
 * Hook to check if the viewport is desktop (hover-capable).
 * Returns false on mobile/touch devices.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsDesktop(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EmailHoverCard — wraps a trigger element and shows an intelligence preview on hover.
 *
 * Only renders the hover card on desktop devices. On mobile, renders children directly.
 * Loads analysis data lazily on hover with a 300ms delay.
 */
export function EmailHoverCard({ email, children }: EmailHoverCardProps) {
  const isDesktop = useIsDesktop();
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldFetch, setShouldFetch] = React.useState(false);

  // Lazy-load analysis data — only fetch when hover card opens
  const { analysis, isLoading } = useEmailAnalysis(shouldFetch ? email.id : null);

  // Start fetching when hover card opens
  const handleOpenChange = React.useCallback((open: boolean) => {
    setIsOpen(open);
    if (open && !shouldFetch) {
      logger.debug('Hover card opened, fetching analysis', { emailId: email.id });
      setShouldFetch(true);
    }
  }, [email.id, shouldFetch]);

  // On mobile, just render children without hover card
  if (!isDesktop) {
    return <>{children}</>;
  }

  // Extract intelligence data from analysis
  const nuggetCount = analysis?.contentDigest?.goldenNuggets?.length ?? email.golden_nugget_count ?? 0;
  const ideaCount = analysis?.ideaSparks?.ideas?.length ?? 0;
  const linkCount = analysis?.contentDigest?.links?.length ?? 0;
  const gist = analysis?.contentDigest?.gist || (email.gist as string) || null;
  const signal = (email.signal_strength as string) || analysis?.categorization?.signalStrength || null;
  const replyWorth = (email.reply_worthiness as string) || analysis?.categorization?.replyWorthiness || null;
  const category = (email.category as string) || analysis?.categorization?.category || null;

  // Find the nearest deadline from actions
  const deadline = analysis?.actionExtraction?.actions
    ?.map((a) => a.deadline)
    .filter(Boolean)
    .sort()
    ?.[0] ?? analysis?.actionExtraction?.deadline ?? null;

  // Confidence style for gist
  const gistConfidence = getConfidenceStyle(analysis?.contentDigest?.confidence);
  const categoryConfidence = getConfidenceStyle(analysis?.categorization?.confidence);

  return (
    <HoverCard openDelay={300} closeDelay={100} open={isOpen} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="right" align="start">
        {isLoading && !analysis ? (
          <HoverCardSkeleton />
        ) : (
          <div className="space-y-2">
            {/* Row 1: Signal + Reply + Category */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {signal && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', SIGNAL_COLORS[signal] || 'bg-gray-400')} />
                  {SIGNAL_LABELS[signal] || signal}
                </Badge>
              )}
              {replyWorth === 'must_reply' && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  Must Reply
                </Badge>
              )}
              {replyWorth === 'should_reply' && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                  Should Reply
                </Badge>
              )}
              {category && (
                <span className="text-[10px] text-muted-foreground">
                  {categoryConfidence.showIndicator && categoryConfidence.level === 'uncertain' && (
                    <CircleHelp className="h-2.5 w-2.5 inline mr-0.5" />
                  )}
                  {categoryConfidence.showIndicator && categoryConfidence.level === 'verified' && (
                    <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5 text-green-500" />
                  )}
                  {category.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Row 2: Gist */}
            {gist && (
              <p className={cn('text-xs text-muted-foreground line-clamp-2', gistConfidence.className)}>
                {gistConfidence.prefix && (
                  <span className="font-medium">{gistConfidence.prefix}</span>
                )}
                &ldquo;{gist}&rdquo;
              </p>
            )}

            {/* Divider */}
            {(nuggetCount > 0 || deadline || ideaCount > 0 || linkCount > 0) && (
              <div className="border-t border-border/40" />
            )}

            {/* Row 3: Stats */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {nuggetCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Gem className="h-3 w-3 text-purple-500" />
                  {nuggetCount} nugget{nuggetCount !== 1 ? 's' : ''}
                </span>
              )}
              {deadline && (
                <span className="flex items-center gap-0.5">
                  <Calendar className="h-3 w-3 text-blue-500" />
                  {formatDeadline(deadline)}
                </span>
              )}
              {ideaCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Lightbulb className="h-3 w-3 text-amber-500" />
                  {ideaCount} idea{ideaCount !== 1 ? 's' : ''}
                </span>
              )}
              {linkCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Link2 className="h-3 w-3 text-blue-400" />
                  {linkCount} link{linkCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Row 4: Quick actions */}
            <div className="border-t border-border/40" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const composeUrl = `https://mail.google.com/mail/?compose=new&to=${encodeURIComponent(email.sender_email)}&su=${encodeURIComponent('Re: ' + (email.subject || ''))}`;
                  window.open(composeUrl, '_blank');
                  logger.debug('Quick reply from hover card', { emailId: email.id });
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Reply"
              >
                <MessageSquare className="h-3 w-3" />
                Reply
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  logger.debug('Quick star from hover card', { emailId: email.id });
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Star"
              >
                <Star className="h-3 w-3" />
                Save
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  logger.debug('Quick archive from hover card', { emailId: email.id });
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Archive"
              >
                <Archive className="h-3 w-3" />
                Archive
              </button>
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Compact skeleton while analysis is loading */
function HoverCardSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/**
 * Formats a deadline string into a compact display format.
 * @param deadline - ISO date or human-readable deadline string
 */
function formatDeadline(deadline: string): string {
  try {
    const date = new Date(deadline);
    if (isNaN(date.getTime())) return deadline;

    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return deadline;
  }
}

export default EmailHoverCard;
