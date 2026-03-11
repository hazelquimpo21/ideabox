/**
 * Calendar unified types — shared across all calendar components.
 * Implements Step 12 from Phase 3 redesign plan.
 *
 * CalendarItem is the unified type that both EventData (from useEvents)
 * and ExtractedDate (from useExtractedDates) merge into.
 *
 * @module components/calendar/types
 */

import type { EventData } from '@/hooks/useEvents';
import type { ExtractedDate } from '@/hooks/useExtractedDates';

export interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  dateString: string;
  time?: string;
  endTime?: string;
  eventType: string;
  location?: string;
  locationType?: string;
  source: 'google_calendar' | 'email_extracted';
  sourceEmailId?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  summary?: string;
  keyPoints?: string[];
  description?: string;
  rsvpRequired?: boolean;
  rsvpDeadline?: string;
  rsvpUrl?: string;
  isOverdue: boolean;
  isAcknowledged: boolean;
  state?: 'dismissed' | 'maybe' | 'saved_to_calendar';
  /** Birthday-specific fields */
  isBirthday?: boolean;
  birthdayPersonName?: string;
  birthdayRelationship?: string;
  birthdayYearKnown?: boolean;
  birthdayAge?: number;
  /** Weighting */
  compositeWeight?: number;
  commitmentLevel?: string;
  /** Whether this is a recurring item */
  isRecurring?: boolean;
  /** Relevance score for "highly relevant" indicator */
  relevanceScore?: number;
  /** "Why attend" personalized recommendation */
  whyAttend?: string;
}

/**
 * Merges EventData and ExtractedDate arrays into a unified CalendarItem[].
 *
 * Deduplicates by ID (events may also exist in extracted_dates).
 * WHY: Both data sources represent calendar-worthy items but come from different
 * APIs — this normalizes them into one shape for rendering.
 */
export function mergeToCalendarItems(
  events: EventData[],
  extractedDates: ExtractedDate[]
): CalendarItem[] {
  const today = new Date().toISOString().split('T')[0];
  const seenIds = new Set<string>();
  const items: CalendarItem[] = [];

  // Convert events first (richer metadata)
  for (const event of events) {
    seenIds.add(event.id);
    const meta = event.event_metadata;
    const isBirthdayType = false; // Events from useEvents are date_type='event'

    items.push({
      id: event.id,
      title: event.title,
      date: new Date(event.date + 'T00:00:00'),
      dateString: event.date,
      time: event.event_time ?? undefined,
      endTime: event.end_time ?? undefined,
      eventType: meta?.eventType ?? 'event',
      location: meta?.location,
      locationType: meta?.locationType,
      source: 'email_extracted',
      sourceEmailId: event.email_id ?? undefined,
      sourceEmailSubject: event.emails?.subject ?? undefined,
      sourceEmailSender: event.emails?.sender_name ?? event.emails?.sender_email ?? undefined,
      summary: meta?.eventSummary ?? undefined,
      keyPoints: meta?.keyPoints ?? undefined,
      description: event.description ?? undefined,
      rsvpRequired: meta?.rsvpRequired,
      rsvpDeadline: meta?.rsvpDeadline,
      rsvpUrl: meta?.rsvpUrl,
      isOverdue: event.date < today && !event.is_acknowledged,
      isAcknowledged: event.is_acknowledged,
      isBirthday: isBirthdayType,
      compositeWeight: meta?.compositeWeight,
      commitmentLevel: meta?.commitmentLevel,
      relevanceScore: meta?.relevanceScore ?? undefined,
      whyAttend: meta?.whyAttend ?? undefined,
    });
  }

  // Convert extracted dates, skip duplicates
  for (const d of extractedDates) {
    if (seenIds.has(d.id)) continue;
    seenIds.add(d.id);
    const meta = d.event_metadata;
    const isBirthdayType = d.date_type === 'birthday' || d.date_type === 'anniversary';

    items.push({
      id: d.id,
      title: d.title,
      date: new Date(d.date + 'T00:00:00'),
      dateString: d.date,
      time: d.event_time ?? undefined,
      eventType: d.date_type,
      location: meta?.location,
      locationType: meta?.locationType,
      source: 'email_extracted',
      sourceEmailId: d.email_id || undefined,
      sourceEmailSubject: d.emails?.subject ?? undefined,
      sourceEmailSender: d.emails?.sender_name ?? d.emails?.sender_email ?? undefined,
      summary: meta?.eventSummary ?? undefined,
      keyPoints: meta?.keyPoints ?? undefined,
      description: d.description ?? undefined,
      rsvpRequired: meta?.rsvpRequired,
      rsvpDeadline: meta?.rsvpDeadline,
      rsvpUrl: meta?.rsvpUrl,
      isOverdue: d.date < today && !d.is_acknowledged,
      isAcknowledged: d.is_acknowledged,
      isBirthday: isBirthdayType,
      compositeWeight: meta?.compositeWeight,
      commitmentLevel: meta?.commitmentLevel,
      isRecurring: d.is_recurring,
      relevanceScore: meta?.relevanceScore ?? undefined,
      whyAttend: meta?.whyAttend ?? undefined,
    });
  }

  return items;
}

/** Time period groups for the timeline view. */
export interface TimelineGroups {
  overdue: CalendarItem[];
  today: CalendarItem[];
  tomorrow: CalendarItem[];
  thisWeek: CalendarItem[];
  nextWeek: CalendarItem[];
  later: CalendarItem[];
}

/**
 * Groups CalendarItems by time period relative to today.
 * Overdue items are always first.
 */
export function groupByTimePeriod(items: CalendarItem[]): TimelineGroups {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // End of this week (Sunday)
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

  // End of next week
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  const endOfNextWeekStr = endOfNextWeek.toISOString().split('T')[0];

  const groups: TimelineGroups = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };

  for (const item of items) {
    const d = item.dateString;
    if (d < todayStr) {
      groups.overdue.push(item);
    } else if (d === todayStr) {
      groups.today.push(item);
    } else if (d === tomorrowStr) {
      groups.tomorrow.push(item);
    } else if (d <= endOfWeekStr) {
      groups.thisWeek.push(item);
    } else if (d <= endOfNextWeekStr) {
      groups.nextWeek.push(item);
    } else {
      groups.later.push(item);
    }
  }

  return groups;
}
