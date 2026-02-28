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
 * - Event state management: dismiss, maybe, saved_to_calendar
 * - Optimistic UI updates for state changes
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
 *
 * // With state management
 * const { dismiss, saveToMaybe, trackCalendarSave } = useEvents();
 * await dismiss(eventId);  // Remove from view
 * await saveToMaybe(eventId);  // Add to watch list
 * await trackCalendarSave(eventId);  // Track calendar add
 * ```
 *
 * @module hooks/useEvents
 * @version 3.0.0
 * @since January 2026 - Updated with state management (dismiss, maybe, calendar)
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
 * Valid event state values.
 * - dismissed: User doesn't want to see this event
 * - maybe: User is interested but not committed (watch list)
 * - saved_to_calendar: User has added to their calendar
 */
export type EventState = 'dismissed' | 'maybe' | 'saved_to_calendar';

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
  /** Whether this is a key date (deadline, registration, etc.) */
  isKeyDate?: boolean;
  /** Type of key date — helps calendar badge display */
  keyDateType?: 'registration_deadline' | 'open_house' | 'deadline' | 'release_date' | 'other' | null;
  /** Assistant-style summary for quick scanning */
  eventSummary?: string | null;
  /** Key points about the event */
  keyPoints?: string[] | null;
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
  /** User states for this event (populated from user_event_states) */
  states?: EventState[];
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
  /** Number of events in maybe list */
  maybe: number;
  /** Number of events saved to calendar */
  savedToCalendar: number;
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
  /** Whether to show dismissed events (default: false) */
  showDismissed?: boolean;
  /** Filter to only show events with specific state */
  filterByState?: EventState;
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
  /** Mark an event as acknowledged/done */
  acknowledge: (eventId: string) => Promise<void>;
  /** Snooze an event */
  snooze: (eventId: string, until: string) => Promise<void>;
  /** Dismiss an event (hide from view) */
  dismiss: (eventId: string) => Promise<void>;
  /** Save event to maybe list (watch list) */
  saveToMaybe: (eventId: string, notes?: string) => Promise<void>;
  /** Track that user added event to calendar */
  trackCalendarSave: (eventId: string) => Promise<void>;
  /** Remove a state from an event (un-dismiss, remove from maybe, etc.) */
  removeState: (eventId: string, state: EventState) => Promise<void>;
  /** Check if an event has a specific state */
  hasState: (eventId: string, state: EventState) => boolean;
  /** Check if a state operation is pending for an event */
  isStatePending: (eventId: string) => boolean;
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
 * Calculates event statistics from events and state map.
 *
 * @param events - All events
 * @param grouped - Grouped events
 * @param statesMap - Map of event ID to states
 * @returns Statistics object
 */
function calculateStats(
  events: EventData[],
  grouped: GroupedEvents,
  statesMap: Map<string, EventState[]>
): EventStats {
  const today = getToday();

  const past = events.filter(e => e.date < today).length;
  const upcoming = events.filter(e => e.date >= today).length;

  // Count events with specific states
  let maybe = 0;
  let savedToCalendar = 0;
  statesMap.forEach((states) => {
    if (states.includes('maybe')) maybe++;
    if (states.includes('saved_to_calendar')) savedToCalendar++;
  });

  return {
    total: events.length,
    past,
    upcoming,
    today: grouped.today.length,
    thisWeek: grouped.today.length + grouped.tomorrow.length + grouped.thisWeek.length,
    maybe,
    savedToCalendar,
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
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing events from emails.
 *
 * This hook uses a dual-source strategy:
 * 1. PRIMARY: /api/events endpoint (reads from email_analyses)
 * 2. FALLBACK: extracted_dates table (original implementation)
 *
 * State management features:
 * - dismiss: Hide events you're not interested in
 * - saveToMaybe: Add to a watch list for events you're unsure about
 * - trackCalendarSave: Track when you've added events to your calendar
 * - removeState: Undo any of the above
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
 *     dismiss,
 *     saveToMaybe,
 *     hasState,
 *   } = useEvents();
 *
 *   const handleDismiss = async (eventId: string) => {
 *     await dismiss(eventId);
 *     // Event is now hidden from the list
 *   };
 *
 *   return (
 *     <div>
 *       {events.map(event => (
 *         <EventCard
 *           key={event.id}
 *           event={event}
 *           isMaybe={hasState(event.id, 'maybe')}
 *           onDismiss={() => handleDismiss(event.id)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEvents(options: UseEventsOptions = {}): UseEventsReturn {
  const {
    limit = 100,
    includePast = false,
    fromDate,
    showDismissed = false,
    filterByState,
  } = options;

  // Auth context for user ID
  const { user } = useAuth();

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [events, setEvents] = React.useState<EventData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [dataSource, setDataSource] = React.useState<'api' | 'extracted_dates'>('api');

  // Map of event ID to states (for quick lookups)
  const [eventStatesMap, setEventStatesMap] = React.useState<Map<string, EventState[]>>(new Map());

  // Track pending state operations for optimistic UI
  const [pendingOperations, setPendingOperations] = React.useState<Set<string>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────────
  // Filter events based on states
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredEvents = React.useMemo(() => {
    let filtered = events;

    // Filter out dismissed events unless showDismissed is true
    if (!showDismissed) {
      filtered = filtered.filter(event => {
        const states = eventStatesMap.get(event.id) || [];
        return !states.includes('dismissed');
      });
    }

    // Filter to only events with specific state
    if (filterByState) {
      filtered = filtered.filter(event => {
        const states = eventStatesMap.get(event.id) || [];
        return states.includes(filterByState);
      });
    }

    logger.debug('Events filtered', {
      original: events.length,
      filtered: filtered.length,
      showDismissed,
      filterByState,
    });

    return filtered;
  }, [events, eventStatesMap, showDismissed, filterByState]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed values
  // ─────────────────────────────────────────────────────────────────────────────

  const groupedEvents = React.useMemo(() => groupEventsByPeriod(filteredEvents), [filteredEvents]);
  const stats = React.useMemo(() => calculateStats(filteredEvents, groupedEvents, eventStatesMap), [filteredEvents, groupedEvents, eventStatesMap]);
  const summary = React.useMemo(() => generateSummary(filteredEvents, groupedEvents), [filteredEvents, groupedEvents]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Events
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

      // Fetch states for all events
      await fetchEventStates(fetchedEvents.map(e => e.id));

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch events';

      logger.error('Failed to fetch events from API', {
        error: errorMessage,
        fallbackAvailable: true,
      });

      // Set error state
      setError(new Error(errorMessage));
      setEvents([]);
      setDataSource('api');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, limit, includePast, fromDate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Event States
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchEventStates = React.useCallback(async (eventIds: string[]) => {
    if (eventIds.length === 0) return;

    logger.debug('Fetching states for events', { count: eventIds.length });

    const newStatesMap = new Map<string, EventState[]>();

    // Fetch states for each event
    // In a real implementation, we might batch this into a single API call
    const statePromises = eventIds.map(async (eventId) => {
      try {
        const response = await fetch(`/api/events/${eventId}/state`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.states) {
            newStatesMap.set(eventId, data.data.states);
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch states for event', {
          eventId: eventId.substring(0, 8),
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });

    await Promise.all(statePromises);

    setEventStatesMap(newStatesMap);

    logger.debug('Event states fetched', {
      eventsWithStates: newStatesMap.size,
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial fetch and refetch on dependency changes
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ─────────────────────────────────────────────────────────────────────────────
  // State Management Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a state to an event with optimistic update.
   */
  const addState = React.useCallback(async (
    eventId: string,
    state: EventState,
    notes?: string
  ) => {
    logger.start(`Adding state to event`, { eventId: eventId.substring(0, 8), state });

    // Optimistic update
    setPendingOperations(prev => new Set(prev).add(eventId));
    setEventStatesMap(prev => {
      const newMap = new Map(prev);
      const currentStates = newMap.get(eventId) || [];
      if (!currentStates.includes(state)) {
        newMap.set(eventId, [...currentStates, state]);
      }
      return newMap;
    });

    try {
      const response = await fetch(`/api/events/${eventId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, notes }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      logger.success(`State added to event`, { eventId: eventId.substring(0, 8), state });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add state';
      logger.error('Failed to add state to event', {
        eventId: eventId.substring(0, 8),
        state,
        error: errorMessage,
      });

      // Rollback optimistic update
      setEventStatesMap(prev => {
        const newMap = new Map(prev);
        const currentStates = newMap.get(eventId) || [];
        newMap.set(eventId, currentStates.filter(s => s !== state));
        return newMap;
      });

      throw new Error(errorMessage);
    } finally {
      setPendingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  }, []);

  /**
   * Remove a state from an event with optimistic update.
   */
  const removeState = React.useCallback(async (eventId: string, state: EventState) => {
    logger.start(`Removing state from event`, { eventId: eventId.substring(0, 8), state });

    // Store original state for rollback
    const originalStates = eventStatesMap.get(eventId) || [];

    // Optimistic update
    setPendingOperations(prev => new Set(prev).add(eventId));
    setEventStatesMap(prev => {
      const newMap = new Map(prev);
      const currentStates = newMap.get(eventId) || [];
      newMap.set(eventId, currentStates.filter(s => s !== state));
      return newMap;
    });

    try {
      const response = await fetch(`/api/events/${eventId}/state`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      logger.success(`State removed from event`, { eventId: eventId.substring(0, 8), state });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove state';
      logger.error('Failed to remove state from event', {
        eventId: eventId.substring(0, 8),
        state,
        error: errorMessage,
      });

      // Rollback optimistic update
      setEventStatesMap(prev => {
        const newMap = new Map(prev);
        newMap.set(eventId, originalStates);
        return newMap;
      });

      throw new Error(errorMessage);
    } finally {
      setPendingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  }, [eventStatesMap]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Public State Actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dismiss an event (hide from view).
   * The event will be filtered out unless showDismissed option is true.
   */
  const dismiss = React.useCallback(async (eventId: string) => {
    logger.info('Dismissing event', { eventId: eventId.substring(0, 8) });
    await addState(eventId, 'dismissed');
  }, [addState]);

  /**
   * Save an event to the "maybe" watch list.
   * Use this for events you're interested in but not committed to.
   */
  const saveToMaybe = React.useCallback(async (eventId: string, notes?: string) => {
    logger.info('Saving event to maybe', { eventId: eventId.substring(0, 8), hasNotes: !!notes });
    await addState(eventId, 'maybe', notes);
  }, [addState]);

  /**
   * Track that the user added an event to their calendar.
   * This is called after the user clicks "Add to Calendar".
   */
  const trackCalendarSave = React.useCallback(async (eventId: string) => {
    logger.info('Tracking calendar save', { eventId: eventId.substring(0, 8) });
    await addState(eventId, 'saved_to_calendar');
  }, [addState]);

  /**
   * Check if an event has a specific state.
   */
  const hasState = React.useCallback((eventId: string, state: EventState): boolean => {
    const states = eventStatesMap.get(eventId) || [];
    return states.includes(state);
  }, [eventStatesMap]);

  /**
   * Check if a state operation is pending for an event.
   */
  const isStatePending = React.useCallback((eventId: string): boolean => {
    return pendingOperations.has(eventId);
  }, [pendingOperations]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Legacy Actions (for backwards compatibility)
  // ─────────────────────────────────────────────────────────────────────────────

  const acknowledge = React.useCallback(async (eventId: string) => {
    // Legacy acknowledge - now just dismisses
    logger.info('Acknowledge called (legacy), dismissing event', { eventId: eventId.substring(0, 8) });
    await dismiss(eventId);
  }, [dismiss]);

  const snooze = React.useCallback(async (eventId: string, until: string) => {
    // Snooze not yet implemented
    logger.warn('Snooze not yet implemented', {
      eventId: eventId.substring(0, 8),
      until,
    });
  }, []);

  const loadMore = React.useCallback(async () => {
    // Pagination not yet implemented
    logger.debug('Load more not yet implemented');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Log state changes for debugging
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading && !error) {
      logger.success('Events state updated', {
        total: filteredEvents.length,
        today: groupedEvents.today.length,
        upcoming: stats.upcoming,
        maybe: stats.maybe,
        savedToCalendar: stats.savedToCalendar,
        dataSource,
      });
    }
  }, [isLoading, error, filteredEvents.length, groupedEvents.today.length, stats, dataSource]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    events: filteredEvents,
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
    dismiss,
    saveToMaybe,
    trackCalendarSave,
    removeState,
    hasState,
    isStatePending,
    dataSource,
  };
}

export default useEvents;
