/**
 * 📋 Actions Page for IdeaBox
 *
 * Displays extracted action items from emails, organized by status and priority.
 * Actions are automatically extracted by the AI analyzer system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES (Planned)
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Action list with status indicators
 * - Filter by status (pending, in progress, completed)
 * - Sort by priority, deadline, or date created
 * - Quick status toggle
 * - Link back to source email
 * - Deadline highlighting
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CURRENT STATUS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Placeholder implementation. Requires:
 * - useActions hook for data fetching
 * - ActionCard component
 * - API routes for action CRUD operations
 *
 * @module app/(auth)/actions/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
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
import {
  CheckSquare,
  Circle,
  Clock,
  AlertTriangle,
  Mail,
  Calendar,
  Plus,
  Filter,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock action data structure.
 * Will be replaced with actual Action type from database.
 */
interface MockAction {
  id: string;
  title: string;
  description?: string;
  actionType: 'respond' | 'review' | 'create' | 'schedule' | 'decide';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  deadline?: Date;
  emailSubject?: string;
  emailId?: string;
  clientName?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA (Remove when hooks are implemented)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_ACTIONS: MockAction[] = [
  {
    id: '1',
    title: 'Review Q4 budget proposal',
    description: 'Need to approve or provide feedback on the attached budget',
    actionType: 'review',
    priority: 'high',
    status: 'pending',
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2), // 2 days
    emailSubject: 'Q4 Budget Review Required',
    emailId: 'email-1',
    clientName: 'Acme Corp',
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: '2',
    title: 'Respond to partnership inquiry',
    description: 'Reply to Mike regarding potential collaboration',
    actionType: 'respond',
    priority: 'medium',
    status: 'pending',
    emailSubject: 'Partnership Opportunity',
    emailId: 'email-2',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
  },
  {
    id: '3',
    title: 'Schedule team retrospective',
    description: 'Set up meeting for sprint review',
    actionType: 'schedule',
    priority: 'medium',
    status: 'in_progress',
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5), // 5 days
    emailSubject: 'Sprint Planning',
    emailId: 'email-3',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: '4',
    title: 'Decide on vendor selection',
    description: 'Choose between AWS and GCP proposals',
    actionType: 'decide',
    priority: 'high',
    status: 'pending',
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
    emailSubject: 'Cloud Provider Proposals',
    emailId: 'email-4',
    clientName: 'Internal',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
  },
  {
    id: '5',
    title: 'Create project timeline document',
    description: 'Draft timeline for Q1 deliverables',
    actionType: 'create',
    priority: 'low',
    status: 'completed',
    emailSubject: 'Q1 Planning',
    emailId: 'email-5',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get priority badge variant and color.
 */
function getPriorityInfo(priority: MockAction['priority']): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
} {
  switch (priority) {
    case 'high':
      return { variant: 'destructive', label: 'High' };
    case 'medium':
      return { variant: 'default', label: 'Medium' };
    case 'low':
      return { variant: 'secondary', label: 'Low' };
    default:
      return { variant: 'outline', label: 'Unknown' };
  }
}

/**
 * Get action type icon.
 */
function getActionTypeIcon(type: MockAction['actionType']): React.ReactNode {
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
    default:
      return <Circle className="h-4 w-4" />;
  }
}

/**
 * Format deadline with urgency indicator.
 */
function formatDeadline(deadline?: Date): { text: string; isUrgent: boolean } | null {
  if (!deadline) return null;

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

/**
 * Action list item component.
 */
function ActionListItem({ action }: { action: MockAction }) {
  const priorityInfo = getPriorityInfo(action.priority);
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
        className="mt-1"
        aria-label={`Mark "${action.title}" as ${action.status === 'completed' ? 'incomplete' : 'complete'}`}
      />

      {/* Action content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-muted-foreground">
            {getActionTypeIcon(action.actionType)}
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
          {action.emailSubject && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {action.emailSubject}
            </span>
          )}
          {action.clientName && (
            <span className="flex items-center gap-1">
              <Circle className="h-3 w-3" />
              {action.clientName}
            </span>
          )}
          {deadlineInfo && (
            <span className={`flex items-center gap-1 ${deadlineInfo.isUrgent ? 'text-destructive font-medium' : ''}`}>
              <Clock className="h-3 w-3" />
              {deadlineInfo.text}
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
 * Actions page component.
 *
 * Currently displays mock data. Will be connected to:
 * - useActions hook for real data
 * - API routes for action operations
 */
export default function ActionsPage() {
  // TODO: Replace with useActions hook
  const [isLoading, setIsLoading] = React.useState(true);
  const [actions, setActions] = React.useState<MockAction[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'completed'>('all');

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setActions(MOCK_ACTIONS);
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Filter actions
  const filteredActions = actions.filter((action) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return action.status !== 'completed';
    if (filter === 'completed') return action.status === 'completed';
    return true;
  });

  // Count stats
  const stats = {
    pending: actions.filter((a) => a.status === 'pending').length,
    inProgress: actions.filter((a) => a.status === 'in_progress').length,
    completed: actions.filter((a) => a.status === 'completed').length,
    overdue: actions.filter((a) => {
      if (!a.deadline || a.status === 'completed') return false;
      return a.deadline < new Date();
    }).length,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────
          Page Header
          ───────────────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Actions"
        description="Tasks and action items extracted from your emails"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Actions' },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        }
      />

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
              <span className="text-2xl font-bold">{stats.overdue}</span>
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
                <ActionListItem key={action.id} action={action} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────
          Developer Note
          ───────────────────────────────────────────────────────────────────── */}
      <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Developer Note:</strong> This page displays mock data.
          Next steps: Create useActions hook, ActionCard component, and API routes.
        </p>
      </div>
    </div>
  );
}
