/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 🏢 Clients API Route
 *
 * Handles listing and creating clients.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/clients
 *   List clients with optional filtering
 *   Query params: status, priority, search, page, limit
 *   Returns: Paginated list of clients
 *
 * POST /api/clients
 *   Create a new client
 *   Body: { name, company?, email?, priority?, ... }
 *   Returns: Created client object
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * List active clients:
 *   GET /api/clients?status=active
 *
 * List VIP clients:
 *   GET /api/clients?priority=vip
 *
 * Search clients:
 *   GET /api/clients?search=acme
 *
 * Create client:
 *   POST /api/clients
 *   { "name": "Acme Corp", "company": "Acme Corporation" }
 *
 * @module app/api/clients/route
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
import { clientQuerySchema, clientCreateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Clients');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/clients - List clients
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching clients list');

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate query parameters
    const queryResult = validateQuery(request, clientQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { status, priority, search } = queryResult;

    // Get pagination parameters
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // Build query
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    } else {
      // By default, exclude archived clients
      query = query.neq('status', 'archived');
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    // Apply text search on name and company
    if (search) {
      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%`);
    }

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch clients', 500);
    }

    logger.success('Clients fetched', {
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
// POST /api/clients - Create client
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Creating client');

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, clientCreateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const clientData = bodyResult;

    // Create client
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        ...clientData,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      logger.error('Insert failed', { error: error.message });
      return apiError('Failed to create client', 500);
    }

    logger.success('Client created', {
      clientId: client.id,
      name: client.name,
    });

    return apiResponse(client, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
