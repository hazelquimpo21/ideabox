/**
 * TimelineGroup — sticky date group header for the timeline view.
 * Implements §6b from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a label (TODAY, TOMORROW, etc.), item count badge, and a full-width
 * horizontal rule. Overdue groups get a red background strip.
 *
 * @module components/calendar/TimelineGroup
 */

import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui';

interface TimelineGroupProps {
  label: string;
  count: number;
  isOverdue?: boolean;
}

export function TimelineGroup({ label, count, isOverdue }: TimelineGroupProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center justify-between px-3 py-2 -mx-1',
        isOverdue
          ? 'bg-red-50 dark:bg-red-950/30'
          : 'bg-background'
      )}
    >
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
      <Badge
        variant={isOverdue ? 'destructive' : 'secondary'}
        className="text-[10px] px-1.5 py-0"
      >
        {count}
      </Badge>
    </div>
  );
}
