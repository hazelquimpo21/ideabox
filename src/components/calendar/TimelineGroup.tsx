/**
 * TimelineGroup — sticky date group header for the timeline view.
 * Implements §6b from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a label (TODAY, TOMORROW, etc.), optional date range subtitle,
 * item count badge, and a full-width horizontal rule.
 * Overdue groups get a red background strip.
 *
 * @module components/calendar/TimelineGroup
 */

import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui';

interface TimelineGroupProps {
  label: string;
  count: number;
  isOverdue?: boolean;
  /** Optional date range string, e.g. "Mar 12 – 15" */
  dateRange?: string;
}

export function TimelineGroup({ label, count, isOverdue, dateRange }: TimelineGroupProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center justify-between px-3 py-2 -mx-1',
        isOverdue
          ? 'bg-red-50 dark:bg-red-950/30'
          : 'bg-background'
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            isOverdue
              ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        {dateRange && (
          <span className="text-[11px] text-muted-foreground/70 font-normal">
            {dateRange}
          </span>
        )}
      </div>
      <Badge
        variant={isOverdue ? 'destructive' : 'secondary'}
        className="text-[10px] px-1.5 py-0"
      >
        {count}
      </Badge>
    </div>
  );
}
