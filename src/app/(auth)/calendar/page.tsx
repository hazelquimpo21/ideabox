/**
 * Calendar Page — Events, Deadlines, and Dates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 2 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unified Calendar page merging Events + Timeline views. Replaces the Phase 1
 * thin wrapper that only rendered EventsPage. Now provides:
 *
 *   - View Toggle: Calendar Grid / List View (via ?view= query param)
 *   - Type Filters: All, Events, Deadlines, Birthdays, Payments, etc.
 *   - Merged Data: Events from useEvents() + dates from useExtractedDates()
 *   - List View: Items grouped by time period (Today, Tomorrow, This Week, etc.)
 *   - Calendar Grid: Monthly grid from CalendarView component
 *   - Stats Banner: Merged stats from both data sources
 *   - Highlight: Scroll to specific item via ?highlight= param
 *
 * Route: /calendar
 * Redirects:
 *   /events   → /calendar (configured in next.config.mjs)
 *   /timeline → /calendar (configured in next.config.mjs)
 *
 * Query Parameters:
 *   - view:      'calendar' | 'list' (default: list)
 *   - type:      DateType filter (e.g. 'deadline', 'birthday', 'event')
 *   - highlight: Item ID to scroll to and highlight
 *   - showPast:  'true' to include past items
 *
 * @module app/(auth)/calendar/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { CalendarStats } from '@/components/calendar';
import { CalendarView } from '@/components/timeline';
import { EventCard } from '@/components/events';
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { useEvents } from '@/hooks/useEvents';
import { useExtractedDates } from '@/hooks/useExtractedDates';
import type { EventData, EventState } from '@/hooks/useEvents';
import type { ExtractedDate, DateType } from '@/hooks/useExtractedDates';
import {
  Calendar,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  Clock,
  DollarSign,
  Cake,
  Heart,
  AlertTriangle,
  ArrowRight,
  Bell,
  RefreshCw,
  Check,
  AlarmClockOff,
  EyeOff,
  Mail,
  Star,
  Filter,
  ChevronDown,
  ChevronRight,
  List,
  History,
  PartyPopper,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CalendarPage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Date type configuration for display properties.
 */
