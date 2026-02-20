/**
 * Today's Schedule Component
 *
 * Displays a compact timeline of today's events and deadlines on the Home page.
 * Shows time, title, and a type icon for each item. Items link to the Calendar
 * page with a highlight parameter for easy navigation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Extracted dates: useExtractedDates() filtered to today/tomorrow
 * - Events: useEvents() filtered to today/tomorrow
 * - Both sources merged and sorted by time
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <TodaySchedule
 *   items={todayItems}
 *   isLoading={false}
 * />
 * ```
 *
 * @module components/home/TodaySchedule
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import {
  Calendar,
  Clock,
  DollarSign,
  Cake,
  AlertTriangle,
  CalendarCheck,
  ArrowRight,
  Bell,
  CalendarClock,
  RefreshCw,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TodaySchedule');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A unified schedule item combining events and extracted dates. */
export interface ScheduleItem {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Time string for display (e.g. "2:30 PM") or null if all-day */
  time: string | null;
  /** Item type for icon selection */
  type: 'event' | 'deadline' | 'birthday' | 'payment_due' | 'appointment' | 'follow_up' | 'reminder' | 'expiration' | 'anniversary' | 'recurring' | 'other';
  /** Whether this item is for tomorrow (vs today) */
  isTomorrow: boolean;
}

export interface TodayScheduleProps {
  /** Schedule items for today and tomorrow */
  items: ScheduleItem[];
  /** Whether data is still loading */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type icon configuration — maps schedule item types to their display icons.
 */
const TYPE_ICONS: Record<ScheduleItem['type'], { icon: React.ElementType; color: string }> = {
  event: { icon: Calendar, color: 'text-green-500' },
  deadline: { icon: Clock, color: 'text-red-500' },
  birthday: { icon: Cake, color: 'text-pink-500' },
  payment_due: { icon: DollarSign, color: 'text-orange-500' },
  appointment: { icon: CalendarCheck, color: 'text-blue-500' },
  follow_up: { icon: ArrowRight, color: 'text-teal-500' },
  reminder: { icon: Bell, color: 'text-indigo-500' },
  expiration: { icon: AlertTriangle, color: 'text-yellow-500' },
  anniversary: { icon: Cake, color: 'text-purple-500' },
  recurring: { icon: RefreshCw, color: 'text-gray-500' },
  other: { icon: CalendarClock, color: 'text-gray-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Today's Schedule — compact timeline of today's events and deadlines.
 *
 * Shows a vertical list of today's items (and optionally tomorrow's)
 * with time, icon, and title. Each item links to `/calendar?highlight=[id]`.
 *
 * Displays an empty state message when there are no items scheduled.
 */
export function TodaySchedule({ items, isLoading }: TodayScheduleProps) {
  logger.debug('Rendering TodaySchedule', { itemCount: items.length, isLoading });

  const todayItems = items.filter((item) => !item.isTomorrow);
  const tomorrowItems = items.filter((item) => item.isTomorrow);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-green-500" />
          Today&apos;s Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // ─── Loading State ────────────────────────────────────────────────
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : todayItems.length === 0 && tomorrowItems.length === 0 ? (
          // ─── Empty State ──────────────────────────────────────────────────
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nothing scheduled today
          </p>
        ) : (
          <div className="space-y-1">
            {/* ─── Today's Items ────────────────────────────────────────────── */}
            {todayItems.map((item) => (
              <ScheduleRow key={item.id} item={item} />
            ))}

            {/* ─── Tomorrow Preview ──────────────────────────────────────────── */}
            {tomorrowItems.length > 0 && (
              <>
                <div className="pt-3 pb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tomorrow
                  </p>
                </div>
                {tomorrowItems.slice(0, 3).map((item) => (
                  <ScheduleRow key={item.id} item={item} />
                ))}
                {tomorrowItems.length > 3 && (
                  <Link
                    href="/calendar"
                    className="block text-xs text-muted-foreground hover:text-foreground pt-1"
                  >
                    +{tomorrowItems.length - 3} more tomorrow
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single row in the schedule timeline.
 * Shows time, type icon, and title. Links to the Calendar page.
 */
function ScheduleRow({ item }: { item: ScheduleItem }) {
  const typeConfig = TYPE_ICONS[item.type] || TYPE_ICONS.other;
  const TypeIcon = typeConfig.icon;

  return (
    <Link
      href={`/calendar?highlight=${item.id}`}
      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
    >
      {/* Time */}
      <span className="text-xs text-muted-foreground w-16 text-right tabular-nums shrink-0">
        {item.time || 'All day'}
      </span>

      {/* Type Icon */}
      <TypeIcon className={`h-4 w-4 shrink-0 ${typeConfig.color}`} />

      {/* Title */}
      <span className="text-sm truncate group-hover:text-foreground">
        {item.title}
      </span>
    </Link>
  );
}

export default TodaySchedule;
