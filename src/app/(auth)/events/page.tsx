/**
 * 📅 Events Page
 *
 * Displays events extracted from emails in a friendly, card-based layout.
 * Events are grouped by time period for easy scanning.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BACKGROUND
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Since January 2026, events are no longer a primary email category. Instead,
 * they are detected via the `has_event` label and stored in extracted_dates
 * with date_type = 'event'. This page provides a dedicated view for events,
 * separate from the timeline which shows all date types mixed together.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Chronological event cards grouped by time period
 * - Quick stats banner (total, today, this week)
 * - Add to Calendar integration
 * - Link to source emails
 * - Toggle to show past events
 * - Acknowledge (mark as done) functionality
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Path: /events
 * Protected: Yes (requires authentication)
 * Query params:
 *   - highlight: Event ID to scroll to and highlight
 *   - showPast: 'true' to include past events
 *
 * @module app/(auth)/events/page
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { EventCard } from '@/components/events';
import { useEvents } from '@/hooks/useEvents';
import type { EventData, GroupedEvents, EventStats } from '@/hooks/useEvents';
import {
  Calendar,
  CalendarDays,
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  History,
  PartyPopper,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EventsPage');

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Stats banner showing event statistics.
 * Provides a quick overview of upcoming events at a glance.
 */
function StatsBanner({ stats }: { stats: EventStats }) {
  logger.debug('Rendering StatsBanner', stats);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total Events */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Events</p>
        </CardContent>
      </Card>

      {/* Today */}
      <Card className={stats.today > 0 ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' : ''}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className={`h-4 w-4 ${stats.today > 0 ? 'text-green-500' : 'text-muted-foreground'}`} />
            <span className={`text-2xl font-bold ${stats.today > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
              {stats.today}
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
            <span className="text-2xl font-bold">{stats.thisWeek}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">This Week</p>
        </CardContent>
      </Card>

      {/* Upcoming */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-500" />
            <span className="text-2xl font-bold">{stats.upcoming}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Event group header component.
 * Shows group title with count and collapsible toggle.
 */
function EventGroupHeader({
  title,
  count,
  icon: Icon,
  iconColor,
  isHighlighted,
  isCollapsed,
  onToggle,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  iconColor: string;
  isHighlighted?: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center justify-between py-3 px-4 rounded-lg
        ${isHighlighted
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
        <Badge variant={isHighlighted ? 'default' : 'secondary'}>
          {count}
        </Badge>
      </div>
    </button>
  );
}

/**
 * Event group component.
 * Renders a collapsible group of event cards.
 */
function EventGroup({
  title,
  events,
  icon,
  iconColor,
  isHighlighted,
  highlightedEventId,
  onAcknowledge,
}: {
  title: string;
  events: EventData[];
  icon: React.ElementType;
  iconColor: string;
  isHighlighted?: boolean;
  highlightedEventId?: string | null;
  onAcknowledge: (id: string) => void;
}) {
  // Start collapsed if this is the "Later" or past group with many events
  const [isCollapsed, setIsCollapsed] = React.useState(
    events.length > 10 && !isHighlighted
  );

  // Expand if highlighted event is in this group
  React.useEffect(() => {
    if (highlightedEventId && events.some((e) => e.id === highlightedEventId)) {
      setIsCollapsed(false);
      logger.debug('Expanding group for highlighted event', {
        title,
        highlightedEventId: highlightedEventId.substring(0, 8),
      });
    }
  }, [highlightedEventId, events, title]);

  if (events.length === 0) return null;

  logger.debug('Rendering EventGroup', {
    title,
    count: events.length,
    isCollapsed,
  });

  return (
    <div className="mb-6">
      <EventGroupHeader
        title={title}
        count={events.length}
        icon={icon}
        iconColor={iconColor}
        isHighlighted={isHighlighted}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />

      {!isCollapsed && (
        <div className="space-y-3 mt-3">
          {events.map((event) => (
            <div
              key={event.id}
              id={`event-${event.id}`}
              className={
                highlightedEventId === event.id
                  ? 'ring-2 ring-green-500 ring-offset-2 rounded-lg'
                  : ''
              }
            >
              <EventCard
                event={event}
                onAcknowledge={onAcknowledge}
                showSourceEmail
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for event cards.
 */
function EventCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no events exist.
 * Shows a friendly message encouraging users that events will appear here.
 */
function EmptyState({ showPast }: { showPast: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-lg mb-2">
          {showPast ? 'No events found' : 'No upcoming events'}
        </CardTitle>
        <CardDescription className="max-w-sm">
          Events from your emails will appear here as they are detected.
          This includes meetups, webinars, appointments, and other gatherings.
        </CardDescription>
      </CardContent>
    </Card>
  );
}

/**
 * Error banner component.
 */
function ErrorBanner({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  logger.error('Events page error', { error: error.message });

  return (
    <Card className="mb-6 border-destructive/50 bg-destructive/5">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Failed to load events</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events Page - Card-based view of events from emails.
 *
 * Features:
 * - Events grouped by time period (Today, Tomorrow, This Week, etc.)
 * - Quick stats banner
 * - Add to Calendar functionality
 * - Toggle to show past events
 * - Highlight specific event via URL param
 */
export default function EventsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // URL Parameters
  // ─────────────────────────────────────────────────────────────────────────────

  const searchParams = useSearchParams();
  const highlightedEventId = searchParams.get('highlight');
  const showPastParam = searchParams.get('showPast') === 'true';

  // ─────────────────────────────────────────────────────────────────────────────
  // Local State
  // ─────────────────────────────────────────────────────────────────────────────

  const [showPast, setShowPast] = React.useState(showPastParam);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch events using the hook
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    events,
    groupedEvents,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    acknowledge,
  } = useEvents({
    includePast: showPast,
  });

  logger.debug('Events page state', {
    isLoading,
    hasError: !!error,
    eventCount: events.length,
    showPast,
    highlightedEventId: highlightedEventId?.substring(0, 8),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scroll to highlighted event on load
  // ─────────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (highlightedEventId && !isLoading && events.length > 0) {
      const element = document.getElementById(`event-${highlightedEventId}`);
      if (element) {
        logger.info('Scrolling to highlighted event', {
          eventId: highlightedEventId.substring(0, 8),
        });
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedEventId, isLoading, events.length]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAcknowledge = async (eventId: string) => {
    logger.start('Acknowledge event', { eventId: eventId.substring(0, 8) });
    await acknowledge(eventId);
    logger.success('Event acknowledged', { eventId: eventId.substring(0, 8) });
  };

  const handleTogglePast = () => {
    const newShowPast = !showPast;
    logger.info('Toggle show past events', { showPast: newShowPast });
    setShowPast(newShowPast);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Check if any groups have events
  // ─────────────────────────────────────────────────────────────────────────────

  const hasAnyEvents = events.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Page Header */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Events"
        description="Meetings, meetups, and events from your emails."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Events' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Error Banner */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Stats Banner */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {!isLoading && <StatsBanner stats={stats} />}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Filters */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            `${events.length} event${events.length !== 1 ? 's' : ''}`
          )}
        </div>

        {/* Show Past Events Toggle */}
        <Button
          variant={showPast ? 'secondary' : 'outline'}
          size="sm"
          onClick={handleTogglePast}
          className="gap-2"
        >
          <History className="h-3.5 w-3.5" />
          {showPast ? 'Hide Past' : 'Show Past'}
        </Button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Main Content */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        // ─── Loading Skeletons ─────────────────────────────────────────────────
        <div className="space-y-6">
          <div>
            <Skeleton className="h-10 w-full rounded-lg mb-3" />
            <EventCardSkeleton />
            <div className="mt-3" />
            <EventCardSkeleton />
          </div>
          <div>
            <Skeleton className="h-10 w-full rounded-lg mb-3" />
            <EventCardSkeleton />
          </div>
        </div>
      ) : !hasAnyEvents ? (
        // ─── Empty State ───────────────────────────────────────────────────────
        <EmptyState showPast={showPast} />
      ) : (
        // ─── Event Groups ──────────────────────────────────────────────────────
        <>
          {/* Past Events (only if showPast is true) */}
          {showPast && groupedEvents.overdue.length > 0 && (
            <EventGroup
              title="Past Events"
              events={groupedEvents.overdue}
              icon={History}
              iconColor="text-gray-500"
              highlightedEventId={highlightedEventId}
              onAcknowledge={handleAcknowledge}
            />
          )}

          {/* Today - highlighted */}
          <EventGroup
            title="Today"
            events={groupedEvents.today}
            icon={CalendarCheck}
            iconColor="text-green-500"
            isHighlighted={groupedEvents.today.length > 0}
            highlightedEventId={highlightedEventId}
            onAcknowledge={handleAcknowledge}
          />

          {/* Tomorrow */}
          <EventGroup
            title="Tomorrow"
            events={groupedEvents.tomorrow}
            icon={Calendar}
            iconColor="text-blue-500"
            highlightedEventId={highlightedEventId}
            onAcknowledge={handleAcknowledge}
          />

          {/* This Week */}
          <EventGroup
            title="This Week"
            events={groupedEvents.thisWeek}
            icon={CalendarDays}
            iconColor="text-purple-500"
            highlightedEventId={highlightedEventId}
            onAcknowledge={handleAcknowledge}
          />

          {/* Next Week */}
          <EventGroup
            title="Next Week"
            events={groupedEvents.nextWeek}
            icon={CalendarDays}
            iconColor="text-orange-500"
            highlightedEventId={highlightedEventId}
            onAcknowledge={handleAcknowledge}
          />

          {/* Later */}
          <EventGroup
            title="Later"
            events={groupedEvents.later}
            icon={Calendar}
            iconColor="text-gray-500"
            highlightedEventId={highlightedEventId}
            onAcknowledge={handleAcknowledge}
          />

          {/* ─── Load More ────────────────────────────────────────────────────── */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore} className="gap-2">
                Load More Events
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
