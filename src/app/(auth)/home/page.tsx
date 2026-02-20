/**
 * Home Page — Daily Briefing & Top Priorities
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 2 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full-featured Home page replacing the Phase 1 thin wrapper. Provides a
 * personalized daily briefing with five sections:
 *
 *   A. Daily Briefing Header — greeting + summary stats
 *   B. Top Priorities — top 3 AI-scored priority cards (reuses PriorityCard)
 *   C. Today's Schedule — compact timeline of today's events/deadlines
 *   D. Pending Tasks — top 5 pending tasks with quick-complete checkboxes
 *   E. Profile Completion Nudge — shown when profile < 50% complete
 *
 * Route: /home
 * Redirect: /hub → /home (configured in next.config.mjs)
 *
 * @module app/(auth)/home/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout';
import { ProfileCompletionNudge } from '@/components/hub';
import { DailyBriefingHeader, TodaySchedule, PendingTasksList } from '@/components/home';
import type { ScheduleItem } from '@/components/home';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { useHubPriorities, useUserContext, useActions, useExtractedDates, useEvents } from '@/hooks';
import { useAuth } from '@/lib/auth';
import type { HubPriorityItem } from '@/services/hub';
import {
  Target,
  Mail,
  CheckSquare,
  Calendar,
  CalendarClock,
  Clock,
  ArrowRight,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Building2,
  TrendingUp,
  Brain,
  Zap,
  MessageSquare,
  Eye,
  Archive,
  CalendarPlus,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('HomePage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type configuration for Hub priority items.
 * Maps each item type to its display properties.
 */
const TYPE_CONFIG: Record<
  HubPriorityItem['type'],
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  email: {
    icon: Mail,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Email',
  },
  action: {
    icon: CheckSquare,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Action',
  },
  event: {
    icon: Calendar,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Event',
  },
  extracted_date: {
    icon: CalendarClock,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    label: 'Date',
  },
};

/**
 * Action button configuration for priority cards.
 */
