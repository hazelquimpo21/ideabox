/**
 * Daily Briefing Header — simplified greeting with action summary.
 * Implements §4a from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a time-aware greeting, a single summary sentence
 * ("N things need you today." or "Your desk is clear."),
 * the date in smaller muted text, and an optional streak indicator.
 *
 * The old 3-stat badges (priorities, events, tasks) are removed —
 * they're now represented by the Trifecta cards.
 *
 * @module components/home/DailyBriefingHeader
 * @since February 2026 — Phase 2, updated March 2026 — Phase 1 Redesign
 * @updated March 2026 — Phase 4: streak indicator
 */

'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui';
import { Tooltip } from '@/components/ui/tooltip';
import { createLogger } from '@/lib/utils/logger';
import { calculateStreak } from '@/lib/utils/streak';

const logger = createLogger('DailyBriefingHeader');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyBriefingHeaderProps {
  /** User's first name (or email prefix as fallback) */
  userName: string | null;
  /** Total count of items needing attention today (must_reply + overdue tasks + today events) */
  actionCount: number;
  /** Whether data is still loading */
  isLoading: boolean;
  /** YYYY-MM-DD dates where user reviewed emails */
  reviewedDates?: string[];
  /** YYYY-MM-DD dates where user completed tasks */
  taskCompletedDates?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DailyBriefingHeader({
  userName,
  actionCount,
  isLoading,
  reviewedDates = [],
  taskCompletedDates = [],
}: DailyBriefingHeaderProps) {
  const greeting = getGreeting();

  // Streak computation cached via useMemo (Phase 4 perf requirement)
  const streak = useMemo(
    () => calculateStreak(reviewedDates, taskCompletedDates),
    [reviewedDates, taskCompletedDates],
  );

  if (streak.display) {
    logger.debug('Streak shown', { days: streak.currentStreak, emoji: streak.emoji });
  }

  return (
    <div className="mb-6">
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-5 w-48" />
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting}, {userName || 'there'}.{' '}
              <span className="text-muted-foreground font-normal">
                {actionCount > 0
                  ? `${actionCount} ${actionCount === 1 ? 'thing needs' : 'things need'} you today.`
                  : 'Your desk is clear.'}
              </span>
            </h1>

            {/* Streak indicator — only visible for 3+ day streaks */}
            {streak.display && (
              <Tooltip variant="info" content={`${streak.currentStreak} consecutive weekdays of activity`}>
                <span className="shrink-0 text-sm text-muted-foreground animate-fade-slide-up whitespace-nowrap">
                  <span className="inline-block animate-pulse-once">{streak.emoji}</span>{' '}
                  {streak.display}
                </span>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{getFormattedDate()}</p>
        </>
      )}
    </div>
  );
}

export default DailyBriefingHeader;
