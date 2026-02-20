/**
 * Calendar View Component for Timeline
 *
 * Displays extracted dates in a monthly calendar grid format.
 * Provides an alternative visualization to the grouped list view.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Monthly calendar grid with navigation
 * - Color-coded date type indicators
 * - Click-to-select day with detail panel
 * - Today highlighting
 * - Acknowledged items shown with reduced opacity
 * - Legend for date type colors
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * import { CalendarView } from '@/components/timeline/CalendarView';
 *
 * <CalendarView
 *   dates={extractedDates}
 *   onAcknowledge={handleAcknowledge}
 *   onSnooze={handleSnooze}
 *   onHide={handleHide}
 * />
 * ```
 *
 * @module components/timeline/CalendarView
 * @version 1.0.0
 * @since January 2026 (P6 Enhancement)
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
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
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  AlarmClockOff,
  EyeOff,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { ExtractedDate, DateType } from '@/hooks/useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logger instance for this component.
 * Provides structured logging for debugging calendar interactions.
 */
const logger = createLogger('CalendarView');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the CalendarView component.
 */
export interface CalendarViewProps {
  /** Array of extracted dates to display */
  dates: ExtractedDate[];
  /** Handler for acknowledging (marking done) a date */
  onAcknowledge: (id: string) => void;
  /** Handler for snoozing a date */
  onSnooze: (id: string, until: string) => void;
  /** Handler for hiding a date */
  onHide: (id: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weekday abbreviations for the calendar header.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Color configuration for date type indicators.
 * Each type has a distinct color for easy visual identification.
 */
const DATE_TYPE_COLORS: Record<DateType | string, { dot: string; bg: string; text: string }> = {
  deadline: {
    dot: 'bg-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
  },
  payment_due: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
  },
  event: {
    dot: 'bg-green-500',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
  },
  birthday: {
    dot: 'bg-pink-500',
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-700 dark:text-pink-300',
  },
  anniversary: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
  },
  expiration: {
    dot: 'bg-yellow-500',
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  appointment: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
  },
  follow_up: {
    dot: 'bg-teal-500',
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-700 dark:text-teal-300',
  },
  reminder: {
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  recurring: {
    dot: 'bg-gray-500',
    bg: 'bg-gray-100 dark:bg-gray-900/30',
    text: 'text-gray-700 dark:text-gray-300',
  },
  other: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-900/30',
    text: 'text-gray-600 dark:text-gray-400',
  },
};

/**
 * Snooze preset options for the detail panel.
 */
const SNOOZE_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates the snooze date based on days from today.
 *
 * @param days - Number of days to add to today
 * @returns ISO date string (YYYY-MM-DD)
 */
function getSnoozeDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Gets color configuration for a date type.
 * Falls back to 'other' type if not found.
 *
 * @param dateType - The date type to look up
 * @returns Color configuration object
 */
