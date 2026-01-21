/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * 📅 useEvents Hook
 *
 * React hook for fetching and managing events extracted from emails.
 * This is a specialized wrapper around useExtractedDates that provides
 * event-specific functionality and data formatting.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BACKGROUND
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Since January 2026, events are no longer a primary email category. Instead,
 * they are detected via the `has_event` label and stored in two places:
 *
 * 1. `email_analyses.event_detection` (JSONB) - Rich event details from the
 *    EventDetector analyzer (title, time, location, RSVP info, locality, etc.)
 *
 * 2. `extracted_dates` table with `date_type = 'event'` - Timeline entries for
 *    chronological display and grouping.
 *
 * This hook uses the extracted_dates approach for the Events page, as it
 * provides built-in grouping, filtering, and timeline functionality.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Fetches only events (date_type = 'event')
 * - Groups events by time period (today, tomorrow, this week, etc.)
 * - Provides upcoming events summary for sidebar display
 * - Supports acknowledge, snooze, and hide actions
 * - Includes comprehensive logging for debugging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * // Basic usage - fetch all upcoming events
 * const { events, groupedEvents, isLoading, summary } = useEvents();
 *
 * // For sidebar preview - limit to 5 events
 * const { events, summary } = useEvents({ limit: 5 });
 *
 * // For events page with full functionality
 * const {
 *   events,
 *   groupedEvents,
 *   isLoading,
 *   error,
 *   refetch,
 *   acknowledge,
 *   snooze,
 *   hide,
 * } = useEvents();
 * ```
 *
 * @module hooks/useEvents
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useExtractedDates } from './useExtractedDates';
import type {
  ExtractedDate,
  GroupedDates,
  DateStats,
  UseExtractedDatesOptions,
} from './useExtractedDates';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useEvents');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event data type - alias for ExtractedDate with event-specific context.
 * Events are stored in extracted_dates with date_type = 'event'.
 */
export type EventData = ExtractedDate;

/**
 * Grouped events structure - mirrors GroupedDates but with event context.
 */
export type GroupedEvents = GroupedDates;

/**
 * Event statistics for the events page.
 */
export interface EventStats {
  /** Total number of events */
  total: number;
  /** Number of past/missed events */
  past: number;
  /** Number of upcoming events */
  upcoming: number;
  /** Number of events happening today */
  today: number;
  /** Number of events this week */
  thisWeek: number;
}

/**
 * Summary data for sidebar preview.
 * Provides a quick glance at upcoming events without full data.
 */
export interface EventsSummary {
  /** Total count of upcoming events */
  count: number;
  /** Days until the next event (0 = today) */
  daysUntilNext: number | null;
  /** Title of the next event */
  nextEventTitle: string | null;
  /** Date of next event (YYYY-MM-DD) */
  nextEventDate: string | null;
  /** Whether there's an event today */
  hasEventToday: boolean;
  /** Whether there's an event tomorrow */
  hasEventTomorrow: boolean;
}

/**
 * Options for the useEvents hook.
 */
export interface UseEventsOptions {
  /** Maximum number of events to fetch (default: 100) */
  limit?: number;
  /** Whether to include past events (default: false) */
  includePast?: boolean;
  /** Date to start from (default: today if includePast is false) */
  fromDate?: string;
}

/**
 * Return type from the useEvents hook.
 */
export interface UseEventsReturn {
  /** Array of event objects */
  events: EventData[];
  /** Events grouped by time period */
  groupedEvents: GroupedEvents;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch events */
  refetch: () => Promise<void>;
  /** Load more events (pagination) */
  loadMore: () => Promise<void>;
  /** Whether more events are available */
  hasMore: boolean;
  /** Event statistics */
  stats: EventStats;
  /** Summary for sidebar preview */
  summary: EventsSummary;
  /** Mark an event as acknowledged/done */
  acknowledge: (eventId: string) => Promise<void>;
  /** Snooze an event until a specific date */
  snooze: (eventId: string, until: string) => Promise<void>;
  /** Hide an event from display */
  hide: (eventId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets today's date in YYYY-MM-DD format.
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets tomorrow's date in YYYY-MM-DD format.
 */
function getTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

/**
 * Calculates the number of days from today to a given date.
 *
 * @param dateStr - Target date in YYYY-MM-DD format
 * @returns Number of days (0 = today, negative = past)
 */
function calculateDaysFromNow(dateStr: string): number {
  const targetDate = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Converts DateStats to EventStats with event-specific naming.
 *
 * @param dateStats - Stats from useExtractedDates
 * @param groupedDates - Grouped dates for additional stats
 * @returns Event-specific statistics
 */
function convertToEventStats(
  dateStats: DateStats,
  groupedDates: GroupedDates
): EventStats {
  return {
    total: dateStats.total,
    past: dateStats.overdue,
    upcoming: dateStats.pending,
    today: groupedDates.today.length,
    thisWeek:
      groupedDates.today.length +
      groupedDates.tomorrow.length +
      groupedDates.thisWeek.length,
  };
}

/**
 * Generates a summary from events for sidebar display.
 *
 * @param events - Array of events
 * @param groupedEvents - Grouped events
 * @returns Summary object for sidebar
 */
function generateSummary(
  events: EventData[],
  groupedEvents: GroupedEvents
): EventsSummary {
  const today = getToday();
  const tomorrow = getTomorrow();

  // Find the first upcoming event (not in the past)
  const upcomingEvents = events.filter((e) => e.date >= today);
  const nextEvent = upcomingEvents[0];

  const summary: EventsSummary = {
    count: upcomingEvents.length,
    daysUntilNext: nextEvent ? calculateDaysFromNow(nextEvent.date) : null,
    nextEventTitle: nextEvent?.title || null,
    nextEventDate: nextEvent?.date || null,
    hasEventToday: groupedEvents.today.length > 0,
    hasEventTomorrow: groupedEvents.tomorrow.length > 0,
  };

  logger.debug('Generated events summary', {
    count: summary.count,
    daysUntilNext: summary.daysUntilNext,
    hasEventToday: summary.hasEventToday,
  });

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing events from the extracted_dates table.
 *
 * This hook wraps useExtractedDates with event-specific filtering and
 * provides a convenient API for the Events page and sidebar preview.
 *
 * @param options - Configuration options
 * @returns Events data, loading state, and control functions
 *
 * @example
 * ```tsx
 * function EventsPage() {
 *   const {
 *     events,
 *     groupedEvents,
 *     isLoading,
 *     stats,
 *     acknowledge,
 *   } = useEvents();
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *
 *   return (
 *     <div>
 *       <h1>Events ({stats.total})</h1>
 *       {groupedEvents.today.length > 0 && (
 *         <EventGroup title="Today" events={groupedEvents.today} />
 *       )}
 *       // ... more groups
 *     </div>
 *   );
 * }
 * ```
 */
export function useEvents(options: UseEventsOptions = {}): UseEventsReturn {
  const { limit = 100, includePast = false, fromDate } = options;

  logger.debug('useEvents hook initialized', {
    limit,
    includePast,
    fromDate,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Build options for useExtractedDates
  // ─────────────────────────────────────────────────────────────────────────────

  const extractedDatesOptions: UseExtractedDatesOptions = React.useMemo(() => {
    const opts: UseExtractedDatesOptions = {
      type: 'event', // Only fetch events
      limit,
    };

    // Filter to only future events unless includePast is true
    if (!includePast) {
      opts.from = fromDate || getToday();
    }

    logger.debug('Built extractedDates options', opts);

    return opts;
  }, [limit, includePast, fromDate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch events using useExtractedDates
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    dates,
    groupedDates,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats: dateStats,
    acknowledge,
    snooze,
    hide,
  } = useExtractedDates(extractedDatesOptions);

  // ─────────────────────────────────────────────────────────────────────────────
  // Compute event-specific stats and summary
  // ─────────────────────────────────────────────────────────────────────────────

  const stats = React.useMemo(
    () => convertToEventStats(dateStats, groupedDates),
    [dateStats, groupedDates]
  );

  const summary = React.useMemo(
    () => generateSummary(dates, groupedDates),
    [dates, groupedDates]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Log state changes for debugging
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading && !error) {
      logger.success('Events loaded', {
        total: dates.length,
        today: groupedDates.today.length,
        upcoming: stats.upcoming,
      });
    }
  }, [isLoading, error, dates.length, groupedDates.today.length, stats.upcoming]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    events: dates,
    groupedEvents: groupedDates,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    summary,
    acknowledge,
    snooze,
    hide,
  };
}

export default useEvents;
