/**
 * Triage Content Component
 *
 * Full-width triage tab — the default tab of the Tasks page.
 * Displays a merged stream of pending email-extracted actions,
 * AI-generated idea sparks, upcoming deadlines, and events needing RSVP,
 * sorted by urgency. Users can accept, dismiss, or snooze items to work
 * through their triage queue.
 *
 * This is the standalone page version of triage; TriageTray.tsx
 * remains as the embeddable card version.
 *
 * @module components/projects/TriageContent
 * @since March 2026 — Phase 1 Tasks Page Redesign
 * @updated March 2026 — Phase 4: Add deadline & event card types
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui';
import { TriageActionCard } from './TriageActionCard';
import { TriageIdeaCard } from './TriageIdeaCard';
import { TriageDeadlineCard } from './TriageDeadlineCard';
import { TriageEventCard } from './TriageEventCard';
import { TriageOverdueTaskCard } from './TriageOverdueTaskCard';
import { TriageEmptyState } from './TriageEmptyState';
import { PromoteActionDialog } from './PromoteActionDialog';
import { useTriageItems, type TriageItem } from '@/hooks/useTriageItems';
import { useIdeas } from '@/hooks/useIdeas';
import { useProjectItems } from '@/hooks/useProjectItems';
import { useProjects } from '@/hooks/useProjects';
import { createLogger } from '@/lib/utils/logger';
import { Undo2, AlertTriangle } from 'lucide-react';
import type { ActionWithEmail } from '@/types/database';
import type { IdeaItem } from '@/hooks/useIdeas';
import type { ExtractedDate } from '@/hooks/useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TriageContent');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TriageFilter = 'all' | 'action' | 'idea' | 'deadline' | 'event' | 'overdue_task';

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function TriageSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/50">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TriageContent — full-width triage tab content for the Tasks page.
 *
 * Merges pending actions, idea sparks, upcoming deadlines, and events
 * needing RSVP into a single sorted list. Provides filter pills,
 * accept/dismiss/snooze controls, and an empty state when all items
 * are triaged.
 *
 * @module components/projects/TriageContent
 * @since March 2026
 */
