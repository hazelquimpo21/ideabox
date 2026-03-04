/**
 * Calendar Page — Events, Deadlines, and Dates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNIFIED CALENDAR PAGE (Phase 2 + March 2026 Improvements)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unified Calendar page merging Events + Timeline views. Provides:
 *
 *   - View Toggle: Calendar Grid / List View (via ?view= query param)
 *   - Type Filters: All, Events, Deadlines, Birthdays, Payments, etc.
 *     FIXED: Tabs now properly filter — "Events" only shows events,
 *     "Deadlines" only shows deadlines, etc. Previously the Events tab
 *     showed everything because extracted_dates weren't filtered when
 *     type='event', and non-event tabs still showed useEvents data.
 *   - Merged Data: Events from useEvents() + dates from useExtractedDates()
 *   - List View: Items grouped by time period (Today, Tomorrow, This Week, etc.)
 *     IMPROVED: EventCards now show event summary and key points for quick scanning.
 *   - Calendar Grid: Monthly grid from CalendarView component
 *     FIXED: Calendar view now shows both events AND extracted dates.
 *     Previously only passed extracted dates, missing all useEvents data.
 *   - Stats Banner: Merged stats from both data sources
 *   - Highlight: Scroll to specific item via ?highlight= param
 *   - Performance: URL updates use shallow state to prevent full re-renders.
 *     Filter/view state managed locally, not via router.replace which caused
 *     re-mounts and occasional redirects to inbox.
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
 * @updated March 2026 — Tab filtering fixes, calendar view events, performance
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  Sparkles,
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
 * Maps each DateType to its icon, color scheme, and display label.
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
 * Filter options for date types shown as tab pills.
 * "All" shows everything, other options filter to that specific type.
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
 * Provides quick-access durations for snoozing extracted dates.
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

/**
 * Converts EventData objects to ExtractedDate format for the CalendarView grid.
 *
 * CalendarView expects ExtractedDate[] — this bridges the gap so events from
 * the useEvents API can also appear as dots on the calendar grid.
 *
 * @param events - Array of events from useEvents hook
 * @returns Array of ExtractedDate-shaped objects for calendar rendering
 */
