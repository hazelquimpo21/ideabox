/**
 * Active Projects Widget
 *
 * Home page widget showing the user's active projects with
 * completion progress. Includes a "View all" link to the Tasks page.
 *
 * @module components/home/ActiveProjectsWidget
 * @since February 2026
 */

'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { ProjectDateRange } from '@/components/projects/ProjectDateRange';
import {
  FolderKanban,
  ArrowRight,
  Lightbulb,
  CheckSquare,
  Repeat,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { Project, ProjectItem } from '@/types/database';

const logger = createLogger('ActiveProjectsWidget');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActiveProjectsWidgetProps {
  projects: Project[];
  items: ProjectItem[];
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getItemCounts(projectId: string, items: ProjectItem[]) {
  const projectItems = items.filter((i) => i.project_id === projectId);
  const completed = projectItems.filter((i) => i.status === 'completed').length;
  const total = projectItems.length;
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ActiveProjectsWidget({
  projects,
  items,
  isLoading,
}: ActiveProjectsWidgetProps) {
  logger.debug('Rendering ActiveProjectsWidget', { projectCount: projects.length, isLoading });

  const activeProjects = projects
    .filter((p) => p.status === 'active')
    .slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-indigo-500" />
            Active Projects
          </CardTitle>
          <Link href="/tasks?tab=projects">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              View all
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-1 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : activeProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No active projects yet
          </p>
        ) : (
          <div className="space-y-3">
            {activeProjects.map((project) => {
              const counts = getItemCounts(project.id, items);
              return (
                <div
                  key={project.id}
                  className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {/* Color stripe */}
                  <div
                    className="w-1 h-8 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: project.color || '#6b7280' }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {counts.total > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {counts.completed}/{counts.total} done ({counts.percent}%)
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No items</span>
                      )}
                      <ProjectDateRange
                        startDate={project.start_date}
                        endDate={project.end_date}
                        compact
                      />
                    </div>
                    {/* Mini progress bar */}
                    {counts.total > 0 && (
                      <div className="h-1 bg-muted rounded-full overflow-hidden mt-1.5 w-full">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${counts.percent}%`,
                            backgroundColor: project.color || '#6b7280',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActiveProjectsWidget;
