/**
 * Action List Item Component
 *
 * Single action row with completion toggle, type icon, priority badge,
 * deadline indicator, and promote-to-project button.
 *
 * @module components/actions/ActionListItem
 * @since February 2026
 */

'use client';

import Link from 'next/link';
import { Badge, Checkbox } from '@/components/ui';
import type { ActionWithEmail, ActionType, ActionPriority } from '@/types/database';
import {
  CheckSquare,
  Circle,
  Clock,
  AlertTriangle,
  Mail,
  Calendar,
  Plus,
  ArrowUpRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionListItemProps {
  action: ActionWithEmail;
  onToggleComplete: (id: string) => void;
  onPromote?: (action: ActionWithEmail) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ActionListItem({ action, onToggleComplete, onPromote }: ActionListItemProps) {
  const priorityInfo = getPriorityInfo(action.priority as ActionPriority | null);
  const deadlineInfo = formatDeadline(action.deadline);

  return (
    <div
      className={`
        flex items-start gap-4 p-4 border-b border-border/50
        hover:bg-muted/30 transition-colors group
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
            <Link
              href={`/inbox?email=${action.email_id}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              title="View source email"
            >
              <Mail className="h-3 w-3" />
              {action.email_subject || action.email_sender || 'Source email'}
            </Link>
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

      {/* Promote button */}
      {onPromote && action.status !== 'completed' && (
        <button
          onClick={() => onPromote(action)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
          aria-label={`Promote "${action.title}" to project item`}
          title="Promote to project item"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
