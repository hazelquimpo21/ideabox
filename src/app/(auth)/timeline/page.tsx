/**
 * Timeline Page
 *
 * Displays extracted dates from emails organized chronologically.
 * Includes deadlines, birthdays, payment dues, appointments, and more.
 * Supports two view modes: grouped list and calendar.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Two view modes: List (grouped) and Calendar (monthly)
 * - Chronological view of all extracted dates
 * - Grouped by time period (overdue, today, tomorrow, etc.)
 * - Filter by date type (deadline, birthday, payment, etc.)
 * - Actions: acknowledge, snooze, hide
 * - Links to source emails
 * - Urgency indicators for overdue items
 * - Calendar view with color-coded date types (P6 Enhancement)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Route: /timeline
 * Protected: Yes (requires authentication)
 *
 * @module app/(auth)/timeline/page
 * @version 1.1.0
 * @since January 2026 (P6 Enhancement: Calendar View)
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Skeleton,
} from '@/components/ui';
import { useExtractedDates } from '@/hooks/useExtractedDates';
import type {
  ExtractedDate,
  DateType,
  DateStats,
  GroupedDates,
} from '@/hooks/useExtractedDates';
import {
  Calendar,
  CalendarClock,
  Clock,
  DollarSign,
  Cake,
  Heart,
  AlertTriangle,
  CalendarCheck,
  ArrowRight,
  Bell,
  RefreshCw,
  Check,
  Snooze,
  EyeOff,
  Mail,
  Star,
  Filter,
  ChevronDown,
  ChevronRight,
  // ─── P6 Enhancement: View Mode Icons ─────────────────────────────────────────
  List,         // For list view toggle button
  CalendarDays, // For calendar view toggle button
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── P6 Enhancement: Calendar View Component ─────────────────────────────────────
import { CalendarView } from '@/components/timeline';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TimelinePage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Date type configuration.
 * Maps each date type to display properties (icon, color, label).
 */
const DATE_TYPE_CONFIG: Record<
  DateType,
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  deadline: {
    icon: Clock,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Deadline',
  },
  event: {
    icon: Calendar,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Event',
  },
  payment_due: {
    icon: DollarSign,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Payment Due',
  },
  birthday: {
    icon: Cake,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
    label: 'Birthday',
  },
  anniversary: {
    icon: Heart,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Anniversary',
  },
  expiration: {
    icon: AlertTriangle,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: 'Expiration',
  },
  appointment: {
    icon: CalendarCheck,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Appointment',
  },
  follow_up: {
    icon: ArrowRight,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    label: 'Follow-up',
  },
  reminder: {
    icon: Bell,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    label: 'Reminder',
  },
  recurring: {
    icon: RefreshCw,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    label: 'Recurring',
  },
  other: {
    icon: CalendarClock,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    label: 'Other',
  },
};

/**
 * Filter options for date types.
 * "all" shows all types.
 */
const TYPE_FILTER_OPTIONS: Array<{ value: DateType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'payment_due', label: 'Payments' },
  { value: 'event', label: 'Events' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'expiration', label: 'Expirations' },
  { value: 'follow_up', label: 'Follow-ups' },
];

/**
 * Snooze preset options.
 */
const SNOOZE_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string for display.
 *
 * @param dateString - ISO date string (YYYY-MM-DD)
 * @returns Formatted date like "Mon, Jan 19"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00'); // Ensure local timezone
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculates the snooze date based on days from today.
 *
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
 * Stats banner showing date statistics.
 */
