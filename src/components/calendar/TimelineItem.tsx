/**
 * TimelineItem — individual timeline entry with inline expansion.
 * Implements §6b and §6d (birthday delight) from VIEW_REDESIGN_PLAN.md.
 *
 * Collapsed: vertical line + colored dot (circle/diamond) + time + title.
 * Expanded: inline card with location, RSVP badge, summary, action buttons.
 * Birthday items get confetti-pop animation on first mount.
 *
 * Wrapped in React.memo since it renders in lists with stable props.
 *
 * @module components/calendar/TimelineItem
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { getEventTypeConfig } from '@/lib/utils/event-colors';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui';
import { Cake, MapPin, Star, Sparkles } from 'lucide-react';
import { RsvpBadge } from './RsvpBadge';
import { EventActions } from './EventActions';
import { DateItemExpanded } from './DateItemExpanded';
import { EmailPreviewModal } from '@/components/events/EmailPreviewModal';
import { RelatedItems } from '@/components/shared/RelatedItems';
import type { CalendarItem } from './types';

/** Date types that use the slim DateItemExpanded card instead of full event details. */
const NON_EVENT_TYPES = new Set([
  'deadline', 'payment_due', 'expiration', 'follow_up', 'reminder', 'recurring', 'other',
]);

/**
 * Formats a short day label for timeline items (e.g., "Wed 12" or "Mar 18").
 * Items in "Today"/"Tomorrow" groups don't need this since the header says it.
 */
