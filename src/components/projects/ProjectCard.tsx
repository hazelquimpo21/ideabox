/**
 * Project Card Component
 *
 * Displays a project as a card with color stripe, name, date range,
 * item count badges, and status/priority indicators.
 *
 * @module components/projects/ProjectCard
 * @since February 2026
 */

'use client';

import { Card, CardContent, Badge } from '@/components/ui';
import { ProjectDateRange } from './ProjectDateRange';
import {
  Lightbulb,
  CheckSquare,
  Repeat,
  MoreVertical,
  FolderKanban,
} from 'lucide-react';
import type { Project } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectCardProps {
  project: Project;
  itemCounts?: { ideas: number; tasks: number; routines: number; completed: number; total: number };
  onClick?: (project: Project) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge variant="default" className="text-xs">Active</Badge>;
    case 'on_hold': return <Badge variant="secondary" className="text-xs">On Hold</Badge>;
    case 'completed': return <Badge variant="outline" className="text-xs">Completed</Badge>;
    case 'archived': return <Badge variant="outline" className="text-xs opacity-60">Archived</Badge>;
    default: return null;
  }
}

function getPriorityDot(priority: string) {
  switch (priority) {
    case 'high': return <span className="h-2 w-2 rounded-full bg-red-500" />;
    case 'medium': return <span className="h-2 w-2 rounded-full bg-yellow-500" />;
    case 'low': return <span className="h-2 w-2 rounded-full bg-green-500" />;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectCard({ project, itemCounts, onClick }: ProjectCardProps) {
  const completionPercent = itemCounts && itemCounts.total > 0
    ? Math.round((itemCounts.completed / itemCounts.total) * 100)
    : 0;

  return (
    <Card
      className="hover:bg-muted/30 transition-colors cursor-pointer overflow-hidden"
      onClick={() => onClick?.(project)}
    >
      <div className="flex">
        {/* Color stripe */}
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: project.color || '#6b7280' }}
        />

        <CardContent className="flex-1 py-4 px-4">
          {/* Header row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{project.icon || ''}</span>
              <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-medium truncate">{project.name}</h3>
              {getPriorityDot(project.priority)}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {getStatusBadge(project.status)}
            </div>
          </div>

          {/* Description */}
          {project.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
              {project.description}
            </p>
          )}

          {/* Item counts */}
          {itemCounts && itemCounts.total > 0 && (
            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
              {itemCounts.ideas > 0 && (
                <span className="flex items-center gap-1">
                  <Lightbulb className="h-3 w-3 text-amber-500" />
                  {itemCounts.ideas}
                </span>
              )}
              {itemCounts.tasks > 0 && (
                <span className="flex items-center gap-1">
                  <CheckSquare className="h-3 w-3 text-blue-500" />
                  {itemCounts.tasks}
                </span>
              )}
              {itemCounts.routines > 0 && (
                <span className="flex items-center gap-1">
                  <Repeat className="h-3 w-3 text-green-500" />
                  {itemCounts.routines}
                </span>
              )}
              <span className="ml-auto">
                {completionPercent}% done
              </span>
            </div>
          )}

          {/* Date range */}
          <ProjectDateRange
            startDate={project.start_date}
            endDate={project.end_date}
            compact
          />
        </CardContent>
      </div>
    </Card>
  );
}
