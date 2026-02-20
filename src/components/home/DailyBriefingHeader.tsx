/**
 * Daily Briefing Header Component
 *
 * Displays a personalized greeting and summary statistics at the top of
 * the Home page. Shows the user's name with a time-of-day greeting,
 * plus counts for priorities, today's events, and pending tasks.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - User name: Passed via props (sourced from useAuth() in parent)
 * - Priority count: Passed via props (sourced from useHubPriorities)
 * - Event count: Passed via props (sourced from useExtractedDates + useEvents)
 * - Task count: Passed via props (sourced from useActions)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <DailyBriefingHeader
 *   userName="Jane"
 *   priorityCount={3}
 *   eventCount={2}
 *   taskCount={5}
 *   isLoading={false}
 * />
 * ```
 *
 * @module components/home/DailyBriefingHeader
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import { Sparkles, Target, Calendar, CheckSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DailyBriefingHeader');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyBriefingHeaderProps {
  /** User's first name (or email prefix as fallback) */
  userName: string | null;
  /** Number of AI-scored priority items */
  priorityCount: number;
  /** Number of events/dates scheduled for today */
  eventCount: number;
  /** Number of pending tasks */
  taskCount: number;
  /** Whether data is still loading */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a greeting based on the current time of day.
 * @returns "Good morning", "Good afternoon", or "Good evening"
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Daily Briefing Header — personalized greeting with summary stats.
 *
 * Renders a time-aware greeting with the user's name and a one-line
 * summary of priorities, events, and pending tasks for the day.
 */
export function DailyBriefingHeader({
  userName,
  priorityCount,
  eventCount,
  taskCount,
  isLoading,
}: DailyBriefingHeaderProps) {
  const greeting = getGreeting();

  logger.debug('Rendering DailyBriefingHeader', {
    userName,
    priorityCount,
    eventCount,
    taskCount,
    isLoading,
  });

  return (
    <div className="mb-8">
      {/* ─── Greeting ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-amber-500" />
        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {userName || 'there'}
          </h1>
        )}
      </div>

      {/* ─── Summary Line ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-5 w-80 mt-1" />
      ) : (
        <p className="text-muted-foreground flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-4 w-4 text-red-500" />
            {priorityCount} {priorityCount === 1 ? 'priority' : 'priorities'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-green-500" />
            {eventCount} {eventCount === 1 ? 'event' : 'events'} today
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckSquare className="h-4 w-4 text-purple-500" />
            {taskCount} pending {taskCount === 1 ? 'task' : 'tasks'}
          </span>
        </p>
      )}
    </div>
  );
}

export default DailyBriefingHeader;
