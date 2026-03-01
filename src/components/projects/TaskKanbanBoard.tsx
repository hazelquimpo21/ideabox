/**
 * Task Kanban Board Component
 *
 * Displays project items in a Kanban-style board with status columns.
 * Items can be moved between columns via a status dropdown on each card.
 *
 * Columns: Backlog → Pending → In Progress → Completed
 *
 * @module components/projects/TaskKanbanBoard
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  Clock,
  AlertTriangle,
  Mail,
  ChevronRight,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { ProjectItemWithEmail, ProjectItemType, ProjectItemStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TaskKanbanBoardProps {
  items: ProjectItemWithEmail[];
  isLoading: boolean;
  onToggleComplete: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<ProjectItemWithEmail>) => Promise<void>;
}

interface KanbanColumn {
  status: ProjectItemStatus;
  label: string;
  color: string;
  headerBg: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLUMNS: KanbanColumn[] = [
  { status: 'backlog', label: 'Backlog', color: 'text-muted-foreground', headerBg: 'bg-muted/40' },
  { status: 'pending', label: 'To Do', color: 'text-amber-600', headerBg: 'bg-amber-50 dark:bg-amber-950/20' },
  { status: 'in_progress', label: 'In Progress', color: 'text-blue-600', headerBg: 'bg-blue-50 dark:bg-blue-950/20' },
  { status: 'completed', label: 'Done', color: 'text-green-600', headerBg: 'bg-green-50 dark:bg-green-950/20' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getTypeIcon(type: ProjectItemType) {
  switch (type) {
    case 'idea': return <Lightbulb className="h-3.5 w-3.5 text-amber-500" />;
    case 'task': return <CheckSquare className="h-3.5 w-3.5 text-blue-500" />;
    case 'routine': return <Repeat className="h-3.5 w-3.5 text-green-500" />;
  }
}

function getPriorityDot(priority: string) {
  switch (priority) {
    case 'urgent': return <span className="h-2 w-2 rounded-full bg-red-500 inline-block" title="Urgent" />;
    case 'high': return <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" title="High" />;
    case 'medium': return <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" title="Medium" />;
    case 'low': return <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" title="Low" />;
    default: return null;
  }
}

function formatDueDate(dateStr: string): { text: string; isUrgent: boolean } {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', isUrgent: true };
  if (diffDays === 0) return { text: 'Today', isUrgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `${diffDays}d`, isUrgent: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isUrgent: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KANBAN CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface KanbanCardProps {
  item: ProjectItemWithEmail;
  onMoveToStatus: (id: string, status: ProjectItemStatus) => void;
  onDelete?: (id: string) => void;
}

function KanbanCard({ item, onMoveToStatus, onDelete }: KanbanCardProps) {
  const [showActions, setShowActions] = React.useState(false);
  const dueInfo = item.due_date ? formatDueDate(item.due_date) : null;

  const moveTargets = COLUMNS.filter((c) => c.status !== item.status);

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-3 space-y-2">
        {/* Title row */}
        <div className="flex items-start gap-2">
          {getTypeIcon(item.item_type)}
          <span className={`text-sm font-medium flex-1 leading-tight ${item.status === 'completed' ? 'line-through opacity-60' : ''}`}>
            {item.title}
          </span>
          {getPriorityDot(item.priority)}
        </div>

        {/* Description preview */}
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {dueInfo && (
            <span className={`flex items-center gap-0.5 ${dueInfo.isUrgent ? 'text-destructive font-medium' : ''}`}>
              {dueInfo.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {dueInfo.text}
            </span>
          )}

          {item.source_email_id && (
            <Link
              href={`/inbox?email=${item.source_email_id}`}
              className="flex items-center gap-0.5 hover:text-foreground transition-colors truncate max-w-[140px]"
              title={item.source_email_subject || 'View source email'}
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.source_email_subject || item.source_email_sender || 'Email'}</span>
            </Link>
          )}

          {item.tags && item.tags.length > 0 && (
            <span className="truncate max-w-[100px]">{item.tags[0]}</span>
          )}
        </div>

        {/* Status move actions */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="h-3 w-3" />
            Move
          </button>

          {showActions && (
            <div className="absolute left-0 top-6 z-10 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]">
              {moveTargets.map((col) => (
                <button
                  key={col.status}
                  onClick={() => { onMoveToStatus(item.id, col.status); setShowActions(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${col.color}`}
                >
                  {col.label}
                </button>
              ))}
              {onDelete && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => { onDelete(item.id); setShowActions(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {COLUMNS.map((col) => (
        <div key={col.status} className="space-y-2">
          <div className={`rounded-md px-3 py-2 ${col.headerBg}`}>
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          </div>
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TaskKanbanBoard({
  items,
  isLoading,
  onToggleComplete,
  onDeleteItem,
  onUpdateItem,
}: TaskKanbanBoardProps) {
  const handleMoveToStatus = React.useCallback(
    (id: string, status: ProjectItemStatus) => {
      if (!onUpdateItem) return;

      if (status === 'completed') {
        onToggleComplete(id);
      } else {
        onUpdateItem(id, { status });
      }
    },
    [onUpdateItem, onToggleComplete]
  );

  if (isLoading) return <KanbanSkeleton />;

  const columnItems = COLUMNS.map((col) => ({
    ...col,
    items: items.filter((item) => item.status === col.status),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-[400px]">
      {columnItems.map((col) => (
        <div key={col.status} className="flex flex-col">
          {/* Column header */}
          <div className={`rounded-t-md px-3 py-2 ${col.headerBg} flex items-center justify-between`}>
            <span className={`text-sm font-medium ${col.color}`}>{col.label}</span>
            <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
              {col.items.length}
            </Badge>
          </div>

          {/* Column body */}
          <div className="flex-1 space-y-2 p-2 border border-t-0 border-border/50 rounded-b-md bg-muted/10 min-h-[200px]">
            {col.items.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                No items
              </div>
            ) : (
              col.items.map((item) => (
                <KanbanCard
                  key={item.id}
                  item={item}
                  onMoveToStatus={handleMoveToStatus}
                  onDelete={onDeleteItem}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
