/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * 📅 useExtractedDates Hook
 *
 * React hook for fetching, filtering, and managing extracted dates from Supabase.
 * Extracted dates are automatically identified from emails by the DateExtractor analyzer
 * and include deadlines, birthdays, payment dues, appointments, and more.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches extracted dates with type and date range filtering
 * - Groups dates by time period (today, tomorrow, this week, etc.)
 * - Supports acknowledge, snooze, and hide actions
 * - Pagination with load more capability
 * - Comprehensive error handling and logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage - fetch all upcoming dates
 * const { dates, isLoading, error, refetch } = useExtractedDates();
 *
 * // Filter by type (deadlines only)
 * const { dates } = useExtractedDates({ type: 'deadline' });
 *
 * // Filter by date range (this week)
 * const { dates } = useExtractedDates({ from: '2026-01-19', to: '2026-01-26' });
 *
 * // Use grouped dates for timeline view
 * const { groupedDates } = useExtractedDates();
 * // groupedDates = { overdue: [...], today: [...], tomorrow: [...], ... }
 *
 * // Acknowledge a date as done
 * await acknowledge('date-id');
 * ```
 *
 * @module hooks/useExtractedDates
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of dates to fetch per request */
const DEFAULT_LIMIT = 100;

/** Logger instance for this hook */
const logger = createLogger('useExtractedDates');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of dates that can be extracted from emails.
 * Matches the date_type enum in the database (migration 013).
 */
export type DateType =
  | 'deadline'
  | 'event'
  | 'payment_due'
  | 'birthday'
  | 'anniversary'
  | 'expiration'
  | 'appointment'
  | 'follow_up'
  | 'reminder'
  | 'recurring'
  | 'other';

/**
 * Related email info returned with extracted dates.
 */
export interface RelatedEmail {
  id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string;
  snippet: string | null;
  date: string;
}

/**
 * Related contact info returned with extracted dates.
 */
export interface RelatedContact {
  id: string;
  name: string | null;
  email: string;
  is_vip: boolean;
}

/**
 * Rich event metadata stored in the event_metadata JSONB column.
 * Only populated for events from EventDetector (date_type='event').
 * Enables rich EventCard display with locality badges, locations, RSVP info.
 *
 * @since January 2026
 */
export interface EventMetadata {
  /** Where the event is relative to user: 'local' | 'out_of_town' | 'virtual' */
  locality: 'local' | 'out_of_town' | 'virtual' | null;
  /** How people participate: 'in_person' | 'virtual' | 'hybrid' | 'unknown' */
  locationType: string;
  /** Physical address or video meeting link */
  location: string | null;
  /** Whether RSVP/registration is required */
  rsvpRequired: boolean;
  /** URL to register or RSVP */
  rsvpUrl: string | null;
  /** RSVP deadline date (ISO format) */
  rsvpDeadline: string | null;
  /** Event organizer name */
  organizer: string | null;
  /** Cost info ('Free', '$25', etc.) */
  cost: string | null;
  /** Additional event details */
  additionalDetails: string | null;
  /** Whether this is a key date vs full event */
  isKeyDate: boolean;
  /** Type of key date if applicable */
  keyDateType: string | null;
  /** One-sentence assistant-style summary */
  eventSummary: string | null;
  /** 2-4 bullet points for quick scanning */
  keyPoints: string[] | null;
}

/**
 * Extracted date entity from the database.
 * Represents a date/deadline/event extracted from an email.
 */
export interface ExtractedDate {
  /** Unique identifier (UUID) */
  id: string;
  /** User who owns this date */
  user_id: string;
  /** Email this date was extracted from */
  email_id: string;
  /** Related contact if identified */
  contact_id: string | null;
  /** Type of date (deadline, birthday, etc.) */
  date_type: DateType;
  /** The actual date */
  date: string;
  /** Optional time if specified (HH:MM:SS format) */
  event_time: string | null;
  /** Display title for this date */
  title: string;
  /** Additional description or context */
  description: string | null;
  /** Whether this is a recurring date */
  is_recurring: boolean;
  /** Recurrence pattern if recurring (e.g., "yearly", "monthly") */
  recurrence_pattern: string | null;
  /** AI confidence score (0-1) */
  confidence: number;
  /** Priority score for Hub ordering */
  priority_score: number;
  /** Whether user has acknowledged/completed this date */
  is_acknowledged: boolean;
  /** When acknowledged */
  acknowledged_at: string | null;
  /** Record timestamps */
  created_at: string;
  updated_at: string;
  /** Related email data (from join) */
  emails?: RelatedEmail | null;
  /** Related contact data (from join) */
  contacts?: RelatedContact | null;
  /**
   * Rich event metadata for EventCard display.
   * Only present for events from EventDetector (date_type='event').
   * Contains locality, location, RSVP info, and assistant-style summaries.
   *
   * @since January 2026
   */
  event_metadata?: EventMetadata | null;
}

/**
 * Options for filtering and paginating extracted dates.
 */
export interface UseExtractedDatesOptions {
  /** Filter by date type */
  type?: DateType;
  /** Filter from this date (inclusive, YYYY-MM-DD format) */
  from?: string;
  /** Filter to this date (inclusive, YYYY-MM-DD format) */
  to?: string;
  /** Filter by acknowledged status */
  isAcknowledged?: boolean;
  /** Filter by specific email */
  emailId?: string;
  /** Filter by specific contact */
  contactId?: string;
  /** Maximum number of dates to fetch */
  limit?: number;
}

/**
 * Grouped dates for timeline display.
 * Dates are grouped by relative time period.
 */
export interface GroupedDates {
  /** Dates that are past due */
  overdue: ExtractedDate[];
  /** Dates for today */
  today: ExtractedDate[];
  /** Dates for tomorrow */
  tomorrow: ExtractedDate[];
  /** Dates for the rest of this week (excluding today/tomorrow) */
  thisWeek: ExtractedDate[];
  /** Dates for next week */
  nextWeek: ExtractedDate[];
  /** Dates further in the future */
  later: ExtractedDate[];
}

/**
 * Statistics for the timeline view.
 */
export interface DateStats {
  /** Total number of dates */
  total: number;
  /** Number of overdue dates */
  overdue: number;
  /** Number of unacknowledged dates */
  pending: number;
  /** Number of acknowledged dates */
  acknowledged: number;
}

/**
 * Return value from the useExtractedDates hook.
 */
export interface UseExtractedDatesReturn {
  /** Array of extracted date objects */
  dates: ExtractedDate[];
  /** Dates grouped by time period (for timeline view) */
  groupedDates: GroupedDates;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch dates with current filters */
  refetch: () => Promise<void>;
  /** Load more dates (pagination) */
  loadMore: () => Promise<void>;
  /** Whether more dates are available */
  hasMore: boolean;
  /** Date statistics */
  stats: DateStats;
  /** Mark a date as acknowledged/done */
  acknowledge: (dateId: string) => Promise<void>;
  /** Snooze a date until a specific date */
  snooze: (dateId: string, until: string) => Promise<void>;
  /** Hide a date (won't appear in Hub) */
  hide: (dateId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets the start of today in YYYY-MM-DD format.
 * Used for date comparisons and filtering.
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
 * Gets the end of this week (Sunday) in YYYY-MM-DD format.
 */
function getEndOfWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSunday = 7 - dayOfWeek;
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  return endOfWeek.toISOString().split('T')[0];
}

/**
 * Gets the end of next week (following Sunday) in YYYY-MM-DD format.
 */
function getEndOfNextWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSunday = 7 - dayOfWeek + 7; // This Sunday + 7 days
  const endOfNextWeek = new Date(now);
  endOfNextWeek.setDate(now.getDate() + daysUntilSunday);
  return endOfNextWeek.toISOString().split('T')[0];
}

/**
 * Groups an array of extracted dates by time period.
 * Used for the timeline view to organize dates chronologically.
 *
 * @param dates - Array of extracted dates to group
 * @returns Object with dates grouped by time period
 */
function groupDatesByPeriod(dates: ExtractedDate[]): GroupedDates {
  const today = getToday();
  const tomorrow = getTomorrow();
  const endOfWeek = getEndOfWeek();
  const endOfNextWeek = getEndOfNextWeek();

  const groups: GroupedDates = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };

  for (const date of dates) {
    const dateStr = date.date;

    if (dateStr < today) {
      // Past due dates
      groups.overdue.push(date);
    } else if (dateStr === today) {
      // Today's dates
      groups.today.push(date);
    } else if (dateStr === tomorrow) {
      // Tomorrow's dates
      groups.tomorrow.push(date);
    } else if (dateStr <= endOfWeek) {
      // Rest of this week (after tomorrow)
      groups.thisWeek.push(date);
    } else if (dateStr <= endOfNextWeek) {
      // Next week
      groups.nextWeek.push(date);
    } else {
      // Further in the future
      groups.later.push(date);
    }
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing extracted dates from Supabase.
 *
 * @param options - Filtering and pagination options
 * @returns Date data, loading state, grouped dates, and control functions
 *
 * @example
 * ```tsx
 * function TimelinePage() {
 *   const {
 *     groupedDates,
 *     isLoading,
 *     error,
 *     stats,
 *     acknowledge,
 *     snooze,
 *   } = useExtractedDates({
 *     isAcknowledged: false, // Only show pending dates
 *   });
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       <StatsBar stats={stats} />
 *       {groupedDates.overdue.length > 0 && (
 *         <DateGroup title="Overdue" dates={groupedDates.overdue} urgent />
 *       )}
 *       {groupedDates.today.length > 0 && (
 *         <DateGroup title="Today" dates={groupedDates.today} />
 *       )}
 *       {/* ... more groups ... *\/}
 *     </div>
 *   );
 * }
 * ```
 */
export function useExtractedDates(options: UseExtractedDatesOptions = {}): UseExtractedDatesReturn {
  // ─────────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────────

  const [dates, setDates] = React.useState<ExtractedDate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [stats, setStats] = React.useState<DateStats>({
    total: 0,
    overdue: 0,
    pending: 0,
    acknowledged: 0,
  });

  // Memoize Supabase client to prevent recreation
  const supabase = React.useMemo(() => createClient(), []);

  // Destructure options with defaults
  const {
    type,
    from,
    to,
    isAcknowledged,
    emailId,
    contactId,
    limit = DEFAULT_LIMIT,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed: Grouped Dates
  // ─────────────────────────────────────────────────────────────────────────────

  // Memoize grouped dates to avoid recalculation on every render
  const groupedDates = React.useMemo(() => groupDatesByPeriod(dates), [dates]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Extracted Dates
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches extracted dates from Supabase with the current filters.
   * Includes related email and contact data via joins.
   */
  const fetchDates = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching extracted dates', {
      type,
      from,
      to,
      isAcknowledged,
      emailId: emailId?.substring(0, 8),
      contactId: contactId?.substring(0, 8),
      limit,
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Build query with related data joins
      // ─────────────────────────────────────────────────────────────────────────
      let query = supabase
        .from('extracted_dates')
        .select(
          `
          *,
          emails:email_id (
            id,
            subject,
            sender_name,
            sender_email,
            snippet,
            date
          ),
          contacts:contact_id (
            id,
            name,
            email,
            is_vip
          )
        `,
          { count: 'exact' }
        )
        .limit(limit);

      // ─────────────────────────────────────────────────────────────────────────
      // Apply filters
      // ─────────────────────────────────────────────────────────────────────────

      // Type filter
      if (type) {
        query = query.eq('date_type', type);
        logger.debug('Applying type filter', { type });
      }

      // Date range filters
      if (from) {
        query = query.gte('date', from);
        logger.debug('Applying from date filter', { from });
      }

      if (to) {
        query = query.lte('date', to);
        logger.debug('Applying to date filter', { to });
      }

      // Acknowledged status filter
      if (isAcknowledged !== undefined) {
        query = query.eq('is_acknowledged', isAcknowledged);
        logger.debug('Applying acknowledged filter', { isAcknowledged });
      }

      // Email filter
      if (emailId) {
        query = query.eq('email_id', emailId);
        logger.debug('Applying email filter', { emailId: emailId.substring(0, 8) });
      }

      // Contact filter
      if (contactId) {
        query = query.eq('contact_id', contactId);
        logger.debug('Applying contact filter', { contactId: contactId.substring(0, 8) });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Apply default sorting: by date ascending (soonest first), then priority
      // ─────────────────────────────────────────────────────────────────────────
      query = query
        .order('date', { ascending: true })
        .order('priority_score', { ascending: false });

      // ─────────────────────────────────────────────────────────────────────────
      // Execute query
      // ─────────────────────────────────────────────────────────────────────────
      const { data, error: queryError, count } = await query;

      if (queryError) {
        logger.error('Database query failed', {
          error: queryError.message,
          code: queryError.code,
        });
        throw new Error(`Failed to fetch dates: ${queryError.message}`);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Update state with fetched data
      // ─────────────────────────────────────────────────────────────────────────
      const fetchedDates = (data || []) as ExtractedDate[];
      setDates(fetchedDates);
      setHasMore(fetchedDates.length >= limit);

      // Calculate stats
      const today = getToday();
      setStats({
        total: count || fetchedDates.length,
        overdue: fetchedDates.filter((d) => d.date < today && !d.is_acknowledged).length,
        pending: fetchedDates.filter((d) => !d.is_acknowledged).length,
        acknowledged: fetchedDates.filter((d) => d.is_acknowledged).length,
      });

      logger.success('Extracted dates fetched', {
        count: fetchedDates.length,
        total: count,
        hasMore: fetchedDates.length >= limit,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch extracted dates', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, type, from, to, isAcknowledged, emailId, contactId, limit]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load More (Pagination)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads the next page of dates using offset-based pagination.
   */
  const loadMore = React.useCallback(async () => {
    if (!hasMore || isLoading) {
      logger.debug('Load more skipped', { hasMore, isLoading });
      return;
    }

    logger.start('Loading more extracted dates', { currentCount: dates.length });

    try {
      let query = supabase
        .from('extracted_dates')
        .select(
          `
          *,
          emails:email_id (
            id,
            subject,
            sender_name,
            sender_email,
            snippet,
            date
          ),
          contacts:contact_id (
            id,
            name,
            email,
            is_vip
          )
        `
        )
        .range(dates.length, dates.length + limit - 1);

      // Apply same filters
      if (type) query = query.eq('date_type', type);
      if (from) query = query.gte('date', from);
      if (to) query = query.lte('date', to);
      if (isAcknowledged !== undefined) query = query.eq('is_acknowledged', isAcknowledged);
      if (emailId) query = query.eq('email_id', emailId);
      if (contactId) query = query.eq('contact_id', contactId);

      // Apply sorting
      query = query
        .order('date', { ascending: true })
        .order('priority_score', { ascending: false });

      const { data, error: queryError } = await query;

      if (queryError) {
        logger.error('Load more query failed', {
          error: queryError.message,
          code: queryError.code,
        });
        throw new Error(`Failed to load more dates: ${queryError.message}`);
      }

      const newDates = (data || []) as ExtractedDate[];
      setDates((prev) => [...prev, ...newDates]);
      setHasMore(newDates.length >= limit);

      logger.success('Loaded more extracted dates', {
        newCount: newDates.length,
        totalCount: dates.length + newDates.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load more dates', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [supabase, dates.length, limit, hasMore, isLoading, type, from, to, isAcknowledged, emailId, contactId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Acknowledge Action
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Marks a date as acknowledged/completed.
   * Uses optimistic update pattern.
   *
   * @param dateId - The ID of the date to acknowledge
   */
  const acknowledge = React.useCallback(
    async (dateId: string) => {
      const date = dates.find((d) => d.id === dateId);
      if (!date) {
        logger.warn('Acknowledge: Date not found', { dateId: dateId.substring(0, 8) });
        return;
      }

      logger.start('Acknowledging date', { dateId: dateId.substring(0, 8) });

      // Optimistic update
      setDates((prev) =>
        prev.map((d) =>
          d.id === dateId
            ? { ...d, is_acknowledged: true, acknowledged_at: new Date().toISOString() }
            : d
        )
      );

      setStats((prev) => ({
        ...prev,
        pending: prev.pending - 1,
        acknowledged: prev.acknowledged + 1,
        overdue: date.date < getToday() ? prev.overdue - 1 : prev.overdue,
      }));

      try {
        const response = await fetch(`/api/dates/${dateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'acknowledge' }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        logger.success('Date acknowledged', { dateId: dateId.substring(0, 8) });
      } catch (err) {
        // Rollback on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back acknowledge', { error: errorMessage });

        setDates((prev) =>
          prev.map((d) =>
            d.id === dateId
              ? { ...d, is_acknowledged: false, acknowledged_at: null }
              : d
          )
        );

        setStats((prev) => ({
          ...prev,
          pending: prev.pending + 1,
          acknowledged: prev.acknowledged - 1,
          overdue: date.date < getToday() ? prev.overdue + 1 : prev.overdue,
        }));

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [dates]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Snooze Action
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Snoozes a date until a specific date.
   * The date will be marked as acknowledged with the snooze info stored.
   *
   * @param dateId - The ID of the date to snooze
   * @param until - The date to snooze until (YYYY-MM-DD format)
   */
  const snooze = React.useCallback(
    async (dateId: string, until: string) => {
      const date = dates.find((d) => d.id === dateId);
      if (!date) {
        logger.warn('Snooze: Date not found', { dateId: dateId.substring(0, 8) });
        return;
      }

      logger.start('Snoozing date', {
        dateId: dateId.substring(0, 8),
        until,
      });

      // Optimistic update - mark as acknowledged with snooze info
      const originalDescription = date.description;
      setDates((prev) =>
        prev.map((d) =>
          d.id === dateId
            ? {
                ...d,
                is_acknowledged: true,
                acknowledged_at: new Date().toISOString(),
                description: `Snoozed until ${until}. Original: ${d.title}`,
              }
            : d
        )
      );

      setStats((prev) => ({
        ...prev,
        pending: prev.pending - 1,
        acknowledged: prev.acknowledged + 1,
        overdue: date.date < getToday() ? prev.overdue - 1 : prev.overdue,
      }));

      try {
        const response = await fetch(`/api/dates/${dateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snooze', snooze_until: until }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        logger.success('Date snoozed', { dateId: dateId.substring(0, 8), until });
      } catch (err) {
        // Rollback on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back snooze', { error: errorMessage });

        setDates((prev) =>
          prev.map((d) =>
            d.id === dateId
              ? {
                  ...d,
                  is_acknowledged: false,
                  acknowledged_at: null,
                  description: originalDescription,
                }
              : d
          )
        );

        setStats((prev) => ({
          ...prev,
          pending: prev.pending + 1,
          acknowledged: prev.acknowledged - 1,
          overdue: date.date < getToday() ? prev.overdue + 1 : prev.overdue,
        }));

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [dates]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Hide Action
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Hides a date by setting priority to 0 and marking as acknowledged.
   * The date won't appear in Hub or timeline prominence.
   *
   * @param dateId - The ID of the date to hide
   */
  const hide = React.useCallback(
    async (dateId: string) => {
      const date = dates.find((d) => d.id === dateId);
      if (!date) {
        logger.warn('Hide: Date not found', { dateId: dateId.substring(0, 8) });
        return;
      }

      logger.start('Hiding date', { dateId: dateId.substring(0, 8) });

      // Optimistic update - remove from list
      const originalDates = [...dates];
      const originalStats = { ...stats };

      setDates((prev) => prev.filter((d) => d.id !== dateId));
      setStats((prev) => ({
        ...prev,
        total: prev.total - 1,
        pending: date.is_acknowledged ? prev.pending : prev.pending - 1,
        acknowledged: date.is_acknowledged ? prev.acknowledged - 1 : prev.acknowledged,
        overdue: date.date < getToday() && !date.is_acknowledged ? prev.overdue - 1 : prev.overdue,
      }));

      try {
        const response = await fetch(`/api/dates/${dateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'hide' }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        logger.success('Date hidden', { dateId: dateId.substring(0, 8) });
      } catch (err) {
        // Rollback on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back hide', { error: errorMessage });

        setDates(originalDates);
        setStats(originalStats);

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [dates, stats]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch dates when filter options change
  React.useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    dates,
    groupedDates,
    isLoading,
    error,
    refetch: fetchDates,
    loadMore,
    hasMore,
    stats,
    acknowledge,
    snooze,
    hide,
  };
}

export default useExtractedDates;
