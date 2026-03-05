/**
 * Home Page — Trifecta Layout with collapsible below-fold sections.
 * Implements §4 from VIEW_REDESIGN_PLAN.md.
 *
 * Layout:
 *   1. Greeting header with single summary sentence
 *   2. Trifecta: NowCard | TodayCard | ThisWeekCard (3-column grid)
 *   3. Below-fold collapsible sections: Tasks, Ideas, Review, Projects
 *
 * Route: /home
 *
 * @module app/(auth)/home/page
 * @since February 2026 — redesigned March 2026 (Phase 1 View Redesign)
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import {
  DailyBriefingHeader,
  NowCard,
  TodayCard,
  ThisWeekCard,
  PendingTasksList,
  IdeaSparksCard,
  DailyReviewCard,
  ActiveProjectsWidget,
} from '@/components/home';
import type { ScheduleItem } from '@/components/home';
import { CollapsibleSection } from '@/components/shared';
import { Button } from '@/components/ui';
import {
  useHubPriorities,
  useActions,
  useExtractedDates,
  useEvents,
  useIdeas,
  useReviewQueue,
  useProjects,
  useProjectItems,
} from '@/hooks';
import { useAuth } from '@/lib/auth';
import { RefreshCw } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('HomePage');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getFirstName(name: string | null | undefined, email: string | undefined): string | null {
  if (name) return name.split(' ')[0] ?? null;
  if (email) return email.split('@')[0] ?? null;
  return null;
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

function getTomorrowString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0] ?? '';
}

function formatTime(time: string): string {
  const parts = time.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function HomePage() {
  logger.start('Rendering Home page');

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const firstName = getFirstName(user?.name, user?.email);

  // ─── Hub Priorities (for NowCard) ──────────────────────────────────────────
  const {
    items: priorityItems,
    isLoading: isPrioritiesLoading,
    refetch: refetchPriorities,
  } = useHubPriorities({ limit: 3, refreshInterval: 5 * 60 * 1000 });

  // ─── Actions / Tasks ───────────────────────────────────────────────────────
  const {
    actions: pendingTasks,
    isLoading: isTasksLoading,
    toggleComplete,
    stats: taskStats,
  } = useActions({ status: 'pending', sortBy: 'urgency', limit: 5 });

  // ─── Idea Sparks ───────────────────────────────────────────────────────────
  const {
    items: ideaItems,
    isLoading: isIdeasLoading,
    saveIdea,
    dismissIdea,
  } = useIdeas({ limit: 10 });

  // ─── Daily Review Queue ────────────────────────────────────────────────────
  const {
    items: reviewItems,
    stats: reviewStats,
    isLoading: isReviewLoading,
    markReviewed,
  } = useReviewQueue({ limit: 8 });

  // ─── Projects ──────────────────────────────────────────────────────────────
  const { projects, isLoading: isProjectsLoading } = useProjects();
  const { items: projectItems, isLoading: isProjectItemsLoading } = useProjectItems();

  // ─── Events & Dates for TodayCard / ThisWeekCard ───────────────────────────
  const today = getTodayString();
  const tomorrow = getTomorrowString();

  const { dates: extractedDates, isLoading: isDatesLoading } = useExtractedDates({
    from: today,
    to: tomorrow,
    isAcknowledged: false,
  });

  const { events, isLoading: isEventsLoading } = useEvents({ includePast: false });

  // ─── Refresh State ─────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    logger.info('User triggered Home page refresh');
    setIsRefreshing(true);
    await refetchPriorities();
    setIsRefreshing(false);
    logger.success('Home page refresh complete');
  }, [refetchPriorities]);

  // ─── Build Schedule Items (merge events + extracted dates) ─────────────────
  const scheduleItems: ScheduleItem[] = React.useMemo(() => {
    const items: ScheduleItem[] = [];

    for (const date of extractedDates) {
      items.push({
        id: date.id,
        title: date.title,
        time: date.event_time ? formatTime(date.event_time) : null,
        type: date.date_type,
        isTomorrow: date.date === tomorrow,
      });
    }

    for (const event of events) {
      if (event.date === today || event.date === tomorrow) {
        const formattedTime = event.event_time ? formatTime(event.event_time) : null;
        if (!items.some((item) => item.title === event.title && item.time === formattedTime)) {
          items.push({
            id: event.id,
            title: event.title,
            time: formattedTime,
            type: 'event',
            isTomorrow: event.date === tomorrow,
          });
        }
      }
    }

    items.sort((a, b) => {
      if (a.isTomorrow !== b.isTomorrow) return a.isTomorrow ? 1 : -1;
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    return items;
  }, [extractedDates, events, today, tomorrow]);

  // ─── Compute action count for greeting ─────────────────────────────────────
  const todayEventCount = scheduleItems.filter((i) => !i.isTomorrow).length;
  const isScheduleLoading = isDatesLoading || isEventsLoading;
  const isAnyLoading = isPrioritiesLoading || isScheduleLoading || isTasksLoading;

  // Action count: must_reply emails (from priorities) + overdue tasks + today's events
  const actionCount = React.useMemo(() => {
    const mustReply = priorityItems.filter(
      (item) => item.type === 'email' && item.suggestedAction === 'respond'
    ).length;
    const overdueTasks = pendingTasks.filter((task) => {
      if (!task.deadline) return false;
      return new Date(task.deadline) < new Date();
    }).length;
    return mustReply + overdueTasks + todayEventCount;
  }, [priorityItems, pendingTasks, todayEventCount]);

  const activeProjectCount = React.useMemo(
    () => projects.filter((p) => p.status === 'active').length,
    [projects]
  );

  logger.debug('Home page state', {
    firstName,
    actionCount,
    priorityCount: priorityItems.length,
    todayEventCount,
    pendingTaskCount: taskStats.pending,
  });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Home"
        description="Your daily briefing and top priorities."
        breadcrumbs={[{ label: 'Home' }]}
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

      {/* Greeting */}
      <DailyBriefingHeader
        userName={firstName}
        actionCount={actionCount}
        isLoading={isAnyLoading}
      />

      {/* Trifecta — always visible, 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NowCard
          item={priorityItems[0] || null}
          isLoading={isPrioritiesLoading}
        />
        <TodayCard
          items={scheduleItems}
          isLoading={isScheduleLoading}
        />
        <ThisWeekCard
          events={events}
          tasks={pendingTasks}
          isLoading={isEventsLoading || isTasksLoading}
        />
      </div>

      {/* Below the fold — collapsible sections */}
      <CollapsibleSection title="Pending Tasks" count={taskStats.pending}>
        <PendingTasksList
          tasks={pendingTasks}
          isLoading={isTasksLoading}
          onToggleComplete={toggleComplete}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Idea Sparks" count={ideaItems.length}>
        <IdeaSparksCard
          ideas={ideaItems}
          isLoading={isIdeasLoading}
          onSave={saveIdea}
          onDismiss={dismissIdea}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Daily Review" count={reviewStats?.totalInQueue}>
        <DailyReviewCard
          items={reviewItems}
          isLoading={isReviewLoading}
          onMarkReviewed={markReviewed}
          totalInQueue={reviewStats?.totalInQueue}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Active Projects" count={activeProjectCount}>
        <ActiveProjectsWidget
          projects={projects}
          items={projectItems}
          isLoading={isProjectsLoading || isProjectItemsLoading}
        />
      </CollapsibleSection>
    </div>
  );
}
