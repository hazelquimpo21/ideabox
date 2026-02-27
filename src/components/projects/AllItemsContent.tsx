/**
 * All Items Content Component
 *
 * Flat list of all project items across all projects.
 * Supports filtering by type (idea/task/routine) and status.
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
  Skeleton,
} from '@/components/ui';
import { ProjectItemList } from './ProjectItemList';
import { CreateItemDialog } from './CreateItemDialog';
import { useProjectItems } from '@/hooks/useProjectItems';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  ListChecks,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import type { ProjectItemType } from '@/types/database';

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
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AllItemsContent() {
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [defaultItemType, setDefaultItemType] = React.useState<ProjectItemType>('task');

  const { items, isLoading, stats, toggleComplete, deleteItem, createItem } =
    useProjectItems({
      itemType: typeFilter === 'all' ? 'all' : (typeFilter as ProjectItemType),
    });

  const handleAddItem = (type: ProjectItemType) => {
    setDefaultItemType(type);
    setShowCreateDialog(true);
  };

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

      {/* Header with create button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {typeFilter !== 'all' ? ` (${typeFilter}s)` : ''}
        </h2>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Item
        </Button>
      </div>

      {/* Items list */}
      <ProjectItemList
        items={items}
        isLoading={isLoading}
        onToggleComplete={toggleComplete}
        onDeleteItem={deleteItem}
        onAddItem={handleAddItem}
        showGroupHeaders={typeFilter === 'all'}
        emptyMessage={typeFilter === 'all' ? 'No items yet — create one to get started' : `No ${typeFilter}s yet`}
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