function StatsBanner({ stats }: { stats: DateStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Dates</p>
        </CardContent>
      </Card>
      <Card className={stats.overdue > 0 ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : ''}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${stats.overdue > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {stats.overdue}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Overdue</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <span className="text-2xl font-bold">{stats.pending}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Pending</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold">{stats.acknowledged}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Done</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Type filter dropdown component.
 */
function TypeFilter({
  value,
  onChange,
}: {
  value: DateType | 'all';
  onChange: (value: DateType | 'all') => void;
}) {
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-2">
        <Filter className="h-3 w-3" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as DateType | 'all')}
          className="absolute inset-0 opacity-0 cursor-pointer"
        >
          {TYPE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {TYPE_FILTER_OPTIONS.find((o) => o.value === value)?.label || 'All Types'}
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Date group header component.
 * Shows group title with optional urgency styling.
 */
function DateGroupHeader({
  title,
  count,
  isUrgent,
  isCollapsed,
  onToggle,
}: {
  title: string;
  count: number;
  isUrgent?: boolean;
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
        <span className="font-semibold">{title}</span>
        <Badge variant={isUrgent ? 'destructive' : 'secondary'}>
          {count}
        </Badge>
      </div>
      {isUrgent && <AlertTriangle className="h-4 w-4 text-red-500" />}
    </button>
  );
}

/**
 * Single date card component.
 * Displays date info with action buttons.
 */
function DateCard({
  date,
  onAcknowledge,
  onSnooze,
  onHide,
}: {
  date: ExtractedDate;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onHide: (id: string) => void;
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = React.useState(false);
  const typeConfig = DATE_TYPE_CONFIG[date.date_type];
  const TypeIcon = typeConfig.icon;

  // Determine if this date is overdue
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = date.date < today && !date.is_acknowledged;

  return (
    <Card className={`
      ${isOverdue ? 'border-red-200 dark:border-red-900' : ''}
      ${date.is_acknowledged ? 'opacity-60' : ''}
    `}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Date info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Type icon */}
            <div className={`p-2 rounded-lg ${typeConfig.bgColor} shrink-0`}>
              <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-medium truncate ${date.is_acknowledged ? 'line-through' : ''}`}>
                  {date.title}
                </h3>
                <Badge className={`text-xs shrink-0 ${typeConfig.bgColor} ${typeConfig.color} border-0`}>
                  {typeConfig.label}
                </Badge>
                {date.is_recurring && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {date.recurrence_pattern || 'Recurring'}
                  </Badge>
                )}
                {date.contacts?.is_vip && (
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                )}
              </div>

              {/* Date and time */}
              <p className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                {formatDate(date.date)}
                {date.time && ` at ${date.time}`}
                {isOverdue && ' (Overdue!)'}
              </p>

              {/* Description */}
              {date.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {date.description}
                </p>
              )}

              {/* Source email info */}
              {date.emails && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">
                    From: {date.emails.sender_name || date.emails.sender_email}
                  </span>
                  {date.emails.subject && (
                    <span className="truncate">
                      &quot;{date.emails.subject}&quot;
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* View email */}
            {date.email_id && (
              <Link href={`/inbox?email=${date.email_id}`}>
                <Button variant="ghost" size="icon" title="View email">
                  <Mail className="h-4 w-4" />
                </Button>
              </Link>
            )}

            {/* Acknowledge / Done */}
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

            {/* Snooze */}
            {!date.is_acknowledged && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                  title="Snooze"
                >
                  <Snooze className="h-4 w-4" />
                </Button>

                {/* Snooze dropdown */}
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

            {/* Hide */}
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
  );
}

/**
 * Loading skeleton for date cards.
 */
function DateCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no dates exist.
 */
function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <CalendarClock className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg mb-2">No dates found</CardTitle>
        <CardDescription>
          Deadlines, birthdays, and other dates will appear here
          <br />
          as they are extracted from your emails.
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
  return (
    <Card className="mb-6 border-destructive/50 bg-destructive/5">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Failed to load timeline</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Date group component that renders a collapsible group of dates.
 */
function DateGroup({
  title,
  dates,
  isUrgent,
  onAcknowledge,
  onSnooze,
  onHide,
}: {
  title: string;
  dates: ExtractedDate[];
  isUrgent?: boolean;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onHide: (id: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  if (dates.length === 0) return null;

  return (
    <div className="mb-6">
      <DateGroupHeader
        title={title}
        count={dates.length}
        isUrgent={isUrgent}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />

      {!isCollapsed && (
        <div className="space-y-3 mt-3">
          {dates.map((date) => (
            <DateCard
              key={date.id}
              date={date}
              onAcknowledge={onAcknowledge}
              onSnooze={onSnooze}
              onHide={onHide}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Timeline Page - Chronological view of extracted dates.
 *
 * Features:
 * - Grouped by time period (overdue, today, tomorrow, etc.)
 * - Filter by date type
 * - Acknowledge, snooze, and hide actions
 * - Links to source emails
 */
export default function TimelinePage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Local State
  // ─────────────────────────────────────────────────────────────────────────────

  const [typeFilter, setTypeFilter] = React.useState<DateType | 'all'>('all');
  const [showAcknowledged, setShowAcknowledged] = React.useState(false);

  // ─── P6 Enhancement: View Mode State ─────────────────────────────────────────
  // 'list' = grouped chronological list (default)
  // 'calendar' = monthly calendar grid
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');

  // ─────────────────────────────────────────────────────────────────────────────
  // Build filter options
  // ─────────────────────────────────────────────────────────────────────────────

  const filterOptions = React.useMemo(() => ({
    type: typeFilter === 'all' ? undefined : typeFilter,
    isAcknowledged: showAcknowledged ? undefined : false,
  }), [typeFilter, showAcknowledged]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch dates using the hook
  // ─────────────────────────────────────────────────────────────────────────────

  const {
    dates,
    groupedDates,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    acknowledge,
    snooze,
    hide,
  } = useExtractedDates(filterOptions);

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAcknowledge = async (dateId: string) => {
    logger.start('Acknowledge date', { dateId: dateId.substring(0, 8) });
    await acknowledge(dateId);
  };

  const handleSnooze = async (dateId: string, until: string) => {
    logger.start('Snooze date', { dateId: dateId.substring(0, 8), until });
    await snooze(dateId, until);
  };

  const handleHide = async (dateId: string) => {
    logger.start('Hide date', { dateId: dateId.substring(0, 8) });
    await hide(dateId);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Check if any groups have dates
  // ─────────────────────────────────────────────────────────────────────────────

  const hasAnyDates = dates.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Timeline"
        description="Deadlines, birthdays, and important dates from your emails."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Timeline' },
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

      {/* Error Banner */}
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {/* Stats Banner */}
      {!isLoading && <StatsBanner stats={stats} />}

      {/* Filters and View Toggle */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Left side: Type filter and Show Done */}
        <div className="flex items-center gap-4">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} />

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

        {/* ─── P6 Enhancement: View Mode Toggle ─────────────────────────────── */}
        {/* Right side: View mode toggle (List / Calendar) */}
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-none gap-1.5"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">List</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
            className="rounded-none gap-1.5"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Main Content Area - List or Calendar View */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        // ─── Loading Skeletons ─────────────────────────────────────────────────
        <div className="space-y-6">
          <div>
            <Skeleton className="h-10 w-full rounded-lg mb-3" />
            <DateCardSkeleton />
            <div className="mt-3" />
            <DateCardSkeleton />
          </div>
          <div>
            <Skeleton className="h-10 w-full rounded-lg mb-3" />
            <DateCardSkeleton />
          </div>
        </div>
      ) : !hasAnyDates ? (
        // ─── Empty State ───────────────────────────────────────────────────────
        <EmptyState />
      ) : viewMode === 'calendar' ? (
        // ─── P6 Enhancement: Calendar View ─────────────────────────────────────
        // Monthly calendar grid with color-coded date indicators
        <CalendarView
          dates={dates}
          onAcknowledge={handleAcknowledge}
          onSnooze={handleSnooze}
          onHide={handleHide}
        />
      ) : (
        // ─── List View (Default): Grouped Date Cards ───────────────────────────
        <>
          {/* Overdue - always show first with urgency styling */}
          <DateGroup
            title="Overdue"
            dates={groupedDates.overdue}
            isUrgent
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* Today */}
          <DateGroup
            title="Today"
            dates={groupedDates.today}
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* Tomorrow */}
          <DateGroup
            title="Tomorrow"
            dates={groupedDates.tomorrow}
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* This Week */}
          <DateGroup
            title="This Week"
            dates={groupedDates.thisWeek}
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* Next Week */}
          <DateGroup
            title="Next Week"
            dates={groupedDates.nextWeek}
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* Later */}
          <DateGroup
            title="Later"
            dates={groupedDates.later}
            onAcknowledge={handleAcknowledge}
            onSnooze={handleSnooze}
            onHide={handleHide}
          />

          {/* Load More (only in list view) */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore} className="gap-2">
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
