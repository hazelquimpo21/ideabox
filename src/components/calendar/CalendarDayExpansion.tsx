/**
 * CalendarDayExpansion — expanded day detail row below the calendar grid.
 * Implements §6c accordion expansion from VIEW_REDESIGN_PLAN.md.
 *
 * Shows items for a selected day with time, title, type icon, and action buttons.
 * Smooth CSS grid-template-rows height animation. Close button in top-right.
 *
 * @module components/calendar/CalendarDayExpansion
 */

'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui';
import { getEventTypeConfig } from '@/lib/utils/event-colors';
import { EventActions } from './EventActions';
import type { CalendarItem } from './types';

interface CalendarDayExpansionProps {
  date: Date;
  items: CalendarItem[];
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onClose: () => void;
}

export function CalendarDayExpansion({
  date,
  items,
  onDismiss,
  onSaveToCalendar,
  onClose,
}: CalendarDayExpansionProps) {
  // Lazy mount guard
  const hasExpanded = React.useRef(false);
  hasExpanded.current = true;

  return (
    <div className="col-span-7 border rounded-lg p-4 bg-card mb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          {format(date, 'EEEE, MMMM d')}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Items or empty */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No events on {format(date, 'EEEE')}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const config = getEventTypeConfig(item.eventType);
            const Icon = config.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 p-2 rounded-md border',
                  item.isAcknowledged && 'opacity-50'
                )}
              >
                {/* Type dot */}
                <div className={cn(
                  'mt-1.5 shrink-0',
                  config.shape === 'diamond' ? 'h-2 w-2 rotate-45' : 'h-2 w-2 rounded-full',
                  config.dot
                )} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-sm font-medium truncate',
                      item.isAcknowledged && 'line-through'
                    )}>
                      {item.title}
                    </span>
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', config.text)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.time || 'All day'}
                    {item.location && ` · ${item.location}`}
                  </p>
                </div>

                {/* Compact actions */}
                <EventActions
                  item={item}
                  onDismiss={onDismiss}
                  onSaveToCalendar={onSaveToCalendar}
                  compact
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
