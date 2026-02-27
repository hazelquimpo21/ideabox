/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Project Items API Route
 *
 * GET /api/projects/[id]/items — List items for a project
 * POST /api/projects/[id]/items — Create an item within a project
 *
 * @module app/api/projects/[id]/items/route
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
import { projectItemQuerySchema, projectItemCreateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:ProjectItems');

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/projects/[id]/items
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;
  logger.start('Fetching project items', { projectId });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const queryResult = validateQuery(request, projectItemQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { itemType, status, sortBy } = queryResult;

    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    let query = supabase
      .from('project_items')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .range(offset, offset + limit - 1);

    // Sort
    switch (sortBy) {
      case 'due_date':
        query = query.order('due_date', { ascending: true, nullsFirst: false });
        break;
      case 'priority':
        query = query.order('priority', { ascending: false });
        break;
      case 'created_at':
        query = query.order('created_at', { ascending: false });
        break;
      case 'sort_order':
      default:
        query = query.order('sort_order', { ascending: true });
        break;
    }

    if (itemType) query = query.eq('item_type', itemType);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch project items', 500);
    }

    logger.success('Project items fetched', { count: data?.length || 0, projectId });
    return paginatedResponse(data || [], pagination, count || 0, request.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/projects/[id]/items
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;
  logger.start('Creating project item', { projectId });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const bodyResult = await validateBody(request, projectItemCreateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const itemData = bodyResult;

    // If promoted from an action, copy fields from the source action
    let enrichedData = { ...itemData };
    if (itemData.source_action_id) {
      const { data: sourceAction } = await supabase
        .from('actions')
        .select('title, description, priority, deadline, estimated_minutes, contact_id, email_id')
        .eq('id', itemData.source_action_id)
        .eq('user_id', user.id)
        .single();

      if (sourceAction) {
        enrichedData = {
          ...enrichedData,
          title: enrichedData.title || sourceAction.title,
          description: enrichedData.description || sourceAction.description,
          priority: enrichedData.priority || sourceAction.priority,
          due_date: enrichedData.due_date || (sourceAction.deadline ? sourceAction.deadline.split('T')[0] : null),
          estimated_minutes: enrichedData.estimated_minutes || sourceAction.estimated_minutes,
          contact_id: enrichedData.contact_id || sourceAction.contact_id,
          source_email_id: enrichedData.source_email_id || sourceAction.email_id,
        };
      }
    }

    const { data: item, error } = await supabase
      .from('project_items')
      .insert({
        ...enrichedData,
        project_id: projectId,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      logger.error('Insert failed', { error: error.message });
      return apiError('Failed to create project item', 500);
    }

    logger.success('Project item created', {
      itemId: item.id,
      type: item.item_type,
      title: item.title,
    });

    return apiResponse(item, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