function formatShortDate(date: Date): string {
  const now = new Date();
  const sameMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  if (sameMonth) {
    // Same month: show weekday + day number, e.g. "Wed 12"
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }
  // Different month: show month + day, e.g. "Apr 5"
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TimelineItemProps {
  item: CalendarItem;
  isExpanded: boolean;
  /** Whether to show the date alongside time (for groups like "This Week", "Later") */
  showDate?: boolean;
  onToggle: () => void;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
}

/**
 * Renders the dot shape (circle or diamond) for the timeline.
 * Diamonds are rotated 45deg squares.
 */
function TimelineDot({ type }: { type: string }) {
  const config = getEventTypeConfig(type);
  if (config.shape === 'diamond') {
    return (
      <div
        className={cn('h-2.5 w-2.5 rotate-45', config.dot)}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className={cn('h-2.5 w-2.5 rounded-full', config.dot)}
      aria-hidden="true"
    />
  );
}

const TimelineItemInner = React.memo(function TimelineItemInner({
  item,
  isExpanded,
  showDate = false,
  onToggle,
  onDismiss,
  onSaveToCalendar,
  onSnooze,
}: TimelineItemProps) {
  const config = getEventTypeConfig(item.eventType);
  const Icon = config.icon;

  // Guard: confetti-pop only on first mount for birthdays
  const hasMounted = React.useRef(false);
  const showConfetti = item.isBirthday && !hasMounted.current;
  React.useEffect(() => { hasMounted.current = true; }, []);

  // Lazy expansion: don't mount expanded content until first opened
  const hasExpanded = React.useRef(false);
  if (isExpanded) hasExpanded.current = true;

  // Email preview modal state
  const [showEmailModal, setShowEmailModal] = React.useState(false);

  const handleViewEmail = React.useCallback((emailId: string) => {
    setShowEmailModal(true);
  }, []);

  const tooltipContent = (
    <div className="text-xs space-y-0.5">
      <p>Source: {item.source === 'google_calendar' ? 'Google Calendar' : 'Email'}</p>
      {item.sourceEmailSender && <p>From: {item.sourceEmailSender}</p>}
    </div>
  );

  // Format the date + time display
  const dateLabel = showDate ? formatShortDate(item.date) : null;

  return (
    <div
      id={`item-${item.id}`}
      className="relative pl-8"
    >
      {/* Vertical line */}
      <div
        className="absolute left-[11px] top-0 bottom-0 w-px bg-border"
        aria-hidden="true"
      />

      {/* Dot — positioned on the vertical line */}
      <div className="absolute left-[5px] top-3 flex items-center justify-center">
        <TimelineDot type={item.eventType} />
      </div>

      {/* Collapsed row */}
      <Tooltip variant="info" content={tooltipContent}>
        <button
          onClick={onToggle}
          className={cn(
            'w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-md transition-colors',
            'hover:bg-muted/60',
            isExpanded && 'bg-muted/40',
            showConfetti && 'animate-confetti-pop'
          )}
        >
          {/* Date + Time column */}
          <div className="shrink-0 tabular-nums text-right" style={{ width: showDate ? '5.5rem' : '4rem' }}>
            {dateLabel && (
              <span className="text-xs font-medium text-foreground/80 block leading-tight">
                {dateLabel}
              </span>
            )}
            <span className="text-xs text-muted-foreground leading-tight">
              {item.time || 'All day'}
            </span>
          </div>

          {/* Title + subtitle */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {item.isBirthday && (
                <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" />
              )}
              <span className={cn(
                'text-sm font-medium truncate',
                item.isAcknowledged && 'line-through opacity-50'
              )}>
                {item.title}
              </span>
            </div>
            {(item.location || item.sourceEmailSender) && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {item.location || item.sourceEmailSender}
              </p>
            )}
          </div>

          {/* Event type badge */}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 shrink-0 border-0 hidden sm:inline-flex',
              config.bg,
              config.text,
            )}
          >
            {config.label}
          </Badge>

          {/* RSVP badge (inline) */}
          {item.rsvpRequired && item.rsvpDeadline && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <RsvpBadge rsvpDeadline={item.rsvpDeadline} rsvpUrl={item.rsvpUrl} />
            </div>
          )}

          {/* Type icon */}
          <Icon className={cn('h-4 w-4 shrink-0', config.text)} />
        </button>
      </Tooltip>

      {/* Expanded content — lazy mounted, CSS grid height animation */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {hasExpanded.current && (
            NON_EVENT_TYPES.has(item.eventType) ? (
              <DateItemExpanded
                item={item}
                onDismiss={onDismiss}
                onSaveToCalendar={onSaveToCalendar}
                onSnooze={onSnooze}
              />
            ) : (
              <div className="px-3 pb-4 pt-1 space-y-3">
                {/* Location */}
                {item.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.location}</span>
                    {item.locationType && (
                      <span className="text-xs capitalize bg-muted px-1.5 py-0.5 rounded">
                        {item.locationType.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                )}

                {/* RSVP badge (expanded) */}
                {item.rsvpRequired && item.rsvpDeadline && (
                  <RsvpBadge rsvpDeadline={item.rsvpDeadline} rsvpUrl={item.rsvpUrl} />
                )}

                {/* Why attend recommendation */}
                {item.whyAttend && (
                  <div className="flex items-start gap-1.5">
                    <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {item.whyAttend}
                    </p>
                  </div>
                )}

                {/* Summary */}
                {item.summary && (
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                )}

                {/* Key points */}
                {item.keyPoints && item.keyPoints.length > 0 && (
                  <ul className="space-y-1">
                    {item.keyPoints.map((point, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-blue-500/60" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Birthday details */}
                {item.isBirthday && item.birthdayAge && item.birthdayYearKnown && (
                  <p className="text-xs text-pink-600 dark:text-pink-400">
                    Turning {item.birthdayAge}
                    {item.birthdayRelationship && ` — ${item.birthdayRelationship}`}
                  </p>
                )}

                {/* Actions */}
                <EventActions
                  item={item}
                  onDismiss={onDismiss}
                  onSaveToCalendar={onSaveToCalendar}
                  onSnooze={onSnooze}
                  onViewEmail={handleViewEmail}
                />

                {/* Related items — cross-entity navigation */}
                {item.sourceEmailId && (
                  <RelatedItems emailId={item.sourceEmailId} />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Email Preview Modal — opens inline instead of navigating away */}
      <EmailPreviewModal
        emailId={item.sourceEmailId ?? null}
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title="Original Email"
      />
    </div>
  );
});

export { TimelineItemInner as TimelineItem };
