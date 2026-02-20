/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Events API Route
 *
 * Provides event data extracted from emails, bypassing the extracted_dates table
 * to work around schema cache issues. This endpoint queries emails that have the
 * `has_event` label and returns event details from email_analyses.event_detection.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS (January 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The original events pipeline had three failure points:
 *
 * 1. SCHEMA CACHE: Supabase schema cache doesn't recognize the `event_time` column
 *    in extracted_dates, causing saves to fail silently.
 *
 * 2. JSON PARSE ERRORS: EventDetector sometimes receives malformed JSON from the
 *    AI, causing event extraction to fail entirely.
 *
 * 3. MISSING BRIDGE: Even when EventDetector succeeds, the data wasn't always
 *    making it into extracted_dates with date_type='event'.
 *
 * This endpoint provides a FALLBACK path that reads event data directly from
 * email_analyses.event_detection JSONB, which IS being populated correctly.
 * This ensures events display on the Events page while the pipeline is fixed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Original (broken):  extracted_dates (date_type='event') -> useEvents -> page
 * This endpoint:      emails + email_analyses (has_event label) -> useEvents -> page
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/events
 *   List events from emails with `has_event` label
 *
 *   Query params:
 *   - from: Start date for range filter (YYYY-MM-DD) - filters by extracted event date
 *   - to: End date for range filter (YYYY-MM-DD)
 *   - includePast: Whether to include past events (default: false)
 *   - page, limit: Pagination
 *
 *   Returns: Array of event objects with email context
 *
 * @module app/api/events/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiError,
  paginatedResponse,
  getPagination,
  requireAuth,
} from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:Events');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event data structure returned by this endpoint.
 * Designed to be compatible with the existing EventCard component.
 */
interface EventResponse {
  /** Unique identifier (email_id used as event ID for consistency) */
  id: string;
  /** User ID (for RLS consistency) */
  user_id: string;
  /** Source email ID */
  email_id: string;
  /** Event title from EventDetector or email subject */
  title: string;
  /** Event description */
  description: string | null;
  /** Event date (YYYY-MM-DD) */
  date: string;
  /** Event time (HH:MM) if known */
  event_time: string | null;
  /** End date for multi-day events */
  end_date: string | null;
  /** End time if known */
  end_time: string | null;
  /** Date type - always 'event' for this endpoint */
  date_type: 'event';
  /** Priority score (1-10) */
  priority_score: number;
  /** Whether user has acknowledged this event */
  is_acknowledged: boolean;
  /** Rich event metadata from EventDetector */
  event_metadata: EventMetadata | null;
  /** Source email details */
  emails: {
    id: string;
    subject: string;
    sender_name: string | null;
    sender_email: string;
    date: string;
    snippet: string | null;
  } | null;
  /** Contact info if available */
  contacts: {
    id: string;
    name: string | null;
    email: string;
    is_vip: boolean;
  } | null;
  /** When the event was created in our system */
  created_at: string;
}

/**
 * Event metadata from EventDetector.
 * This structure matches what EventDetector stores in email_analyses.event_detection.
 */
interface EventMetadata {
  locality?: 'local' | 'out_of_town' | 'virtual';
  locationType?: 'in_person' | 'virtual' | 'hybrid' | 'unknown';
  location?: string;
  rsvpRequired?: boolean;
  rsvpUrl?: string;
  rsvpDeadline?: string;
  organizer?: string;
  cost?: string;
  additionalDetails?: string;
  eventSummary?: string;
  keyPoints?: string[];
}

/**
 * Structure of email_analyses.event_detection JSONB.
 * This is what EventDetector stores when it successfully extracts event info.
 */
interface EventDetectionData {
  has_event: boolean;
  event_title?: string;
  event_date?: string;
  event_time?: string;
  event_end_time?: string;
  location_type?: 'in_person' | 'virtual' | 'hybrid' | 'unknown';
  location?: string;
  registration_deadline?: string;
  rsvp_required?: boolean;
  rsvp_url?: string;
  organizer?: string;
  cost?: string;
  additional_details?: string;
  confidence?: number;
}

/**
 * Structure of email_analyses.categorization JSONB.
 * We check the labels array for 'has_event'.
 */