function eventsToExtractedDates(events: EventData[]): ExtractedDate[] {
  return events.map((event) => ({
    id: event.id,
    user_id: event.user_id,
    email_id: event.email_id || '',
    contact_id: null,
    date_type: 'event' as DateType,
    date: event.date,
    event_time: event.event_time,
    title: event.title,
    description: event.description,
    is_recurring: false,
    recurrence_pattern: null,
    confidence: 1,
    priority_score: event.priority_score,
    is_acknowledged: event.is_acknowledged,
    acknowledged_at: null,
    created_at: event.created_at,
    updated_at: event.created_at,
    emails: event.emails ? {
      id: event.emails.id,
      subject: event.emails.subject,
      sender_name: event.emails.sender_name,
      sender_email: event.emails.sender_email,
      snippet: event.emails.snippet ?? null,
      date: event.emails.date || event.created_at,
    } : null,
    contacts: event.contacts ?? null,
    event_metadata: event.event_metadata ?? null,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type filter bar — pill buttons for filtering by date type.
 *
 * Each button acts as a tab. The active tab is highlighted with the default
 * variant, inactive tabs use outline. Clicking a tab updates the type filter
 * which controls what data is shown in both list and calendar views.
 */
function TypeFilterBar({
  value,
  onChange,
}: {
  value: DateType | 'all';
  onChange: (value: DateType | 'all') => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter by type">
      {TYPE_FILTER_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(option.value)}
          className="text-xs"
          role="tab"
          aria-selected={value === option.value}
          aria-label={`Show ${option.label}`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Event summary section — shows AI-generated overview, key points, and
 * personalized "why attend" recommendation.
 *
 * Displays the eventSummary, keyPoints, and whyAttend from event metadata.
 * This gives users a quick at-a-glance reason to attend without reading
 * the full email. Only renders if metadata contains summary content.
 *
 * The whyAttend text is personalized based on the user's interests, location,
 * and the event's characteristics (NEW March 2026).
 */
function EventSummarySection({ event }: { event: EventData }) {
  const metadata = event.event_metadata;
  if (!metadata) return null;

  const { eventSummary, keyPoints, whyAttend, relevanceScore } = metadata;

  // Only show if we have some content to display
  if (!eventSummary && (!keyPoints || keyPoints.length === 0) && !whyAttend) return null;

  return (
    <div className="mt-2 p-2.5 rounded-md bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
      {/* "Why attend" personalized recommendation — shown prominently when available */}
      {whyAttend && (
        <div className="flex items-start gap-1.5 mb-1.5">
          <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 leading-snug">
            {whyAttend}
          </p>
        </div>
      )}

      {/* Summary line */}
      {eventSummary && (
        <p className="text-sm text-blue-800 dark:text-blue-200 leading-snug">
          {eventSummary}
        </p>
      )}

      {/* Key points as scannable bullets */}
      {keyPoints && keyPoints.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {keyPoints.map((point, i) => (
            <li key={i} className="text-xs text-blue-700/80 dark:text-blue-300/80 flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-blue-500/60" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Relevance indicator — small subtle badge */}
      {relevanceScore != null && relevanceScore >= 7 && (
        <div className="mt-1.5 flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-green-700 dark:text-green-400 font-medium uppercase tracking-wide">
            Highly relevant
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Date card component for displaying extracted dates in the list view.
 *
 * Shows extracted date info (title, type badge, date/time, description, sender)
 * with action buttons: acknowledge (mark done), snooze, hide, and view email.
 * Overdue items are highlighted with red borders and text.
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

                {/* Show event summary for event-type dates with metadata */}
                {date.date_type === 'event' && date.event_metadata && (
                  <EventSummarySection event={date as unknown as EventData} />
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
                  <Button variant="ghost" size="icon" title="View source email">
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
 *
 * Renders as a clickable bar with chevron, icon, title, and count.
 * Groups with urgent items (overdue) have red styling.
 * Groups with highlighted items (today with content) have green styling.
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
      aria-expanded={!isCollapsed}
      aria-label={`${title} — ${count} items`}
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
 *
 * Renders a collapsible section with a GroupHeader and a list of EventCards
 * (for events from useEvents) and DateCards (for extracted dates).
 * Auto-expands when a highlighted item is inside the group.
 * Auto-collapses groups with >10 items that aren't urgent or highlighted.
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

  // Auto-expand if a highlighted item is in this group
  React.useEffect(() => {
    if (highlightedItemId) {
      const hasItem = events.some((e) => e.id === highlightedItemId)
        || dates.some((d) => d.id === highlightedItemId);
      if (hasItem) {
        setIsCollapsed(false);
        logger.debug('Auto-expanding group for highlighted item', {
          group: title,
          highlightedItemId: highlightedItemId.substring(0, 8),
        });
      }
    }
  }, [highlightedItemId, events, dates, title]);

  // Don't render empty groups
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
          {/* Render events (from useEvents API) */}
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
              {/* Event overview: AI summary and key points for quick scanning */}
              <EventSummarySection event={event} />
            </div>
          ))}

          {/* Render extracted dates (from useExtractedDates Supabase query) */}
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
 * Shows placeholder cards while data is being fetched.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Skeleton stats banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-8 w-12 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Skeleton group headers and cards */}
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
 * Empty state when no items exist for the current filters.
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
 * PERFORMANCE NOTES (March 2026):
 * - Filter/view state is managed with React.useState, NOT synced back to the
 *   URL on every change. Previously router.replace() on each filter toggle
 *   caused full Next.js re-renders and occasional redirects to /inbox.
 * - URL params are read once on mount (via useSearchParams) for initial state.
 * - Memoized computed values prevent unnecessary re-renders of child components.
 * - Data fetching hooks (useEvents, useExtractedDates) handle their own caching.
 *
 * TAB FILTERING FIX (March 2026):
 * - "Events" tab: Shows only events from useEvents + event-type extracted dates
 * - "Deadlines" tab: Shows only deadline-type extracted dates (no events)
 * - Other tabs: Shows only that specific date_type from extracted dates
 * - "All" tab: Shows everything from both data sources
 */
export default function CalendarPage() {
  logger.start('Rendering Calendar page');

  // ─── URL Parameters (read once for initial state) ──────────────────────────
  // PERF: We read search params only for initial hydration. State changes
  // are managed locally to avoid router.replace() re-renders.
  const searchParams = useSearchParams();
  const initialViewRef = React.useRef(searchParams.get('view'));
  const initialTypeRef = React.useRef(searchParams.get('type'));
  const initialShowPastRef = React.useRef(searchParams.get('showPast') === 'true');
  const highlightedItemId = searchParams.get('highlight');

  // ─── Local State ───────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>(
    initialViewRef.current === 'calendar' ? 'calendar' : 'list'
  );
  const [typeFilter, setTypeFilter] = React.useState<DateType | 'all'>(
    (initialTypeRef.current as DateType | 'all') || 'all'
  );
  const [showPast, setShowPast] = React.useState(initialShowPastRef.current);
  const [showAcknowledged, setShowAcknowledged] = React.useState(false);

  // ─── Data Fetching: Events from /api/events ────────────────────────────────
  // These are rich events extracted from emails with the has_event label.
  // They come with event_metadata containing locality, RSVP info, summaries.
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

  // ─── Data Fetching: Extracted Dates from Supabase ──────────────────────────
  // These are date items (deadlines, birthdays, payments, etc.) extracted
  // from emails by the DateExtractor analyzer.
  //
  // FIX (March 2026): When typeFilter is 'event', we still pass 'event' to
  // useExtractedDates so it only returns event-type dates (not all dates).
  // Previously, 'event' filter was only handled by hiding useEvents data,
  // but extracted dates were unfiltered — showing deadlines etc. in "Events" tab.
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
  // When ?highlight=<id> is present, scroll that item into view after loading.
  React.useEffect(() => {
    if (highlightedItemId && !isLoading) {
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        const element = document.getElementById(`item-${highlightedItemId}`);
        if (element) {
          logger.info('Scrolling to highlighted item', {
            itemId: highlightedItemId.substring(0, 8),
          });
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          logger.warn('Highlighted item not found in DOM', {
            itemId: highlightedItemId.substring(0, 8),
          });
        }
      });
    }
  }, [highlightedItemId, isLoading]);

  // ─── Handler: View Mode Toggle ─────────────────────────────────────────────
  const handleViewChange = React.useCallback((mode: 'list' | 'calendar') => {
    logger.info('View mode changed', { from: viewMode, to: mode });
    setViewMode(mode);
  }, [viewMode]);

  // ─── Handler: Type Filter Change ───────────────────────────────────────────
  const handleTypeFilterChange = React.useCallback((value: DateType | 'all') => {
    logger.info('Type filter changed', { from: typeFilter, to: value });
    setTypeFilter(value);
  }, [typeFilter]);

  // ─── Handler: Show Past Toggle ─────────────────────────────────────────────
  const handleTogglePast = React.useCallback(() => {
    setShowPast((prev) => {
      const next = !prev;
      logger.info('Toggle show past', { showPast: next });
      return next;
    });
  }, []);

  // ─── Handler: Refresh ──────────────────────────────────────────────────────
  const handleRefresh = React.useCallback(() => {
    logger.info('User triggered Calendar refresh');
    refetchEvents();
    refetchDates();
  }, [refetchEvents, refetchDates]);

  // ─── Event Action Handlers ─────────────────────────────────────────────────

  const handleDismissEvent = React.useCallback(async (eventId: string) => {
    logger.start('Dismiss event', { eventId: eventId.substring(0, 8) });
    try {
      await dismissEvent(eventId);
      logger.success('Event dismissed', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to dismiss event', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [dismissEvent]);

  const handleSaveToMaybe = React.useCallback(async (eventId: string) => {
    logger.start('Save to maybe', { eventId: eventId.substring(0, 8) });
    try {
      await saveToMaybe(eventId);
      logger.success('Saved to maybe', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to save to maybe', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [saveToMaybe]);

  const handleRemoveFromMaybe = React.useCallback(async (eventId: string) => {
    logger.start('Remove from maybe', { eventId: eventId.substring(0, 8) });
    try {
      await removeEventState(eventId, 'maybe');
      logger.success('Removed from maybe', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to remove from maybe', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [removeEventState]);

  const handleAddToCalendar = React.useCallback(async (eventId: string) => {
    logger.start('Track calendar save', { eventId: eventId.substring(0, 8) });
    try {
      await trackCalendarSave(eventId);
      logger.success('Calendar save tracked', { eventId: eventId.substring(0, 8) });
    } catch (err) {
      logger.error('Failed to track calendar save', { eventId: eventId.substring(0, 8), error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [trackCalendarSave]);

  // ─── Date Action Handlers ──────────────────────────────────────────────────

  const handleAcknowledgeDate = React.useCallback(async (dateId: string) => {
    logger.start('Acknowledge date', { dateId: dateId.substring(0, 8) });
    await acknowledgeDate(dateId);
  }, [acknowledgeDate]);

  const handleSnoozeDate = React.useCallback(async (dateId: string, until: string) => {
    logger.start('Snooze date', { dateId: dateId.substring(0, 8), until });
    await snoozeDate(dateId, until);
  }, [snoozeDate]);

  const handleHideDate = React.useCallback(async (dateId: string) => {
    logger.start('Hide date', { dateId: dateId.substring(0, 8) });
    await hideDate(dateId);
  }, [hideDate]);

  // ─── Computed: Filter events by type ───────────────────────────────────────
  //
  // TAB FILTERING LOGIC (March 2026 fix):
  //
  // The useEvents hook always returns events (date_type='event').
  // The useExtractedDates hook filters by the selected type.
  //
  // When typeFilter is:
  //   'all'   → show events from useEvents + all dates from useExtractedDates
  //   'event' → show events from useEvents + event-type dates from useExtractedDates
  //   other   → hide events from useEvents, show only that type from useExtractedDates
  //
  // This ensures clicking "Deadlines" tab only shows deadlines, not events.
  const filteredGroupedEvents = React.useMemo(() => {
    // Only show useEvents data when filter is 'all' or 'event'
    if (typeFilter !== 'all' && typeFilter !== 'event') {
      logger.debug('Hiding useEvents data for non-event filter', { typeFilter });
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

  // ─── Computed: Merge events into calendar view dates ───────────────────────
  // CalendarView expects ExtractedDate[]. We convert events to that format
  // and merge with extracted dates so the calendar grid shows everything.
  const calendarViewDates = React.useMemo(() => {
    // Apply type filter: only include events if filter is 'all' or 'event'
    const includeEvents = typeFilter === 'all' || typeFilter === 'event';
    const eventDates = includeEvents ? eventsToExtractedDates(events) : [];

    // Deduplicate by ID (events may also exist in extracted_dates)
    const dateIds = new Set(dates.map((d) => d.id));
    const uniqueEventDates = eventDates.filter((ed) => !dateIds.has(ed.id));

    const merged = [...dates, ...uniqueEventDates];
    logger.debug('Calendar view dates merged', {
      extractedDates: dates.length,
      events: uniqueEventDates.length,
      total: merged.length,
      typeFilter,
    });
    return merged;
  }, [dates, events, typeFilter]);

  // Check if there are any items to display (considering current filters)
  const hasAnyItems = React.useMemo(() => {
    if (typeFilter === 'all') return events.length > 0 || dates.length > 0;
    if (typeFilter === 'event') return events.length > 0 || dates.length > 0;
    return dates.length > 0;
  }, [events.length, dates.length, typeFilter]);

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

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !hasAnyItems ? (
        <EmptyState />
      ) : viewMode === 'calendar' ? (
        // ─── Calendar Grid View ─────────────────────────────────────────────
        // FIX (March 2026): Now passes merged events + dates to the calendar
        // grid. Previously only passed extracted dates, so events from the
        // useEvents API were invisible in calendar view.
        <CalendarView
          dates={calendarViewDates}
          onAcknowledge={handleAcknowledgeDate}
          onSnooze={handleSnoozeDate}
          onHide={handleHideDate}
        />
      ) : (
        // ─── List View: Merged Groups ───────────────────────────────────────
        <>
          {/* Overdue — only shown when "Show Past" is enabled */}
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

          {/* Load More — for paginated extracted dates */}
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
