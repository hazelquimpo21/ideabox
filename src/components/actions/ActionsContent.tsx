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
  Button,
  Badge,
  Checkbox,
  Skeleton,
} from '@/components/ui';
import { useActions, type Action, type ActionType, type ActionPriority } from '@/hooks';
import {
  CheckSquare,
  Circle,
  Clock,
  AlertTriangle,
  Mail,
  Calendar,
  Plus,
  Filter,
  Loader2,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ActionsContent');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get priority badge variant and color.
 */
function getPriorityInfo(priority: ActionPriority | null): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
} {
  switch (priority) {
    case 'urgent':
      return { variant: 'destructive', label: 'Urgent' };
    case 'high':
      return { variant: 'destructive', label: 'High' };
    case 'medium':
      return { variant: 'default', label: 'Medium' };
    case 'low':
      return { variant: 'secondary', label: 'Low' };
    default:
      return { variant: 'outline', label: 'Normal' };
  }
}

/**
 * Get action type icon.
 */
function getActionTypeIcon(type: ActionType | null): React.ReactNode {
  switch (type) {
    case 'respond':
      return <Mail className="h-4 w-4" />;
    case 'review':
      return <CheckSquare className="h-4 w-4" />;
    case 'create':
      return <Plus className="h-4 w-4" />;
    case 'schedule':
      return <Calendar className="h-4 w-4" />;
    case 'decide':
      return <AlertTriangle className="h-4 w-4" />;
    case 'follow_up':
      return <Clock className="h-4 w-4" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
}

/**
 * Format deadline with urgency indicator.
 */
function formatDeadline(deadlineStr?: string | null): { text: string; isUrgent: boolean } | null {
  if (!deadlineStr) return null;

  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'Overdue', isUrgent: true };
  } else if (diffDays === 0) {
    return { text: 'Due today', isUrgent: true };
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', isUrgent: true };
  } else if (diffDays <= 7) {
    return { text: `Due in ${diffDays} days`, isUrgent: false };
  } else {
    return { text: deadline.toLocaleDateString(), isUrgent: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionListItemProps {
  action: Action;
  onToggleComplete: (id: string) => void;
}

/**
 * Action list item component.
 * Displays a single action with completion toggle and priority badge.
 */
function ActionListItem({ action, onToggleComplete }: ActionListItemProps) {
  const priorityInfo = getPriorityInfo(action.priority as ActionPriority | null);
  const deadlineInfo = formatDeadline(action.deadline);

  return (
    <div
      className={`
        flex items-start gap-4 p-4 border-b border-border/50
        hover:bg-muted/30 transition-colors
        ${action.status === 'completed' ? 'opacity-60' : ''}
      `}
    >
      {/* Checkbox */}
      <Checkbox
        checked={action.status === 'completed'}
        onCheckedChange={() => onToggleComplete(action.id)}
        className="mt-1"
        aria-label={`Mark "${action.title}" as ${action.status === 'completed' ? 'incomplete' : 'complete'}`}
      />

      {/* Action content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-muted-foreground">
            {getActionTypeIcon(action.action_type)}
          </span>
          <span className={`font-medium ${action.status === 'completed' ? 'line-through' : ''}`}>
            {action.title}
          </span>
          <Badge variant={priorityInfo.variant} className="text-xs">
            {priorityInfo.label}
          </Badge>
        </div>

        {action.description && (
          <p className="text-sm text-muted-foreground mb-2">
            {action.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {action.email_id && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              From email
            </span>
          )}
          {action.contact_id && (
            <span className="flex items-center gap-1">
              <Circle className="h-3 w-3" />
              Contact linked
            </span>
          )}
          {deadlineInfo && (
            <span className={`flex items-center gap-1 ${deadlineInfo.isUrgent ? 'text-destructive font-medium' : ''}`}>
              <Clock className="h-3 w-3" />
              {deadlineInfo.text}
            </span>
          )}
          {action.estimated_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{action.estimated_minutes} min
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for action list.
 */
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

/**
 * Empty state when no actions.
 */
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

/**
 * Actions content component.
 *
 * Renders the actions body content (error banner, stats cards, action list)
 * without the PageHeader. Designed to be embedded in tab containers.
 */
export function ActionsContent() {
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'completed'>('all');
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Fetch actions using the useActions hook
  const {
    actions,
    isLoading,
    error,
    refetch,
    toggleComplete,
    stats,
  } = useActions({ limit: 100 });

  /** Handle refresh */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

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
      {/* ─────────────────────────────────────────────────────────────────────
          Error Banner
          ───────────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Stats Cards
          ───────────────────────────────────────────────────────────────────── */}
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

      {/* ─────────────────────────────────────────────────────────────────────
          Action List
          ───────────────────────────────────────────────────────────────────── */}
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
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
