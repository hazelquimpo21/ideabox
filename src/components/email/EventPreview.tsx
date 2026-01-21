/**
 * Event Preview Component
 *
 * Compact event info display for email list items.
 * Shows event date, time, location type, and RSVP deadline at a glance.
 *
 * @module components/email/EventPreview
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import {
  Calendar,
  Clock,
  Video,
  Building2,
  Users,
  HelpCircle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import {
  formatEventDate,
  formatTime12h,
  calculateDaysFromNow,
  getDeadlineUrgency,
} from '@/lib/utils/calendar';
import type { EventPreviewData } from '@/hooks';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EventPreview');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EventPreviewProps {
  /** Event preview data */
  event: EventPreviewData;
  /** Additional CSS class names */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets location type icon and label.
 */
function getLocationTypeConfig(type: EventPreviewData['locationType']) {
  switch (type) {
    case 'in_person':
      return {
        icon: Building2,
        label: 'In-person',
        className: 'text-blue-600 dark:text-blue-400',
      };
    case 'virtual':
      return {
        icon: Video,
        label: 'Virtual',
        className: 'text-purple-600 dark:text-purple-400',
      };
    case 'hybrid':
      return {
        icon: Users,
        label: 'Hybrid',
        className: 'text-teal-600 dark:text-teal-400',
      };
    default:
      return {
        icon: HelpCircle,
        label: 'TBD',
        className: 'text-muted-foreground',
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compact event preview for email list items.
 *
 * Shows key event info at a glance:
 * - Event date and time
 * - Location type (in-person, virtual, hybrid)
 * - RSVP deadline with urgency indicator
 * - Cost (if not free)
 */
export function EventPreview({ event, className = '' }: EventPreviewProps) {
  // Don't render if no event date
  if (!event.eventDate) {
    logger.warn('EventPreview rendered without eventDate');
    return null;
  }

  const locationConfig = getLocationTypeConfig(event.locationType);
  const LocationIcon = locationConfig.icon;

  // Calculate days until event
  const daysUntilEvent = calculateDaysFromNow(event.eventDate);

  // Calculate RSVP urgency if deadline exists
  let rsvpUrgency: ReturnType<typeof getDeadlineUrgency> | null = null;
  let daysUntilRsvp: number | null = null;
  if (event.registrationDeadline) {
    daysUntilRsvp = calculateDaysFromNow(event.registrationDeadline);
    rsvpUrgency = getDeadlineUrgency(daysUntilRsvp);
  }

  // If we have an AI-generated summary, show it prominently
  if (event.eventSummary) {
    return (
      <div
        className={`text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-md px-2.5 py-1.5 mt-2 ${className}`}
      >
        <div className="flex items-start gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <span className="text-green-800 dark:text-green-300 leading-relaxed">
            {event.eventSummary}
          </span>
        </div>
      </div>
    );
  }

  // Fallback to structured display if no summary available
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-md px-2.5 py-1.5 mt-2 ${className}`}
    >
      {/* Event Date & Time */}
      <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
        <Calendar className="h-3.5 w-3.5" />
        <span className="font-medium">
          {formatEventDate(event.eventDate, { short: true, includeYear: false })}
        </span>
        {event.eventTime && (
          <>
            <span className="text-green-500 dark:text-green-600">•</span>
            <span>{formatTime12h(event.eventTime)}</span>
          </>
        )}
        {daysUntilEvent === 0 && (
          <span className="text-green-600 dark:text-green-400 font-semibold ml-1">
            Today!
          </span>
        )}
        {daysUntilEvent === 1 && (
          <span className="text-green-600 dark:text-green-400 font-medium ml-1">
            Tomorrow
          </span>
        )}
      </div>

      {/* Location Type */}
      <div className={`flex items-center gap-1 ${locationConfig.className}`}>
        <LocationIcon className="h-3.5 w-3.5" />
        <span>{locationConfig.label}</span>
      </div>

      {/* RSVP Deadline */}
      {rsvpUrgency && daysUntilRsvp !== null && (
        <div className={`flex items-center gap-1 ${rsvpUrgency.color}`}>
          <Clock className="h-3.5 w-3.5" />
          <span>
            {rsvpUrgency.level === 'past' ? (
              'RSVP closed'
            ) : rsvpUrgency.level === 'critical' ? (
              <span className="font-semibold">RSVP today!</span>
            ) : rsvpUrgency.level === 'urgent' ? (
              <span className="font-medium">RSVP in {daysUntilRsvp}d</span>
            ) : (
              `RSVP ${daysUntilRsvp}d`
            )}
          </span>
        </div>
      )}

      {/* Cost (only if not free) */}
      {event.cost && !event.cost.toLowerCase().includes('free') && (
        <div className="text-amber-600 dark:text-amber-400 font-medium">
          {event.cost}
        </div>
      )}

      {/* Free indicator */}
      {event.cost?.toLowerCase().includes('free') && (
        <div className="text-green-600 dark:text-green-400 font-medium">
          Free
        </div>
      )}
    </div>
  );
}

export default EventPreview;