const ACTION_CONFIG: Record<
  NonNullable<HubPriorityItem['suggestedAction']>,
  { icon: React.ElementType; label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  respond: { icon: MessageSquare, label: 'Respond', variant: 'default' },
  review: { icon: Eye, label: 'Review', variant: 'secondary' },
  decide: { icon: Brain, label: 'Decide', variant: 'default' },
  schedule: { icon: CalendarPlus, label: 'Schedule', variant: 'secondary' },
  archive: { icon: Archive, label: 'Archive', variant: 'outline' },
  attend: { icon: Calendar, label: 'RSVP', variant: 'default' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS — Priority Card (reused from Hub)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Priority card for a single Hub item.
 * Replicates the PriorityCard from the Hub page for display on the Home page.
 */
function PriorityCard({
  item,
  rank,
}: {
  item: HubPriorityItem;
  rank: number;
}) {
  const typeConfig = TYPE_CONFIG[item.type];
  const TypeIcon = typeConfig.icon;
  const actionConfig = item.suggestedAction ? ACTION_CONFIG[item.suggestedAction] : null;
  const ActionIcon = actionConfig?.icon;

  /** Returns a color class based on the priority score. */
  const getPriorityColor = (score: number) => {
    if (score >= 80) return 'text-red-600 dark:text-red-400';
    if (score >= 60) return 'text-orange-600 dark:text-orange-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/20">
      {/* Rank indicator */}
      <div className="absolute top-0 left-0 w-10 h-10 flex items-center justify-center">
        <span className="text-4xl font-bold text-muted-foreground/20">
          {rank}
        </span>
      </div>

      {/* Priority score indicator */}
      <div className="absolute top-3 right-3">
        <div className={`flex items-center gap-1.5 ${getPriorityColor(item.priorityScore)}`}>
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-semibold">{item.priorityScore}</span>
        </div>
      </div>

      <CardHeader className="pb-2 pt-8">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Type and client badges */}
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {typeConfig.label}
              </Badge>
              {item.clientName && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />
                  {item.clientName}
                </Badge>
              )}
              {item.timeRemaining && (
                <Badge
                  variant={item.timeRemaining === 'Overdue!' ? 'destructive' : 'outline'}
                  className="text-xs gap-1"
                >
                  <Clock className="h-3 w-3" />
                  {item.timeRemaining}
                </Badge>
              )}
            </div>

            {/* Title */}
            <CardTitle className="text-lg line-clamp-2">
              {item.title}
            </CardTitle>

            {/* Sender for emails */}
            {item.senderName && (
              <p className="text-sm text-muted-foreground mt-1">
                From: {item.senderName}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {/* AI Summary or description */}
        {item.aiSummary ? (
          <div className="flex items-start gap-2 mb-3 p-2 rounded-md bg-muted/50">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">{item.aiSummary}</p>
          </div>
        ) : item.description ? (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {item.description}
          </p>
        ) : null}

        {/* Why important */}
        <div className="flex items-start gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            {item.whyImportant}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href={item.href} className="flex-1">
            <Button className="w-full gap-2" variant="default">
              <Zap className="h-4 w-4" />
              View & Act
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {actionConfig && ActionIcon && (
            <Button variant={actionConfig.variant} size="icon" title={actionConfig.label}>
              <ActionIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Score breakdown (collapsible detail) */}
        <details className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Score breakdown
          </summary>
          <div className="mt-2 grid grid-cols-5 gap-1 text-xs text-muted-foreground">
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.base.toFixed(1)}</div>
              <div>Base</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.deadline.toFixed(1)}x</div>
              <div>Deadline</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.client.toFixed(1)}x</div>
              <div>Client</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.staleness.toFixed(1)}x</div>
              <div>Staleness</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{item.scoreFactors.momentum.toFixed(1)}x</div>
              <div>Momentum</div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for priority cards.
 */
function PriorityCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-6 w-3/4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <Skeleton className="h-16 w-full mb-3" />
        <Skeleton className="h-4 w-full mb-4" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the first name from a user name string or email.
 * @param name - Full name or email address
 * @returns First name or email prefix
 */
function getFirstName(name: string | null | undefined, email: string | undefined): string | null {
  if (name) {
    return name.split(' ')[0];
  }
  if (email) {
    return email.split('@')[0];
  }
  return null;
}

/**
 * Gets today's date in YYYY-MM-DD format for filtering.
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets tomorrow's date in YYYY-MM-DD format for filtering.
 */
function getTomorrowString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Home Page — full Phase 2 implementation.
 *
 * Shows a personalized daily briefing with:
 * 1. Greeting header with summary statistics
 * 2. Top 3 AI-scored priority cards
 * 3. Today's schedule (events + extracted dates)
 * 4. Top 5 pending tasks with quick-complete
 * 5. Profile completion nudge (if < 50%)
 */
export default function HomePage() {
  logger.start('Rendering Home page');

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const firstName = getFirstName(user?.name, user?.email);

  // ─── Hub Priorities (Section B) ────────────────────────────────────────────
  const {
    items: priorityItems,
    isLoading: isPrioritiesLoading,
    error: prioritiesError,
    refetch: refetchPriorities,
  } = useHubPriorities({ limit: 3, refreshInterval: 5 * 60 * 1000 });

  // ─── User Context (Section E: Profile Nudge) ──────────────────────────────
  const {
    completionPercent,
    incompleteSections,
    isLoading: isContextLoading,
  } = useUserContext();

  // ─── Actions / Tasks (Section D) ───────────────────────────────────────────
  const {
    actions: pendingTasks,
    isLoading: isTasksLoading,
    toggleComplete,
    stats: taskStats,
  } = useActions({ status: 'pending', sortBy: 'urgency', limit: 5 });

  // ─── Extracted Dates for Today's Schedule (Section C) ──────────────────────
  const today = getTodayString();
  const tomorrow = getTomorrowString();

  const {
    dates: extractedDates,
    isLoading: isDatesLoading,
  } = useExtractedDates({ from: today, to: tomorrow, isAcknowledged: false });

  // ─── Events for Today's Schedule (Section C) ──────────────────────────────
  const {
    events,
    isLoading: isEventsLoading,
    stats: eventStats,
  } = useEvents({ includePast: false });

  // ─── Refresh State ─────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    logger.info('User triggered Home page refresh');
    setIsRefreshing(true);
    await refetchPriorities();
    setIsRefreshing(false);
    logger.success('Home page refresh complete');
  };

  // ─── Build Schedule Items (merge events + extracted dates) ─────────────────

  const scheduleItems: ScheduleItem[] = React.useMemo(() => {
    const items: ScheduleItem[] = [];

    // Add extracted dates for today/tomorrow
    for (const date of extractedDates) {
      items.push({
        id: date.id,
        title: date.title,
        time: date.event_time ? formatTime(date.event_time) : null,
        type: date.date_type,
        isTomorrow: date.date === tomorrow,
      });
    }

    // Add events for today/tomorrow from useEvents
    for (const event of events) {
      if (event.date === today || event.date === tomorrow) {
        // Avoid duplicates (events may also appear as extracted_dates)
        if (!items.some((item) => item.title === event.title && item.time === (event.event_time ? formatTime(event.event_time) : null))) {
          items.push({
            id: event.id,
            title: event.title,
            time: event.event_time ? formatTime(event.event_time) : null,
            type: 'event',
            isTomorrow: event.date === tomorrow,
          });
        }
      }
    }

    // Sort: today first, then by time (null/all-day last)
    items.sort((a, b) => {
      if (a.isTomorrow !== b.isTomorrow) return a.isTomorrow ? 1 : -1;
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    logger.debug('Built schedule items', {
      total: items.length,
      today: items.filter((i) => !i.isTomorrow).length,
      tomorrow: items.filter((i) => i.isTomorrow).length,
    });

    return items;
  }, [extractedDates, events, today, tomorrow]);

  // ─── Compute Briefing Stats ────────────────────────────────────────────────

  const todayEventCount = scheduleItems.filter((i) => !i.isTomorrow).length;
  const isScheduleLoading = isDatesLoading || isEventsLoading;

  logger.debug('Home page state', {
    firstName,
    priorityCount: priorityItems.length,
    todayEventCount,
    pendingTaskCount: taskStats.pending,
    isLoading: isPrioritiesLoading || isScheduleLoading || isTasksLoading,
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Home"
        description="Your daily briefing and top priorities."
        breadcrumbs={[
          { label: 'Home' },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isPrioritiesLoading || isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* ─── Section A: Daily Briefing Header ─────────────────────────────── */}
      <DailyBriefingHeader
        userName={firstName}
        priorityCount={priorityItems.length}
        eventCount={todayEventCount}
        taskCount={taskStats.pending}
        isLoading={isPrioritiesLoading || isScheduleLoading || isTasksLoading}
      />

      {/* ─── Section E: Profile Completion Nudge ──────────────────────────── */}
      {!isContextLoading && (
        <ProfileCompletionNudge
          completionPercent={completionPercent}
          incompleteSections={incompleteSections}
        />
      )}

      {/* ─── Section B: Top Priorities ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-red-500" />
          Top Priorities
        </h2>

        {/* Error state */}
        {prioritiesError && (
          <Card className="mb-4 border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Failed to load priorities</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {prioritiesError.message}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {isPrioritiesLoading ? (
            <>
              <PriorityCardSkeleton />
              <PriorityCardSkeleton />
              <PriorityCardSkeleton />
            </>
          ) : priorityItems.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg mb-1">All caught up!</CardTitle>
                <CardDescription>No urgent priorities right now.</CardDescription>
              </CardContent>
            </Card>
          ) : (
            priorityItems.map((item, index) => (
              <PriorityCard key={item.id} item={item} rank={index + 1} />
            ))
          )}
        </div>
      </section>

      {/* ─── Sections C & D: Schedule + Tasks (side by side on desktop) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Section C: Today's Schedule */}
        <TodaySchedule
          items={scheduleItems}
          isLoading={isScheduleLoading}
        />

        {/* Section D: Pending Tasks */}
        <PendingTasksList
          tasks={pendingTasks}
          isLoading={isTasksLoading}
          onToggleComplete={toggleComplete}
        />
      </div>

      {/* ─── Explore More Navigation ──────────────────────────────────────── */}
      {!isPrioritiesLoading && (
        <div className="pt-6 border-t">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Explore more
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/inbox">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <span className="font-medium">Inbox</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/tasks">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-purple-500" />
                  <span className="font-medium">Tasks</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/contacts">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-teal-500" />
                  <span className="font-medium">Contacts</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/calendar">
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Calendar</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a time string (HH:MM:SS or HH:MM) to a display format (e.g. "2:30 PM").
 * @param time - Time string in HH:MM or HH:MM:SS format
 * @returns Formatted time like "2:30 PM"
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
