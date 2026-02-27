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
 *   F. Idea Sparks — AI-generated ideas from email content (NEW Feb 2026)
 *   G. Daily Review — review queue for scan-worthy emails (NEW Feb 2026)
 *   H. Insights — synthesized tips/frameworks from newsletters (NEW Feb 2026)
 *   I. News Brief — factual news items from email content (NEW Feb 2026)
 *   K. Saved Links — AI-analyzed links from email content (NEW Feb 2026)
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
import {
  DailyBriefingHeader,
  TodaySchedule,
  PendingTasksList,
  IdeaSparksCard,
  DailyReviewCard,
  InsightsCard,
  NewsBriefCard,
  SavedLinksCard,
  EmailSummaryCard,
  ActiveProjectsWidget,
} from '@/components/home';
import type { ScheduleItem } from '@/components/home';
import { PriorityCard, PriorityCardSkeleton } from '@/components/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  useHubPriorities,
  useUserContext,
  useActions,
  useExtractedDates,
  useEvents,
  useIdeas,
  useLinks,
  useReviewQueue,
  useSummary,
  useSyncStatus,
  useProjects,
  useProjectItems,
} from '@/hooks';
import { useAuth } from '@/lib/auth';
import {
  Target,
  RefreshCw,
  Sparkles,
  CheckSquare,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('HomePage');

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

  // ─── Idea Sparks (Section F — NEW Feb 2026) ────────────────────────────
  const {
    items: ideaItems,
    isLoading: isIdeasLoading,
    saveIdea,
    dismissIdea,
  } = useIdeas({ limit: 10 });

  // ─── Saved Links (Section K — NEW Feb 2026) ──────────────────────────
  const {
    items: linkItems,
    isLoading: isLinksLoading,
    saveLink,
    dismissLink,
  } = useLinks({ limit: 15 });

  // ─── Daily Review Queue (Section G — NEW Feb 2026) ────────────────────
  const {
    items: reviewItems,
    stats: reviewStats,
    isLoading: isReviewLoading,
    markReviewed,
  } = useReviewQueue({ limit: 8 });

  // ─── Email Summary (NEW Feb 2026) ─────────────────────────────────────
  const {
    summary,
    isLoading: isSummaryLoading,
    isGenerating: isSummaryGenerating,
    isStale: isSummaryStale,
    error: summaryError,
    regenerate: regenerateSummary,
  } = useSummary({ refreshInterval: 5 * 60 * 1000 });

  // ─── Sync Status (for "emails last checked" timestamp) ──────────────
  const { lastSyncAt } = useSyncStatus();

  // ─── Projects (Section J — NEW Feb 2026) ──────────────────────────
  const {
    projects,
    isLoading: isProjectsLoading,
  } = useProjects();

  const {
    items: projectItems,
    isLoading: isProjectItemsLoading,
  } = useProjectItems();

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

      {/* ─── Email Summary (NEW Feb 2026) ──────────────────────────────── */}
      <EmailSummaryCard
        summary={summary}
        isLoading={isSummaryLoading}
        isGenerating={isSummaryGenerating}
        isStale={isSummaryStale}
        error={summaryError}
        onRefresh={regenerateSummary}
        lastSyncAt={lastSyncAt}
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

      {/* ─── Section J: Active Projects (NEW Feb 2026) ──────────────────── */}
      <div className="mb-8">
        <ActiveProjectsWidget
          projects={projects}
          items={projectItems}
          isLoading={isProjectsLoading || isProjectItemsLoading}
        />
      </div>

      {/* ─── Sections F & G: Idea Sparks + Daily Review (NEW Feb 2026) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Section F: Idea Sparks — AI-generated ideas from email content */}
        <IdeaSparksCard
          ideas={ideaItems}
          isLoading={isIdeasLoading}
          onSave={saveIdea}
          onDismiss={dismissIdea}
        />

        {/* Section G: Daily Review — review queue for scan-worthy emails */}
        <DailyReviewCard
          items={reviewItems}
          isLoading={isReviewLoading}
          onMarkReviewed={markReviewed}
          totalInQueue={reviewStats?.totalInQueue}
        />
      </div>

      {/* ─── Sections H & I: Insights + News Brief (NEW Feb 2026) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Section H: Insights — synthesized tips from newsletters */}
        <InsightsCard limit={5} />

        {/* Section I: News Brief — factual news from email content */}
        <NewsBriefCard limit={5} />
      </div>

      {/* ─── Section K: Saved Links (NEW Feb 2026) ─────────────────────────── */}
      <div className="mb-8">
        <SavedLinksCard
          links={linkItems}
          isLoading={isLinksLoading}
          onSave={saveLink}
          onDismiss={dismissLink}
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
