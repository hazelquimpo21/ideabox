/**
 * TodayCard — vertical mini-timeline of today's events.
 * Implements §4b "The Trifecta Layout" from VIEW_REDESIGN_PLAN.md.
 *
 * Shows up to 5 items with time on left, title on right, and
 * colored dot by event type. Links to Calendar with highlight.
 *
 * @module components/home/TodayCard
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
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared';
import { Calendar, ArrowRight } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { ScheduleItem } from './TodaySchedule';
import { staggeredEntrance } from '@/lib/utils/animations';

const logger = createLogger('TodayCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TodayCardProps {
  items: ScheduleItem[];
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Event type → dot color mapping (§2a event type colors) */
const TYPE_DOT_COLORS: Record<string, string> = {
  event: 'bg-blue-500',
  appointment: 'bg-blue-500',
  deadline: 'bg-amber-500',
  expiration: 'bg-amber-500',
  birthday: 'bg-pink-500',
  anniversary: 'bg-pink-500',
  payment_due: 'bg-emerald-500',
  follow_up: 'bg-purple-500',
  recurring: 'bg-indigo-400',
  reminder: 'bg-indigo-400',
  other: 'bg-slate-400',
};

const MAX_VISIBLE = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TodayCard({ items, isLoading }: TodayCardProps) {
  // Only show today's items in this card
  const todayItems = React.useMemo(
    () => items.filter((item) => !item.isTomorrow),
    [items]
  );

  // Animation mount guard — only animate on first render
  const hasMounted = React.useRef(false);
  React.useEffect(() => { hasMounted.current = true; }, []);

  React.useEffect(() => {
    if (!isLoading) {
      if (todayItems.length === 0) {
        logger.debug('No events today — showing empty state');
      } else {
        logger.debug('Rendering today events', { count: todayItems.length });
      }
    }
  }, [isLoading, todayItems.length]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleItems = todayItems.slice(0, MAX_VISIBLE);
  const overflowCount = todayItems.length - MAX_VISIBLE;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-green-500" />
          Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayItems.length === 0 ? (
          <EmptyState
            variant="no-events"
            title="No events today."
            subtitle="A blank canvas."
            className="py-4"
          />
        ) : (
          <div className="space-y-1">
            {visibleItems.map((item, index) => {
              const dotColor = TYPE_DOT_COLORS[item.type] || TYPE_DOT_COLORS.other;
              const entrance = !hasMounted.current ? staggeredEntrance(index) : undefined;

              const baseClass = 'flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors';

              const row = (
                <Link
                  key={item.id}
                  href={`/calendar?highlight=${item.id}`}
                  className={entrance ? `${baseClass} ${entrance.className}` : baseClass}
                  style={entrance?.style}
                >
                  {/* Time */}
                  <span className="text-xs text-muted-foreground w-14 text-right tabular-nums shrink-0">
                    {item.time || 'All day'}
                  </span>
                  {/* Dot */}
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                  {/* Title */}
                  <span className="text-sm truncate">{item.title}</span>
                </Link>
              );

              return (
                <Tooltip
                  key={item.id}
                  content={`${item.type.replace(/_/g, ' ')} — click to view in calendar`}
                >
                  {row}
                </Tooltip>
              );
            })}

            {overflowCount > 0 && (
              <Link
                href="/calendar"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-1 pl-[4.25rem]"
              >
                +{overflowCount} more <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TodayCard;
