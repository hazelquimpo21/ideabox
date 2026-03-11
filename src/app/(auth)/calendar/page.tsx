/**
 * Calendar Page — thin orchestrator for events, deadlines, and dates.
 * Phase 3 redesign: delegates rendering to TimelineView and CalendarGrid.
 *
 * Merges data from useEvents() + useExtractedDates() into CalendarItem[],
 * manages URL state (?view=, ?type=, ?highlight=), and passes action
 * handlers down to child components.
 *
 * @module app/(auth)/calendar/page
 * @since February 2026 — Phase 2
 * @updated March 2026 — Phase 3 redesign (timeline, heat map, RSVP badges)
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { CalendarStats } from '@/components/calendar/CalendarStats';
import { TimelineView } from '@/components/calendar/TimelineView';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import {
  Button,
  Skeleton,
  Card,
  CardContent,
} from '@/components/ui';
import { useEvents } from '@/hooks/useEvents';
import { useExtractedDates } from '@/hooks/useExtractedDates';
import type { DateType } from '@/hooks/useExtractedDates';
import {
  RefreshCw,
  List,
  CalendarDays,
  AlertTriangle,
  History,
  Check,
} from 'lucide-react';
import { TYPE_FILTER_OPTIONS } from '@/lib/utils/event-colors';
import { mergeToCalendarItems } from '@/components/calendar/types';
import { createLogger } from '@/lib/utils/logger';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const logger = createLogger('CalendarPage');

export default function CalendarPage() {
  logger.start('Rendering Calendar page');

  // URL params — read once for initial state (perf: no router.replace re-renders)
  const searchParams = useSearchParams();
  const initialViewRef = React.useRef(searchParams.get('view'));
  const initialTypeRef = React.useRef(searchParams.get('type'));
  const initialShowPastRef = React.useRef(searchParams.get('showPast') === 'true');
  const highlightedItemId = searchParams.get('highlight');

  // Local state
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>(
    initialViewRef.current === 'calendar' ? 'calendar' : 'list'
  );
  const [typeFilter, setTypeFilter] = React.useState<DateType | 'all'>(
    (initialTypeRef.current as DateType | 'all') || 'all'
  );
  const [showPast, setShowPast] = React.useState(initialShowPastRef.current);
  const [showAcknowledged, setShowAcknowledged] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  // Data sources
  const {
    events,
    isLoading: isEventsLoading,
    error: eventsError,
    refetch: refetchEvents,
    dismiss: dismissEvent,
    trackCalendarSave,
  } = useEvents({ includePast: showPast });

  const {
    dates,
    isLoading: isDatesLoading,
    error: datesError,
    refetch: refetchDates,
    acknowledge: acknowledgeDate,
    snooze: snoozeDate,
    loadMore: loadMoreDates,
    hasMore: hasMoreDates,
  } = useExtractedDates({
    type: typeFilter === 'all' ? undefined : typeFilter,
    isAcknowledged: showAcknowledged ? undefined : false,
  });

  const isLoading = isEventsLoading || isDatesLoading;
  const error = eventsError || datesError;

  // Merge data into unified CalendarItem[] — filter events by type.
  // Filter out date_type='event' from extracted dates to avoid duplicates
  // with events already coming from /api/events (EventDetector data).
  const mergedItems = React.useMemo(() => {
    const includeEvents = typeFilter === 'all' || typeFilter === 'event';
    const filteredEvents = includeEvents ? events : [];
    const nonEventDates = dates.filter((d) => d.date_type !== 'event');
    return mergeToCalendarItems(filteredEvents, nonEventDates);
  }, [events, dates, typeFilter]);

  // Handlers
  const handleRefresh = React.useCallback(() => {
    logger.info('User triggered Calendar refresh');
    refetchEvents();
    refetchDates();
  }, [refetchEvents, refetchDates]);

  const handleViewChange = React.useCallback((mode: 'list' | 'calendar') => {
    logger.info('View mode changed', { to: mode });
    setViewMode(mode);
  }, []);

  const handleTypeFilterChange = React.useCallback((value: DateType | 'all') => {
    logger.info('Type filter changed', { to: value });
    setTypeFilter(value);
  }, []);

  // Dismiss handles both event dismissal and extracted date acknowledgment
  const handleDismiss = React.useCallback(async (id: string) => {
    logger.info('Dismiss item', { itemId: id.substring(0, 8) });
    try {
      await dismissEvent(id);
    } catch {
      // If dismiss fails (not an event), try acknowledging as extracted date
      await acknowledgeDate(id);
    }
  }, [dismissEvent, acknowledgeDate]);

  const handleSaveToCalendar = React.useCallback(async (id: string) => {
    logger.info('Save to calendar', { itemId: id.substring(0, 8) });
    await trackCalendarSave(id);
  }, [trackCalendarSave]);

  const handleSnooze = React.useCallback(async (id: string, until: Date) => {
    const untilStr = until.toISOString().split('T')[0]!;
    logger.info('Snooze item', { itemId: id.substring(0, 8), until: untilStr });
    await snoozeDate(id, untilStr);
  }, [snoozeDate]);

  // ─── Keyboard Navigation (Phase 4) ──────────────────────────────────────
  const [selectedTimelineIdx, setSelectedTimelineIdx] = React.useState(-1);

  const getTimelineButtons = React.useCallback((): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>('[id^="item-"] button'));
  }, []);

  const handleNextItem = React.useCallback(() => {
    const btns = getTimelineButtons();
    if (btns.length === 0) return;
    const next = Math.min(selectedTimelineIdx + 1, btns.length - 1);
    setSelectedTimelineIdx(next);
    btns[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    btns[next]?.focus();
    logger.debug('Keyboard nav', { direction: 'next', index: next });
  }, [selectedTimelineIdx, getTimelineButtons]);

  const handlePrevItem = React.useCallback(() => {
    const btns = getTimelineButtons();
    if (btns.length === 0) return;
    const prev = Math.max(selectedTimelineIdx - 1, 0);
    setSelectedTimelineIdx(prev);
    btns[prev]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    btns[prev]?.focus();
    logger.debug('Keyboard nav', { direction: 'prev', index: prev });
  }, [selectedTimelineIdx, getTimelineButtons]);

  useKeyboardShortcuts([
    { key: 'j', handler: handleNextItem, description: 'Next item', view: 'calendar' },
    { key: 'k', handler: handlePrevItem, description: 'Previous item', view: 'calendar' },
  ]);

  return (
    <div>
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

      {/* Error banner */}
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

      {/* Stats banner */}
      {!isLoading && <CalendarStats items={mergedItems} />}

      {/* Filters & view toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Type filter pills */}
          <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter by type">
            {TYPE_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={typeFilter === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTypeFilterChange(option.value as DateType | 'all')}
                className="text-xs"
                role="tab"
                aria-selected={typeFilter === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Button
            variant={showPast ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowPast((p: boolean) => !p)}
            className="gap-2"
          >
            <History className="h-3.5 w-3.5" />
            {showPast ? 'Hide Past' : 'Show Past'}
          </Button>

          <Button
            variant={showAcknowledged ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowAcknowledged((p: boolean) => !p)}
            className="gap-2"
          >
            <Check className="h-3 w-3" />
            {showAcknowledged ? 'Hide Done' : 'Show Done'}
          </Button>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewChange('list')}
            className="rounded-none gap-1.5"
            aria-label="List view"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">List</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewChange('calendar')}
            className="rounded-none gap-1.5"
            aria-label="Calendar view"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : viewMode === 'list' ? (
        <TimelineView
          items={mergedItems}
          highlightedItemId={highlightedItemId}
          onDismiss={handleDismiss}
          onSaveToCalendar={handleSaveToCalendar}
          onSnooze={handleSnooze}
        />
      ) : (
        <CalendarGrid
          items={mergedItems}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          onDismiss={handleDismiss}
          onSaveToCalendar={handleSaveToCalendar}
        />
      )}

      {/* Load more for paginated dates */}
      {hasMoreDates && viewMode === 'list' && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={loadMoreDates}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

/** Loading skeleton while data is being fetched. */
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i}>
          <Skeleton className="h-8 w-full rounded-lg mb-3" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
