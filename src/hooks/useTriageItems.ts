/**
 * useTriageItems Hook
 *
 * Composition hook that merges `useActions` + `useIdeas` + `useExtractedDates`
 * + `useEvents` into a unified triage stream. Provides a normalized
 * `TriageItem[]` array sorted by urgency, with dismiss and snooze capabilities.
 *
 * This hook is the data source for the Triage tab (TriageContent) and
 * can also be used by the embeddable TriageTray component.
 *
 * @module hooks/useTriageItems
 * @since March 2026 — Phase 1 Tasks Page Redesign
 * @updated March 2026 — Phase 3: Snooze persistence via localStorage
 * @updated March 2026 — Phase 4: Add deadlines & events to triage stream
 */

'use client';

import * as React from 'react';
import { useActions } from '@/hooks/useActions';
import { useIdeas, type IdeaItem } from '@/hooks/useIdeas';
import { useExtractedDates, type ExtractedDate } from '@/hooks/useExtractedDates';
import { useEvents, type EventData } from '@/hooks/useEvents';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { ActionWithEmail } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useTriageItems');

/** localStorage key for persisting snoozed items across page refreshes */
const SNOOZE_STORAGE_KEY = 'ideabox_triage_snoozed';

/** localStorage key for persisting dismissed items across page refreshes */
const DISMISS_STORAGE_KEY = 'ideabox_triage_dismissed';

/** How far back to look for overdue deadlines (days) */
const OVERDUE_LOOKBACK_DAYS = 30;

/** How long (ms) the undo-dismiss window stays open */
const UNDO_DISMISS_WINDOW_MS = 8000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalized triage item — represents an action, idea, deadline, or event
 * in a unified interface for rendering in the triage list.
 *
 * @module hooks/useTriageItems
 * @since March 2026
 */
export interface TriageItem {
  id: string;
  type: 'action' | 'idea' | 'deadline' | 'event' | 'overdue_task';
  title: string;
  subtitle: string;
  urgency: number;
  sourceEmailId?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  deadline?: string;
  confidence?: number;
  /** Task firmness: hard = contractual/financial, soft = social/personal, flexible = nice-to-have */
  firmness?: 'hard' | 'soft' | 'flexible';
  raw: ActionWithEmail | IdeaItem | ExtractedDate | EventData | OverdueProjectItem;
}

/** Lightweight type for overdue project_items surfaced in triage */
export interface OverdueProjectItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  item_type: string;
  status: string;
  project_id: string | null;
  source_email_id: string | null;
  firmness: 'hard' | 'soft' | 'flexible' | null;
  created_at: string;
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
  stats: { total: number; actions: number; ideas: number; deadlines: number; events: number; overdueTasks: number };
  /** Loading state from underlying hooks */
  isLoading: boolean;
  /** Dismiss an item — persisted to localStorage for actions/deadlines/events, API call for ideas */
  dismissItem: (id: string, type: TriageItem['type']) => void;
  /** Undo the last dismiss (8-second window) */
  undoLastDismiss: () => void;
  /** The last dismissed item (for undo toast display), null if no recent dismiss or window expired */
  lastDismissed: TriageItem | null;
  /** Snooze an item for N minutes (persisted to localStorage, survives refresh) */
  snoozeItem: (id: string, type: TriageItem['type'], minutes: number) => void;
  /** Refetch all data sources */
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
 * Normalize an ExtractedDate (deadline/payment_due/expiration) into a TriageItem.
 * Urgency is based on proximity: today=10, tomorrow=8, 3 days=6, 7 days=4.
 */
