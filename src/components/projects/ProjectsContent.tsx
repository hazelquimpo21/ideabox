/**
 * Projects Content Component
 *
 * Main content area for the Projects tab. Shows project list with stats,
 * filtering, and project creation. Each project card links to its detail view.
 *
 * @module components/projects/ProjectsContent
 * @since February 2026
 */

'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
} from '@/components/ui';
import { ProjectCard } from './ProjectCard';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ProjectItemList } from './ProjectItemList';
import { CreateItemDialog } from './CreateItemDialog';
import { useProjects } from '@/hooks/useProjects';
import { useProjectItems } from '@/hooks/useProjectItems';
import {
  FolderKanban,
  Plus,
  Inbox,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { Project, ProjectItemType } from '@/types/database';

const logger = createLogger('ProjectsContent');

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ProjectsListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="py-4">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-72 mb-3" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyProjects({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <FolderKanban className="h-12 w-12 mb-4 opacity-40" />
      <h3 className="text-base font-medium mb-1">No projects yet</h3>
      <p className="text-sm mb-4">Create a project to organize your ideas, tasks, and routines.</p>
      <Button onClick={onCreateClick} size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Create Project
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS CARDS
// ═══════════════════════════════════════════════════════════════════════════════

interface StatsCardsProps {
  stats: { total: number; active: number; onHold: number; completed: number };
  filter: string;
  onFilterChange: (filter: string) => void;
}

function StatsCards({ stats, filter, onFilterChange }: StatsCardsProps) {
  const cards = [
    { key: 'all', label: 'Total', value: stats.total, color: 'text-foreground' },
    { key: 'active', label: 'Active', value: stats.active, color: 'text-blue-500' },
    { key: 'on_hold', label: 'On Hold', value: stats.onHold, color: 'text-yellow-500' },
    { key: 'completed', label: 'Done', value: stats.completed, color: 'text-green-500' },
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
          <CardContent className="py-3 px-4 text-center">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const { items, isLoading, toggleComplete, deleteItem, createItem, stats } =
    useProjectItems({ projectId: project.id });
  const [showCreateItem, setShowCreateItem] = React.useState(false);
  const [defaultItemType, setDefaultItemType] = React.useState<ProjectItemType>('task');

  const handleAddItem = (type: ProjectItemType) => {
    setDefaultItemType(type);
    setShowCreateItem(true);
  };

  return (
    <div>
      {/* Back button + project header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="h-4 w-1 rounded-full"
          style={{ backgroundColor: project.color || '#6b7280' }}
        />
        <h2 className="text-lg font-semibold">{project.name}</h2>
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground mb-4 ml-12">{project.description}</p>
      )}

      {/* Item stats summary */}
      <div className="flex items-center gap-4 mb-4 ml-12 text-sm text-muted-foreground">
        <span>{stats.byType.task} tasks</span>
        <span>{stats.byType.idea} ideas</span>
        <span>{stats.byType.routine} routines</span>
        {stats.overdue > 0 && (
          <span className="text-destructive font-medium">{stats.overdue} overdue</span>
        )}
      </div>

      {/* Add item button */}
      <div className="mb-4 ml-12">
        <Button variant="outline" size="sm" onClick={() => setShowCreateItem(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items list */}
      <div className="ml-12">
        <ProjectItemList
          items={items}
          isLoading={isLoading}
          onToggleComplete={toggleComplete}
          onDeleteItem={deleteItem}
          onAddItem={handleAddItem}
          emptyMessage="No items in this project yet"
        />
      </div>

      <CreateItemDialog
        open={showCreateItem}
        onOpenChange={setShowCreateItem}
        onCreate={createItem}
        defaultType={defaultItemType}
        projectId={project.id}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectsContent() {
  const { projects, isLoading, stats, createProject, refetch } = useProjects();
  const { items: allItems } = useProjectItems();
  const [filter, setFilter] = React.useState('all');
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);

  // If viewing a specific project, show detail view
  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  // Filter projects
  const filteredProjects = filter === 'all'
    ? projects
    : projects.filter((p) => p.status === filter);

  // Build item counts per project
  const itemCountsMap = React.useMemo(() => {
    const map: Record<string, { ideas: number; tasks: number; routines: number; completed: number; total: number }> = {};
    for (const item of allItems) {
      if (!item.project_id) continue;
      if (!map[item.project_id]) {
        map[item.project_id] = { ideas: 0, tasks: 0, routines: 0, completed: 0, total: 0 };
      }
      const counts = map[item.project_id];
      counts.total++;
      if (item.item_type === 'idea') counts.ideas++;
      if (item.item_type === 'task') counts.tasks++;
      if (item.item_type === 'routine') counts.routines++;
      if (item.status === 'completed') counts.completed++;
    }
    return map;
  }, [allItems]);

  return (
    <div>
      {/* Stats cards */}
      <StatsCards stats={stats} filter={filter} onFilterChange={setFilter} />

      {/* Header with create button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
        </h2>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Project list or loading/empty state */}
      {isLoading ? (
        <ProjectsListSkeleton />
      ) : filteredProjects.length === 0 && filter === 'all' ? (
        <EmptyProjects onCreateClick={() => setShowCreateDialog(true)} />
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No {filter.replace('_', ' ')} projects
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              itemCounts={itemCountsMap[project.id]}
              onClick={setSelectedProject}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={createProject}
      />
    </div>
  );
}
