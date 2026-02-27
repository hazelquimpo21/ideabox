/**
 * All Items Content Component
 *
 * Flat list of all project items across all projects.
 * Supports filtering by type, status, overdue, and completed visibility.
 * Supports sorting by due date, priority, created date, and status.
 *
 * @module components/projects/AllItemsContent
 * @since February 2026
 */

'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Checkbox,
} from '@/components/ui';
import { ProjectItemList } from './ProjectItemList';
import { CreateItemDialog } from './CreateItemDialog';
import { useProjectItems } from '@/hooks/useProjectItems';
import { useProjects } from '@/hooks/useProjects';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  ListChecks,
  Plus,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ProjectItemType, ProjectItemStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// STATS CARDS
// ═══════════════════════════════════════════════════════════════════════════════

interface StatsCardsProps {
  stats: {
    total: number;
    byType: { idea: number; task: number; routine: number };
    overdue: number;
  };
  filter: string;
  onFilterChange: (filter: string) => void;
}

function StatsCards({ stats, filter, onFilterChange }: StatsCardsProps) {
  const cards = [
    { key: 'all', label: 'All', value: stats.total, icon: <ListChecks className="h-4 w-4" />, color: 'text-foreground' },
    { key: 'task', label: 'Tasks', value: stats.byType.task, icon: <CheckSquare className="h-4 w-4 text-blue-500" />, color: 'text-blue-500' },
    { key: 'idea', label: 'Ideas', value: stats.byType.idea, icon: <Lightbulb className="h-4 w-4 text-amber-500" />, color: 'text-amber-500' },
    { key: 'routine', label: 'Routines', value: stats.byType.routine, icon: <Repeat className="h-4 w-4 text-green-500" />, color: 'text-green-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <Card
          key={c.key}
          className={`cursor-pointer transition-all hover:bg-muted/30 ${
            filter === c.key ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => onFilterChange(c.key)}
        >
          <CardContent className="py-3 px-4 flex items-center gap-3">
            {c.icon}
            <div>
              <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SORT & FILTER BAR
// ═══════════════════════════════════════════════════════════════════════════════

type SortOption = 'due_date' | 'priority' | 'created_at' | 'sort_order';
type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';

interface FilterBarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (v: boolean) => void;
  showCompleted: boolean;
  onShowCompletedChange: (v: boolean) => void;
}

function FilterBar({
  sortBy, onSortChange,
  statusFilter, onStatusFilterChange,
  overdueOnly, onOverdueOnlyChange,
  showCompleted, onShowCompletedChange,
}: FilterBarProps) {
  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Done' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Sort selector */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="text-xs bg-transparent border border-input rounded px-2 py-1"
        >
          <option value="sort_order">Manual order</option>
          <option value="due_date">Due date</option>
          <option value="priority">Priority</option>
          <option value="created_at">Created date</option>
        </select>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
        {statusOptions.map((s) => (
          <button
            key={s.value}
            onClick={() => onStatusFilterChange(s.value)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Quick toggles */}
      <div className="flex items-center gap-3 ml-auto text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <Checkbox
            checked={overdueOnly}
            onCheckedChange={(v) => onOverdueOnlyChange(v === true)}
            className="h-3.5 w-3.5"
          />
          <AlertTriangle className="h-3 w-3 text-destructive" />
          Overdue only
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <Checkbox
            checked={showCompleted}
            onCheckedChange={(v) => onShowCompletedChange(v === true)}
            className="h-3.5 w-3.5"
          />
          {showCompleted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Show completed
        </label>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function isOverdue(item: { due_date?: string | null; status: string }): boolean {
  if (!item.due_date || item.status === 'completed' || item.status === 'cancelled') return false;
  return new Date(item.due_date) < new Date();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AllItemsContent() {
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortBy, setSortBy] = React.useState<SortOption>('sort_order');
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [defaultItemType, setDefaultItemType] = React.useState<ProjectItemType>('task');

  const { items, isLoading, stats, toggleComplete, deleteItem, createItem, updateItem } =
    useProjectItems({
      itemType: typeFilter === 'all' ? 'all' : (typeFilter as ProjectItemType),
      sortBy,
    });

  const { projects } = useProjects();
  const projectList = React.useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    [projects]
  );

  const handleAddItem = (type: ProjectItemType) => {
    setDefaultItemType(type);
    setShowCreateDialog(true);
  };

  // ─── Client-side filtering ─────────────────────────────────────────────────
  const filteredItems = React.useMemo(() => {
    let result = items;

    // Hide completed by default
    if (!showCompleted) {
      result = result.filter((i) => i.status !== 'completed');
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter);
    }

    // Overdue only
    if (overdueOnly) {
      result = result.filter(isOverdue);
    }

    return result;
  }, [items, showCompleted, statusFilter, overdueOnly]);

  return (
    <div>
      {/* Stats cards */}
      <StatsCards stats={stats} filter={typeFilter} onFilterChange={setTypeFilter} />

      {/* Overdue warning */}
      {stats.overdue > 0 && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          {stats.overdue} overdue item{stats.overdue !== 1 ? 's' : ''}
        </div>
      )}

      {/* Sort & filter bar */}
      <FilterBar
        sortBy={sortBy}
        onSortChange={setSortBy}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        overdueOnly={overdueOnly}
        onOverdueOnlyChange={setOverdueOnly}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
      />

      {/* Header with create button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          {typeFilter !== 'all' ? ` (${typeFilter}s)` : ''}
        </h2>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Item
        </Button>
      </div>

      {/* Items list */}
      <ProjectItemList
        items={filteredItems}
        isLoading={isLoading}
        onToggleComplete={toggleComplete}
        onDeleteItem={deleteItem}
        onUpdateItem={updateItem}
        onAddItem={handleAddItem}
        showGroupHeaders={typeFilter === 'all'}
        emptyMessage={typeFilter === 'all' ? 'No items yet — create one to get started' : `No ${typeFilter}s yet`}
        projects={projectList}
      />

      <CreateItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={createItem}
        defaultType={defaultItemType}
      />
    </div>
  );
}
