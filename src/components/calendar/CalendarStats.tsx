/**
 * CalendarStats — smart stats banner with 3 StatCard components.
 * Implements §6a from VIEW_REDESIGN_PLAN.md (Phase 3 redesign).
 *
 * Shows Today (with next-up subtitle), This Week (with busiest day),
 * and Overdue (with oldest item) as animated stat cards.
 *
 * @module components/calendar/CalendarStats
 * @since February 2026 — Phase 2, refactored March 2026 — Phase 3
 */

'use client';

import * as React from 'react';
import { StatCard } from '@/components/shared/StatCard';
import { createLogger } from '@/lib/utils/logger';
import type { CalendarItem } from './types';

const logger = createLogger('CalendarStats');

export interface CalendarStatsProps {
  items: CalendarItem[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarStats({ items }: CalendarStatsProps) {
  const stats = React.useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // End of this week (upcoming Sunday)
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const todayItems: CalendarItem[] = [];
    const weekItems: CalendarItem[] = [];
    const overdueItems: CalendarItem[] = [];

    for (const item of items) {
      const d = item.dateString;
      if (d < todayStr && !item.isAcknowledged) {
        overdueItems.push(item);
      }
      if (d === todayStr) {
        todayItems.push(item);
      }
      if (d >= todayStr && d <= endOfWeekStr) {
        weekItems.push(item);
      }
    }

    // Today subtitle: find next upcoming item by time
    let todaySubtitle = 'All clear';
    if (todayItems.length > 0) {
      const nowTime = now.toTimeString().slice(0, 5);
      const upcoming = todayItems
        .filter((i) => i.time && i.time > nowTime)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if (upcoming.length > 0) {
        todaySubtitle = `Next: ${upcoming[0]!.title.slice(0, 25)}`;
      } else {
        todaySubtitle = `${todayItems.length} item${todayItems.length > 1 ? 's' : ''} today`;
      }
    }

    // Week subtitle: find the day of week with the most items
    let weekSubtitle = '';
    if (weekItems.length > 0) {
      const dayCounts: Record<number, number> = {};
      for (const item of weekItems) {
        const dayOfWeek = item.date.getDay();
        dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + 1;
      }
      let busiestDay = 0;
      let busiestCount = 0;
      for (const [day, count] of Object.entries(dayCounts)) {
        if (count > busiestCount) {
          busiestDay = Number(day);
          busiestCount = count;
        }
      }
      weekSubtitle = `Busiest: ${DAY_NAMES[busiestDay]} (${busiestCount})`;
    }

    // Overdue subtitle: show the oldest overdue item
    let overdueSubtitle = 'None';
    if (overdueItems.length > 0) {
      const oldest = overdueItems.sort(
        (a, b) => a.dateString.localeCompare(b.dateString)
      )[0]!;
      const daysAgo = Math.floor(
        (now.getTime() - oldest.date.getTime()) / (1000 * 60 * 60 * 24)
      );
      const titleSnippet = oldest.title.length > 20
        ? oldest.title.slice(0, 20) + '…'
        : oldest.title;
      overdueSubtitle = `${titleSnippet} (${daysAgo}d ago)`;
    }

    logger.debug('Calendar stats', {
      today: todayItems.length,
      thisWeek: weekItems.length,
      overdue: overdueItems.length,
    });

    return {
      todayCount: todayItems.length,
      todaySubtitle,
      weekCount: weekItems.length,
      weekSubtitle,
      overdueCount: overdueItems.length,
      overdueSubtitle,
    };
  }, [items]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard
        label="Today"
        value={stats.todayCount}
        subtitle={stats.todaySubtitle}
      />
      <StatCard
        label="This Week"
        value={stats.weekCount}
        subtitle={stats.weekSubtitle}
      />
      <StatCard
        label="Overdue"
        value={stats.overdueCount}
        subtitle={stats.overdueSubtitle}
        className={stats.overdueCount > 0 ? 'bg-red-50/80 dark:bg-red-950/20' : undefined}
      />
    </div>
  );
}

export default CalendarStats;
