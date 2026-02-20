/**
 * Pending Tasks List Component
 *
 * Displays the top 5 pending tasks sorted by urgency on the Home page.
 * Each task has a quick-complete checkbox for marking tasks done without
 * navigating away. Includes a "View all" link to the Tasks page.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Actions: useActions({ status: 'pending', sortBy: 'urgency', limit: 5 })
 * - Toggle: Calls toggleComplete from useActions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <PendingTasksList
 *   tasks={actions}
 *   isLoading={false}
 *   onToggleComplete={toggleComplete}
 * />
 * ```
 *
 * @module components/home/PendingTasksList
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
  Checkbox,
} from '@/components/ui';
import { CheckSquare, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { Action } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PendingTasksList');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PendingTasksListProps {
  /** Array of pending action items (max 5) */
  tasks: Action[];
  /** Whether data is still loading */
  isLoading: boolean;
  /** Callback to toggle a task's completion status */
  onToggleComplete: (id: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if an action is overdue based on its deadline.
 * @param action - The action to check
 * @returns true if the deadline has passed and the action is not completed
 */
function isOverdue(action: Action): boolean {
  if (!action.deadline || action.status === 'completed' || action.status === 'cancelled') {
    return false;
  }
  return new Date(action.deadline) < new Date();
}

/**
 * Formats a deadline date relative to today.
 * @param deadline - ISO date string
 * @returns Human-readable relative date like "Today", "Tomorrow", "In 3 days"
 */
function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pending Tasks List — top 5 pending tasks with quick-complete checkboxes.
 *
 * Shows urgency badges and deadline info for each task.
 * Includes a "View all" link to the full Tasks page.
 */
export function PendingTasksList({
  tasks,
  isLoading,
  onToggleComplete,
}: PendingTasksListProps) {
  logger.debug('Rendering PendingTasksList', { taskCount: tasks.length, isLoading });

  /**
   * Handle toggling a task complete with logging.
   */
  const handleToggle = async (taskId: string, taskTitle: string) => {
    logger.info('Toggling task complete', { taskId: taskId.substring(0, 8), taskTitle });
    try {
      await onToggleComplete(taskId);
      logger.success('Task toggled', { taskId: taskId.substring(0, 8) });
    } catch (error) {
      logger.error('Failed to toggle task', {
        taskId: taskId.substring(0, 8),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-purple-500" />
            Pending Tasks
          </CardTitle>
          <Link href="/tasks">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              View all
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // ─── Loading State ────────────────────────────────────────────────
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          // ─── Empty State ──────────────────────────────────────────────────
          <p className="text-sm text-muted-foreground py-4 text-center">
            No pending tasks — you&apos;re all caught up!
          </p>
        ) : (
          // ─── Task List ────────────────────────────────────────────────────
          <div className="space-y-2">
            {tasks.map((task) => {
              const overdue = isOverdue(task);
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {/* Quick-complete checkbox */}
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => handleToggle(task.id, task.title)}
                    className="mt-0.5"
                    aria-label={`Mark "${task.title}" as complete`}
                  />

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Priority badge */}
                      {task.priority === 'high' && (
                        <Badge variant="destructive" className="text-xs py-0">
                          High
                        </Badge>
                      )}
                      {task.priority === 'medium' && (
                        <Badge variant="secondary" className="text-xs py-0">
                          Medium
                        </Badge>
                      )}

                      {/* Deadline */}
                      {task.deadline && (
                        <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                          {overdue ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {formatDeadline(task.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PendingTasksList;
