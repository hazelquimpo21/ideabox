/**
 * Project Item List Component
 *
 * Grouped list of project items by type (ideas, tasks, routines).
 * Each section is collapsible and shows a count badge.
 *
 * @module components/projects/ProjectItemList
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Card, CardContent, Badge, Button, Skeleton } from '@/components/ui';
import { ProjectItemRow } from './ProjectItemRow';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  ChevronDown,
  ChevronRight,
  Plus,
  Inbox,
} from 'lucide-react';
import type { ProjectItem, ProjectItemType } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectItemListProps {
  items: ProjectItem[];
  isLoading: boolean;
  onToggleComplete: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onAddItem?: (type: ProjectItemType) => void;
  showGroupHeaders?: boolean;
  emptyMessage?: string;
}

interface GroupConfig {
  type: ProjectItemType;
  label: string;
  icon: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const GROUPS: GroupConfig[] = [
  { type: 'task', label: 'Tasks', icon: <CheckSquare className="h-4 w-4 text-blue-500" /> },
  { type: 'idea', label: 'Ideas', icon: <Lightbulb className="h-4 w-4 text-amber-500" /> },
  { type: 'routine', label: 'Routines', icon: <Repeat className="h-4 w-4 text-green-500" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectItemList({
  items,
  isLoading,
  onToggleComplete,
  onDeleteItem,
  onAddItem,
  showGroupHeaders = true,
  emptyMessage = 'No items yet',
}: ProjectItemListProps) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const toggleGroup = (type: string) => {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  if (isLoading) return <ListSkeleton />;
  if (items.length === 0) return <EmptyState message={emptyMessage} />;

  // If no grouping, render flat list
  if (!showGroupHeaders) {
    return (
      <Card>
        <CardContent className="p-0">
          {items.map((item) => (
            <ProjectItemRow
              key={item.id}
              item={item}
              onToggleComplete={onToggleComplete}
              onDelete={onDeleteItem}
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Grouped rendering
  const grouped = GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => i.item_type === g.type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      {grouped.map((group) => (
        <Card key={group.type}>
          <CardContent className="p-0">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.type)}
              className="flex items-center gap-2 w-full px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              {collapsed[group.type] ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              {group.icon}
              <span className="text-sm font-medium">{group.label}</span>
              <Badge variant="secondary" className="text-xs ml-1">
                {group.items.length}
              </Badge>
              {onAddItem && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem(group.type);
                  }}
                  aria-label={`Add ${group.type}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </button>

            {/* Group items */}
            {!collapsed[group.type] && (
              <div>
                {group.items.map((item) => (
                  <ProjectItemRow
                    key={item.id}
                    item={item}
                    onToggleComplete={onToggleComplete}
                    onDelete={onDeleteItem}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
