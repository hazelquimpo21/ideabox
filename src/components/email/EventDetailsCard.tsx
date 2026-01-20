/**
 * Event Details Card Component
 *
 * Displays rich event information extracted from emails.
 * Shows event date, time, location, RSVP info, and provides
 * actionable buttons like "Add to Calendar" and "RSVP".
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Event title with date/time display
 * - Location type indicator (in-person, virtual, hybrid)
 * - Interactive location (map link or video link)
 * - RSVP deadline with urgency indicator
 * - Add to Google Calendar button
 * - RSVP button if URL available
 * - Cost and organizer info
 *
 * @module components/email/EventDetailsCard
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Building2,
  ExternalLink,
  CalendarPlus,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import {
  generateGoogleCalendarLink,
  formatEventDisplay,
  formatEventDate,
  calculateDaysFromNow,
  getDeadlineUrgency,
  formatTime12h,
} from '@/lib/utils/calendar';
import type { EventDetectionResult } from '@/hooks/useEmailAnalysis';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EventDetailsCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EventDetailsCardProps {
  /** Event detection data from AI analysis */
  event: EventDetectionResult;
  /** Optional email subject for calendar description */
  emailSubject?: string;
  /** Optional additional description for calendar event */
  description?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Location type badge with icon.
 */
function LocationTypeBadge({ type }: { type: EventDetectionResult['locationType'] }) {
  const config = {
    in_person: {
      icon: Building2,
      label: 'In-Person',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    virtual: {
      icon: Video,
      label: 'Virtual',
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    },
    hybrid: {
      icon: Users,
      label: 'Hybrid',
      className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    },
    unknown: {
      icon: HelpCircle,
      label: 'TBD',
      className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
  };

  const { icon: Icon, label, className } = config[type];

  return (
    <Badge variant="outline" className={`gap-1 border-0 ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Cost badge display.
 */
function CostBadge({ cost }: { cost: string }) {
  const isFree = cost.toLowerCase().includes('free');

  return (
    <Badge
      variant="outline"
      className={`gap-1 ${
        isFree
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0'
      }`}
    >
      <DollarSign className="h-3 w-3" />
      {cost}
    </Badge>
  );
}

/**
 * RSVP deadline display with urgency indicator.
 */
function RsvpDeadline({ deadline }: { deadline: string }) {
  const daysUntil = calculateDaysFromNow(deadline);
  const urgency = getDeadlineUrgency(daysUntil);
  const formattedDate = formatEventDate(deadline, { short: true });

  return (
    <div className={`flex items-center gap-2 text-sm ${urgency.color}`}>
      {urgency.level === 'past' ? (
        <AlertTriangle className="h-4 w-4" />
      ) : urgency.level === 'critical' ? (
        <AlertTriangle className="h-4 w-4 animate-pulse" />
      ) : (
        <Clock className="h-4 w-4" />
      )}
      <span>
        {urgency.level === 'past' ? (
          <span className="font-medium">Registration closed ({formattedDate})</span>
        ) : daysUntil === 0 ? (
          <span className="font-medium">RSVP today!</span>
        ) : daysUntil === 1 ? (
          <span className="font-medium">RSVP by tomorrow</span>
        ) : (
          <>
            RSVP by {formattedDate}{' '}
            <span className="font-medium">({daysUntil} days left)</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Location display with optional map/video link.
 */
function LocationDisplay({ location, locationType }: { location: string; locationType: string }) {
  const isVideoLink =
    location.includes('zoom') ||
    location.includes('meet.google') ||
    location.includes('teams.microsoft') ||
    location.includes('webex');

  // Generate Google Maps link for physical addresses
  const mapsLink = !isVideoLink ? `https://maps.google.com/?q=${encodeURIComponent(location)}` : null;

  return (
    <div className="flex items-start gap-2">
      {isVideoLink ? (
        <Video className="h-4 w-4 mt-0.5 text-purple-500 shrink-0" />
      ) : (
        <MapPin className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {isVideoLink ? (
          <a
            href={location}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            onClick={() => logger.info('Video meeting link clicked', { locationType })}
          >
            Join Meeting
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground truncate">{location}</span>
            {mapsLink && (
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0"
                onClick={() => logger.info('Maps link clicked', { location })}
              >
                <MapPin className="h-3 w-3" />
                Map
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event Details Card
 *
 * Displays comprehensive event information with actionable buttons.
 * Designed for use in email detail sidebar.
 */
export function EventDetailsCard({
  event,
  emailSubject,
  description,
  compact = false,
}: EventDetailsCardProps) {
  logger.debug('Rendering EventDetailsCard', {
    eventTitle: event.eventTitle,
    eventDate: event.eventDate,
    compact,
  });

  // Don't render if no valid event data
  if (!event.hasEvent || !event.eventDate) {
    logger.warn('EventDetailsCard rendered with invalid event data', {
      hasEvent: event.hasEvent,
      hasDate: !!event.eventDate,
    });
    return null;
  }

  // Format event display data
  const displayData = formatEventDisplay(event.eventDate, event.eventTime, event.eventEndTime);
  const eventDaysAway = calculateDaysFromNow(event.eventDate);

  // Generate Google Calendar link
  const calendarLink = generateGoogleCalendarLink({
    title: event.eventTitle,
    startDate: event.eventDate,
    startTime: event.eventTime,
    endTime: event.eventEndTime,
    location: event.location,
    description: description || emailSubject || event.additionalDetails,
  });

  // Handle calendar button click
  const handleAddToCalendar = () => {
    logger.info('Add to Calendar clicked', {
      eventTitle: event.eventTitle,
      eventDate: event.eventDate,
    });
    window.open(calendarLink, '_blank', 'noopener,noreferrer');
  };

  // Handle RSVP button click
  const handleRsvp = () => {
    if (event.rsvpUrl) {
      logger.info('RSVP clicked', {
        eventTitle: event.eventTitle,
        rsvpUrl: event.rsvpUrl.substring(0, 50),
      });
      window.open(event.rsvpUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Compact Mode (for email list preview)
  // ─────────────────────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 mt-1.5">
        <Calendar className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
        <span className="font-medium">
          {formatEventDate(event.eventDate, { short: true })}
        </span>
        {event.eventTime && (
          <>
            <span className="text-muted-foreground">•</span>
            <span>{formatTime12h(event.eventTime)}</span>
          </>
        )}
        <LocationTypeBadge type={event.locationType} />
        {event.registrationDeadline && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className={getDeadlineUrgency(calculateDaysFromNow(event.registrationDeadline)).color}>
              RSVP {calculateDaysFromNow(event.registrationDeadline)}d
            </span>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Full Card Mode (for email detail view)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Card className="mx-6 my-4 border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-950/10">
      <CardHeader className="py-3 border-b border-green-200 dark:border-green-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <Calendar className="h-4 w-4" />
            Event Details
          </div>
          <div className="flex items-center gap-2">
            <LocationTypeBadge type={event.locationType} />
            {event.cost && <CostBadge cost={event.cost} />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Event Title */}
        <div>
          <h3 className="font-semibold text-lg leading-tight">{event.eventTitle}</h3>
          {event.organizer && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Hosted by {event.organizer}
            </p>
          )}
        </div>

        {/* Date & Time */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
            <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-medium">{displayData.dateDisplay}</p>
            {displayData.timeDisplay && (
              <p className="text-sm text-muted-foreground">{displayData.timeDisplay}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {eventDaysAway === 0 ? (
                <span className="text-green-600 dark:text-green-400 font-medium">Happening today!</span>
              ) : eventDaysAway > 0 ? (
                displayData.relativeDate
              ) : (
                <span className="text-muted-foreground">{displayData.relativeDate}</span>
              )}
            </p>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <LocationDisplay location={event.location} locationType={event.locationType} />
        )}

        {/* RSVP Deadline */}
        {event.registrationDeadline && (
          <div className="p-3 rounded-lg bg-muted/50">
            <RsvpDeadline deadline={event.registrationDeadline} />
          </div>
        )}

        {/* Additional Details */}
        {event.additionalDetails && (
          <div className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
            {event.additionalDetails}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="default"
            size="sm"
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={handleAddToCalendar}
          >
            <CalendarPlus className="h-4 w-4" />
            Add to Calendar
          </Button>

          {event.rsvpUrl && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleRsvp}>
              <CheckCircle2 className="h-4 w-4" />
              RSVP
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Confidence indicator (subtle) */}
        {event.confidence < 0.7 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            Some details may need verification ({Math.round(event.confidence * 100)}% confident)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default EventDetailsCard;