function deadlineToTriageItem(date: ExtractedDate): TriageItem {
  const now = new Date();
  const dateObj = new Date(date.date + 'T00:00:00');
  const diffDays = Math.ceil((dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let urgency = 4;
  if (diffDays <= 0) urgency = 10;
  else if (diffDays <= 1) urgency = 8;
  else if (diffDays <= 3) urgency = 6;

  return {
    id: `deadline-${date.id}`,
    type: 'deadline',
    title: date.title,
    subtitle: date.date_type,
    urgency,
    sourceEmailId: date.email_id || undefined,
    sourceEmailSubject: date.emails?.subject ?? undefined,
    sourceEmailSender: date.emails?.sender_name ?? date.emails?.sender_email ?? undefined,
    deadline: date.date,
    raw: date,
  };
}

/**
 * Normalize an EventData into a TriageItem for triage.
 * Urgency is based on RSVP deadline proximity, or event date if no RSVP deadline.
 */
function eventToTriageItem(event: EventData): TriageItem {
  const now = new Date();
  const rsvpDate = event.event_metadata?.rsvpDeadline
    ? new Date(event.event_metadata.rsvpDeadline + 'T00:00:00')
    : null;
  const eventDate = new Date(event.date + 'T00:00:00');
  const targetDate = rsvpDate || eventDate;
  const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let urgency = 4;
  if (diffDays <= 0) urgency = 10;
  else if (diffDays <= 1) urgency = 8;
  else if (diffDays <= 3) urgency = 6;

  return {
    id: `event-${event.id}`,
    type: 'event',
    title: event.title,
    subtitle: 'Event',
    urgency,
    sourceEmailId: event.email_id ?? undefined,
    sourceEmailSubject: event.emails?.subject ?? undefined,
    sourceEmailSender: event.emails?.sender_name ?? event.emails?.sender_email ?? undefined,
    deadline: event.date,
    raw: event,
  };
}

/**
 * Normalize an overdue ProjectItem into a TriageItem.
 * These are tasks already on the board that have passed their due date
 * and need re-attention.
 */
function overdueTaskToTriageItem(task: OverdueProjectItem): TriageItem {
  const now = new Date();
  const dueDate = new Date(task.due_date + 'T00:00:00');
  const daysPast = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  // Overdue tasks get max urgency, boosted further the longer they're overdue
  const urgency = Math.min(10, 8 + Math.floor(daysPast / 3));

  return {
    id: `overdue-task-${task.id}`,
    type: 'overdue_task',
    title: task.title,
    subtitle: daysPast === 1 ? '1 day overdue' : `${daysPast} days overdue`,
    urgency,
    sourceEmailId: task.source_email_id ?? undefined,
    deadline: task.due_date,
    firmness: task.firmness ?? inferFirmness(undefined, task.priority),
    raw: task,
  };
}

/**
 * Infer firmness from action type and priority.
 * Hard = financial, legal, or high-consequence deadlines.
 * Soft = social commitments, follow-ups.
 * Flexible = ideas, nice-to-haves.
 */
function inferFirmness(
  actionType?: string,
  priority?: string,
): 'hard' | 'soft' | 'flexible' {
  // Financial/legal/submission actions are always hard
  const hardTypes = ['pay', 'submit', 'register'];
  if (actionType && hardTypes.includes(actionType)) return 'hard';

  // Urgent/high priority defaults to hard
  if (priority === 'urgent' || priority === 'high') return 'soft';

  // Social/follow-up actions are soft
  const softTypes = ['respond', 'follow_up', 'schedule', 'book', 'decide'];
  if (actionType && softTypes.includes(actionType)) return 'soft';

  return 'flexible';
}

/**
 * Infer firmness for a deadline based on its date_type.
 */
function inferDeadlineFirmness(dateType: string): 'hard' | 'soft' | 'flexible' {
  if (['payment_due', 'expiration'].includes(dateType)) return 'hard';
  if (dateType === 'deadline') return 'soft';
  return 'flexible';
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
 * 1. Overdue items first (actions and deadlines)
 * 2. Items with upcoming deadlines by date proximity
 * 3. Normalized urgency DESC
 * 4. Items with deadlines above items without
 */
function sortTriageItems(a: TriageItem, b: TriageItem): number {
  const aOverdue = a.type === 'overdue_task' || ((a.type === 'action' || a.type === 'deadline') && isOverdue(a.deadline));
  const bOverdue = b.type === 'overdue_task' || ((b.type === 'action' || b.type === 'deadline') && isOverdue(b.deadline));

  // Hard-firmness items float above soft/flexible at equal overdue status
  const firmOrder = { hard: 0, soft: 1, flexible: 2 };
  const aFirm = firmOrder[a.firmness ?? 'flexible'] ?? 2;
  const bFirm = firmOrder[b.firmness ?? 'flexible'] ?? 2;
  if (aOverdue && bOverdue && aFirm !== bFirm) return aFirm - bFirm;

  // Overdue items float to top
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;

  // Then by urgency DESC
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;

  // At equal urgency, items with deadlines float above those without
  const aHasDeadline = !!a.deadline;
  const bHasDeadline = !!b.deadline;
  if (aHasDeadline && !bHasDeadline) return -1;
  if (!aHasDeadline && bHasDeadline) return 1;

  // Both have deadlines — sort by date proximity
  if (aHasDeadline && bHasDeadline) {
    return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Composition hook that merges pending actions, idea sparks, upcoming deadlines,
 * and events needing RSVP into a unified, sorted triage stream with dismiss
 * and snooze capabilities.
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
  // ─── Date range for deadline/event filtering ────────────────────────────────
  // KEY FIX: Include overdue dates (past 30 days) so they don't silently vanish
  const today = new Date().toISOString().split('T')[0]!;
  const overdueFrom = new Date(Date.now() - OVERDUE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]!;
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]!;

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

  const {
    dates: extractedDates,
    isLoading: datesLoading,
    refetch: refetchDates,
  } = useExtractedDates({
    from: overdueFrom, // Was: today — now includes overdue deadlines
    to: sevenDaysFromNow,
    isAcknowledged: false,
  });

  const {
    events,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useEvents({ includePast: false });

  // ─── Overdue project_items query ──────────────────────────────────────────
  const supabase = React.useMemo(() => createClient(), []);
  const [overdueProjectItems, setOverdueProjectItems] = React.useState<OverdueProjectItem[]>([]);
  const [overdueLoading, setOverdueLoading] = React.useState(true);

  const fetchOverdueItems = React.useCallback(async () => {
    setOverdueLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_items')
        .select('id, title, description, due_date, priority, item_type, status, project_id, source_email_id, created_at')
        .lt('due_date', today)
        .not('status', 'in', '("completed","cancelled")')
        .order('due_date', { ascending: true })
        .limit(20);

      if (error) {
        logger.warn('Failed to fetch overdue project items', { error: error.message });
      } else {
        setOverdueProjectItems((data || []).map((d) => ({ ...d, firmness: null })) as OverdueProjectItem[]);
      }
    } catch (err) {
      logger.warn('Error fetching overdue project items', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    } finally {
      setOverdueLoading(false);
    }
  }, [supabase, today]);

  React.useEffect(() => { fetchOverdueItems(); }, [fetchOverdueItems]);

  // ─── Persisted dismiss state (localStorage) ───────────────────────────────
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!stored) return new Set();
      return new Set(JSON.parse(stored) as string[]);
    } catch {
      return new Set();
    }
  });

  const [snoozedUntil, setSnoozedUntil] = React.useState<Map<string, number>>(() => {
    if (typeof window === 'undefined') return new Map();
    try {
      const stored = localStorage.getItem(SNOOZE_STORAGE_KEY);
      if (!stored) return new Map();
      const entries: [string, number][] = JSON.parse(stored);
      // Filter out expired snoozes on mount
      const now = Date.now();
      return new Map(entries.filter(([, until]) => until > now));
    } catch {
      return new Map();
    }
  });

  // ─── Undo dismiss state ────────────────────────────────────────────────────
  const [lastDismissed, setLastDismissed] = React.useState<TriageItem | null>(null);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = actionsLoading || ideasLoading || datesLoading || eventsLoading || overdueLoading;

  // ─── Merge and sort items ───────────────────────────────────────────────────
  const now = Date.now();

  const actionItems: TriageItem[] = actions
    .map((a) => {
      const item = actionToTriageItem(a);
      item.firmness = inferFirmness(
        (a as { action_type?: string }).action_type,
        undefined,
      );
      return item;
    })
    .filter((item) => !dismissedIds.has(item.id));

  const ideaItems: TriageItem[] = ideas
    .map((idea, i) => {
      const item = ideaToTriageItem(idea, i);
      item.firmness = 'flexible';
      return item;
    })
    .filter((item) => !dismissedIds.has(item.id));

  // Filter extracted dates to deadline/payment_due/expiration types only
  const deadlineItems: TriageItem[] = extractedDates
    .filter((d) => ['deadline', 'payment_due', 'expiration'].includes(d.date_type))
    .map((d) => {
      const item = deadlineToTriageItem(d);
      item.firmness = inferDeadlineFirmness(d.date_type);
      return item;
    })
    .filter((item) => !dismissedIds.has(item.id));

  // Filter events for those needing RSVP (commitment_level = 'invited') within 7 days
  const eventItems: TriageItem[] = events
    .filter((e) => {
      const meta = e.event_metadata;
      if (meta?.commitmentLevel !== 'invited') return false;
      const eventDate = new Date(e.date + 'T00:00:00');
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return eventDate.getTime() - now <= sevenDaysMs && eventDate.getTime() >= now - 24 * 60 * 60 * 1000;
    })
    .map((e) => {
      const item = eventToTriageItem(e);
      item.firmness = 'soft';
      return item;
    })
    .filter((item) => !dismissedIds.has(item.id));

  // Overdue project_items — tasks on the board that passed their due date
  const overdueTaskItems: TriageItem[] = overdueProjectItems
    .map(overdueTaskToTriageItem)
    .filter((item) => !dismissedIds.has(item.id));

  const allItems = [...actionItems, ...ideaItems, ...deadlineItems, ...eventItems, ...overdueTaskItems]
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
    deadlines: allItems.filter((i) => i.type === 'deadline').length,
    events: allItems.filter((i) => i.type === 'event').length,
    overdueTasks: allItems.filter((i) => i.type === 'overdue_task').length,
  };

  // Log on data load
  React.useEffect(() => {
    if (!isLoading) {
      logger.info('Triage items loaded', {
        actions: actionItems.length,
        ideas: ideaItems.length,
        deadlines: deadlineItems.length,
        events: eventItems.length,
        overdueTasks: overdueTaskItems.length,
        snoozed: snoozedUntil.size,
        dismissed: dismissedIds.size,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  /**
   * Persist dismissed IDs to localStorage.
   */
  const persistDismissed = React.useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...ids]));
    } catch { /* localStorage full — ignore */ }
  }, []);

  /**
   * Dismiss an item from the triage list.
   * Persisted to localStorage for all types. Ideas also call dismissIdea API.
   * Starts an 8-second undo window.
   */
  const dismissItem = React.useCallback(
    (id: string, type: TriageItem['type']) => {
      logger.info('Item dismissed', { type, itemId: id });

      // Find the item before dismissing (for undo)
      const dismissedItem = allItems.find((item) => item.id === id) ?? null;

      setDismissedIds((prev) => {
        const next = new Set([...prev, id]);
        persistDismissed(next);
        return next;
      });

      if (type === 'idea') {
        const idea = ideas.find(
          (item, i) => `idea-${item.emailId}-${item.type}-${i}` === id
        );
        if (idea) dismissIdea(idea);
      }

      // Set up undo window
      if (dismissedItem) {
        setLastDismissed(dismissedItem);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => {
          setLastDismissed(null);
        }, UNDO_DISMISS_WINDOW_MS);
      }
    },
    [ideas, dismissIdea, allItems, persistDismissed]
  );

  /**
   * Undo the last dismiss — removes the ID from the persisted dismiss set.
   */
  const undoLastDismiss = React.useCallback(() => {
    if (!lastDismissed) return;
    logger.info('Undo dismiss', { itemId: lastDismissed.id });
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(lastDismissed.id);
      persistDismissed(next);
      return next;
    });
    setLastDismissed(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [lastDismissed, persistDismissed]);

  /**
   * Snooze an item for a given number of minutes.
   * Item reappears when snoozedUntil timestamp passes.
   * Persisted to localStorage — survives page refresh.
   * Expired snoozes are cleaned up on mount.
   */
  const snoozeItem = React.useCallback(
    (id: string, type: TriageItem['type'], minutes: number) => {
      const until = Date.now() + minutes * 60 * 1000;
      logger.info('Item snoozed', { type, itemId: id, snoozedUntil: new Date(until).toISOString() });
      setSnoozedUntil((prev) => {
        const next = new Map(prev).set(id, until);
        try {
          localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify([...next.entries()]));
        } catch { /* localStorage full — ignore */ }
        return next;
      });
    },
    []
  );

  /**
   * Refetch all underlying data sources.
   */
  const refetch = React.useCallback(() => {
    logger.info('Refetching triage items');
    refetchActions();
    refetchIdeas();
    refetchDates();
    refetchEvents();
    fetchOverdueItems();
  }, [refetchActions, refetchIdeas, refetchDates, refetchEvents, fetchOverdueItems]);

  // Clean up undo timer on unmount
  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  return {
    items: allItems,
    stats,
    isLoading,
    dismissItem,
    undoLastDismiss,
    lastDismissed,
    snoozeItem,
    refetch,
  };
}

export default useTriageItems;
