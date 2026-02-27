/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useProjects Hook
 *
 * React hook for fetching, filtering, and managing projects from Supabase.
 * Provides CRUD operations with optimistic updates and statistics.
 *
 * @module hooks/useProjects
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Project, ProjectStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 50;
const logger = createLogger('useProjects');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseProjectsOptions {
  status?: ProjectStatus | 'all';
  limit?: number;
  sortBy?: 'updated_at' | 'created_at' | 'name' | 'priority';
}

export interface ProjectStats {
  total: number;
  active: number;
  onHold: number;
  completed: number;
  archived: number;
}

export interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  stats: ProjectStats;
  refetch: () => Promise<void>;
  createProject: (project: Partial<Project> & { name: string }) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function calculateStats(projects: Project[]): ProjectStats {
  return {
    total: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    onHold: projects.filter((p) => p.status === 'on_hold').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    archived: projects.filter((p) => p.status === 'archived').length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<ProjectStats>({
    total: 0, active: 0, onHold: 0, completed: 0, archived: 0,
  });

  const supabase = React.useMemo(() => createClient(), []);
  const { status = 'all', limit = DEFAULT_LIMIT, sortBy = 'updated_at' } = options;

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProjects = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    logger.start('Fetching projects', { status, limit, sortBy });

    try {
      let query = supabase.from('projects').select('*').limit(limit);

      switch (sortBy) {
        case 'name':
          query = query.order('name', { ascending: true });
          break;
        case 'priority':
          query = query.order('priority', { ascending: false });
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        case 'updated_at':
        default:
          query = query.order('updated_at', { ascending: false });
      }

      if (status !== 'all') query = query.eq('status', status);

      const { data, error: queryError } = await query;
      if (queryError) throw new Error(queryError.message);

      const fetched = data || [];
      setProjects(fetched);
      setStats(calculateStats(fetched));
      logger.success('Projects fetched', { count: fetched.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch projects', { error: msg });
      setError(err instanceof Error ? err : new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, status, limit, sortBy]);

  // ─── Create ─────────────────────────────────────────────────────────────────

  const createProject = React.useCallback(
    async (newProject: Partial<Project> & { name: string }): Promise<Project | null> => {
      logger.start('Creating project', { name: newProject.name });

      try {
        const { data, error: insertError } = await supabase
          .from('projects')
          .insert(newProject)
          .select()
          .single();

        if (insertError) throw new Error(insertError.message);

        if (data) {
          setProjects((prev) => [data, ...prev]);
          setStats((prev) => ({ ...prev, total: prev.total + 1, active: prev.active + 1 }));
        }

        logger.success('Project created', { id: data?.id });
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create project', { error: msg });
        setError(err instanceof Error ? err : new Error(msg));
        return null;
      }
    },
    [supabase]
  );

  // ─── Update ─────────────────────────────────────────────────────────────────

  const updateProject = React.useCallback(
    async (id: string, updates: Partial<Project>) => {
      logger.start('Updating project', { id });

      const original = projects.find((p) => p.id === id);
      if (!original) return;

      // Optimistic update
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

      try {
        const { error: updateError } = await supabase
          .from('projects')
          .update(updates)
          .eq('id', id);

        if (updateError) throw new Error(updateError.message);

        // Recalculate stats
        setStats(calculateStats(projects.map((p) => (p.id === id ? { ...p, ...updates } : p))));
        logger.success('Project updated', { id });
      } catch (err) {
        setProjects((prev) => prev.map((p) => (p.id === id ? original : p)));
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to update project', { id, error: msg });
        setError(err instanceof Error ? err : new Error(msg));
      }
    },
    [supabase, projects]
  );

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const deleteProject = React.useCallback(
    async (id: string) => {
      logger.start('Deleting project', { id });
      const originalProjects = [...projects];

      setProjects((prev) => prev.filter((p) => p.id !== id));

      try {
        const { error: deleteError } = await supabase
          .from('projects')
          .delete()
          .eq('id', id);

        if (deleteError) throw new Error(deleteError.message);

        setStats(calculateStats(projects.filter((p) => p.id !== id)));
        logger.success('Project deleted', { id });
      } catch (err) {
        setProjects(originalProjects);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to delete project', { id, error: msg });
        setError(err instanceof Error ? err : new Error(msg));
      }
    },
    [supabase, projects]
  );

  // ─── Effects ────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return {
    projects, isLoading, error, stats,
    refetch: fetchProjects, createProject, updateProject, deleteProject,
  };
}

export default useProjects;
