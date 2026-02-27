/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Project Detail API Route
 *
 * GET /api/projects/[id] — Fetch a single project with item counts
 * PATCH /api/projects/[id] — Update project properties
 * DELETE /api/projects/[id] — Delete project (cascades items)
 *
 * @module app/api/projects/[id]/route
 * @since February 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { projectUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Project');

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/projects/[id]
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching project', { projectId: id });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const { data: project, error } = await supabase
      .from('projects')
      .select('*, contacts ( id, name, email, company )')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiError('Project not found', 404);
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch project', 500);
    }

    // Fetch item counts by type
    const { data: itemCounts } = await supabase
      .from('project_items')
      .select('item_type, status')
      .eq('project_id', id)
      .eq('user_id', user.id);

    const counts = {
      total: itemCounts?.length || 0,
      ideas: itemCounts?.filter((i) => i.item_type === 'idea').length || 0,
      tasks: itemCounts?.filter((i) => i.item_type === 'task').length || 0,
      routines: itemCounts?.filter((i) => i.item_type === 'routine').length || 0,
      completed: itemCounts?.filter((i) => i.status === 'completed').length || 0,
    };

    logger.success('Project fetched', { projectId: id });
    return apiResponse({ ...project, item_counts: counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/projects/[id]
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Updating project', { projectId: id });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const bodyResult = await validateBody(request, projectUpdateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const updates = bodyResult;

    const { data: project, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiError('Project not found', 404);
      logger.error('Update failed', { error: error.message });
      return apiError('Failed to update project', 500);
    }

    logger.success('Project updated', { projectId: id, fields: Object.keys(updates) });
    return apiResponse(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/projects/[id]
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Deleting project', { projectId: id });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error('Delete failed', { error: error.message });
      return apiError('Failed to delete project', 500);
    }

    logger.success('Project deleted', { projectId: id });
    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
