/**
 * useTriageItems Hook
 *
 * Composition hook that merges `useActions` + `useIdeas` into a unified
 * triage stream. Provides a normalized `TriageItem[]` array sorted by
 * urgency, with dismiss and snooze capabilities.
 *
 * This hook is the data source for the Triage tab (TriageContent) and
 * can also be used by the embeddable TriageTray component.
 *
 * @module hooks/useTriageItems
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import { useActions } from '@/hooks/useActions';
import { useIdeas, type IdeaItem } from '@/hooks/useIdeas';
import { createLogger } from '@/lib/utils/logger';
import type { ActionWithEmail } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useTriageItems');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalized triage item — represents either an action or an idea
 * in a unified interface for rendering in the triage list.
 *
 * @module hooks/useTriageItems
 * @since March 2026
 */
export interface TriageItem {
  id: string;
  type: 'action' | 'idea';
  title: string;
  subtitle: string;
  urgency: number;
  sourceEmailId?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  deadline?: string;
  confidence?: number;
  raw: ActionWithEmail | IdeaItem;
}

/**
 * Return type for the useTriageItems hook.
 *
 * @module hooks/useTriageItems
 * @since March 2026
 */
export interface UseTriageItemsReturn {
  /** Merged and sorted triage items */
  items: TriageItem[];
  /** Counts for stats display */
  stats: { total: number; actions: number; ideas: number };
  /** Loading state from underlying hooks */
  isLoading: boolean;
  /** Dismiss an item (local state for actions, API call for ideas) */
  dismissItem: (id: string, type: 'action' | 'idea') => void;
  /** Snooze an item for N minutes (local state only, clears on refresh) */
  snoozeItem: (id: string, type: 'action' | 'idea', minutes: number) => void;
  /** Refetch both actions and ideas */
  refetch: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Action type labels for subtitle display */
const ACTION_TYPE_LABELS: Record<string, string> = {
  respond: 'Reply',
  review: 'Review',
  create: 'Create',
  schedule: 'Schedule',
  decide: 'Decide',
  pay: 'Pay',
  submit: 'Submit',
  register: 'Register',
  book: 'Book',
  follow_up: 'Follow up',
};

/**
 * Normalize an ActionWithEmail into a TriageItem.
 */
function actionToTriageItem(action: ActionWithEmail): TriageItem {
  const subtitle = action.action_type
    ? ACTION_TYPE_LABELS[action.action_type] || action.action_type
    : 'Task';

  return {
    id: action.id,
    type: 'action',
    title: action.title || 'Untitled action',
    subtitle,
    urgency: action.urgency_score ?? 5,
    sourceEmailId: action.email_id ?? undefined,
    sourceEmailSubject: action.email_subject ?? undefined,
    sourceEmailSender: action.email_sender ?? undefined,
    deadline: action.deadline ?? undefined,
    raw: action,
  };
}

/**
 * Normalize an IdeaItem into a TriageItem.
 */
function ideaToTriageItem(idea: IdeaItem, index: number): TriageItem {
  return {
    id: `idea-${idea.emailId}-${idea.type}-${index}`,
    type: 'idea',
    title: idea.idea,
    subtitle: idea.type.replace(/_/g, ' '),
    urgency: idea.confidence * 10,
    sourceEmailId: idea.emailId || undefined,
    sourceEmailSubject: idea.emailSubject ?? undefined,
    sourceEmailSender: idea.emailSender ?? undefined,
    confidence: idea.confidence,
    raw: idea,
  };
}

/**
 * Check if an action's deadline is in the past.
 */
function isOverdue(deadline: string | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

/**
 * Sort triage items by:
 * 1. Overdue actions first
 * 2. Normalized urgency DESC
 * 3. Actions with deadlines float above ideas at equal urgency
 */
function sortTriageItems(a: TriageItem, b: TriageItem): number {
  const aOverdue = a.type === 'action' && isOverdue(a.deadline);
  const bOverdue = b.type === 'action' && isOverdue(b.deadline);

  // Overdue actions float to top
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;

  // Then by urgency DESC
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;

  // At equal urgency, actions with deadlines above ideas
  const aHasDeadline = a.type === 'action' && !!a.deadline;
  const bHasDeadline = b.type === 'action' && !!b.deadline;
  if (aHasDeadline && !bHasDeadline) return -1;
  if (!aHasDeadline && bHasDeadline) return 1;

  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Composition hook that merges pending actions and idea sparks into a
 * unified, sorted triage stream with dismiss and snooze capabilities.
 *
 * @returns Merged triage items, stats, loading state, and action handlers
 *
 * @example
 * ```tsx
 * const { items, stats, isLoading, dismissItem, snoozeItem } = useTriageItems();
 * ```
 *
 * @module hooks/useTriageItems
 * @since March 2026
 */
export function useTriageItems(): UseTriageItemsReturn {
  // ─── Underlying hooks ───────────────────────────────────────────────────────
  const {
    actions,
    isLoading: actionsLoading,
    refetch: refetchActions,
  } = useActions({ status: 'pending', limit: 30, sortBy: 'urgency' });

  const {
    items: ideas,
    isLoading: ideasLoading,
    dismissIdea,
    refetch: refetchIdeas,
  } = useIdeas({ limit: 20 });

  // ─── Local state ────────────────────────────────────────────────────────────
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
  const [snoozedUntil, setSnoozedUntil] = React.useState<Map<string, number>>(new Map());

  const isLoading = actionsLoading || ideasLoading;

  // ─── Merge and sort items ───────────────────────────────────────────────────
  const now = Date.now();

  const actionItems: TriageItem[] = actions
    .map(actionToTriageItem)
    .filter((item) => !dismissedIds.has(item.id));

  const ideaItems: TriageItem[] = ideas
    .map((idea, i) => ideaToTriageItem(idea, i))
    .filter((item) => !dismissedIds.has(item.id));

  const allItems = [...actionItems, ...ideaItems]
    .filter((item) => {
      const snoozeExpiry = snoozedUntil.get(item.id);
      if (snoozeExpiry && now < snoozeExpiry) return false;
      return true;
    })
    .sort(sortTriageItems);

  const stats = {
    total: allItems.length,
    actions: allItems.filter((i) => i.type === 'action').length,
    ideas: allItems.filter((i) => i.type === 'idea').length,
  };

  // Log on data load
  React.useEffect(() => {
    if (!isLoading) {
      logger.info('Triage items loaded', {
        actions: actionItems.length,
        ideas: ideaItems.length,
        snoozed: snoozedUntil.size,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  /**
   * Dismiss an item from the triage list.
   * Actions: local state dismiss. Ideas: calls dismissIdea API.
   */
  const dismissItem = React.useCallback(
    (id: string, type: 'action' | 'idea') => {
      logger.info('Item dismissed', { type, itemId: id });
      setDismissedIds((prev) => new Set([...prev, id]));

      if (type === 'idea') {
        const idea = ideas.find(
          (item, i) => `idea-${item.emailId}-${item.type}-${i}` === id
        );
        if (idea) dismissIdea(idea);
      }
    },
    [ideas, dismissIdea]
  );

  /**
   * Snooze an item for a given number of minutes.
   * Item reappears when snoozedUntil timestamp passes.
   * Local state only — does not persist across page refresh.
   */
  const snoozeItem = React.useCallback(
    (id: string, type: 'action' | 'idea', minutes: number) => {
      const until = Date.now() + minutes * 60 * 1000;
      logger.info('Item snoozed', { type, itemId: id, snoozedUntil: new Date(until).toISOString() });
      setSnoozedUntil((prev) => new Map(prev).set(id, until));
    },
    []
  );

  /**
   * Refetch both underlying data sources.
   */
  const refetch = React.useCallback(() => {
    logger.info('Refetching triage items');
    refetchActions();
    refetchIdeas();
  }, [refetchActions, refetchIdeas]);

  return {
    items: allItems,
    stats,
    isLoading,
    dismissItem,
    snoozeItem,
    refetch,
  };
}

export default useTriageItems;
