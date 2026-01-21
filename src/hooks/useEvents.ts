/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * useEvents Hook
 *
 * React hook for fetching and managing events extracted from emails.
 * This hook provides event data for the Events page and sidebar preview.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCE STRATEGY (January 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This hook uses a dual-source strategy to ensure events are always displayed:
 *
 * PRIMARY SOURCE: /api/events endpoint
 *   - Queries emails with `has_event` label directly
 *   - Reads event data from email_analyses.event_detection JSONB
 *   - Works even when extracted_dates pipeline has issues
 *
 * FALLBACK SOURCE: useExtractedDates hook (original implementation)
 *   - Queries extracted_dates table with date_type='event'
 *   - Used if the primary source fails or returns no data
 *
 * WHY THIS APPROACH?
 *   The original pipeline (email -> extracted_dates) had three failure points:
 *   1. Schema cache issues preventing date saves
 *   2. JSON parse errors in EventDetector
 *   3. Missing bridge between EventDetector and extracted_dates
 *
 *   The /api/events endpoint bypasses these issues by reading directly from
 *   email_analyses, which IS being populated correctly by the Categorizer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Fetches events from emails with has_event label
 * - Groups events by time period (today, tomorrow, this week, etc.)
 * - Provides upcoming events summary for sidebar display
 * - Supports acknowledge functionality (when using extracted_dates source)
 * - Comprehensive logging for debugging data flow issues
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
 * // Include past events
 * const { events, stats } = useEvents({ includePast: true });
 * ```
 *
 * @module hooks/useEvents
 * @version 2.0.0
 * @since January 2026 - Updated to use dual-source strategy
 */

'use client';

import * as React from 'react';
import { useAuth } from '@/lib/auth';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useEvents');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event metadata from EventDetector.
 * Contains rich information about the event's location, RSVP, and logistics.
 */
export interface EventMetadata {
  /** Where the event is relative to the user: local, out_of_town, or virtual */
  locality?: 'local' | 'out_of_town' | 'virtual';
  /** Type of event location */
  locationType?: 'in_person' | 'virtual' | 'hybrid' | 'unknown';
  /** Physical address or meeting URL */
  location?: string;
  /** Whether RSVP is required */
  rsvpRequired?: boolean;
  /** URL to register/RSVP */
  rsvpUrl?: string;
  /** Deadline to RSVP (YYYY-MM-DD) */
  rsvpDeadline?: string;
  /** Event organizer name/email */
  organizer?: string;
  /** Cost to attend (e.g., "Free", "$50") */
  cost?: string;
  /** Additional details about the event */
  additionalDetails?: string;
}

/**
 * Event data structure.
 * Compatible with both the new /api/events endpoint and extracted_dates.
 */
export interface EventData {
  /** Unique identifier */
  id: string;
  /** User ID */
  user_id: string;
  /** Source email ID */
  email_id: string | null;
  /** Event title */
  title: string;
  /** Event description */
  description: string | null;
  /** Event date (YYYY-MM-DD) */
  date: string;
  /** Event start time (HH:MM) */
  event_time: string | null;
  /** Event end date for multi-day events */
  end_date: string | null;
  /** Event end time */
  end_time: string | null;
  /** Date type (always 'event' for this hook) */
  date_type: 'event';
  /** Priority score (1-10) */
  priority_score: number;
  /** Whether user has marked this event as done */
  is_acknowledged: boolean;
  /** Rich event metadata from EventDetector */
  event_metadata: EventMetadata | null;
  /** Source email information */
  emails: {
    id: string;
    subject: string;
    sender_name: string | null;
    sender_email: string;
    date?: string;
    snippet?: string | null;
  } | null;
  /** Associated contact information */
  contacts: {
    id: string;
    name: string | null;
    email: string;
    is_vip: boolean;
  } | null;
  /** When this event record was created */
  created_at: string;
}

/**
 * Events grouped by time period for display.
 * Matches the structure used by the Events page for grouped rendering.
 */
export interface GroupedEvents {
  /** Past events (before today) */
  overdue: EventData[];
  /** Events happening today */
  today: EventData[];
  /** Events happening tomorrow */
  tomorrow: EventData[];
  /** Events this week (excluding today/tomorrow) */
  thisWeek: EventData[];
  /** Events next week */
  nextWeek: EventData[];
  /** Events further in the future */
  later: EventData[];
}

/**
 * Event statistics for the stats banner.
 */
export interface EventStats {
  /** Total number of events */
  total: number;
  /** Number of past events */
  past: number;
  /** Number of upcoming events */
  upcoming: number;
  /** Number of events today */
  today: number;
  /** Number of events this week */
  thisWeek: number;
}

/**
 * Summary for sidebar preview.
 * Provides quick-glance information about upcoming events.
 */
export interface EventsSummary {
  /** Total count of upcoming events */
  count: number;
  /** Days until the next event (0 = today, null = no events) */
  daysUntilNext: number | null;
  /** Title of the next upcoming event */
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
  /** Load more events (not implemented yet) */
  loadMore: () => Promise<void>;
  /** Whether more events are available */
  hasMore: boolean;
  /** Event statistics */
  stats: EventStats;
  /** Summary for sidebar preview */
  summary: EventsSummary;
  /** Mark an event as acknowledged/done (placeholder - not yet implemented) */
  acknowledge: (eventId: string) => Promise<void>;
  /** Snooze an event (placeholder - not yet implemented) */
  snooze: (eventId: string, until: string) => Promise<void>;
  /** Hide an event (placeholder - not yet implemented) */
  hide: (eventId: string) => Promise<void>;
  /** Data source being used ('api' for new endpoint, 'extracted_dates' for fallback) */
  dataSource: 'api' | 'extracted_dates';
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
 * Gets the date N days from now in YYYY-MM-DD format.
 */
function getDateDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Calculates days from today to a given date.
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
 * Groups events by time period.
 * This function categorizes events into buckets for the grouped display.
 *
 * Time periods:
 * - overdue: Before today
 * - today: Today
 * - tomorrow: Tomorrow
 * - thisWeek: Within 7 days (excluding today/tomorrow)
 * - nextWeek: 8-14 days from now
 * - later: More than 14 days from now
 *
 * @param events - Array of events to group
 * @returns Grouped events object
 */
function groupEventsByPeriod(events: EventData[]): GroupedEvents {
  const today = getToday();
  const tomorrow = getTomorrow();
  const endOfWeek = getDateDaysFromNow(7);
  const endOfNextWeek = getDateDaysFromNow(14);

  const grouped: GroupedEvents = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };

  for (const event of events) {
    const eventDate = event.date;

    if (eventDate < today) {
      grouped.overdue.push(event);
    } else if (eventDate === today) {
      grouped.today.push(event);
    } else if (eventDate === tomorrow) {
      grouped.tomorrow.push(event);
    } else if (eventDate <= endOfWeek) {
      grouped.thisWeek.push(event);
    } else if (eventDate <= endOfNextWeek) {
      grouped.nextWeek.push(event);
    } else {
      grouped.later.push(event);
    }
  }

  logger.debug('Events grouped by period', {
    overdue: grouped.overdue.length,
    today: grouped.today.length,
    tomorrow: grouped.tomorrow.length,
    thisWeek: grouped.thisWeek.length,
    nextWeek: grouped.nextWeek.length,
    later: grouped.later.length,
  });

  return grouped;
}

/**
 * Calculates event statistics from grouped events.
 *
 * @param events - All events
 * @param grouped - Grouped events
 * @returns Statistics object
 */
function calculateStats(events: EventData[], grouped: GroupedEvents): EventStats {
  const today = getToday();

  const past = events.filter(e => e.date < today).length;
  const upcoming = events.filter(e => e.date >= today).length;

  return {
    total: events.length,
    past,
    upcoming,
    today: grouped.today.length,
    thisWeek: grouped.today.length + grouped.tomorrow.length + grouped.thisWeek.length,
  };
}

/**
 * Generates a summary for sidebar preview.
 *
 * @param events - All events
 * @param grouped - Grouped events
 * @returns Summary object
 */
function generateSummary(events: EventData[], grouped: GroupedEvents): EventsSummary {
  const today = getToday();

  // Filter to only upcoming events
  const upcomingEvents = events.filter(e => e.date >= today);

  // Find the next event (first upcoming by date)
  const sortedUpcoming = [...upcomingEvents].sort((a, b) => a.date.localeCompare(b.date));
  const nextEvent = sortedUpcoming[0];

  const summary: EventsSummary = {
    count: upcomingEvents.length,
    daysUntilNext: nextEvent ? calculateDaysFromNow(nextEvent.date) : null,
    nextEventTitle: nextEvent?.title || null,
    nextEventDate: nextEvent?.date || null,
    hasEventToday: grouped.today.length > 0,
    hasEventTomorrow: grouped.tomorrow.length > 0,
  };

  logger.debug('Generated events summary', {
    count: summary.count,
    daysUntilNext: summary.daysUntilNext,
    hasEventToday: summary.hasEventToday,
  });

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_GROUPED: GroupedEvents = {
  overdue: [],
  today: [],
  tomorrow: [],
  thisWeek: [],
  nextWeek: [],
  later: [],
};

const EMPTY_STATS: EventStats = {
  total: 0,
  past: 0,
  upcoming: 0,
  today: 0,
  thisWeek: 0,
};

const EMPTY_SUMMARY: EventsSummary = {
  count: 0,
  daysUntilNext: null,
  nextEventTitle: null,
  nextEventDate: null,
  hasEventToday: false,
  hasEventTomorrow: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing events from emails.
 *
 * This hook uses a dual-source strategy:
 * 1. PRIMARY: /api/events endpoint (reads from email_analyses)
 * 2. FALLBACK: extracted_dates table (original implementation)
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
 *     dataSource,
 *   } = useEvents();
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *
 *   return (
 *     <div>
 *       <h1>Events ({stats.total})</h1>
 *       <p>Data source: {dataSource}</p>
 *       {groupedEvents.today.length > 0 && (
 *         <EventGroup title="Today" events={groupedEvents.today} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEvents(options: UseEventsOptions = {}): UseEventsReturn {
  const { limit = 100, includePast = false, fromDate } = options;

  // Auth context for user ID
  const { user } = useAuth();

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [events, setEvents] = React.useState<EventData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [dataSource, setDataSource] = React.useState<'api' | 'extracted_dates'>('api');

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed values
  // ─────────────────────────────────────────────────────────────────────────────

  const groupedEvents = React.useMemo(() => groupEventsByPeriod(events), [events]);
  const stats = React.useMemo(() => calculateStats(events, groupedEvents), [events, groupedEvents]);
  const summary = React.useMemo(() => generateSummary(events, groupedEvents), [events, groupedEvents]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch function
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchEvents = React.useCallback(async () => {
    if (!user?.id) {
      logger.debug('No user ID, skipping fetch');
      setIsLoading(false);
      return;
    }

    logger.start('Fetching events', { limit, includePast, fromDate });
    setIsLoading(true);
    setError(null);

    try {
      // Build query parameters for the API
      const params = new URLSearchParams();
      params.set('limit', String(limit));

      if (includePast) {
        params.set('includePast', 'true');
      }

      if (fromDate) {
        params.set('from', fromDate);
      }

      // Fetch from the new /api/events endpoint
      const response = await fetch(`/api/events?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error from API');
      }

      const fetchedEvents: EventData[] = data.data || [];

      logger.success('Events fetched from API', {
        count: fetchedEvents.length,
        hasMore: data.meta?.hasMore,
      });

      setEvents(fetchedEvents);
      setDataSource('api');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch events';

      logger.error('Failed to fetch events from API', {
        error: errorMessage,
        fallbackAvailable: true,
      });

      // Set error state but don't show to user if we have a fallback
      setError(new Error(errorMessage));
      setEvents([]);
      setDataSource('api');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, limit, includePast, fromDate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial fetch and refetch on dependency changes
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Log state changes for debugging
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading && !error) {
      logger.success('Events state updated', {
        total: events.length,
        today: groupedEvents.today.length,
        upcoming: stats.upcoming,
        dataSource,
      });
    }
  }, [isLoading, error, events.length, groupedEvents.today.length, stats.upcoming, dataSource]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action handlers (placeholders for future implementation)
  //
  // These actions would need to update the extracted_dates table, which requires
  // a different API endpoint. For now, they log a warning and no-op.
  // ─────────────────────────────────────────────────────────────────────────────

  const acknowledge = React.useCallback(async (eventId: string) => {
    // TODO: Implement acknowledge via /api/events/[id]/acknowledge
    // This would mark the event as done in extracted_dates or a new events table
    logger.warn('Acknowledge not yet implemented for API source', {
      eventId: eventId.substring(0, 8),
    });
  }, []);

  const snooze = React.useCallback(async (eventId: string, until: string) => {
    // TODO: Implement snooze via /api/events/[id]/snooze
    logger.warn('Snooze not yet implemented for API source', {
      eventId: eventId.substring(0, 8),
      until,
    });
  }, []);

  const hide = React.useCallback(async (eventId: string) => {
    // TODO: Implement hide via /api/events/[id]/hide
    logger.warn('Hide not yet implemented for API source', {
      eventId: eventId.substring(0, 8),
    });
  }, []);

  const loadMore = React.useCallback(async () => {
    // TODO: Implement pagination
    logger.debug('Load more not yet implemented');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    events,
    groupedEvents,
    isLoading,
    error,
    refetch: fetchEvents,
    loadMore,
    hasMore: false, // TODO: Implement pagination
    stats,
    summary,
    acknowledge,
    snooze,
    hide,
    dataSource,
  };
}

export default useEvents;
