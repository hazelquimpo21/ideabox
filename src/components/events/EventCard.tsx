/**
 * 📅 Event Card Component
 *
 * Displays a single event in a friendly, scannable card format.
 * Used on the Events page and in the sidebar preview section.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Event title with date/time display
 * - Locality badge (Local / Out of Town / Virtual)
 * - Relative date display (Today, Tomorrow, In X days)
 * - Location with map/video link
 * - RSVP deadline with urgency indicator
 * - Add to Calendar button
 * - Link to source email
 * - Compact variant for sidebar preview
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * // Full card for Events page
 * <EventCard
 *   event={eventData}
 *   onAcknowledge={handleAcknowledge}
 *   onAddToCalendar={handleAddToCalendar}
 * />
 *
 * // Compact card for sidebar preview
 * <EventCard event={eventData} variant="compact" />
 * ```
 *
 * @module components/events/EventCard
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  ExternalLink,
  CalendarPlus,
  Check,
  Mail,
  Home,
  Plane,
  Globe,
  ChevronRight,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import {
  generateGoogleCalendarLink,
  formatEventDate,
  formatTime12h,
  calculateDaysFromNow,
  formatRelativeDate,
  getDeadlineUrgency,
} from '@/lib/utils/calendar';
import type { EventData, EventMetadata } from '@/hooks/useEvents';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EventCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event locality type - where the event is relative to the user.
 * Now sourced from event_metadata.locality field.
 *
 * @since January 2026 - Now uses event_metadata instead of email_analyses JOIN
 */
type EventLocality = 'local' | 'out_of_town' | 'virtual' | null;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts event metadata from an event record.
 * Returns null if no metadata available (non-EventDetector events).
 */
function getEventMetadata(event: EventData): EventMetadata | null {
  return event.event_metadata ?? null;
}

/**
 * Gets the locality from event metadata.
 * Falls back to determining from location type if metadata is incomplete.
 */
function getLocality(event: EventData): EventLocality {
  const metadata = getEventMetadata(event);
  if (metadata?.locality) {
    return metadata.locality;
  }
  // Fallback: if locationType is virtual, assume virtual locality
  if (metadata?.locationType === 'virtual') {
    return 'virtual';
  }
  return null;
}

/**
 * Props for the EventCard component.
 */