const DATE_TYPE_CONFIG: Record<
  DateType,
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  deadline: { icon: Clock, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', label: 'Deadline' },
  event: { icon: Calendar, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30', label: 'Event' },
  payment_due: { icon: DollarSign, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30', label: 'Payment Due' },
  birthday: { icon: Cake, color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-100 dark:bg-pink-900/30', label: 'Birthday' },
  anniversary: { icon: Heart, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30', label: 'Anniversary' },
  expiration: { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Expiration' },
  appointment: { icon: CalendarCheck, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30', label: 'Appointment' },
  follow_up: { icon: ArrowRight, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/30', label: 'Follow-up' },
  reminder: { icon: Bell, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30', label: 'Reminder' },
  recurring: { icon: RefreshCw, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/30', label: 'Recurring' },
  other: { icon: CalendarClock, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/30', label: 'Other' },
};

/**
 * Filter options for date types.
 */
const TYPE_FILTER_OPTIONS: Array<{ value: DateType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'event', label: 'Events' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'payment_due', label: 'Payments' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'follow_up', label: 'Follow-ups' },
];

/**
 * Snooze preset options for date items.
 */
const SNOOZE_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string for display.
 * @param dateString - ISO date string (YYYY-MM-DD)
 * @returns Formatted date like "Mon, Jan 19"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculates a snooze date from today.
 * @param days - Number of days to add
 * @returns Date string in YYYY-MM-DD format
 */
function getSnoozeDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type filter bar — pill buttons for filtering by date type.
 */
function TypeFilterBar({
  value,
  onChange,
}: {
  value: DateType | 'all';
  onChange: (value: DateType | 'all') => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TYPE_FILTER_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(option.value)}
          className="text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Date card component for displaying extracted dates in the list view.
 * Includes action buttons: acknowledge, snooze, hide.
 */
function DateCard({
  date,
  onAcknowledge,
  onSnooze,
  onHide,
  isHighlighted,
}: {
  date: ExtractedDate;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onHide: (id: string) => void;
  isHighlighted?: boolean;
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = React.useState(false);
  const typeConfig = DATE_TYPE_CONFIG[date.date_type];
  const TypeIcon = typeConfig.icon;

  const today = new Date().toISOString().split('T')[0];
  const isOverdue = date.date < today && !date.is_acknowledged;

  return (
    <div
      id={`item-${date.id}`}
      className={isHighlighted ? 'ring-2 ring-green-500 ring-offset-2 rounded-lg' : ''}
    >
      <Card className={`
        ${isOverdue ? 'border-red-200 dark:border-red-900' : ''}
        ${date.is_acknowledged ? 'opacity-60' : ''}
      `}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Date info */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`p-2 rounded-lg ${typeConfig.bgColor} shrink-0`}>
                <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-medium truncate ${date.is_acknowledged ? 'line-through' : ''}`}>
                    {date.title}
                  </h3>
                  <Badge className={`text-xs shrink-0 ${typeConfig.bgColor} ${typeConfig.color} border-0`}>
                    {typeConfig.label}
                  </Badge>
                </div>
                <p className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                  {formatDate(date.date)}
                  {date.event_time && ` at ${date.event_time}`}
                  {isOverdue && ' (Overdue!)'}
                </p>
                {date.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {date.description}
                  </p>
                )}
                {date.emails && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">
                      From: {date.emails.sender_name || date.emails.sender_email}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {date.email_id && (
                <Link href={`/inbox?email=${date.email_id}`}>
                  <Button variant="ghost" size="icon" title="View email">
                    <Mail className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              {!date.is_acknowledged && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onAcknowledge(date.id)}
                  title="Mark as done"
                  className="text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              {!date.is_acknowledged && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                    title="Snooze"
                  >
                    <AlarmClockOff className="h-4 w-4" />
                  </Button>
                  {showSnoozeMenu && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-lg p-1 min-w-[120px]">
                      {SNOOZE_PRESETS.map((preset) => (
                        <button
                          key={preset.days}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded-sm"
                          onClick={() => {
                            onSnooze(date.id, getSnoozeDate(preset.days));
                            setShowSnoozeMenu(false);
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onHide(date.id)}
                title="Hide"
                className="text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Group header for the list view — collapsible section title with count badge.
 */
function GroupHeader({
  title,
  count,
  icon: Icon,
  iconColor,
  isUrgent,
  isHighlighted,
  isCollapsed,
  onToggle,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  iconColor: string;
  isUrgent?: boolean;
  isHighlighted?: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center justify-between py-3 px-4 rounded-lg
        ${isUrgent
          ? 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100'
          : isHighlighted
          ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100'
          : 'bg-muted/50 text-foreground'
        }
        hover:bg-muted transition-colors
      `}
    >
      <div className="flex items-center gap-2">
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="font-semibold">{title}</span>
        <Badge variant={isUrgent ? 'destructive' : isHighlighted ? 'default' : 'secondary'}>
          {count}
        </Badge>
      </div>
      {isUrgent && <AlertTriangle className="h-4 w-4 text-red-500" />}
    </button>
  );
}

/**
 * A merged list group containing both events and extracted dates.
 */
function MergedGroup({
  title,
  events,
  dates,
  icon,
  iconColor,
  isUrgent,
  isHighlighted,
  highlightedItemId,
  // Event handlers
  onDismissEvent,
  onSaveToMaybe,
  onRemoveFromMaybe,
  onAddToCalendar,
  hasEventState,
  isEventStatePending,
  // Date handlers
  onAcknowledgeDate,
  onSnoozeDate,
  onHideDate,
}: {
  title: string;
  events: EventData[];
  dates: ExtractedDate[];
  icon: React.ElementType;
  iconColor: string;
  isUrgent?: boolean;
  isHighlighted?: boolean;
  highlightedItemId?: string | null;
  onDismissEvent: (id: string) => Promise<void>;
  onSaveToMaybe: (id: string) => Promise<void>;
  onRemoveFromMaybe: (id: string) => Promise<void>;
  onAddToCalendar: (id: string) => Promise<void>;
  hasEventState: (id: string, state: EventState) => boolean;
  isEventStatePending: (id: string) => boolean;
  onAcknowledgeDate: (id: string) => void;
  onSnoozeDate: (id: string, until: string) => void;
  onHideDate: (id: string) => void;
}) {
  const totalCount = events.length + dates.length;
  const [isCollapsed, setIsCollapsed] = React.useState(
    totalCount > 10 && !isHighlighted && !isUrgent
  );

  // Expand if highlighted item is in this group
  React.useEffect(() => {
    if (highlightedItemId) {
      const hasItem = events.some((e) => e.id === highlightedItemId)
        || dates.some((d) => d.id === highlightedItemId);
      if (hasItem) {
        setIsCollapsed(false);
        logger.debug('Expanding group for highlighted item', { title, highlightedItemId: highlightedItemId.substring(0, 8) });
      }
    }
  }, [highlightedItemId, events, dates, title]);

  if (totalCount === 0) return null;

  return (
    <div className="mb-6">
      <GroupHeader
        title={title}
        count={totalCount}
        icon={icon}
        iconColor={iconColor}
        isUrgent={isUrgent}
        isHighlighted={isHighlighted}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />

      {!isCollapsed && (
        <div className="space-y-3 mt-3">
          {/* Render events */}
          {events.map((event) => (
            <div
              key={`event-${event.id}`}
              id={`item-${event.id}`}
              className={highlightedItemId === event.id ? 'ring-2 ring-green-500 ring-offset-2 rounded-lg' : ''}
            >
              <EventCard
                event={event}
                onDismiss={onDismissEvent}
                onSaveToMaybe={onSaveToMaybe}
                onRemoveFromMaybe={onRemoveFromMaybe}
                onAddToCalendar={onAddToCalendar}
                isMaybe={hasEventState(event.id, 'maybe')}
                isSavedToCalendar={hasEventState(event.id, 'saved_to_calendar')}
                isPending={isEventStatePending(event.id)}
                showSourceEmail
              />
            </div>
          ))}

          {/* Render extracted dates */}
          {dates.map((date) => (
            <DateCard
              key={`date-${date.id}`}
              date={date}
              onAcknowledge={onAcknowledgeDate}
              onSnooze={onSnoozeDate}
              onHide={onHideDate}
              isHighlighted={highlightedItemId === date.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the calendar page.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-10 w-full rounded-lg mb-3" />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div>
        <Skeleton className="h-10 w-full rounded-lg mb-3" />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Empty state when no items exist.
 */
function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-lg mb-2">No upcoming items</CardTitle>
        <CardDescription className="max-w-sm">
          Events, deadlines, and other dates from your emails will appear here
          as they are detected.
        </CardDescription>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calendar page — unified view of events and extracted dates.
 *
 * Features:
 * - View toggle between Calendar Grid and List View
 * - Type filters (All, Events, Deadlines, Birthdays, etc.)
 * - Merged events + extracted dates grouped by time period
 * - Stats banner with key metrics
 * - Highlight support via ?highlight= query param
 * - Show past toggle and acknowledged items toggle
 */
export default function CalendarPage() {
  logger.start('Rendering Calendar page (Phase 2 — unified view)');

  // ─── URL Parameters ────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const highlightedItemId = searchParams.get('highlight');
  const viewParam = searchParams.get('view');
  const typeParam = searchParams.get('type');
  const showPastParam = searchParams.get('showPast') === 'true';

  // ─── Local State ───────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>(
    viewParam === 'calendar' ? 'calendar' : 'list'
  );
  const [typeFilter, setTypeFilter] = React.useState<DateType | 'all'>(
    (typeParam as DateType | 'all') || 'all'
  );
  const [showPast, setShowPast] = React.useState(showPastParam);
  const [showAcknowledged, setShowAcknowledged] = React.useState(false);

  // ─── Data Fetching: Events ─────────────────────────────────────────────────
  const {
    events,
    groupedEvents,
    isLoading: isEventsLoading,
    error: eventsError,
    refetch: refetchEvents,
    stats: eventStats,
    dismiss: dismissEvent,
    saveToMaybe,
    removeState: removeEventState,
    trackCalendarSave,
    hasState: hasEventState,
    isStatePending: isEventStatePending,
  } = useEvents({ includePast: showPast });

  // ─── Data Fetching: Extracted Dates ────────────────────────────────────────
  const {
    dates,
    groupedDates,
    isLoading: isDatesLoading,
    error: datesError,
    refetch: refetchDates,
    stats: dateStats,
    acknowledge: acknowledgeDate,
    snooze: snoozeDate,
    hide: hideDate,
    loadMore: loadMoreDates,
    hasMore: hasMoreDates,
  } = useExtractedDates({
    type: typeFilter === 'all' ? undefined : typeFilter,
    isAcknowledged: showAcknowledged ? undefined : false,
  });

  const isLoading = isEventsLoading || isDatesLoading;
  const error = eventsError || datesError;

  logger.debug('Calendar page state', {
    viewMode,
    typeFilter,
    showPast,
    showAcknowledged,
    eventCount: events.length,
    dateCount: dates.length,
    highlightedItemId: highlightedItemId?.substring(0, 8),
  });

  // ─── Scroll to Highlighted Item ────────────────────────────────────────────
  React.useEffect(() => {
    if (highlightedItemId && !isLoading) {
      const element = document.getElementById(`item-${highlightedItemId}`);
      if (element) {
        logger.info('Scrolling to highlighted item', {
          itemId: highlightedItemId.substring(0, 8),
        });
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedItemId, isLoading]);

  // ─── URL Sync ──────────────────────────────────────────────────────────────

  /**
   * Update URL query param without full navigation.
   */
  const updateQueryParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'list' && value !== 'all' && value !== 'false') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  /**
   * Handle view mode toggle.
   */
  const handleViewChange = (mode: 'list' | 'calendar') => {
    logger.info('View mode changed', { from: viewMode, to: mode });
    setViewMode(mode);
    updateQueryParam('view', mode);
  };

  /**
   * Handle type filter change.
   */
  const handleTypeFilterChange = (value: DateType | 'all') => {
    logger.info('Type filter changed', { from: typeFilter, to: value });
    setTypeFilter(value);
    updateQueryParam('type', value === 'all' ? null : value);
  };

  /**
   * Handle show past toggle.
   */
  const handleTogglePast = () => {
    const newShowPast = !showPast;
    logger.info('Toggle show past', { showPast: newShowPast });
    setShowPast(newShowPast);
    updateQueryParam('showPast', newShowPast ? 'true' : null);
  };

  /**
   * Handle refresh.
   */
  const handleRefresh = () => {
    logger.info('User triggered Calendar refresh');
    refetchEvents();
    refetchDates();
  };

  // ─── Event Action Handlers ─────────────────────────────────────────────────

  const handleDismissEvent = async (eventId: string) => {
    logger.start('Dismiss event', { eventId: eventId.substring(0, 8) });
    try {
      await dismissEvent(eventId);
      logger.success('Event dismissed', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to dismiss event', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleSaveToMaybe = async (eventId: string) => {
    logger.start('Save to maybe', { eventId: eventId.substring(0, 8) });
    try {
      await saveToMaybe(eventId);
      logger.success('Saved to maybe', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to save to maybe', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleRemoveFromMaybe = async (eventId: string) => {
    logger.start('Remove from maybe', { eventId: eventId.substring(0, 8) });
    try {
      await removeEventState(eventId, 'maybe');
      logger.success('Removed from maybe', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to remove from maybe', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleAddToCalendar = async (eventId: string) => {
    logger.start('Track calendar save', { eventId: eventId.substring(0, 8) });
    try {
      await trackCalendarSave(eventId);
      logger.success('Calendar save tracked', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to track calendar save', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  // ─── Date Action Handlers ──────────────────────────────────────────────────

  const handleAcknowledgeDate = async (dateId: string) => {
    logger.start('Acknowledge date', { dateId: dateId.substring(0, 8) });
    await acknowledgeDate(dateId);
  };

  const handleSnoozeDate = async (dateId: string, until: string) => {
    logger.start('Snooze date', { dateId: dateId.substring(0, 8), until });
    await snoozeDate(dateId, until);
  };

  const handleHideDate = async (dateId: string) => {
    logger.start('Hide date', { dateId: dateId.substring(0, 8) });
    await hideDate(dateId);
  };

  // ─── Filter events by type if needed ───────────────────────────────────────

  const filteredGroupedEvents = React.useMemo(() => {
    // Only show events when type filter is 'all' or 'event'
    if (typeFilter !== 'all' && typeFilter !== 'event') {
      return {
        overdue: [],
        today: [],
        tomorrow: [],
        thisWeek: [],
        nextWeek: [],
        later: [],
      };
    }
    return groupedEvents;
  }, [groupedEvents, typeFilter]);

  const hasAnyItems = events.length > 0 || dates.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Calendar"
        description="Events, deadlines, and important dates from your emails."
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Calendar' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* ─── Error Banner ─────────────────────────────────────────────────── */}
      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Failed to load calendar data</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Stats Banner ─────────────────────────────────────────────────── */}
      {!isLoading && (
        <CalendarStats eventStats={eventStats} dateStats={dateStats} />
      )}

      {/* ─── Filters & View Toggle ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {/* Left: Type Filters + Show Past/Done */}
        <div className="flex items-center gap-4 flex-wrap">
          <TypeFilterBar value={typeFilter} onChange={handleTypeFilterChange} />

          <Button
            variant={showPast ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleTogglePast}
            className="gap-2"
          >
            <History className="h-3.5 w-3.5" />
            {showPast ? 'Hide Past' : 'Show Past'}
          </Button>

          <Button
            variant={showAcknowledged ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowAcknowledged(!showAcknowledged)}
            className="gap-2"
          >
            <Check className="h-3 w-3" />
            {showAcknowledged ? 'Hide Done' : 'Show Done'}
          </Button>
        </div>

        {/* Right: View Mode Toggle */}
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewChange('list')}
            className="rounded-none gap-1.5"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">List</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewChange('calendar')}
            className="rounded-none gap-1.5"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !hasAnyItems ? (
        <EmptyState />
      ) : viewMode === 'calendar' ? (
        // ─── Calendar Grid View ─────────────────────────────────────────────
        <CalendarView
          dates={dates}
          onAcknowledge={handleAcknowledgeDate}
          onSnooze={handleSnoozeDate}
          onHide={handleHideDate}
        />
      ) : (
        // ─── List View: Merged Groups ───────────────────────────────────────
        <>
          {/* Overdue */}
          {showPast && (
            <MergedGroup
              title="Overdue"
              events={filteredGroupedEvents.overdue}
              dates={groupedDates.overdue}
              icon={AlertTriangle}
              iconColor="text-red-500"
              isUrgent
              highlightedItemId={highlightedItemId}
              onDismissEvent={handleDismissEvent}
              onSaveToMaybe={handleSaveToMaybe}
              onRemoveFromMaybe={handleRemoveFromMaybe}
              onAddToCalendar={handleAddToCalendar}
              hasEventState={hasEventState}
              isEventStatePending={isEventStatePending}
              onAcknowledgeDate={handleAcknowledgeDate}
              onSnoozeDate={handleSnoozeDate}
              onHideDate={handleHideDate}
            />
          )}

          {/* Today */}
          <MergedGroup
            title="Today"
            events={filteredGroupedEvents.today}
            dates={groupedDates.today}
            icon={CalendarCheck}
            iconColor="text-green-500"
            isHighlighted={(filteredGroupedEvents.today.length + groupedDates.today.length) > 0}
            highlightedItemId={highlightedItemId}
            onDismissEvent={handleDismissEvent}
            onSaveToMaybe={handleSaveToMaybe}
            onRemoveFromMaybe={handleRemoveFromMaybe}
            onAddToCalendar={handleAddToCalendar}
            hasEventState={hasEventState}
            isEventStatePending={isEventStatePending}
            onAcknowledgeDate={handleAcknowledgeDate}
            onSnoozeDate={handleSnoozeDate}
            onHideDate={handleHideDate}
          />

          {/* Tomorrow */}
          <MergedGroup
            title="Tomorrow"
            events={filteredGroupedEvents.tomorrow}
            dates={groupedDates.tomorrow}
            icon={Calendar}
            iconColor="text-blue-500"
            highlightedItemId={highlightedItemId}
            onDismissEvent={handleDismissEvent}
            onSaveToMaybe={handleSaveToMaybe}
            onRemoveFromMaybe={handleRemoveFromMaybe}
            onAddToCalendar={handleAddToCalendar}
            hasEventState={hasEventState}
            isEventStatePending={isEventStatePending}
            onAcknowledgeDate={handleAcknowledgeDate}
            onSnoozeDate={handleSnoozeDate}
            onHideDate={handleHideDate}
          />

          {/* This Week */}
          <MergedGroup
            title="This Week"
            events={filteredGroupedEvents.thisWeek}
            dates={groupedDates.thisWeek}
            icon={CalendarDays}
            iconColor="text-purple-500"
            highlightedItemId={highlightedItemId}
            onDismissEvent={handleDismissEvent}
            onSaveToMaybe={handleSaveToMaybe}
            onRemoveFromMaybe={handleRemoveFromMaybe}
            onAddToCalendar={handleAddToCalendar}
            hasEventState={hasEventState}
            isEventStatePending={isEventStatePending}
            onAcknowledgeDate={handleAcknowledgeDate}
            onSnoozeDate={handleSnoozeDate}
            onHideDate={handleHideDate}
          />

          {/* Next Week */}
          <MergedGroup
            title="Next Week"
            events={filteredGroupedEvents.nextWeek}
            dates={groupedDates.nextWeek}
            icon={CalendarDays}
            iconColor="text-orange-500"
            highlightedItemId={highlightedItemId}
            onDismissEvent={handleDismissEvent}
            onSaveToMaybe={handleSaveToMaybe}
            onRemoveFromMaybe={handleRemoveFromMaybe}
            onAddToCalendar={handleAddToCalendar}
            hasEventState={hasEventState}
            isEventStatePending={isEventStatePending}
            onAcknowledgeDate={handleAcknowledgeDate}
            onSnoozeDate={handleSnoozeDate}
            onHideDate={handleHideDate}
          />

          {/* Later */}
          <MergedGroup
            title="Later"
            events={filteredGroupedEvents.later}
            dates={groupedDates.later}
            icon={Calendar}
            iconColor="text-gray-500"
            highlightedItemId={highlightedItemId}
            onDismissEvent={handleDismissEvent}
            onSaveToMaybe={handleSaveToMaybe}
            onRemoveFromMaybe={handleRemoveFromMaybe}
            onAddToCalendar={handleAddToCalendar}
            hasEventState={hasEventState}
            isEventStatePending={isEventStatePending}
            onAcknowledgeDate={handleAcknowledgeDate}
            onSnoozeDate={handleSnoozeDate}
            onHideDate={handleHideDate}
          />

          {/* Load More */}
          {hasMoreDates && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMoreDates} className="gap-2">
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