interface CategorizationData {
  category?: string;
  labels?: string[];
  summary?: string;
  confidence?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets today's date in YYYY-MM-DD format.
 * Used for filtering future vs past events.
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Transforms raw database row into EventResponse format.
 * This normalizes the data structure to match what the frontend expects.
 *
 * The transformation handles:
 * - Extracting event details from event_detection JSONB
 * - Falling back to email metadata when event_detection is incomplete
 * - Building event_metadata for EventCard consumption
 *
 * @param row - Raw database row from the query
 * @returns Normalized event response object
 */
function transformToEventResponse(row: any): EventResponse {
  const eventDetection: EventDetectionData | null = row.email_analyses?.event_detection;
  const categorization: CategorizationData | null = row.email_analyses?.categorization;

  // Extract event date - prefer event_detection, fall back to email date
  // This is critical: we need a valid date for grouping and display
  const eventDate = eventDetection?.event_date || row.date?.split('T')[0] || getToday();

  // Build event metadata for the EventCard component
  // This structure matches what EventCard expects from extracted_dates.event_metadata
  const eventMetadata: EventMetadata | null = eventDetection ? {
    locality: inferLocality(eventDetection),
    locationType: eventDetection.location_type,
    location: eventDetection.location,
    rsvpRequired: eventDetection.rsvp_required,
    rsvpUrl: eventDetection.rsvp_url,
    rsvpDeadline: eventDetection.registration_deadline,
    organizer: eventDetection.organizer,
    cost: eventDetection.cost,
    additionalDetails: eventDetection.additional_details,
  } : null;

  return {
    // Use email ID as the event ID - this ensures uniqueness and allows
    // linking back to the source email
    id: row.id,
    user_id: row.user_id,
    email_id: row.id,

    // Event title: prefer EventDetector's title, fall back to email subject
    title: eventDetection?.event_title || row.subject || 'Untitled Event',

    // Description: use categorization summary if no event-specific description
    description: eventDetection?.additional_details || categorization?.summary || null,

    // Date and time from EventDetector
    date: eventDate,
    event_time: eventDetection?.event_time || null,
    end_date: null, // EventDetector doesn't extract end dates yet
    end_time: eventDetection?.event_end_time || null,

    // Always 'event' for this endpoint
    date_type: 'event',

    // Default priority - could be enhanced based on urgency signals
    priority_score: 5,

    // Events from this endpoint haven't been acknowledged yet
    // (acknowledgment is stored in extracted_dates, not here)
    is_acknowledged: false,

    // Rich metadata for EventCard
    event_metadata: eventMetadata,

    // Source email context
    emails: {
      id: row.id,
      subject: row.subject,
      sender_name: row.sender_name,
      sender_email: row.sender_email,
      date: row.date,
      snippet: row.snippet,
    },

    // Contact info (if we have it)
    contacts: row.contacts || null,

    created_at: row.created_at,
  };
}

/**
 * Infers event locality from EventDetector data.
 * This helps users quickly identify which events require travel.
 *
 * Logic:
 * - Virtual/hybrid events -> 'virtual'
 * - Events with location containing "zoom/meet/teams" -> 'virtual'
 * - Other events -> null (unknown locality, could enhance with user context)
 *
 * @param eventDetection - Event detection data from analyzer
 * @returns Inferred locality or null
 */
function inferLocality(eventDetection: EventDetectionData): 'local' | 'out_of_town' | 'virtual' | undefined {
  // Virtual events are clearly identifiable
  if (eventDetection.location_type === 'virtual') {
    return 'virtual';
  }

  // Hybrid events should show as virtual (can attend remotely)
  if (eventDetection.location_type === 'hybrid') {
    return 'virtual';
  }

  // Check location string for video meeting indicators
  const location = eventDetection.location?.toLowerCase() || '';
  if (
    location.includes('zoom') ||
    location.includes('meet.google') ||
    location.includes('teams.microsoft') ||
    location.includes('webex')
  ) {
    return 'virtual';
  }

  // For in-person events, we'd need user's location context to determine
  // if it's local or out of town. For now, return undefined.
  // TODO: Enhance with user_context.location_city comparison
  return undefined;
}

/**
 * Parses query parameters for the events endpoint.
 * Handles boolean conversion and date validation.
 *
 * @param request - Incoming request
 * @returns Parsed query parameters
 */
function parseQueryParams(request: NextRequest): {
  from: string | null;
  to: string | null;
  includePast: boolean;
} {
  const url = new URL(request.url);

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const includePast = url.searchParams.get('includePast') === 'true';

  return { from, to, includePast };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/events - List events from emails
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.start('Fetching events from emails');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Create Supabase client and authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized events request');
      return userResult;
    }
    const user = userResult;

