/**
 * Project Item Row Component
 *
 * Single row for displaying a project item (idea, task, or routine)
 * with checkbox, type icon, title, priority badge, due date, and
 * inline editing capabilities.
 *
 * @module components/projects/ProjectItemRow
 * @since February 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Checkbox, Input } from '@/components/ui';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  Clock,
  AlertTriangle,
  Trash2,
  Mail,
} from 'lucide-react';
import type { ProjectItemWithEmail, ProjectItemType } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectItemRowProps {
  item: ProjectItemWithEmail;
  onToggleComplete: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<ProjectItemWithEmail>) => Promise<void>;
  projects?: Array<{ id: string; name: string; color?: string | null }>;
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

const PRIORITY_CYCLE = ['low', 'medium', 'high', 'urgent'] as const;

function getPriorityBadge(priority: string, onClick?: () => void) {
  const props = onClick
    ? { onClick, className: 'text-xs cursor-pointer hover:opacity-80', role: 'button' as const }
    : { className: 'text-xs' };

  switch (priority) {
    case 'urgent': return <Badge variant="destructive" {...props}>Urgent</Badge>;
    case 'high': return <Badge variant="destructive" {...props}>High</Badge>;
    case 'medium': return <Badge variant="default" {...props}>Medium</Badge>;
    case 'low': return <Badge variant="secondary" {...props}>Low</Badge>;
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

/** Format recurrence pattern to human-readable text */
function formatRecurrence(pattern: string, config?: Record<string, unknown> | null): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const interval = config?.interval as number | undefined;

  switch (pattern) {
    case 'daily':
      return interval && interval > 1 ? `Every ${interval} days` : 'Daily';
    case 'weekly': {
      const dow = config?.day_of_week as number | undefined;
      const dayLabel = dow !== undefined ? dayNames[dow] : null;
      if (interval && interval > 1) return `Every ${interval} weeks`;
      return dayLabel ? `Weekly (${dayLabel})` : 'Weekly';
    }
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return interval && interval > 1 ? `Every ${interval} months` : 'Monthly';
    default:
      return pattern;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectItemRow({ item, onToggleComplete, onDelete, onUpdate, projects }: ProjectItemRowProps) {
  const isCompleted = item.status === 'completed';
  const dueInfo = item.due_date ? formatDueDate(item.due_date) : null;

  // ─── Inline edit state ─────────────────────────────────────────────────────
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(item.title);
  const [editingDueDate, setEditingDueDate] = React.useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [editingTitle]);

  // ─── Inline handlers ──────────────────────────────────────────────────────
  const saveTitle = () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft.trim() !== item.title && onUpdate) {
      onUpdate(item.id, { title: titleDraft.trim() });
    } else {
      setTitleDraft(item.title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') { setTitleDraft(item.title); setEditingTitle(false); }
  };

  const cyclePriority = () => {
    if (!onUpdate) return;
    const idx = PRIORITY_CYCLE.indexOf(item.priority as typeof PRIORITY_CYCLE[number]);
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    onUpdate(item.id, { priority: next });
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingDueDate(false);
    if (onUpdate) {
      onUpdate(item.id, { due_date: e.target.value || null });
    }
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onUpdate) return;
    onUpdate(item.id, { project_id: e.target.value || null });
  };

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

          {/* ─── Editable title ──────────────────────────────────────────── */}
          {editingTitle && onUpdate ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={handleTitleKeyDown}
              className="text-sm font-medium bg-transparent border-b border-primary outline-none flex-1 min-w-0"
              maxLength={200}
            />
          ) : (
            <span
              className={`text-sm font-medium ${isCompleted ? 'line-through' : ''} ${onUpdate ? 'cursor-text' : ''}`}
              onDoubleClick={() => { if (onUpdate) { setTitleDraft(item.title); setEditingTitle(true); } }}
              title={onUpdate ? 'Double-click to edit' : undefined}
            >
              {item.title}
            </span>
          )}

          {/* ─── Clickable priority badge ────────────────────────────────── */}
          {getPriorityBadge(item.priority, onUpdate ? cyclePriority : undefined)}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
            {item.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {/* ─── Clickable due date ────────────────────────────────────── */}
          {editingDueDate && onUpdate ? (
            <input
              type="date"
              defaultValue={item.due_date || ''}
              onChange={handleDueDateChange}
              onBlur={() => setEditingDueDate(false)}
              autoFocus
              className="text-xs border border-input rounded px-1 py-0.5 bg-background"
            />
          ) : dueInfo ? (
            <span
              className={`flex items-center gap-1 ${dueInfo.isUrgent ? 'text-destructive font-medium' : ''} ${onUpdate ? 'cursor-pointer hover:underline' : ''}`}
              onClick={() => { if (onUpdate) setEditingDueDate(true); }}
              title={onUpdate ? 'Click to change due date' : undefined}
            >
              {dueInfo.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {dueInfo.text}
            </span>
          ) : onUpdate && item.item_type !== 'idea' ? (
            <span
              className="flex items-center gap-1 cursor-pointer hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setEditingDueDate(true)}
            >
              <Clock className="h-3 w-3" />
              Add due date
            </span>
          ) : null}

          {item.estimated_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{item.estimated_minutes}m
            </span>
          )}

          {/* ─── Recurrence badge ──────────────────────────────────────── */}
          {item.recurrence_pattern && (
            <Badge variant="outline" className="text-xs font-normal py-0 px-1.5">
              <Repeat className="h-3 w-3 mr-1" />
              {formatRecurrence(item.recurrence_pattern, item.recurrence_config as Record<string, unknown> | null)}
            </Badge>
          )}

          {item.tags && item.tags.length > 0 && (
            <span className="text-muted-foreground/70">
              {item.tags.slice(0, 2).join(', ')}
            </span>
          )}

          {/* ─── Source email link ────────────────────────────────────── */}
          {item.source_email_id && (
            <Link
              href={`/inbox?email=${item.source_email_id}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              title="View source email"
            >
              <Mail className="h-3 w-3" />
              {item.source_email_subject || item.source_email_sender || 'Source email'}
            </Link>
          )}

          {/* ─── Project reassignment ──────────────────────────────────── */}
          {onUpdate && projects && projects.length > 0 && (
            <select
              value={item.project_id || ''}
              onChange={handleProjectChange}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-transparent border border-input rounded px-1 py-0.5 max-w-[120px] cursor-pointer"
              title="Move to project"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
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
