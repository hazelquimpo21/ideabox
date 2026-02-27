/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useProjectItems Hook
 *
 * React hook for fetching and managing project items (ideas, tasks, routines).
 * Supports both project-scoped and cross-project queries.
 *
 * @module hooks/useProjectItems
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { ProjectItem, ProjectItemType, ProjectItemStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 100;
const logger = createLogger('useProjectItems');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseProjectItemsOptions {
  /** Scope to a specific project. Null = all projects. */
  projectId?: string | null;
  /** Filter by item type */
  itemType?: ProjectItemType | 'all';
  /** Filter by status */
  status?: ProjectItemStatus | 'all';
  /** Sort order */
  sortBy?: 'sort_order' | 'due_date' | 'priority' | 'created_at';
  /** Max items */
  limit?: number;
}

export interface ProjectItemStats {
  total: number;
  byType: { idea: number; task: number; routine: number };
  byStatus: { backlog: number; pending: number; inProgress: number; completed: number; cancelled: number };
  overdue: number;
}

export interface UseProjectItemsReturn {
  items: ProjectItem[];
  isLoading: boolean;
  error: Error | null;
  stats: ProjectItemStats;
  refetch: () => Promise<void>;
  createItem: (item: Partial<ProjectItem> & { title: string }) => Promise<ProjectItem | null>;
  updateItem: (id: string, updates: Partial<ProjectItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function isOverdue(item: ProjectItem): boolean {
  if (!item.due_date || item.status === 'completed' || item.status === 'cancelled') return false;
  return new Date(item.due_date) < new Date();
}

/** Calculate the next due date based on a recurrence pattern */
function getNextDueDate(currentDue: string, pattern: string): string {
  const date = new Date(currentDue + 'T00:00:00');
  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      date.setDate(date.getDate() + 7);
  }
  return date.toISOString().split('T')[0];
}

function calculateStats(items: ProjectItem[]): ProjectItemStats {
  return {
    total: items.length,
    byType: {
      idea: items.filter((i) => i.item_type === 'idea').length,
      task: items.filter((i) => i.item_type === 'task').length,
      routine: items.filter((i) => i.item_type === 'routine').length,
    },
    byStatus: {
      backlog: items.filter((i) => i.status === 'backlog').length,
      pending: items.filter((i) => i.status === 'pending').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      completed: items.filter((i) => i.status === 'completed').length,
      cancelled: items.filter((i) => i.status === 'cancelled').length,
    },
    overdue: items.filter(isOverdue).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useProjectItems(options: UseProjectItemsOptions = {}): UseProjectItemsReturn {
  const [items, setItems] = React.useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<ProjectItemStats>({
    total: 0,
    byType: { idea: 0, task: 0, routine: 0 },
    byStatus: { backlog: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
    overdue: 0,
  });

  const supabase = React.useMemo(() => createClient(), []);
  const {
    projectId = null,
    itemType = 'all',
    status = 'all',
    sortBy = 'sort_order',
    limit = DEFAULT_LIMIT,
  } = options;

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    logger.start('Fetching project items', { projectId, itemType, status, sortBy });

    try {
      let query = supabase.from('project_items').select('*').limit(limit);

      switch (sortBy) {
        case 'due_date':
          query = query.order('due_date', { ascending: true, nullsFirst: false });
          break;
        case 'priority':
          query = query.order('priority', { ascending: false });
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        case 'sort_order':
        default:
          query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
      }

      if (projectId) query = query.eq('project_id', projectId);
      if (itemType !== 'all') query = query.eq('item_type', itemType);
      if (status !== 'all') query = query.eq('status', status);

      const { data, error: queryError } = await query;
      if (queryError) throw new Error(queryError.message);

      const fetched = data || [];
      setItems(fetched);
      setStats(calculateStats(fetched));
      logger.success('Project items fetched', { count: fetched.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch project items', { error: msg });
      setError(err instanceof Error ? err : new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, projectId, itemType, status, sortBy, limit]);

  // ─── Create ─────────────────────────────────────────────────────────────────

  const createItem = React.useCallback(
    async (newItem: Partial<ProjectItem> & { title: string }): Promise<ProjectItem | null> => {
      logger.start('Creating project item', { title: newItem.title, type: newItem.item_type });

      try {
        const insertData = { ...newItem };
        if (projectId && !insertData.project_id) {
          insertData.project_id = projectId;
        }

        const { data, error: insertError } = await supabase
          .from('project_items')
          .insert(insertData)
          .select()
          .single();

        if (insertError) throw new Error(insertError.message);

        if (data) {
          setItems((prev) => [...prev, data]);
          setStats((prev) => ({
            ...prev,
            total: prev.total + 1,
            byType: { ...prev.byType, [data.item_type]: (prev.byType[data.item_type] || 0) + 1 },
          }));
        }

        logger.success('Project item created', { id: data?.id });
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create project item', { error: msg });
        setError(err instanceof Error ? err : new Error(msg));
        return null;
      }
    },
    [supabase, projectId]
  );

  // ─── Update ─────────────────────────────────────────────────────────────────

  const updateItem = React.useCallback(
    async (id: string, updates: Partial<ProjectItem>) => {
      const original = items.find((i) => i.id === id);
      if (!original) return;

      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));

      try {
        const finalUpdates: Record<string, unknown> = { ...updates };
        if (updates.status === 'completed' && original.status !== 'completed') {
          finalUpdates.completed_at = new Date().toISOString();
        } else if (updates.status && updates.status !== 'completed') {
          finalUpdates.completed_at = null;
        }

        const { error: updateError } = await supabase
          .from('project_items')
          .update(finalUpdates)
          .eq('id', id);

        if (updateError) throw new Error(updateError.message);

        setStats(calculateStats(items.map((i) => (i.id === id ? { ...i, ...updates } : i))));
        logger.success('Project item updated', { id });
      } catch (err) {
        setItems((prev) => prev.map((i) => (i.id === id ? original : i)));
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to update project item', { id, error: msg });
        setError(err instanceof Error ? err : new Error(msg));
      }
    },
    [supabase, items]
  );

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const deleteItem = React.useCallback(
    async (id: string) => {
      const originalItems = [...items];
      setItems((prev) => prev.filter((i) => i.id !== id));

      try {
        const { error: deleteError } = await supabase
          .from('project_items')
          .delete()
          .eq('id', id);

        if (deleteError) throw new Error(deleteError.message);

        setStats(calculateStats(items.filter((i) => i.id !== id)));
        logger.success('Project item deleted', { id });
      } catch (err) {
        setItems(originalItems);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to delete project item', { id, error: msg });
        setError(err instanceof Error ? err : new Error(msg));
      }
    },
    [supabase, items]
  );

  // ─── Toggle Complete ────────────────────────────────────────────────────────

  const toggleComplete = React.useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const newStatus: ProjectItemStatus = item.status === 'completed' ? 'pending' : 'completed';
      await updateItem(id, { status: newStatus });

      // Auto-create next occurrence for recurring routines
      if (
        newStatus === 'completed' &&
        item.item_type === 'routine' &&
        item.recurrence_pattern &&
        item.due_date
      ) {
        const nextDue = getNextDueDate(item.due_date, item.recurrence_pattern);
        logger.start('Auto-creating next routine occurrence', { title: item.title, nextDue });

        await createItem({
          title: item.title,
          description: item.description || undefined,
          item_type: 'routine',
          priority: item.priority,
          due_date: nextDue,
          recurrence_pattern: item.recurrence_pattern,
          recurrence_config: item.recurrence_config || undefined,
          estimated_minutes: item.estimated_minutes || undefined,
          project_id: item.project_id || undefined,
          tags: item.tags || undefined,
        });
      }
    },
    [items, updateItem, createItem]
  );

  // ─── Effects ────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return {
    items, isLoading, error, stats,
    refetch: fetchItems, createItem, updateItem, deleteItem, toggleComplete,
  };
}

export default useProjectItems;
