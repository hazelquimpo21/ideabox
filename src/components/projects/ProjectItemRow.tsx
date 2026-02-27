/**
 * Project Item Row Component
 *
 * Single row for displaying a project item (idea, task, or routine)
 * with checkbox, type icon, title, priority badge, and due date.
 *
 * @module components/projects/ProjectItemRow
 * @since February 2026
 */

'use client';

import { Badge, Checkbox } from '@/components/ui';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  Clock,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import type { ProjectItem, ProjectItemType } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectItemRowProps {
  item: ProjectItem;
  onToggleComplete: (id: string) => void;
  onDelete?: (id: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getTypeIcon(type: ProjectItemType) {
  switch (type) {
    case 'idea': return <Lightbulb className="h-4 w-4 text-amber-500" />;
    case 'task': return <CheckSquare className="h-4 w-4 text-blue-500" />;
    case 'routine': return <Repeat className="h-4 w-4 text-green-500" />;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'urgent': return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
    case 'high': return <Badge variant="destructive" className="text-xs">High</Badge>;
    case 'medium': return <Badge variant="default" className="text-xs">Medium</Badge>;
    case 'low': return <Badge variant="secondary" className="text-xs">Low</Badge>;
    default: return null;
  }
}

function formatDueDate(dateStr: string): { text: string; isUrgent: boolean } {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', isUrgent: true };
  if (diffDays === 0) return { text: 'Due today', isUrgent: true };
  if (diffDays === 1) return { text: 'Due tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, isUrgent: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isUrgent: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectItemRow({ item, onToggleComplete, onDelete }: ProjectItemRowProps) {
  const isCompleted = item.status === 'completed';
  const dueInfo = item.due_date ? formatDueDate(item.due_date) : null;

  return (
    <div
      className={`
        flex items-start gap-3 p-3 border-b border-border/50
        hover:bg-muted/30 transition-colors group
        ${isCompleted ? 'opacity-60' : ''}
      `}
    >
      {/* Checkbox (not shown for ideas) */}
      {item.item_type !== 'idea' ? (
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggleComplete(item.id)}
          className="mt-0.5"
          aria-label={`Mark "${item.title}" as ${isCompleted ? 'incomplete' : 'complete'}`}
        />
      ) : (
        <div className="mt-0.5">{getTypeIcon(item.item_type)}</div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {item.item_type !== 'idea' && (
            <span className="text-muted-foreground">{getTypeIcon(item.item_type)}</span>
          )}
          <span className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
            {item.title}
          </span>
          {getPriorityBadge(item.priority)}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
            {item.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {dueInfo && (
            <span className={`flex items-center gap-1 ${dueInfo.isUrgent ? 'text-destructive font-medium' : ''}`}>
              {dueInfo.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {dueInfo.text}
            </span>
          )}
          {item.estimated_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{item.estimated_minutes}m
            </span>
          )}
          {item.recurrence_pattern && (
            <span className="flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              {item.recurrence_pattern}
            </span>
          )}
          {item.tags && item.tags.length > 0 && (
            <span className="text-muted-foreground/70">
              {item.tags.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
          aria-label={`Delete "${item.title}"`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
