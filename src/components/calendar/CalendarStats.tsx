/**
 * Calendar Stats Banner Component
 *
 * Displays merged statistics from both Events and Timeline data sources.
 * Shows counts for upcoming events, overdue deadlines, birthdays this month,
 * and other key metrics in a grid layout.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Event stats: from useEvents().stats (total, today, thisWeek, maybe, saved)
 * - Date stats: from useExtractedDates().stats (total, overdue, pending, acknowledged)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <CalendarStats
 *   eventStats={eventStats}
 *   dateStats={dateStats}
 * />
 * ```
 *
 * @module components/calendar/CalendarStats
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import {
  Card,
  CardContent,
} from '@/components/ui';
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  AlertTriangle,
  Clock,
  Check,
  CalendarClock,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { EventStats } from '@/hooks/useEvents';
import type { DateStats } from '@/hooks/useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CalendarStats');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CalendarStatsProps {
  /** Event statistics from useEvents */
  eventStats: EventStats;
  /** Date statistics from useExtractedDates */
  dateStats: DateStats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calendar Stats Banner — merged statistics from events and timeline.
 *
 * Shows key metrics in a responsive grid: total items, today's count,
 * this week, overdue, and pending items.
 */
export function CalendarStats({ eventStats, dateStats }: CalendarStatsProps) {
  logger.debug('Rendering CalendarStats', { eventStats, dateStats });

  const totalItems = eventStats.total + dateStats.total;
  const todayCount = eventStats.today;
  const overdueCount = dateStats.overdue;
  const pendingCount = dateStats.pending;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {/* Total Items */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{totalItems}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Items</p>
        </CardContent>
      </Card>

      {/* Today */}
      <Card className={todayCount > 0 ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' : ''}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className={`h-4 w-4 ${todayCount > 0 ? 'text-green-500' : 'text-muted-foreground'}`} />
            <span className={`text-2xl font-bold ${todayCount > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
              {todayCount}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Today</p>
        </CardContent>
      </Card>

      {/* This Week */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            <span className="text-2xl font-bold">{eventStats.thisWeek}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">This Week</p>
        </CardContent>
      </Card>

      {/* Overdue */}
      <Card className={overdueCount > 0 ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : ''}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {overdueCount}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Overdue</p>
        </CardContent>
      </Card>

      {/* Pending */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <span className="text-2xl font-bold">{pendingCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Pending</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default CalendarStats;
