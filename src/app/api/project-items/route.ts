/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Cross-Project Items API Route
 *
 * GET /api/project-items — List all items across all projects (for "All Items" view)
 *
 * @module app/api/project-items/route
 * @since February 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiError,
  paginatedResponse,
  getPagination,
  validateQuery,
  requireAuth,
} from '@/lib/api/utils';
import { projectItemQuerySchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:ProjectItems:All');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/project-items - List all items across projects
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching all project items');

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const queryResult = validateQuery(request, projectItemQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { itemType, status, projectId, sortBy } = queryResult;

    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    let query = supabase
      .from('project_items')
      .select('*, projects ( id, name, color )', { count: 'exact' })
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
      case 'sort_order':
        query = query.order('sort_order', { ascending: true });
        break;
      case 'created_at':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    if (itemType) query = query.eq('item_type', itemType);
    if (status) query = query.eq('status', status);
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch project items', 500);
    }

    logger.success('All project items fetched', { count: data?.length || 0, total: count });
    return paginatedResponse(data || [], pagination, count || 0, request.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
