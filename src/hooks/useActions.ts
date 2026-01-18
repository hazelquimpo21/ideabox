/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 📋 useActions Hook
 *
 * React hook for fetching, filtering, and managing action items from Supabase.
 * Provides CRUD operations for the Actions page and related components.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches actions with status/priority filtering
 * - Supports optimistic updates for toggle operations
 * - Provides action statistics for dashboard
 * - Includes deadline-based sorting
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * const { actions, isLoading, toggleComplete, stats } = useActions();
 *
 * // With status filter
 * const { actions } = useActions({ status: 'pending' });
 *
 * // With client filter
 * const { actions } = useActions({ clientId: 'uuid-here' });
 * ```
 *
 * @module hooks/useActions
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Action, ActionStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of actions to fetch */
const DEFAULT_LIMIT = 100;

/** Logger instance for this hook */
const logger = createLogger('useActions');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for filtering actions.
 */
export interface UseActionsOptions {
  /** Filter by action status */
  status?: ActionStatus | 'all' | 'overdue';
  /** Filter by client ID */
  clientId?: string;
  /** Filter by email ID */
  emailId?: string;
  /** Maximum number of actions to fetch */
  limit?: number;
  /** Sort by deadline (default) or creation date */
  sortBy?: 'deadline' | 'created_at' | 'urgency';
}

/**
 * Action statistics for dashboard display.
 */
export interface ActionStats {
  /** Total number of actions */
  total: number;
  /** Number of pending actions */
  pending: number;
  /** Number of in-progress actions */
  inProgress: number;
  /** Number of completed actions */
  completed: number;
  /** Number of overdue actions */
  overdue: number;
}

/**
 * Return value from the useActions hook.
 */
export interface UseActionsReturn {
  /** Array of action objects */
  actions: Action[];
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch actions with current filters */
  refetch: () => Promise<void>;
  /** Toggle an action's completion status */
  toggleComplete: (id: string) => Promise<void>;
  /** Update an action */
  updateAction: (id: string, updates: Partial<Action>) => Promise<void>;
  /** Create a new action */
  createAction: (action: Omit<Action, 'id' | 'created_at' | 'updated_at'>) => Promise<Action | null>;
  /** Delete an action */
  deleteAction: (id: string) => Promise<void>;
  /** Action statistics */
  stats: ActionStats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if an action is overdue.
 */
function isOverdue(action: Action): boolean {
  if (!action.deadline || action.status === 'completed' || action.status === 'cancelled') {
    return false;
  }
  return new Date(action.deadline) < new Date();
}

/**
 * Calculates action statistics from an array of actions.
 */
function calculateStats(actions: Action[]): ActionStats {
  return {
    total: actions.length,
    pending: actions.filter((a) => a.status === 'pending').length,
    inProgress: actions.filter((a) => a.status === 'in_progress').length,
    completed: actions.filter((a) => a.status === 'completed').length,
    overdue: actions.filter(isOverdue).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing actions from Supabase.
 *
 * @param options - Filtering and sorting options
 * @returns Action data, loading state, and control functions
 *
 * @example
 * ```tsx
 * function ActionsPage() {
 *   const { actions, isLoading, toggleComplete, stats } = useActions({
 *     status: 'pending',
 *     sortBy: 'deadline',
 *   });
 *
 *   return (
 *     <div>
 *       <StatsBar stats={stats} />
 *       <ActionList
 *         actions={actions}
 *         onToggle={toggleComplete}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useActions(options: UseActionsOptions = {}): UseActionsReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [actions, setActions] = React.useState<Action[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<ActionStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
  });

  // Memoize the Supabase client
  const supabase = React.useMemo(() => createClient(), []);

  // Destructure options with defaults
  const {
    status = 'all',
    clientId,
    emailId,
    limit = DEFAULT_LIMIT,
    sortBy = 'deadline',
  } = options;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Actions
  // ───────────────────────────────────────────────────────────────────────────

  const fetchActions = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching actions', { status, clientId, emailId, limit, sortBy });

    try {
      // Build the base query
      let query = supabase.from('actions').select('*').limit(limit);

      // Apply sorting
      switch (sortBy) {
        case 'deadline':
          // Sort by deadline (nulls last), then by urgency
          query = query.order('deadline', { ascending: true, nullsFirst: false });
          break;
        case 'urgency':
          query = query.order('urgency_score', { ascending: false });
          break;
        case 'created_at':
        default:
          query = query.order('created_at', { ascending: false });
      }

      // Apply status filter
      if (status === 'overdue') {
        // Overdue: has deadline in the past, not completed/cancelled
        query = query
          .not('status', 'in', '("completed","cancelled")')
          .lt('deadline', new Date().toISOString());
      } else if (status !== 'all') {
        query = query.eq('status', status);
      }

      // Apply client filter
      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      // Apply email filter
      if (emailId) {
        query = query.eq('email_id', emailId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      const fetchedActions = data || [];
      setActions(fetchedActions);
      setStats(calculateStats(fetchedActions));

      logger.success('Actions fetched', { count: fetchedActions.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch actions', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, status, clientId, emailId, limit, sortBy]);

  // ───────────────────────────────────────────────────────────────────────────
  // Toggle Complete
  // ───────────────────────────────────────────────────────────────────────────

  const toggleComplete = React.useCallback(
    async (id: string) => {
      const action = actions.find((a) => a.id === id);
      if (!action) return;

      const newStatus: ActionStatus = action.status === 'completed' ? 'pending' : 'completed';
      const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

      logger.start('Toggling action completion', { id, newStatus });

      // Optimistic update
      setActions((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: newStatus, completed_at: completedAt } : a
        )
      );

      try {
        const { error: updateError } = await supabase
          .from('actions')
          .update({ status: newStatus, completed_at: completedAt })
          .eq('id', id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Recalculate stats
        setStats(() => {
          const updatedActions = actions.map((a) =>
            a.id === id ? { ...a, status: newStatus, completed_at: completedAt } : a
          );
          return calculateStats(updatedActions);
        });

        logger.success('Action toggled', { id, newStatus });
      } catch (err) {
        // Revert optimistic update on error
        setActions((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: action.status, completed_at: action.completed_at } : a
          )
        );

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to toggle action', { id, error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, actions]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Update Action
  // ───────────────────────────────────────────────────────────────────────────

  const updateAction = React.useCallback(
    async (id: string, updates: Partial<Action>) => {
      logger.start('Updating action', { id, updates });

      const originalAction = actions.find((a) => a.id === id);
      if (!originalAction) return;

      // Optimistic update
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
      );

      try {
        const { error: updateError } = await supabase
          .from('actions')
          .update(updates)
          .eq('id', id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        logger.success('Action updated', { id });
      } catch (err) {
        // Revert on error
        setActions((prev) =>
          prev.map((a) => (a.id === id ? originalAction : a))
        );

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to update action', { id, error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, actions]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Create Action
  // ───────────────────────────────────────────────────────────────────────────

  const createAction = React.useCallback(
    async (
      newAction: Omit<Action, 'id' | 'created_at' | 'updated_at'>
    ): Promise<Action | null> => {
      logger.start('Creating action', { title: newAction.title });

      try {
        const { data, error: insertError } = await supabase
          .from('actions')
          .insert(newAction)
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        // Add to local state
        if (data) {
          setActions((prev) => [data, ...prev]);
          setStats(() => calculateStats([data, ...actions]));
        }

        logger.success('Action created', { id: data?.id });
        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create action', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return null;
      }
    },
    [supabase, actions]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Delete Action
  // ───────────────────────────────────────────────────────────────────────────

  const deleteAction = React.useCallback(
    async (id: string) => {
      logger.start('Deleting action', { id });

      const originalActions = [...actions];

      // Optimistic removal
      setActions((prev) => prev.filter((a) => a.id !== id));

      try {
        const { error: deleteError } = await supabase
          .from('actions')
          .delete()
          .eq('id', id);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Update stats
        setStats(calculateStats(actions.filter((a) => a.id !== id)));

        logger.success('Action deleted', { id });
      } catch (err) {
        // Revert on error
        setActions(originalActions);

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to delete action', { id, error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, actions]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    actions,
    isLoading,
    error,
    refetch: fetchActions,
    toggleComplete,
    updateAction,
    createAction,
    deleteAction,
    stats,
  };
}

export default useActions;