    logger.debug('User authenticated', { userId: user.id.substring(0, 8) });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Parse query parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const { from, to, includePast } = parseQueryParams(request);
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    logger.debug('Query parameters', { from, to, includePast, limit, offset });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Query emails with has_event label
    //
    // This query:
    // 1. Joins emails with email_analyses to get event_detection JSONB
    // 2. Filters for emails where categorization.labels contains 'has_event'
    // 3. Orders by email date (newest first for past, oldest first for future)
    //
    // Note: We use a raw filter for the JSONB array containment check because
    // Supabase's query builder doesn't have native support for this operation.
    // ─────────────────────────────────────────────────────────────────────────────
    let query = supabase
      .from('emails')
      .select(`
        id,
        user_id,
        subject,
        sender_name,
        sender_email,
        date,
        snippet,
        created_at,
        email_analyses!inner (
          categorization,
          event_detection
        ),
        contacts:contact_id (
          id,
          name,
          email,
          is_vip:priority
        )
      `, { count: 'exact' })
      .eq('user_id', user.id);

    // Filter for emails with has_event label in categorization.labels array
    // This is the key filter that identifies event emails
    query = query.filter(
      'email_analyses.categorization',
      'cs',
      JSON.stringify({ labels: ['has_event'] })
    );

    logger.debug('Applied has_event label filter');

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Apply date filters
    //
    // Since event_detection.event_date is inside a JSONB column, we can't easily
    // filter on it with Supabase. Instead, we filter on the email date as a proxy.
    // This is imperfect but works for most cases where event emails are received
    // close to the event date.
    //
    // For more precise filtering, we post-filter in JavaScript after the query.
    // ─────────────────────────────────────────────────────────────────────────────
    if (!includePast) {
      // Default: only show emails from the last 30 days (likely to have future events)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      query = query.gte('date', thirtyDaysAgoStr);
      logger.debug('Filtering to recent emails', { from: thirtyDaysAgoStr });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Apply sorting and pagination
    // Sort by email date descending (newest first)
    // ─────────────────────────────────────────────────────────────────────────────
    query = query
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Execute query
    // ─────────────────────────────────────────────────────────────────────────────
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', {
        error: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
        userId: user.id.substring(0, 8),
      });
      return apiError(`Failed to fetch events: ${error.message}`, 500);
    }

    logger.debug('Raw query returned', { rowCount: data?.length || 0, totalCount: count });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 7: Transform and filter results
    //
    // Transform raw database rows into EventResponse format and apply
    // additional filtering based on the actual event date (from event_detection).
    // ─────────────────────────────────────────────────────────────────────────────
    const today = getToday();

    let events: EventResponse[] = (data || [])
      .map(transformToEventResponse)
      // Filter out events without valid dates
      .filter(event => event.date && event.date !== 'Invalid Date');

    // Apply date range filters on the actual event date
    if (from) {
      events = events.filter(event => event.date >= from);
      logger.debug('Filtered by from date', { from, remaining: events.length });
    }

    if (to) {
      events = events.filter(event => event.date <= to);
      logger.debug('Filtered by to date', { to, remaining: events.length });
    }

    // Filter out past events unless includePast is true
    if (!includePast) {
      events = events.filter(event => event.date >= today);
      logger.debug('Filtered out past events', { today, remaining: events.length });
    }

    // Sort by event date (ascending for upcoming events)
    events.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // Secondary sort by time if dates are equal
      return (a.event_time || '').localeCompare(b.event_time || '');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 8: Return paginated response
    // ─────────────────────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;

    logger.success('Events fetched successfully', {
      count: events.length,
      totalFromDb: count,
      userId: user.id.substring(0, 8),
      durationMs,
      filters: { from, to, includePast },
    });

    return paginatedResponse(
      events,
      pagination,
      events.length, // Use filtered count, not DB count
      request.url
    );

  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────────
    // Error handling
    // ─────────────────────────────────────────────────────────────────────────────
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error('Unexpected error in GET /api/events', {
      error: message,
      stack: stack?.split('\n').slice(0, 3).join(' | '),
    });

    return apiError('Internal server error', 500);
  }
}
