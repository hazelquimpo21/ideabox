/**
 * Task Kanban Board Component
 *
 * Drag-and-drop Kanban board for project items.
 * Cards can be dragged between status columns.
 * Uses @dnd-kit for accessible, performant drag-and-drop.
 *
 * Columns: Backlog → To Do → In Progress → Done
 *
 * @module components/projects/TaskKanbanBoard
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  Clock,
  AlertTriangle,
  Mail,
  Trash2,
  GripVertical,
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

interface ColumnConfig {
  status: ProjectItemStatus;
  label: string;
  color: string;
  headerBg: string;
  accentBorder: string;
  dropHighlight: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLUMNS: ColumnConfig[] = [
  {
    status: 'backlog',
    label: 'Backlog',
    color: 'text-muted-foreground',
    headerBg: 'bg-muted/40',
    accentBorder: 'border-t-muted-foreground/30',
    dropHighlight: 'ring-muted-foreground/30 bg-muted/20',
  },
  {
    status: 'pending',
    label: 'To Do',
    color: 'text-amber-600 dark:text-amber-400',
    headerBg: 'bg-amber-50 dark:bg-amber-950/20',
    accentBorder: 'border-t-amber-400',
    dropHighlight: 'ring-amber-400/40 bg-amber-50/30 dark:bg-amber-950/10',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    color: 'text-blue-600 dark:text-blue-400',
    headerBg: 'bg-blue-50 dark:bg-blue-950/20',
    accentBorder: 'border-t-blue-400',
    dropHighlight: 'ring-blue-400/40 bg-blue-50/30 dark:bg-blue-950/10',
  },
  {
    status: 'completed',
    label: 'Done',
    color: 'text-green-600 dark:text-green-400',
    headerBg: 'bg-green-50 dark:bg-green-950/20',
    accentBorder: 'border-t-green-400',
    dropHighlight: 'ring-green-400/40 bg-green-50/30 dark:bg-green-950/10',
  },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

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
// DRAGGABLE KANBAN CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface KanbanCardProps {
  item: ProjectItemWithEmail;
  onDelete?: (id: string) => void;
  isDragOverlay?: boolean;
}

function KanbanCardContent({ item, onDelete, isDragOverlay }: KanbanCardProps) {
  const dueInfo = item.due_date ? formatDueDate(item.due_date) : null;
  const priorityColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low;

  return (
    <div className={cn(
      'rounded-lg border bg-card p-3 space-y-2 group',
      'transition-all duration-200',
      isDragOverlay
        ? 'shadow-xl ring-2 ring-primary/30 scale-[1.02] rotate-[1deg] opacity-95'
        : 'shadow-sm hover:shadow-md',
      item.status === 'completed' && 'opacity-60',
    )}>
      {/* Priority accent stripe */}
      <div className={cn('h-0.5 -mt-3 -mx-3 rounded-t-lg mb-2', priorityColor)} />

      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        {getTypeIcon(item.item_type)}
        <span className={cn(
          'text-sm font-medium flex-1 leading-tight',
          item.status === 'completed' && 'line-through',
        )}>
          {item.title}
        </span>
      </div>

      {/* Description preview */}
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-[26px]">
          {item.description}
        </p>
      )}

      {/* Metadata chips */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap pl-[26px]">
        {dueInfo && (
          <span className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full',
            dueInfo.isUrgent
              ? 'bg-destructive/10 text-destructive font-medium'
              : 'bg-muted/60',
          )}>
            {dueInfo.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {dueInfo.text}
          </span>
        )}

        {item.source_email_id && (
          <Link
            href={`/inbox?email=${item.source_email_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted hover:text-foreground transition-colors truncate max-w-[130px]"
            title={item.source_email_subject || 'View source email'}
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.source_email_subject || item.source_email_sender || 'Email'}</span>
          </Link>
        )}

        {item.tags && item.tags.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-muted/60 truncate max-w-[80px]">
            {item.tags[0]}
          </span>
        )}
      </div>

      {/* Delete — appears on hover */}
      {onDelete && !isDragOverlay && (
        <div className="flex justify-end -mb-1">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground/40 hover:text-destructive rounded"
            aria-label={`Delete "${item.title}"`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Wrapper that makes a card sortable/draggable */
function SortableKanbanCard({ item, onDelete }: { item: ProjectItemWithEmail; onDelete?: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { item } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardContent item={item} onDelete={onDelete} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DROPPABLE COLUMN
// ═══════════════════════════════════════════════════════════════════════════════

interface DroppableColumnProps {
  column: ColumnConfig;
  items: ProjectItemWithEmail[];
  isOver: boolean;
  onDelete?: (id: string) => void;
}

function DroppableColumn({ column, items, isOver, onDelete }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.status });

  return (
    <div className="flex flex-col min-w-[220px]">
      {/* Column header with accent top border */}
      <div className={cn(
        'rounded-t-lg px-3 py-2.5 border-t-2 flex items-center justify-between',
        column.headerBg,
        column.accentBorder,
      )}>
        <span className={cn('text-sm font-semibold', column.color)}>{column.label}</span>
        <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center tabular-nums">
          {items.length}
        </Badge>
      </div>

      {/* Column body — droppable zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 p-2 border border-t-0 border-border/50 rounded-b-lg min-h-[260px]',
          'transition-all duration-200',
          isOver ? cn('ring-2', column.dropHighlight) : 'bg-muted/5',
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div className={cn(
              'flex flex-col items-center justify-center h-24 text-xs rounded-md border-2 border-dashed',
              'transition-colors duration-200',
              isOver
                ? 'border-primary/40 text-primary/60'
                : 'border-border/30 text-muted-foreground/40',
            )}>
              {isOver ? 'Drop here' : 'Drag items here'}
            </div>
          ) : (
            items.map((item) => (
              <SortableKanbanCard key={item.id} item={item} onDelete={onDelete} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
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
          <div className={cn('rounded-t-lg px-3 py-2.5 border-t-2', col.headerBg, col.accentBorder)}>
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          </div>
          <div className="p-2 border border-t-0 border-border/50 rounded-b-lg space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="h-0.5 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TaskKanbanBoard({
  items,
  isLoading,
  onToggleComplete,
  onDeleteItem,
  onUpdateItem,
}: TaskKanbanBoardProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overColumnId, setOverColumnId] = React.useState<string | null>(null);

  // ─── Sensors ────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // ─── Group items by column ─────────────────────────────────────────────────
  const columnItems = React.useMemo(
    () => COLUMNS.map((col) => ({
      ...col,
      items: items.filter((item) => item.status === col.status),
    })),
    [items],
  );

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  // ─── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = React.useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverColumnId(null);
      return;
    }

    // Determine which column the card is over
    const overId = over.id as string;
    const isColumn = COLUMNS.some((c) => c.status === overId);
    if (isColumn) {
      setOverColumnId(overId);
    } else {
      // Over another card — find which column it's in
      const overItem = items.find((i) => i.id === overId);
      if (overItem) {
        setOverColumnId(overItem.status);
      }
    }
  }, [items]);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (!over || !onUpdateItem) return;

    const itemId = active.id as string;
    const overId = over.id as string;

    // Determine target status
    const isColumn = COLUMNS.some((c) => c.status === overId);
    let targetStatus: ProjectItemStatus;

    if (isColumn) {
      targetStatus = overId as ProjectItemStatus;
    } else {
      const overItem = items.find((i) => i.id === overId);
      if (!overItem) return;
      targetStatus = overItem.status;
    }

    // Find the dragged item
    const draggedItem = items.find((i) => i.id === itemId);
    if (!draggedItem || draggedItem.status === targetStatus) return;

    // Update status
    if (targetStatus === 'completed') {
      onToggleComplete(itemId);
    } else {
      onUpdateItem(itemId, { status: targetStatus });
    }
  }, [items, onUpdateItem, onToggleComplete]);

  const handleDragCancel = React.useCallback(() => {
    setActiveId(null);
    setOverColumnId(null);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) return <KanbanSkeleton />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-[400px]">
        {columnItems.map((col) => (
          <DroppableColumn
            key={col.status}
            column={col}
            items={col.items}
            isOver={overColumnId === col.status}
            onDelete={onDeleteItem}
          />
        ))}
      </div>

      {/* Drag overlay — floating card that follows the cursor */}
      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeItem ? (
          <KanbanCardContent item={activeItem} isDragOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
