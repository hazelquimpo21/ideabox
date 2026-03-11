/**
 * Triage Event Card
 *
 * Renders an event needing RSVP in the triage list.
 * Follows the same structure as TriageActionCard with a purple Calendar icon
 * and "Add to calendar" as the primary action.
 *
 * @module components/projects/TriageEventCard
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Calendar,
  Mail,
  Clock,
  MapPin,
  CalendarPlus,
  ListTodo,
  X,
  AlarmClock,
} from 'lucide-react';
import { RsvpBadge } from '@/components/calendar/RsvpBadge';
import { createLogger } from '@/lib/utils/logger';
import type { TriageItem } from '@/hooks/useTriageItems';

const logger = createLogger('TriageEventCard');

/**
 * Format an event date for display.
 */
function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface TriageEventCardProps {
  item: TriageItem;
  onAccept: (item: TriageItem) => void;
  onDismiss: (item: TriageItem) => void;
  onSnooze: (item: TriageItem) => void;
}

export function TriageEventCard({ item, onAccept, onDismiss, onSnooze }: TriageEventCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const location = (item.raw as Record<string, unknown>)?.location as string | undefined;
  const rsvpDeadline = (item.raw as Record<string, unknown>)?.rsvpDeadline as string | undefined;
  const rsvpUrl = (item.raw as Record<string, unknown>)?.rsvpUrl as string | undefined;

  const handleDismiss = React.useCallback(() => {
    logger.info('Event dismissed', { itemId: item.id });
    setDismissed(true);
    setTimeout(() => onDismiss(item), 300);
  }, [item, onDismiss]);

  const handleSnooze = React.useCallback(() => {
    logger.info('Event snoozed', { itemId: item.id });
    onSnooze(item);
  }, [item, onSnooze]);

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
        <Calendar className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.title}</span>
        </div>

        {location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {location}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {item.deadline && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60">
              <Clock className="h-3 w-3" />
              {formatEventDate(item.deadline)}
            </span>
          )}

          {rsvpDeadline && (
            <RsvpBadge rsvpDeadline={rsvpDeadline} rsvpUrl={rsvpUrl} />
          )}

          {item.sourceEmailId && (
            <Link
              href={`/inbox?email=${item.sourceEmailId}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.sourceEmailSubject || item.sourceEmailSender || 'Source email'}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Link href="/calendar">
          <Button variant="default" size="sm" className="h-7 px-2.5 text-xs shadow-sm">
            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
            Add to calendar
          </Button>
        </Link>
        <button
          onClick={() => onAccept(item)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          title="Create task"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleSnooze}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          title="Snooze"
        >
          <AlarmClock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDismiss}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
