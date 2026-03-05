/**
 * CalendarGrid — month grid with heat map and day expansion.
 * Implements §6c from VIEW_REDESIGN_PLAN.md.
 *
 * Standard 7-column grid with prev/next month navigation, heat map intensity
 * based on item count, type dots per cell, and accordion-style day expansion
 * below the relevant week row. Only one day expanded at a time.
 *
 * @module components/calendar/CalendarGrid
 */

'use client';

import * as React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { CalendarDayCell } from './CalendarDayCell';
import { CalendarDayExpansion } from './CalendarDayExpansion';
import type { CalendarItem } from './types';

const logger = createLogger('CalendarGrid');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  items: CalendarItem[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
}

export function CalendarGrid({
  items,
  month,
  onMonthChange,
  onDismiss,
  onSaveToCalendar,
}: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  // Grid boundaries
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Index items by date string for O(1) lookup per cell
  const itemsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = item.dateString;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  // Navigation handlers
  const handlePrev = React.useCallback(() => {
    const prev = subMonths(month, 1);
    logger.info('Month changed', { month: format(prev, 'yyyy-MM') });
    onMonthChange(prev);
    setSelectedDate(null);
  }, [month, onMonthChange]);

  const handleNext = React.useCallback(() => {
    const next = addMonths(month, 1);
    logger.info('Month changed', { month: format(next, 'yyyy-MM') });
    onMonthChange(next);
    setSelectedDate(null);
  }, [month, onMonthChange]);

  const handleToday = React.useCallback(() => {
    const now = new Date();
    logger.info('Month changed', { month: 'today' });
    onMonthChange(now);
    setSelectedDate(null);
  }, [onMonthChange]);

  const handleDayClick = React.useCallback((day: Date) => {
    setSelectedDate((prev) => {
      if (prev && isSameDay(prev, day)) return null; // Toggle off
      logger.info('Day expanded', { date: format(day, 'yyyy-MM-dd') });
      return day;
    });
  }, []);

  const handleCloseExpansion = React.useCallback(() => {
    setSelectedDate(null);
  }, []);

  // Split calendar into week rows for expansion insertion
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(month, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous month</span>
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next month</span>
          </Button>
        </div>
      </div>

      <Card className="p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Week rows with expansion */}
        {weeks.map((week, weekIdx) => {
          // Check if selected day is in this week
          const expandedInWeek = selectedDate
            ? week.some((day) => isSameDay(day, selectedDate))
            : false;

          return (
            <React.Fragment key={weekIdx}>
              {/* Day cells row */}
              <div className="grid grid-cols-7 gap-1">
                {week.map((day, dayIdx) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayItems = itemsByDate.get(key) || [];
                  return (
                    <CalendarDayCell
                      key={dayIdx}
                      date={day}
                      items={dayItems}
                      isToday={isToday(day)}
                      isSelected={!!selectedDate && isSameDay(day, selectedDate)}
                      isCurrentMonth={isSameMonth(day, month)}
                      onClick={() => handleDayClick(day)}
                    />
                  );
                })}
              </div>

              {/* Expansion row — rendered below the week containing the selected day */}
              {expandedInWeek && selectedDate && (
                <div className="grid grid-cols-1 mt-1 mb-1">
                  <CalendarDayExpansion
                    date={selectedDate}
                    items={itemsByDate.get(format(selectedDate, 'yyyy-MM-dd')) || []}
                    onDismiss={onDismiss}
                    onSaveToCalendar={onSaveToCalendar}
                    onClose={handleCloseExpansion}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </Card>

      {/* Color legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: 'Event', dot: 'bg-blue-500', shape: 'circle' },
          { label: 'Deadline', dot: 'bg-amber-500', shape: 'diamond' },
          { label: 'Birthday', dot: 'bg-pink-500', shape: 'circle' },
          { label: 'Payment', dot: 'bg-emerald-500', shape: 'diamond' },
          { label: 'Follow-up', dot: 'bg-purple-500', shape: 'circle' },
          { label: 'Recurring', dot: 'bg-indigo-400', shape: 'circle' },
        ].map(({ label, dot, shape }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`h-2 w-2 ${dot} ${shape === 'diamond' ? 'rotate-45' : 'rounded-full'}`} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
