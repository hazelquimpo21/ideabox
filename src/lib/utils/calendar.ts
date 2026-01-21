/**
 * Calendar Utilities
 *
 * Utilities for calendar integration including:
 * - Google Calendar link generation
 * - Date/time formatting for events
 * - RSVP deadline calculations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Generate Google Calendar event creation links
 * - Format event times for display (12h/24h)
 * - Calculate days until deadline
 * - Parse various date formats
 *
 * @module lib/utils/calendar
 * @version 1.0.0
 * @since January 2026
 */

import { createLogger } from './logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CalendarUtils');

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEZONE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default timezone when user hasn't specified one.
 * Central Time (America/Chicago) is used as the app default.
 */
export const DEFAULT_TIMEZONE = 'America/Chicago';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event data for calendar link generation.
 */
export interface CalendarEventData {
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Start date in ISO format (YYYY-MM-DD) */
  startDate: string;
  /** Start time in 24h format (HH:MM) - optional for all-day events */
  startTime?: string;
  /** End date in ISO format (YYYY-MM-DD) - defaults to startDate */
  endDate?: string;
  /** End time in 24h format (HH:MM) */
  endTime?: string;
  /** Location (physical address or video link) */
  location?: string;
}

/**
 * Formatted event display data.
 */
export interface FormattedEventDisplay {
  /** Formatted date string (e.g., "Sat, Jan 25, 2026") */
  dateDisplay: string;
  /** Formatted time string (e.g., "6:00 PM - 8:00 PM") */
  timeDisplay: string | null;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Days from now (negative = past) */
  daysFromNow: number;
  /** Human-readable relative time (e.g., "in 3 days", "tomorrow") */
  relativeDate: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR LINK GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a Google Calendar event creation URL.
 *
 * When clicked, opens Google Calendar with a new event pre-filled.
 *
 * @param event - Event data to include in the calendar link
 * @returns Google Calendar URL string
 *
 * @example
 * ```typescript
 * const link = generateGoogleCalendarLink({
 *   title: 'Milwaukee Tech Meetup',
 *   startDate: '2026-01-25',
 *   startTime: '18:00',
 *   endTime: '20:00',
 *   location: '123 Main St, Milwaukee, WI',
 *   description: 'Monthly tech meetup discussing AI in production',
 * });
 * // Opens: https://calendar.google.com/calendar/render?action=TEMPLATE&...
 * ```
 */
export function generateGoogleCalendarLink(event: CalendarEventData): string {
  logger.debug('Generating Google Calendar link', {
    title: event.title,
    startDate: event.startDate,
    hasTime: !!event.startTime,
  });

  try {
    const baseUrl = 'https://calendar.google.com/calendar/render';
    const params = new URLSearchParams();

    params.set('action', 'TEMPLATE');
    params.set('text', event.title);

    // Format dates for Google Calendar
    // All-day events use YYYYMMDD format
    // Timed events use YYYYMMDDTHHMMSS format
    const startDateStr = event.startDate.replace(/-/g, '');
    const endDate = event.endDate || event.startDate;
    const endDateStr = endDate.replace(/-/g, '');

    if (event.startTime) {
      // Timed event
      const startTimeStr = event.startTime.replace(':', '') + '00';
      const endTimeStr = event.endTime
        ? event.endTime.replace(':', '') + '00'
        : addHours(event.startTime, 1).replace(':', '') + '00';

      params.set('dates', `${startDateStr}T${startTimeStr}/${endDateStr}T${endTimeStr}`);
    } else {
      // All-day event - end date should be day after for Google Calendar
      const endDatePlusOne = addDays(endDate, 1).replace(/-/g, '');
      params.set('dates', `${startDateStr}/${endDatePlusOne}`);
    }

    if (event.description) {
      params.set('details', event.description);
    }

    if (event.location) {
      params.set('location', event.location);
    }

    const url = `${baseUrl}?${params.toString()}`;

    logger.debug('Generated calendar link', { url: url.substring(0, 100) + '...' });

    return url;
  } catch (error) {
    logger.error('Failed to generate calendar link', {
      error: error instanceof Error ? error.message : 'Unknown error',
      event: event.title,
    });

    // Return a basic link that will at least open Google Calendar
    return 'https://calendar.google.com/calendar';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE/TIME FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a 24-hour time string to 12-hour format with AM/PM.
 * Optionally displays the time in a specific timezone.
 *
 * @param time24h - Time in 24h format (HH:MM)
 * @param options - Optional formatting options
 * @param options.timezone - IANA timezone (e.g., 'America/Chicago'). Defaults to Central Time.
 * @param options.date - Date string (YYYY-MM-DD) for timezone-accurate conversion. If not provided, uses today.
 * @param options.showTimezone - Whether to show timezone abbreviation (e.g., "6:00 PM CST")
 * @returns Time in 12h format (e.g., "6:00 PM" or "6:00 PM CST")
 *
 * @example
 * ```typescript
 * formatTime12h('18:00'); // "6:00 PM"
 * formatTime12h('18:00', { timezone: 'America/New_York' }); // "7:00 PM" (if source is Central)
 * formatTime12h('18:00', { showTimezone: true }); // "6:00 PM CST"
 * ```
 */
export function formatTime12h(
  time24h: string,
  options?: {
    timezone?: string;
    date?: string;
    showTimezone?: boolean;
  }
): string {
  try {
    const timezone = options?.timezone || DEFAULT_TIMEZONE;
    const dateStr = options?.date || new Date().toISOString().split('T')[0];
    const showTz = options?.showTimezone ?? false;

    // Create a date object with the time
    // We interpret the input time as being in the target timezone
    const [hoursStr, minutesStr] = time24h.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr || '0', 10);

    // Create a Date object for formatting
    // Parse the date and time together
    const dateTimeStr = `${dateStr}T${time24h.padEnd(5, ':00')}:00`;
    const date = new Date(dateTimeStr);

    // Format using Intl.DateTimeFormat for proper timezone handling
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
      ...(showTz && { timeZoneName: 'short' }),
    });

    return formatter.format(date);
  } catch (error) {
    logger.warn('Failed to format time with timezone, falling back to simple format', {
      time24h,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Fallback to simple formatting without timezone
    try {
      const [hoursStr, minutesStr] = time24h.split(':');
      const hours = parseInt(hoursStr, 10);
      const minutes = minutesStr || '00';

      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;

      return `${hours12}:${minutes} ${period}`;
    } catch {
      return time24h;
    }
  }
}

/**
 * Formats a date string for display.
 *
 * @param dateStr - Date in ISO format (YYYY-MM-DD)
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * ```typescript
 * formatEventDate('2026-01-25'); // "Sat, Jan 25, 2026"
 * formatEventDate('2026-01-25', { short: true }); // "Jan 25"
 * ```
 */
export function formatEventDate(
  dateStr: string,
  options?: { short?: boolean; includeYear?: boolean }
): string {
  try {
    // Parse as local date (not UTC)
    const date = new Date(dateStr + 'T00:00:00');

    if (options?.short) {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(options.includeYear !== false && { year: 'numeric' }),
      });
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (error) {
    logger.warn('Failed to format date', { dateStr, error });
    return dateStr;
  }
}

/**
 * Creates a comprehensive formatted display for an event.
 *
 * @param startDate - Event start date (YYYY-MM-DD)
 * @param startTime - Optional start time (HH:MM)
 * @param endTime - Optional end time (HH:MM)
 * @returns Formatted display data
 */
export function formatEventDisplay(
  startDate: string,
  startTime?: string,
  endTime?: string
): FormattedEventDisplay {
  const dateDisplay = formatEventDate(startDate);
  const isAllDay = !startTime;

  let timeDisplay: string | null = null;
  if (startTime) {
    const start12h = formatTime12h(startTime);
    if (endTime) {
      const end12h = formatTime12h(endTime);
      timeDisplay = `${start12h} - ${end12h}`;
    } else {
      timeDisplay = start12h;
    }
  }

  const daysFromNow = calculateDaysFromNow(startDate);
  const relativeDate = formatRelativeDate(daysFromNow);

  return {
    dateDisplay,
    timeDisplay,
    isAllDay,
    daysFromNow,
    relativeDate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEADLINE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates the number of days from today to a given date.
 *
 * @param dateStr - Target date in ISO format (YYYY-MM-DD)
 * @returns Number of days (negative if in the past)
 *
 * @example
 * ```typescript
 * // If today is 2026-01-20
 * calculateDaysFromNow('2026-01-25'); // 5
 * calculateDaysFromNow('2026-01-20'); // 0
 * calculateDaysFromNow('2026-01-18'); // -2
 * ```
 */
export function calculateDaysFromNow(dateStr: string): number {
  try {
    const targetDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = targetDate.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch (error) {
    logger.warn('Failed to calculate days from now', { dateStr, error });
    return 0;
  }
}

/**
 * Formats the number of days into a human-readable relative date.
 *
 * @param days - Number of days from today
 * @returns Human-readable string
 *
 * @example
 * ```typescript
 * formatRelativeDate(0);  // "Today"
 * formatRelativeDate(1);  // "Tomorrow"
 * formatRelativeDate(3);  // "In 3 days"
 * formatRelativeDate(-1); // "Yesterday"
 * formatRelativeDate(-5); // "5 days ago"
 * ```
 */
export function formatRelativeDate(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 7) return `In ${days} days`;
  if (days > 7 && days <= 14) return 'Next week';
  if (days > 14) return `In ${Math.ceil(days / 7)} weeks`;
  if (days < -1 && days >= -7) return `${Math.abs(days)} days ago`;
  return `${Math.abs(Math.ceil(days / 7))} weeks ago`;
}

/**
 * Gets urgency level for a deadline.
 *
 * @param days - Days until deadline
 * @returns Urgency level and styling
 */
export function getDeadlineUrgency(days: number): {
  level: 'critical' | 'urgent' | 'soon' | 'normal' | 'past';
  color: string;
  bgColor: string;
} {
  if (days < 0) {
    return {
      level: 'past',
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    };
  }
  if (days === 0) {
    return {
      level: 'critical',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    };
  }
  if (days <= 2) {
    return {
      level: 'urgent',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    };
  }
  if (days <= 7) {
    return {
      level: 'soon',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    };
  }
  return {
    level: 'normal',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adds hours to a time string.
 *
 * @param time - Time in HH:MM format
 * @param hours - Hours to add
 * @returns New time in HH:MM format
 */
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = (h + hours) * 60 + m;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

/**
 * Adds days to a date string.
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @param days - Days to add
 * @returns New date in YYYY-MM-DD format
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  generateGoogleCalendarLink,
  formatTime12h,
  formatEventDate,
  formatEventDisplay,
  calculateDaysFromNow,
  formatRelativeDate,
  getDeadlineUrgency,
};
