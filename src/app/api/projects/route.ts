/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Projects API Route
 *
 * Handles listing and creating projects.
 *
 * GET /api/projects — List projects with optional filtering
 * POST /api/projects — Create a new project
 *
 * @module app/api/projects/route
 * @since February 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  paginatedResponse,
  getPagination,
  validateQuery,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { projectQuerySchema, projectCreateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Projects');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/projects - List projects
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching projects list');

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const queryResult = validateQuery(request, projectQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { status, priority, contactId } = queryResult;

    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    let query = supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (contactId) query = query.eq('contact_id', contactId);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch projects', 500);
    }

    logger.success('Projects fetched', { count: data?.length || 0, total: count });

    return paginatedResponse(data || [], pagination, count || 0, request.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/projects - Create project
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Creating project');

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const bodyResult = await validateBody(request, projectCreateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const projectData = bodyResult;

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ ...projectData, user_id: user.id })
      .select()
      .single();

    if (error) {
      logger.error('Insert failed', { error: error.message });
      return apiError('Failed to create project', 500);
    }

    logger.success('Project created', { projectId: project.id, name: project.name });
    return apiResponse(project, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