export interface EventCardProps {
  /** Event data from useEvents hook */
  event: EventData;
  /** Card display variant */
  variant?: 'default' | 'compact';
  /** Callback when event is acknowledged/done */
  onAcknowledge?: (eventId: string) => void;
  /** Callback when Add to Calendar is clicked */
  onAddToCalendar?: (event: EventData) => void;
  /** Whether to show source email info */
  showSourceEmail?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Locality badge component.
 * Shows where the event is relative to the user (Local, Out of Town, Virtual).
 *
 * This helps users quickly identify which events require travel planning
 * versus those they can attend locally or virtually.
 */
function LocalityBadge({ locality }: { locality: EventLocality }) {
  if (!locality) return null;

  const config = {
    local: {
      icon: Home,
      label: 'Local',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    },
    out_of_town: {
      icon: Plane,
      label: 'Out of Town',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    },
    virtual: {
      icon: Globe,
      label: 'Virtual',
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    },
  };

  const localityConfig = config[locality];
  if (!localityConfig) return null;

  const { icon: Icon, label, className } = localityConfig;

  return (
    <Badge variant="outline" className={`gap-1 border-0 text-xs ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Date/time display component.
 * Shows formatted date with optional time and relative indicator.
 */
function DateTimeDisplay({
  date,
  time,
  showRelative = true,
}: {
  date: string;
  time?: string | null;
  showRelative?: boolean;
}) {
  const daysFromNow = calculateDaysFromNow(date);
  const relativeDate = formatRelativeDate(daysFromNow);
  const formattedDate = formatEventDate(date, { short: true });
  const isPast = daysFromNow < 0;
  const isToday = daysFromNow === 0;
  const isTomorrow = daysFromNow === 1;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Calendar className={`h-4 w-4 ${isToday ? 'text-green-500' : 'text-muted-foreground'}`} />
      <div>
        <span className={`font-medium ${isPast ? 'text-muted-foreground' : ''}`}>
          {formattedDate}
        </span>
        {time && (
          <span className="text-muted-foreground ml-1.5">
            at {formatTime12h(time)}
          </span>
        )}
        {showRelative && (
          <span
            className={`ml-2 text-xs ${
              isToday
                ? 'text-green-600 dark:text-green-400 font-medium'
                : isTomorrow
                ? 'text-blue-600 dark:text-blue-400 font-medium'
                : isPast
                ? 'text-muted-foreground'
                : 'text-muted-foreground'
            }`}
          >
            ({relativeDate})
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Location display with optional link.
 * Detects video meeting links and shows appropriate action.
 */
function LocationDisplay({ location }: { location: string }) {
  // Detect if this is a video meeting link
  const isVideoLink =
    location.includes('zoom') ||
    location.includes('meet.google') ||
    location.includes('teams.microsoft') ||
    location.includes('webex');

  // Generate Google Maps link for physical addresses
  const mapsLink = !isVideoLink
    ? `https://maps.google.com/?q=${encodeURIComponent(location)}`
    : null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {isVideoLink ? (
        <>
          <Video className="h-3.5 w-3.5 text-purple-500" />
          <a
            href={location}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            onClick={() => logger.info('Video meeting link clicked', { location: location.substring(0, 30) })}
          >
            Join Meeting
            <ExternalLink className="h-3 w-3" />
          </a>
        </>
      ) : (
        <>
          <MapPin className="h-3.5 w-3.5 text-blue-500" />
          <span className="truncate flex-1">{location}</span>
          {mapsLink && (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0"
              onClick={() => logger.info('Maps link clicked', { location })}
            >
              <MapPin className="h-3 w-3" />
              Map
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPACT VARIANT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compact event card for sidebar preview.
 * Shows minimal info: title, date, and locality badge.
 */
function CompactEventCard({
  event,
  className,
}: {
  event: EventData;
  className?: string;
}) {
  const daysFromNow = calculateDaysFromNow(event.date);
  const isToday = daysFromNow === 0;
  const isTomorrow = daysFromNow === 1;

  logger.debug('Rendering compact EventCard', {
    eventId: event.id.substring(0, 8),
    title: event.title,
    date: event.date,
  });

  return (
    <Link href={`/events?highlight=${event.id}`}>
      <Card
        className={`
          cursor-pointer transition-all hover:shadow-md hover:border-green-300
          dark:hover:border-green-700
          ${isToday ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20' : ''}
          ${className || ''}
        `}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Event title */}
              <h4 className="font-medium text-sm truncate">{event.title}</h4>

              {/* Date and time */}
              <p className="text-xs text-muted-foreground mt-0.5">
                {isToday ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Today
                  </span>
                ) : isTomorrow ? (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    Tomorrow
                  </span>
                ) : (
                  formatEventDate(event.date, { short: true })
                )}
                {event.event_time && (
                  <span className="ml-1">at {formatTime12h(event.event_time)}</span>
                )}
              </p>
            </div>

            {/* Locality badge and chevron */}
            <div className="flex items-center gap-1 shrink-0">
              <LocalityBadge locality={getLocality(event)} />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event Card Component
 *
 * Displays event information in a friendly, scannable card format.
 * Supports full and compact variants for different contexts.
 *
 * The card includes:
 * - Event title and description
 * - Date/time with relative indicator
 * - Location with map/video link
 * - Locality badge (Local/Out of Town/Virtual)
 * - Add to Calendar action
 * - Link to source email
 *
 * @example
 * ```tsx
 * // Full card with all features
 * <EventCard
 *   event={eventData}
 *   onAcknowledge={handleAcknowledge}
 *   showSourceEmail
 * />
 *
 * // Compact card for sidebar
 * <EventCard event={eventData} variant="compact" />
 * ```
 */
export function EventCard({
  event,
  variant = 'default',
  onAcknowledge,
  onAddToCalendar,
  showSourceEmail = true,
  className,
}: EventCardProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Compact variant - delegate to specialized component
  // ─────────────────────────────────────────────────────────────────────────────

  if (variant === 'compact') {
    return <CompactEventCard event={event} className={className} />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Full variant - rich event card
  // ─────────────────────────────────────────────────────────────────────────────

  logger.debug('Rendering full EventCard', {
    eventId: event.id.substring(0, 8),
    title: event.title,
    date: event.date,
    hasSourceEmail: !!event.emails,
  });

  const daysFromNow = calculateDaysFromNow(event.date);
  const isToday = daysFromNow === 0;
  const isPast = daysFromNow < 0;

  // Generate Google Calendar link
  const calendarLink = generateGoogleCalendarLink({
    title: event.title,
    startDate: event.date,
    startTime: event.event_time || undefined,
    description: event.description || undefined,
  });

  /**
   * Handle Add to Calendar click.
   * Opens Google Calendar in new tab and triggers optional callback.
   */
  const handleAddToCalendar = () => {
    logger.info('Add to Calendar clicked', {
      eventId: event.id.substring(0, 8),
      title: event.title,
    });

    window.open(calendarLink, '_blank', 'noopener,noreferrer');

    if (onAddToCalendar) {
      onAddToCalendar(event);
    }
  };

  /**
   * Handle Done/Acknowledge click.
   */
  const handleAcknowledge = () => {
    if (onAcknowledge) {
      logger.info('Event acknowledged', {
        eventId: event.id.substring(0, 8),
        title: event.title,
      });
      onAcknowledge(event.id);
    }
  };

  return (
    <Card
      className={`
        transition-all
        ${isToday ? 'border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-950/10' : ''}
        ${isPast ? 'opacity-60' : ''}
        ${event.is_acknowledged ? 'opacity-50' : ''}
        ${className || ''}
      `}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Header: Title and badges */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3
                className={`
                  font-semibold text-base leading-tight
                  ${event.is_acknowledged ? 'line-through text-muted-foreground' : ''}
                `}
              >
                {event.title}
              </h3>

              {/* Description if available */}
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>

            {/* Today indicator */}
            {isToday && !isPast && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0 shrink-0">
                Today
              </Badge>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Date, Time, and Locality */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <DateTimeDisplay
              date={event.date}
              time={event.event_time}
              showRelative={!isToday}
            />
            <LocalityBadge locality={getLocality(event)} />
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Location (from event_metadata) */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {getEventMetadata(event)?.location && (
            <LocationDisplay location={getEventMetadata(event)!.location!} />
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* RSVP and Cost Info (from event_metadata) */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {(() => {
            const meta = getEventMetadata(event);
            if (!meta) return null;

            const showRsvp = meta.rsvpRequired || meta.rsvpDeadline || meta.rsvpUrl;
            const showCost = meta.cost;

            if (!showRsvp && !showCost) return null;

            return (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {/* Cost badge */}
                {showCost && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      meta.cost?.toLowerCase() === 'free'
                        ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300'
                        : 'border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-300'
                    }`}
                  >
                    {meta.cost}
                  </Badge>
                )}

                {/* RSVP indicator */}
                {meta.rsvpRequired && (
                  <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                    RSVP Required
                  </Badge>
                )}

                {/* RSVP deadline */}
                {meta.rsvpDeadline && (
                  <span className="text-xs text-muted-foreground">
                    RSVP by {formatEventDate(meta.rsvpDeadline, { short: true })}
                  </span>
                )}

                {/* RSVP link */}
                {meta.rsvpUrl && (
                  <a
                    href={meta.rsvpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    onClick={() => logger.info('RSVP link clicked', { eventId: event.id.substring(0, 8) })}
                  >
                    Register
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            );
          })()}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Source email info */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {showSourceEmail && event.emails && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">
                From: {event.emails.sender_name || event.emails.sender_email}
              </span>
              {event.email_id && (
                <Link
                  href={`/inbox?email=${event.email_id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                >
                  View email
                </Link>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Actions */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {/* Add to Calendar */}
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 h-8"
                onClick={handleAddToCalendar}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Add to Calendar
              </Button>

              {/* Mark as Done (if not already) */}
              {!event.is_acknowledged && onAcknowledge && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={handleAcknowledge}
                >
                  <Check className="h-3.5 w-3.5" />
                  Done
                </Button>
              )}
            </div>

            {/* VIP indicator from contact */}
            {event.contacts?.is_vip && (
              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                VIP Contact
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EventCard;
