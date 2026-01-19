/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Contacts API Route
 *
 * Handles listing contacts with various filters and sorting options.
 * Contacts are auto-populated from email processing and enriched by AI.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/contacts
 *   List contacts with optional filtering and sorting
 *
 *   Query params:
 *   - isVip: Filter by VIP status (true/false)
 *   - isMuted: Filter by muted status (true/false)
 *   - relationshipType: Filter by relationship (client, colleague, etc.)
 *   - search: Search by name or email
 *   - sortBy: Sort field (email_count, last_seen_at, name)
 *   - sortOrder: Sort direction (asc, desc)
 *   - page, limit: Pagination
 *
 *   Returns: Paginated list of contacts with communication stats
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * List VIP contacts:
 *   GET /api/contacts?isVip=true
 *
 * Search contacts:
 *   GET /api/contacts?search=john
 *
 * List by most emails:
 *   GET /api/contacts?sortBy=email_count&sortOrder=desc
 *
 * List client contacts:
 *   GET /api/contacts?relationshipType=client
 *
 * @module app/api/contacts/route
 * @version 1.0.0
 * @since January 2026
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
import { contactQuerySchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:Contacts');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts - List contacts
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching contacts list');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Create Supabase client and authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized contacts request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate query parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const queryResult = validateQuery(request, contactQuerySchema);
    if (queryResult instanceof Response) {
      logger.warn('Invalid query parameters');
      return queryResult;
    }
    const { isVip, isMuted, relationshipType, search, sortBy, sortOrder } = queryResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Get pagination parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Build the database query
    // ─────────────────────────────────────────────────────────────────────────────
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply filters
    if (isVip !== undefined) {
      query = query.eq('is_vip', isVip);
      logger.debug('Filtering by VIP status', { isVip });
    }

    if (isMuted !== undefined) {
      query = query.eq('is_muted', isMuted);
      logger.debug('Filtering by muted status', { isMuted });
    }

    if (relationshipType) {
      query = query.eq('relationship_type', relationshipType);
      logger.debug('Filtering by relationship type', { relationshipType });
    }

    // Apply text search on name and email
    if (search) {
      // Use case-insensitive search on name and email columns
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      logger.debug('Applying search filter', { search });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Apply sorting
    // ─────────────────────────────────────────────────────────────────────────────
    const sortField = sortBy || 'last_seen_at';
    const ascending = sortOrder === 'asc';

    query = query.order(sortField, { ascending, nullsFirst: false });
    logger.debug('Applying sort', { sortField, ascending });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Apply pagination
    // ─────────────────────────────────────────────────────────────────────────────
    query = query.range(offset, offset + limit - 1);

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 7: Execute query
    // ─────────────────────────────────────────────────────────────────────────────
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', {
        error: error.message,
        code: error.code,
        userId: user.id.substring(0, 8),
      });
      return apiError('Failed to fetch contacts', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 8: Return paginated response
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Contacts fetched', {
      count: data?.length || 0,
      total: count,
      userId: user.id.substring(0, 8),
      filters: { isVip, isMuted, relationshipType, search: !!search },
    });

    return paginatedResponse(
      data || [],
      pagination,
      count || 0,
      request.url
    );
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────────
    // Error handling
    // ─────────────────────────────────────────────────────────────────────────────
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in GET /api/contacts', { error: message });
    return apiError('Internal server error', 500);
  }
}