function getTypeColors(dateType: string): { dot: string; bg: string; text: string } {
  return DATE_TYPE_COLORS[dateType] || DATE_TYPE_COLORS.other;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calendar View Component
 *
 * Renders extracted dates in a monthly calendar format with:
 * - Month navigation (previous/next/today)
 * - Color-coded date type indicators
 * - Click-to-expand day details
 * - Actions for acknowledge, snooze, and hide
 *
 * @param props - Component props
 * @returns React component
 */
export function CalendarView({
  dates,
  onAcknowledge,
  onSnooze,
  onHide,
}: CalendarViewProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────────

  /** Currently displayed month */
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  /** Selected day for detail view (null = no selection) */
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Calendar Calculations
  // ─────────────────────────────────────────────────────────────────────────────

  // Calculate the calendar grid boundaries
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  // Generate array of all days in the calendar view
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  logger.debug('Calendar grid calculated', {
    month: format(currentMonth, 'MMMM yyyy'),
    startDay: format(calendarStart, 'MMM d'),
    endDay: format(calendarEnd, 'MMM d'),
    totalDays: calendarDays.length,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Index dates by day for efficient lookup
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Map of date strings (YYYY-MM-DD) to arrays of ExtractedDate objects.
   * Memoized to prevent recalculation on every render.
   */
  const datesByDay = React.useMemo(() => {
    const map = new Map<string, ExtractedDate[]>();

    dates.forEach((d) => {
      const key = d.date; // Already in YYYY-MM-DD format
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(d);
    });

    logger.debug('Dates indexed by day', {
      totalDates: dates.length,
      uniqueDays: map.size,
    });

    return map;
  }, [dates]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Navigate to the previous month.
   */
  const handlePrevMonth = () => {
    logger.debug('Navigating to previous month');
    setCurrentMonth(subMonths(currentMonth, 1));
    setSelectedDate(null); // Clear selection on navigation
  };

  /**
   * Navigate to the next month.
   */
  const handleNextMonth = () => {
    logger.debug('Navigating to next month');
    setCurrentMonth(addMonths(currentMonth, 1));
    setSelectedDate(null); // Clear selection on navigation
  };

  /**
   * Navigate to the current month.
   */
  const handleToday = () => {
    logger.debug('Navigating to current month');
    setCurrentMonth(new Date());
    setSelectedDate(null);
  };

  /**
   * Handle clicking on a calendar day.
   */
  const handleDayClick = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    const dayDates = datesByDay.get(key) || [];

    logger.debug('Day clicked', {
      date: key,
      itemCount: dayDates.length,
    });

    setSelectedDate(day);
  };

  /**
   * Close the selected day detail panel.
   */
  const handleCloseDetail = () => {
    setSelectedDate(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Month Navigation Header */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous month</span>
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next month</span>
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Calendar Grid */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        {/* Weekday Headers */}
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

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayDates = datesByDay.get(key) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);

            return (
              <button
                key={index}
                onClick={() => handleDayClick(day)}
                className={cn(
                  // Base styles
                  'relative h-16 sm:h-20 p-1 rounded-md border transition-colors text-left',
                  // Current month vs other months
                  isCurrentMonth
                    ? 'bg-background hover:bg-accent'
                    : 'bg-muted/30 text-muted-foreground',
                  // Selected state
                  isSelected && 'ring-2 ring-primary',
                  // Today highlight
                  isTodayDate && 'border-primary'
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    'text-sm',
                    isTodayDate && 'font-bold text-primary'
                  )}
                >
                  {format(day, 'd')}
                </span>

                {/* Date type indicators (dots) */}
                {dayDates.length > 0 && (
                  <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                    {/* Show up to 4 dots, then +N indicator */}
                    {dayDates.slice(0, 4).map((d, i) => {
                      const colors = getTypeColors(d.date_type);
                      return (
                        <div
                          key={i}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            colors.dot,
                            d.is_acknowledged && 'opacity-40'
                          )}
                          title={d.title}
                        />
                      );
                    })}
                    {dayDates.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayDates.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Selected Day Detail Panel */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {selectedDate && (
        <SelectedDayPanel
          date={selectedDate}
          items={datesByDay.get(format(selectedDate, 'yyyy-MM-dd')) || []}
          onClose={handleCloseDetail}
          onAcknowledge={onAcknowledge}
          onSnooze={onSnooze}
          onHide={onHide}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Color Legend */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(DATE_TYPE_COLORS)
          .slice(0, 8) // Show first 8 types to avoid overcrowding
          .map(([type, colors]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={cn('h-2 w-2 rounded-full', colors.dot)} />
              <span className="capitalize text-muted-foreground">
                {type.replace('_', ' ')}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELECTED DAY PANEL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Panel showing details for the selected day.
 * Displays all items on that day with action buttons.
 */
function SelectedDayPanel({
  date,
  items,
  onClose,
  onAcknowledge,
  onSnooze,
  onHide,
}: {
  date: Date;
  items: ExtractedDate[];
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onHide: (id: string) => void;
}) {
  // Track which item has snooze menu open
  const [openSnoozeId, setOpenSnoozeId] = React.useState<string | null>(null);

  // Check if day is in the past
  const isPast = date < new Date(new Date().toDateString());

  return (
    <Card>
      <CardContent className="p-4">
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Header with date and close button */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">
            {format(date, 'EEEE, MMMM d, yyyy')}
            {isPast && (
              <Badge variant="outline" className="ml-2 text-xs">
                Past
              </Badge>
            )}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Empty state */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No items scheduled for this day
          </p>
        ) : (
          /* ─────────────────────────────────────────────────────────────────── */
          /* Item list */
          /* ─────────────────────────────────────────────────────────────────── */
          <div className="space-y-3">
            {items.map((item) => {
              const colors = getTypeColors(item.date_type);
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border',
                    item.is_acknowledged && 'opacity-50'
                  )}
                >
                  {/* Color indicator */}
                  <div
                    className={cn('h-2 w-2 rounded-full mt-2 flex-shrink-0', colors.dot)}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'font-medium',
                        item.is_acknowledged && 'line-through'
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className={cn('capitalize', colors.text)}>
                        {item.date_type.replace('_', ' ')}
                      </span>
                      {item.event_time && ` at ${item.event_time}`}
                      {item.is_recurring && (
                        <>
                          {' '}
                          <RefreshCw className="inline h-3 w-3" />
                        </>
                      )}
                    </p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* View source email */}
                    {item.email_id && (
                      <Link href={`/inbox?email=${item.email_id}`}>
                        <Button variant="ghost" size="icon" title="View email">
                          <Mail className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}

                    {/* Acknowledge / Done */}
                    {!item.is_acknowledged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAcknowledge(item.id)}
                        title="Mark as done"
                        className="text-green-600 hover:text-green-700 hover:bg-green-100"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Snooze */}
                    {!item.is_acknowledged && (
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setOpenSnoozeId(openSnoozeId === item.id ? null : item.id)
                          }
                          title="Snooze"
                        >
                          <AlarmClockOff className="h-4 w-4" />
                        </Button>

                        {/* Snooze dropdown */}
                        {openSnoozeId === item.id && (
                          <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-lg p-1 min-w-[100px]">
                            {SNOOZE_PRESETS.map((preset) => (
                              <button
                                key={preset.days}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded-sm"
                                onClick={() => {
                                  onSnooze(item.id, getSnoozeDate(preset.days));
                                  setOpenSnoozeId(null);
                                }}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hide */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onHide(item.id)}
                      title="Hide"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CalendarView;
