/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 📧 Emails API Route
 *
 * Handles listing emails with filtering, pagination, and search.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/emails
 *   List emails with optional filtering
 *   Query params: category, clientId, unread, starred, archived, search, page, limit
 *   Returns: Paginated list of emails with X-Total-Count header
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * List action-required emails:
 *   GET /api/emails?category=action_required
 *
 * List unread emails for a client:
 *   GET /api/emails?clientId=uuid&unread=true
 *
 * Search emails:
 *   GET /api/emails?search=proposal&limit=20
 *
 * @module app/api/emails/route
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
import { emailQuerySchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Emails');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/emails - List emails
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching emails list');

  try {
    // Initialize Supabase client with user context
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate query parameters
    const queryResult = validateQuery(request, emailQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const { category, clientId, unread, starred, archived, search } = queryResult;

    // Get pagination parameters
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // Build query
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (unread !== undefined) {
      query = query.eq('is_read', !unread);
    }

    if (starred !== undefined) {
      query = query.eq('is_starred', starred);
    }

    // By default, exclude archived unless explicitly requested
    if (archived === true) {
      query = query.eq('is_archived', true);
    } else if (archived === false || archived === undefined) {
      query = query.eq('is_archived', false);
    }

    // Apply text search on subject and snippet
    if (search) {
      query = query.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
    }

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch emails', 500);
    }

    logger.success('Emails fetched', {
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
