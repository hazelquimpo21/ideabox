/**
 * 📋 Actions API Route
 *
 * Handles listing and creating action items.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/actions
 *   List actions with optional filtering
 *   Query params: status, clientId, emailId, priority, page, limit
 *   Returns: Paginated list of actions
 *
 * POST /api/actions
 *   Create a new action
 *   Body: { title, description?, priority?, deadline?, ... }
 *   Returns: Created action object
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * List pending actions:
 *   GET /api/actions?status=pending
 *
 * List high-priority client actions:
 *   GET /api/actions?clientId=uuid&priority=high
 *
 * Create action:
 *   POST /api/actions
 *   { "title": "Review proposal", "deadline": "2026-01-20T17:00:00Z" }
 *
 * @module app/api/actions/route
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
import { actionQuerySchema, actionCreateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Actions');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/actions - List actions
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching actions list');

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate query parameters
    const queryResult = validateQuery(request, actionQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { status, clientId, emailId, priority } = queryResult;

    // Get pagination parameters
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // Build query
    let query = supabase
      .from('actions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('urgency_score', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (emailId) {
      query = query.eq('email_id', emailId);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch actions', 500);
    }

    logger.success('Actions fetched', {
      count: data?.length || 0,
      total: count,
      userId: user.id,
    });

    return paginatedResponse(
      data || [],
      pagination,
      count || 0,
      request.url
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/actions - Create action
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Creating action');

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, actionCreateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const actionData = bodyResult;

    // Create action
    const { data: action, error } = await supabase
      .from('actions')
      .insert({
        ...actionData,
        user_id: user.id,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error('Insert failed', { error: error.message });
      return apiError('Failed to create action', 500);
    }

    logger.success('Action created', {
      actionId: action.id,
      title: action.title,
    });

    return apiResponse(action, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
