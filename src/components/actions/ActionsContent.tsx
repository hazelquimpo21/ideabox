/**
 * Actions Content Component
 *
 * Extracted body content from the Actions page for use in tab containers.
 * Renders everything the ActionsPage renders EXCEPT the PageHeader.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Action list with status indicators
 * - Filter by status (pending, in progress, completed)
 * - Quick status toggle with optimistic updates
 * - Link back to source email
 * - Deadline highlighting with urgency indicators
 * - Real-time stats
 * - Promote action to project item (Phase 3 bridge)
 *
 * @module components/actions/ActionsContent
 */

'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { useActions, type Action } from '@/hooks';
import { useProjects } from '@/hooks/useProjects';
import { useProjectItems } from '@/hooks/useProjectItems';
import { ActionListItem } from './ActionListItem';
import { PromoteActionDialog } from '@/components/projects/PromoteActionDialog';
import {
  CheckSquare,
  Circle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ActionsContent');

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ActionListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <CheckSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No action items</h3>
      <p className="text-muted-foreground max-w-sm">
        Action items will appear here when IdeaBox extracts them from your emails.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ActionsContent() {
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'completed'>('all');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [promoteAction, setPromoteAction] = React.useState<Action | null>(null);

  // Fetch actions using the useActions hook
  const {
    actions,
    isLoading,
    error,
    refetch,
    toggleComplete,
    stats,
  } = useActions({ limit: 100 });

  // Projects data for the promote dialog
  const { projects } = useProjects();
  const { createItem } = useProjectItems();

  /** Handle promote: mark action completed via toggleComplete */
  const handleCompleteAction = React.useCallback(async (actionId: string) => {
    await toggleComplete(actionId);
  }, [toggleComplete]);

  /** Calculate overdue count */
  const overdueCount = actions.filter((a) => {
    if (!a.deadline || a.status === 'completed') return false;
    return new Date(a.deadline) < new Date();
  }).length;

  // Filter actions based on current filter
  const filteredActions = actions.filter((action) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return action.status !== 'completed';
    if (filter === 'completed') return action.status === 'completed';
    return true;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card
          className={`cursor-pointer transition-colors ${filter === 'pending' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.pending}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{stats.inProgress}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">In Progress</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filter === 'completed' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setFilter(filter === 'completed' ? 'all' : 'completed')}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.completed}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">{overdueCount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Action List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {filter === 'all' ? 'All Actions' : filter === 'pending' ? 'Pending Actions' : 'Completed Actions'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <ActionListSkeleton />
          ) : filteredActions.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {filteredActions.map((action) => (
                <ActionListItem
                  key={action.id}
                  action={action}
                  onToggleComplete={toggleComplete}
                  onPromote={setPromoteAction}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promote to project item dialog */}
      <PromoteActionDialog
        open={promoteAction !== null}
        onOpenChange={(open) => { if (!open) setPromoteAction(null); }}
        action={promoteAction}
        projects={projects}
        onCreateItem={createItem}
        onCompleteAction={handleCompleteAction}
      />
    </div>
  );
}