export function TriageContent() {
  const [filter, setFilter] = React.useState<TriageFilter>('all');
  const [promoteAction, setPromoteAction] = React.useState<ActionWithEmail | null>(null);

  // ─── Data hooks ─────────────────────────────────────────────────────────────
  const { items, stats, isLoading, dismissItem, undoLastDismiss, lastDismissed, snoozeItem } = useTriageItems();
  const { saveIdea } = useIdeas({ limit: 20 });
  const { projects } = useProjects();
  const { createItem } = useProjectItems({ itemType: 'all', sortBy: 'sort_order' });

  // Log on load
  React.useEffect(() => {
    if (!isLoading) {
      logger.info('Triage loaded', {
        actionCount: stats.actions,
        ideaCount: stats.ideas,
        deadlineCount: stats.deadlines,
        eventCount: stats.events,
        totalSuggestions: stats.total,
      });
    }
  }, [isLoading, stats]);

  // ─── Filtered items ─────────────────────────────────────────────────────────
  const filteredItems = filter === 'all'
    ? items
    : items.filter((item) => item.type === filter);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  /** Legacy accept — only used as fallback when popover props aren't available */
  const handleAccept = React.useCallback((item: TriageItem) => {
    logger.info('Item accepted (legacy)', { type: item.type, itemId: item.id });
    if (item.type === 'action') {
      setPromoteAction(item.raw as ActionWithEmail);
    } else if (item.type === 'idea') {
      saveIdea(item.raw as IdeaItem);
    }
    // For deadlines and events, handleAccept is a no-op in legacy mode
  }, [saveIdea]);

  /** Quick accept for actions — creates a project_item via the popover */
  const handleQuickAcceptAction = React.useCallback(async (item: TriageItem, projectId: string, priority: string) => {
    logger.info('Quick accept action', { itemId: item.id, projectId, priority, firmness: item.firmness });
    const raw = item.raw as ActionWithEmail;
    await createItem({
      title: item.title,
      item_type: 'task',
      status: 'pending',
      priority,
      project_id: projectId || undefined,
      source_action_id: raw.id,
      source_email_id: item.sourceEmailId || undefined,
      firmness: item.firmness ?? 'flexible',
    });
    dismissItem(item.id, 'action');
  }, [createItem, dismissItem]);

  /** Quick accept for ideas — saves the idea AND creates a project_item */
  const handleQuickAcceptIdea = React.useCallback(async (item: TriageItem, projectId: string, priority: string) => {
    logger.info('Quick accept idea', { itemId: item.id, projectId, priority });
    const idea = item.raw as IdeaItem;
    await saveIdea(idea);
    await createItem({
      title: item.title,
      item_type: 'idea',
      status: 'pending',
      priority,
      project_id: projectId || undefined,
      source_email_id: item.sourceEmailId || undefined,
    });
    dismissItem(item.id, 'idea');
  }, [createItem, saveIdea, dismissItem]);

  /** Quick accept for deadlines — creates a task project_item with due date */
  const handleQuickAcceptDeadline = React.useCallback(async (item: TriageItem, projectId: string, priority: string) => {
    logger.info('Quick accept deadline', { itemId: item.id, projectId, priority, firmness: item.firmness });
    const raw = item.raw as ExtractedDate;
    await createItem({
      title: item.title,
      item_type: 'task',
      status: 'pending',
      priority,
      project_id: projectId || undefined,
      source_email_id: item.sourceEmailId || undefined,
      due_date: raw.date,
      firmness: item.firmness ?? 'flexible',
    });
    dismissItem(item.id, 'deadline');
  }, [createItem, dismissItem]);

  /** Quick accept for events — creates a task project_item with event date */
  const handleQuickAcceptEvent = React.useCallback(async (item: TriageItem, projectId: string, priority: string) => {
    logger.info('Quick accept event', { itemId: item.id, projectId, priority });
    const raw = item.raw as import('@/hooks/useEvents').EventData;
    await createItem({
      title: item.title,
      item_type: 'task',
      status: 'pending',
      priority,
      project_id: projectId || undefined,
      source_email_id: item.sourceEmailId || undefined,
      due_date: raw.date,
    });
    dismissItem(item.id, 'event');
  }, [createItem, dismissItem]);

  /** Open full PromoteActionDialog as fallback from "More options..." */
  const handleFallbackToDialog = React.useCallback((item: TriageItem) => {
    logger.info('Fallback to dialog', { itemId: item.id });
    setPromoteAction(item.raw as ActionWithEmail);
  }, []);

  const handleDismiss = React.useCallback((item: TriageItem) => {
    dismissItem(item.id, item.type);
  }, [dismissItem]);

  const handleSnooze = React.useCallback((item: TriageItem, minutes?: number) => {
    snoozeItem(item.id, item.type, minutes ?? 240);
  }, [snoozeItem]);

  const handleFilterChange = React.useCallback((newFilter: TriageFilter) => {
    logger.info('Filter changed', { from: filter, to: newFilter });
    setFilter(newFilter);
  }, [filter]);

  // ─── Categorize items for section rendering ────────────────────────────────
  const overdueItems = filteredItems.filter((i) =>
    i.type === 'overdue_task' || (i.deadline && new Date(i.deadline + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00'))
  );
  const activeItems = filteredItems.filter((i) => !overdueItems.includes(i));

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Stats banner — warmer, more human */}
      <div className="flex items-center gap-3 text-sm">
        {isLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : stats.total === 0 ? null : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground text-base">{stats.total}</span>
              {' '}item{stats.total !== 1 ? 's' : ''} need your attention
            </span>
            {stats.overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                {stats.overdueTasks} overdue
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'all' as const, label: 'All', count: stats.total },
          { key: 'action' as const, label: 'Tasks', count: stats.actions },
          { key: 'idea' as const, label: 'Ideas', count: stats.ideas },
          { key: 'deadline' as const, label: 'Deadlines', count: stats.deadlines },
          { key: 'event' as const, label: 'Events', count: stats.events },
          ...(stats.overdueTasks > 0 ? [{ key: 'overdue_task' as const, label: 'Overdue', count: stats.overdueTasks }] : []),
        ]).map((pill) => (
          <button
            key={pill.key}
            onClick={() => handleFilterChange(pill.key)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-all duration-200',
              filter === pill.key
                ? pill.key === 'overdue_task'
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-primary text-primary-foreground border-primary shadow-sm'
                : pill.key === 'overdue_task'
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/30'
                  : 'bg-background border-input hover:bg-muted',
            )}
          >
            {pill.label}{pill.count > 0 ? ` (${pill.count})` : ''}
          </button>
        ))}
      </div>

      {/* Undo dismiss toast */}
      {lastDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/80 border border-border/60 animate-in slide-in-from-top-2 duration-300">
          <span className="text-sm text-muted-foreground flex-1 truncate">
            Dismissed <span className="font-medium text-foreground">&ldquo;{lastDismissed.title}&rdquo;</span>
          </span>
          <button
            onClick={undoLastDismiss}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-background border border-border hover:bg-accent transition-colors shadow-sm"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        </div>
      )}

      {/* Item list */}
      {isLoading ? (
        <TriageSkeleton />
      ) : filteredItems.length === 0 ? (
        <TriageEmptyState />
      ) : (
        <div className="space-y-4">
          {/* Overdue section — visually distinct with red accent */}
          {overdueItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-1">
                <div className="h-px flex-1 bg-red-200 dark:bg-red-800/40" />
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider px-2">
                  Needs attention
                </span>
                <div className="h-px flex-1 bg-red-200 dark:bg-red-800/40" />
              </div>
              {overdueItems.map((item) => renderTriageCard(item))}
            </div>
          )}

          {/* Active items section */}
          {activeItems.length > 0 && (
            <div className="space-y-2">
              {overdueItems.length > 0 && (
                <div className="flex items-center gap-2 pb-1 pt-2">
                  <div className="h-px flex-1 bg-border/40" />
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    Incoming
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
              )}
              {activeItems.map((item) => renderTriageCard(item))}
            </div>
          )}
        </div>
      )}

      {/* Promote action dialog — fallback from "More options..." in QuickAcceptPopover */}
      <PromoteActionDialog
        open={!!promoteAction}
        onOpenChange={(open) => { if (!open) setPromoteAction(null); }}
        action={promoteAction}
        projects={projects}
        onCreateItem={createItem}
      />
    </div>
  );

  // ─── Card renderer ────────────────────────────────────────────────────────
  function renderTriageCard(item: TriageItem) {
    switch (item.type) {
      case 'action':
        return (
          <TriageActionCard
            key={item.id}
            item={item}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            projects={projects}
            onCreateItem={(projectId, priority) => handleQuickAcceptAction(item, projectId, priority)}
            onFallbackToDialog={handleFallbackToDialog}
          />
        );
      case 'idea':
        return (
          <TriageIdeaCard
            key={item.id}
            item={item}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            projects={projects}
            onCreateItem={(projectId, priority) => handleQuickAcceptIdea(item, projectId, priority)}
          />
        );
      case 'deadline':
        return (
          <TriageDeadlineCard
            key={item.id}
            item={item}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            projects={projects}
            onCreateItem={(projectId, priority) => handleQuickAcceptDeadline(item, projectId, priority)}
          />
        );
      case 'event':
        return (
          <TriageEventCard
            key={item.id}
            item={item}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            projects={projects}
          />
        );
      case 'overdue_task':
        return (
          <TriageOverdueTaskCard
            key={item.id}
            item={item}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
          />
        );
      default:
        return null;
    }
  }
}
