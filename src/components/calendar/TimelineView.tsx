/**
 * TimelineView — vertical timeline list for calendar items.
 * Implements §6b "List View → Timeline Style" from VIEW_REDESIGN_PLAN.md.
 *
 * Groups items by time period (Overdue, Today, Tomorrow, etc.) with sticky
 * headers. Overdue section always first with red background strip.
 * Only one item can be expanded at a time (inline, no modal).
 *
 * @module components/calendar/TimelineView
 */

'use client';

import * as React from 'react';
import { staggeredEntrance } from '@/lib/utils/animations';
import { EmptyState } from '@/components/shared/EmptyState';
import { createLogger } from '@/lib/utils/logger';
import { TimelineGroup } from './TimelineGroup';
import { TimelineItem } from './TimelineItem';
import { groupByTimePeriod } from './types';
import type { CalendarItem } from './types';

const logger = createLogger('TimelineView');

/**
 * Computes a human-readable date range string from a group of items.
 * e.g. "Mar 12 – 15" or "Mar 28 – Apr 3"
 */
function getDateRange(items: CalendarItem[]): string | undefined {
  if (items.length === 0) return undefined;
  const dates = items.map((i) => i.date).sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const fMonth = first.toLocaleDateString('en-US', { month: 'short' });
  const fDay = first.getDate();
  const lMonth = last.toLocaleDateString('en-US', { month: 'short' });
  const lDay = last.getDate();

  if (first.getTime() === last.getTime()) {
    return `${fMonth} ${fDay}`;
  }
  if (fMonth === lMonth) {
    return `${fMonth} ${fDay} – ${lDay}`;
  }
  return `${fMonth} ${fDay} – ${lMonth} ${lDay}`;
}

interface TimelineViewProps {
  items: CalendarItem[];
  highlightedItemId?: string | null;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
}

/** Group definitions in display order. showDate = items need their own date label. */
const GROUP_DEFS = [
  { key: 'overdue' as const, label: 'OVERDUE', isOverdue: true, showDate: true },
  { key: 'today' as const, label: 'TODAY', isOverdue: false, showDate: false },
  { key: 'tomorrow' as const, label: 'TOMORROW', isOverdue: false, showDate: false },
  { key: 'thisWeek' as const, label: 'THIS WEEK', isOverdue: false, showDate: true },
  { key: 'nextWeek' as const, label: 'NEXT WEEK', isOverdue: false, showDate: true },
  { key: 'later' as const, label: 'LATER', isOverdue: false, showDate: true },
] as const;

export function TimelineView({
  items,
  highlightedItemId,
  onDismiss,
  onSaveToCalendar,
  onSnooze,
}: TimelineViewProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Stagger animation guard — only animate on first mount
  const hasMounted = React.useRef(false);
  React.useEffect(() => { hasMounted.current = true; }, []);

  const groups = React.useMemo(() => {
    const g = groupByTimePeriod(items);
    logger.debug('Timeline groups', {
      overdue: g.overdue.length,
      today: g.today.length,
      tomorrow: g.tomorrow.length,
      thisWeek: g.thisWeek.length,
      nextWeek: g.nextWeek.length,
      later: g.later.length,
    });
    return g;
  }, [items]);

  const handleToggle = React.useCallback((id: string) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        logger.info('Timeline item expanded', { itemId: id.substring(0, 8) });
      }
      return next;
    });
  }, []);

  // ─── Dismiss Animation (Phase 4) ─────────────────────────────────────
  const [exitingId, setExitingId] = React.useState<string | null>(null);

  const handleDismissWithAnimation = React.useCallback((id: string) => {
    setExitingId(id);
    setTimeout(() => {
      onDismiss?.(id);
      setExitingId(null);
    }, 200);
  }, [onDismiss]);

  // Scroll to highlighted item once loaded
  React.useEffect(() => {
    if (highlightedItemId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`item-${highlightedItemId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Auto-expand the highlighted item
          setExpandedId(highlightedItemId);
        }
      });
    }
  }, [highlightedItemId]);

  if (items.length === 0) {
    return (
      <EmptyState
        variant="no-events"
        title="No upcoming items"
        subtitle="Events, deadlines, and dates from your emails will appear here."
      />
    );
  }

  let itemIndex = 0;

  return (
    <div className="space-y-1">
      {GROUP_DEFS.map(({ key, label, isOverdue, showDate }) => {
        const groupItems = groups[key];
        if (groupItems.length === 0) return null;

        return (
          <div key={key}>
            <TimelineGroup
              label={label}
              count={groupItems.length}
              isOverdue={isOverdue}
              dateRange={showDate ? getDateRange(groupItems) : undefined}
            />
            <div className="relative">
              {groupItems.map((item) => {
                const idx = itemIndex++;
                const entrance = !hasMounted.current
                  ? staggeredEntrance(idx)
                  : { className: '', style: {} as React.CSSProperties };

                return (
                  <div
                    key={item.id}
                    className={`${entrance.className} ${exitingId === item.id ? 'animate-slide-out-down' : ''}`}
                    style={entrance.style}
                  >
                    <TimelineItem
                      item={item}
                      isExpanded={expandedId === item.id}
                      showDate={showDate}
                      onToggle={() => handleToggle(item.id)}
                      onDismiss={handleDismissWithAnimation}
                      onSaveToCalendar={onSaveToCalendar}
                      onSnooze={onSnooze}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
