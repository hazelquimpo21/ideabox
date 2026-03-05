/**
 * CalendarDayCell — individual day cell for the month grid with heat map.
 * Implements §6c from VIEW_REDESIGN_PLAN.md.
 *
 * Shows heat map intensity (0→transparent, 1-2→light, 3-4→medium, 5+→strong),
 * up to 3 colored type dots, today ring, and tooltip with count breakdown.
 *
 * Wrapped in React.memo since it renders 35-42 times in the grid.
 *
 * @module components/calendar/CalendarDayCell
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { getEventTypeConfig } from '@/lib/utils/event-colors';
import type { CalendarItem } from './types';

interface CalendarDayCellProps {
  date: Date;
  items: CalendarItem[];
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}

/** Heat map background by item count. */
function getHeatMapBg(count: number): string {
  if (count === 0) return 'bg-transparent';
  if (count <= 2) return 'bg-blue-50 dark:bg-blue-950/20';
  if (count <= 4) return 'bg-blue-100 dark:bg-blue-950/40';
  return 'bg-blue-200 dark:bg-blue-900/50';
}

/** Builds tooltip text: "2 events, 1 deadline, 1 birthday" */
function buildTooltipText(items: CalendarItem[]): string {
  if (items.length === 0) return 'No items';
  const counts: Record<string, number> = {};
  for (const item of items) {
    const config = getEventTypeConfig(item.eventType);
    const label = config.label.toLowerCase();
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');
}

const CalendarDayCellInner = React.memo(function CalendarDayCellInner({
  date,
  items,
  isToday,
  isSelected,
  isCurrentMonth,
  onClick,
}: CalendarDayCellProps) {
  const tooltipText = buildTooltipText(items);

  // Up to 3 type dots
  const dotItems = items.slice(0, 3);

  return (
    <Tooltip variant="info" content={tooltipText}>
      <button
        onClick={onClick}
        className={cn(
          'relative h-16 sm:h-20 p-1 rounded-md border transition-colors text-left',
          getHeatMapBg(items.length),
          isCurrentMonth
            ? 'hover:bg-accent'
            : 'opacity-30',
          isSelected && 'bg-accent',
          isToday && 'ring-2 ring-primary',
        )}
      >
        {/* Day number */}
        <span
          className={cn(
            'text-sm',
            isToday && 'font-bold text-primary'
          )}
        >
          {date.getDate()}
        </span>

        {/* Type dots */}
        {dotItems.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex gap-0.5">
            {dotItems.map((item, i) => {
              const config = getEventTypeConfig(item.eventType);
              return config.shape === 'diamond' ? (
                <div
                  key={i}
                  className={cn('h-1.5 w-1.5 rotate-45', config.dot)}
                />
              ) : (
                <div
                  key={i}
                  className={cn('h-1.5 w-1.5 rounded-full', config.dot)}
                />
              );
            })}
            {items.length > 3 && (
              <span className="text-[10px] text-muted-foreground leading-none">
                +{items.length - 3}
              </span>
            )}
          </div>
        )}
      </button>
    </Tooltip>
  );
});

export { CalendarDayCellInner as CalendarDayCell };
