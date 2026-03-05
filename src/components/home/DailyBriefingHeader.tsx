/**
 * Daily Briefing Header — simplified greeting with action summary.
 * Implements §4a from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a time-aware greeting, a single summary sentence
 * ("N things need you today." or "Your desk is clear."),
 * and the date in smaller muted text.
 *
 * The old 3-stat badges (priorities, events, tasks) are removed —
 * they're now represented by the Trifecta cards.
 *
 * @module components/home/DailyBriefingHeader
 * @since February 2026 — Phase 2, updated March 2026 — Phase 1 Redesign
 */

'use client';

import { Skeleton } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';

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
}: DailyBriefingHeaderProps) {
  const greeting = getGreeting();

  logger.debug('Rendering DailyBriefingHeader', { userName, actionCount, isLoading });

  return (
    <div className="mb-6">
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-5 w-48" />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {userName || 'there'}.{' '}
            <span className="text-muted-foreground font-normal">
              {actionCount > 0
                ? `${actionCount} ${actionCount === 1 ? 'thing needs' : 'things need'} you today.`
                : 'Your desk is clear.'}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{getFormattedDate()}</p>
        </>
      )}
    </div>
  );
}

export default DailyBriefingHeader;
