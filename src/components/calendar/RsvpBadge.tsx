/**
 * RsvpBadge — RSVP countdown indicator with urgency levels.
 * Implements §6e from VIEW_REDESIGN_PLAN.md.
 *
 * Shows 4 urgency states based on time remaining:
 * - >48h: muted "RSVP by [date]"
 * - 24-48h: amber "RSVP by tomorrow"
 * - <24h: red pulsing "RSVP today!"
 * - Past: red strikethrough "RSVP closed"
 *
 * @module components/calendar/RsvpBadge
 */

'use client';

import { Tooltip } from '@/components/ui/tooltip';

interface RsvpBadgeProps {
  rsvpDeadline: string | Date;
  rsvpUrl?: string;
}

export function RsvpBadge({ rsvpDeadline, rsvpUrl }: RsvpBadgeProps) {
  const deadline = typeof rsvpDeadline === 'string'
    ? new Date(rsvpDeadline)
    : rsvpDeadline;
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  let text: string;
  let className: string;
  let tooltipText: string;

  if (hoursRemaining < 0) {
    // Past deadline
    const dateStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    text = `RSVP closed ${dateStr}`;
    className = 'text-red-500 line-through text-xs';
    tooltipText = 'The RSVP deadline has passed.';
  } else if (hoursRemaining < 24) {
    text = 'RSVP today!';
    className = 'text-red-600 dark:text-red-400 font-semibold text-xs animate-pulse-once';
    tooltipText = `RSVP deadline is in ${Math.round(hoursRemaining)} hours — respond soon!`;
  } else if (hoursRemaining < 48) {
    text = 'RSVP by tomorrow';
    className = 'text-amber-600 dark:text-amber-400 font-medium text-xs';
    tooltipText = `RSVP deadline is in ${Math.round(hoursRemaining)} hours.`;
  } else {
    const dateStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    text = `RSVP by ${dateStr}`;
    className = 'text-muted-foreground text-xs';
    tooltipText = `You have ${Math.round(hoursRemaining / 24)} days to RSVP.`;
  }

  const content = rsvpUrl ? (
    <a
      href={rsvpUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} underline decoration-dotted hover:decoration-solid`}
    >
      {text}
    </a>
  ) : (
    <span className={className}>{text}</span>
  );

  return (
    <Tooltip variant="info" content={tooltipText}>
      {content}
    </Tooltip>
  );
}
