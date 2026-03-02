/**
 * Triage Content Component
 *
 * Full-width triage tab — the default tab of the Tasks page.
 * Displays a merged stream of pending email-extracted actions and
 * AI-generated idea sparks, sorted by urgency. Users can accept,
 * dismiss, or snooze items to work through their triage queue.
 *
 * This is the standalone page version of triage; TriageTray.tsx
 * remains as the embeddable card version.
 *
 * @module components/projects/TriageContent
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui';
import { TriageActionCard } from './TriageActionCard';
import { TriageIdeaCard } from './TriageIdeaCard';
import { TriageEmptyState } from './TriageEmptyState';
import { PromoteActionDialog } from './PromoteActionDialog';
import { useTriageItems, type TriageItem } from '@/hooks/useTriageItems';
import { useIdeas } from '@/hooks/useIdeas';
import { useProjectItems } from '@/hooks/useProjectItems';
import { useProjects } from '@/hooks/useProjects';
import { createLogger } from '@/lib/utils/logger';
import type { ActionWithEmail } from '@/types/database';
import type { IdeaItem } from '@/hooks/useIdeas';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TriageContent');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TriageFilter = 'all' | 'action' | 'idea';

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
 * Merges pending actions and idea sparks into a single sorted list.
 * Provides filter pills, accept/dismiss/snooze controls, and an
 * empty state when all items are triaged.
 *
 * @module components/projects/TriageContent
 * @since March 2026
 */
export function TriageContent() {
  const [filter, setFilter] = React.useState<TriageFilter>('all');
  const [promoteAction, setPromoteAction] = React.useState<ActionWithEmail | null>(null);

  // ─── Data hooks ─────────────────────────────────────────────────────────────
  const { items, stats, isLoading, dismissItem, snoozeItem } = useTriageItems();
  const { saveIdea } = useIdeas({ limit: 20 });
  const { projects } = useProjects();
  const { createItem } = useProjectItems({ itemType: 'all', sortBy: 'sort_order' });

  // Log on load
  React.useEffect(() => {
    if (!isLoading) {
      logger.info('Triage loaded', {
        actionCount: stats.actions,
        ideaCount: stats.ideas,
        totalSuggestions: stats.total,
      });
    }
  }, [isLoading, stats]);

  // ─── Filtered items ─────────────────────────────────────────────────────────
  const filteredItems = filter === 'all'
    ? items
    : items.filter((item) => item.type === filter);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleAccept = React.useCallback((item: TriageItem) => {
    logger.info('Item accepted', { type: item.type, itemId: item.id });
    if (item.type === 'action') {
      setPromoteAction(item.raw as ActionWithEmail);
    } else {
      saveIdea(item.raw as IdeaItem);
    }
  }, [saveIdea]);

  const handleDismiss = React.useCallback((item: TriageItem) => {
    dismissItem(item.id, item.type);
  }, [dismissItem]);

  const handleSnooze = React.useCallback((item: TriageItem) => {
    // Snooze for 4 hours by default
    snoozeItem(item.id, item.type, 240);
  }, [snoozeItem]);

  const handleFilterChange = React.useCallback((newFilter: TriageFilter) => {
    logger.info('Filter changed', { from: filter, to: newFilter });
    setFilter(newFilter);
  }, [filter]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Stats banner */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {isLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          <span>
            <span className="font-semibold text-foreground">{stats.total}</span>
            {' '}item{stats.total !== 1 ? 's' : ''} to triage
            {' '}&middot; {stats.actions} task{stats.actions !== 1 ? 's' : ''}
            {' '}&middot; {stats.ideas} idea{stats.ideas !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {([
          { key: 'all' as const, label: 'All', count: stats.total },
          { key: 'action' as const, label: 'Tasks', count: stats.actions },
          { key: 'idea' as const, label: 'Ideas', count: stats.ideas },
        ]).map((pill) => (
          <button
            key={pill.key}
            onClick={() => handleFilterChange(pill.key)}
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition-colors',
              filter === pill.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-muted',
            )}
          >
            {pill.label}{pill.count > 0 ? ` (${pill.count})` : ''}
          </button>
        ))}
      </div>

      {/* Item list */}
      {isLoading ? (
        <TriageSkeleton />
      ) : filteredItems.length === 0 ? (
        <TriageEmptyState />
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) =>
            item.type === 'action' ? (
              <TriageActionCard
                key={item.id}
                item={item}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
              />
            ) : (
              <TriageIdeaCard
                key={item.id}
                item={item}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
              />
            )
          )}
        </div>
      )}

      {/* Promote action dialog (Phase 1 — full dialog for actions) */}
      <PromoteActionDialog
        open={!!promoteAction}
        onOpenChange={(open) => { if (!open) setPromoteAction(null); }}
        action={promoteAction}
        projects={projects}
        onCreateItem={createItem}
      />
    </div>
  );
}
