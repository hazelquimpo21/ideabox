/**
 * ThisWeekCard — aggregate stats for the week ahead.
 * Implements §4b "The Trifecta Layout" from VIEW_REDESIGN_PLAN.md.
 *
 * Shows 3 stat numbers (events, deadlines, tasks due) and a
 * "busiest day" callout computed from events data.
 *
 * @module components/home/ThisWeekCard
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { StatCard, EmptyState } from '@/components/shared';
import { BarChart3 } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { EventData } from '@/hooks/useEvents';
import type { Action } from '@/types/database';

const logger = createLogger('ThisWeekCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ThisWeekCardProps {
  events: EventData[];
  tasks: Action[];
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getEndOfWeek(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0] ?? '';
}

function getToday(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ThisWeekCard({ events, tasks, isLoading }: ThisWeekCardProps) {
  const router = useRouter();

  // Memoize all week computations in a single pass
  const weekStats = React.useMemo(() => {
    const today = getToday();
    const endOfWeek = getEndOfWeek();

    const weekEvents = events.filter(
      (e) => e.date >= today && e.date <= endOfWeek
    );

    const deadlines = weekEvents.filter((e) => {
      const type = e.event_metadata?.eventType as string | undefined;
      return type === 'deadline' || type === 'expiration';
    });

    const tasksDue = tasks.filter((t) => {
      if (!t.deadline || t.status === 'completed' || t.status === 'cancelled') return false;
      return t.deadline >= today && t.deadline <= endOfWeek;
    });

    // Busiest day: count events per day, find the max
    const dayCounts: Record<string, number> = {};
    for (const event of weekEvents) {
      dayCounts[event.date] = (dayCounts[event.date] || 0) + 1;
    }

    let busiestDay: string | null = null;
    let maxCount = 0;
    for (const [date, count] of Object.entries(dayCounts)) {
      if (count > maxCount) {
        maxCount = count;
        busiestDay = date;
      }
    }

    const busiestDayName = busiestDay
      ? DAY_NAMES[new Date(busiestDay + 'T00:00:00').getDay()]
      : null;

    return {
      eventsCount: weekEvents.length,
      deadlinesCount: deadlines.length,
      tasksDueCount: tasksDue.length,
      busiestDayName,
      busiestDayCount: maxCount,
      // Top items for tooltips
      topEvents: weekEvents.slice(0, 3).map((e) => e.title),
      topDeadlines: deadlines.slice(0, 3).map((e) => e.title),
      topTasks: tasksDue.slice(0, 3).map((t) => t.title),
    };
  }, [events, tasks]);

  React.useEffect(() => {
    if (!isLoading) {
      logger.debug('ThisWeekCard stats computed', {
        events: weekStats.eventsCount,
        deadlines: weekStats.deadlinesCount,
        tasksDue: weekStats.tasksDueCount,
        busiestDay: weekStats.busiestDayName,
      });
    }
  }, [isLoading, weekStats]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty =
    weekStats.eventsCount === 0 &&
    weekStats.deadlinesCount === 0 &&
    weekStats.tasksDueCount === 0;

  const makeTooltip = (items: string[], label: string) => {
    if (items.length === 0) return undefined;
    return (
      <div>
        <p className="font-medium text-xs mb-1">Top {label}:</p>
        <ul className="text-xs space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="truncate">• {item}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          This Week
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            variant="no-events"
            title="Light week ahead."
            className="py-4"
          />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Events"
                value={weekStats.eventsCount}
                tooltipContent={makeTooltip(weekStats.topEvents, 'events')}
                onClick={() => router.push('/calendar')}
              />
              <StatCard
                label="Deadlines"
                value={weekStats.deadlinesCount}
                tooltipContent={makeTooltip(weekStats.topDeadlines, 'deadlines')}
                onClick={() => router.push('/calendar?filter=deadline')}
              />
              <StatCard
                label="Tasks due"
                value={weekStats.tasksDueCount}
                tooltipContent={makeTooltip(weekStats.topTasks, 'tasks')}
                onClick={() => router.push('/tasks')}
              />
            </div>

            {weekStats.busiestDayName && weekStats.busiestDayCount > 1 && (
              <p className="text-xs text-muted-foreground text-center">
                Busiest: <span className="font-medium text-foreground">{weekStats.busiestDayName}</span>{' '}
                ({weekStats.busiestDayCount} events)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ThisWeekCard;
