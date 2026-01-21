/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Extracted Dates API Route
 *
 * Handles listing extracted dates from emails for the Hub timeline view.
 * Dates are automatically extracted by the DateExtractor analyzer during
 * email processing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/dates
 *   List extracted dates with optional filtering
 *
 *   Query params:
 *   - type: Filter by date type (deadline, event, payment_due, etc.)
 *   - from: Start date for range filter (YYYY-MM-DD)
 *   - to: End date for range filter (YYYY-MM-DD)
 *   - isAcknowledged: Filter by acknowledged status (true/false)
 *   - emailId: Filter by source email
 *   - contactId: Filter by associated contact
 *   - page, limit: Pagination
 *
 *   Returns: Paginated list of extracted dates with related email info
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Get upcoming deadlines:
 *   GET /api/dates?type=deadline&from=2026-01-19
 *
 * Get unacknowledged dates:
 *   GET /api/dates?isAcknowledged=false
 *
 * Get dates for this week:
 *   GET /api/dates?from=2026-01-19&to=2026-01-26
 *
 * Get birthdays:
 *   GET /api/dates?type=birthday
 *
 * @module app/api/dates/route
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
import { extractedDatesQuerySchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:Dates');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/dates - List extracted dates
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching extracted dates');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Create Supabase client and authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized dates request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate query parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const queryResult = validateQuery(request, extractedDatesQuerySchema);
    if (queryResult instanceof Response) {
      logger.warn('Invalid query parameters');
      return queryResult;
    }
    const { type, from, to, isAcknowledged, emailId, contactId } = queryResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Get pagination parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Build the database query
    // Includes event_metadata JSONB for rich event display (locality, location, RSVP)
    // ─────────────────────────────────────────────────────────────────────────────
    let query = supabase
      .from('extracted_dates')
      .select(`
        *,
        event_metadata,
        emails:email_id (
          id,
          subject,
          sender_name,
          sender_email
        ),
        contacts:contact_id (
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .eq('user_id', user.id);

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Apply filters
    // ─────────────────────────────────────────────────────────────────────────────

    // Filter by date type
    if (type) {
      query = query.eq('date_type', type);
      logger.debug('Filtering by date type', { type });
    }

    // Filter by date range
    if (from) {
      query = query.gte('date', from);
      logger.debug('Filtering from date', { from });
    }

    if (to) {
      query = query.lte('date', to);
      logger.debug('Filtering to date', { to });
    }

    // Filter by acknowledged status
    if (isAcknowledged !== undefined) {
      query = query.eq('is_acknowledged', isAcknowledged);
      logger.debug('Filtering by acknowledged status', { isAcknowledged });
    }

    // Filter by email
    if (emailId) {
      query = query.eq('email_id', emailId);
      logger.debug('Filtering by email', { emailId: emailId.substring(0, 8) });
    }

    // Filter by contact
    if (contactId) {
      query = query.eq('contact_id', contactId);
      logger.debug('Filtering by contact', { contactId: contactId.substring(0, 8) });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Apply sorting and pagination
    // Default: Sort by date ascending (soonest first), then by priority score
    // ─────────────────────────────────────────────────────────────────────────────
    query = query
      .order('date', { ascending: true })
      .order('priority_score', { ascending: false })
      .range(offset, offset + limit - 1);

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
      return apiError('Failed to fetch dates', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 8: Return paginated response
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Extracted dates fetched', {
      count: data?.length || 0,
      total: count,
      userId: user.id.substring(0, 8),
      filters: { type, from, to, isAcknowledged },
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
    logger.error('Unexpected error in GET /api/dates', { error: message });
    return apiError('Internal server error', 500);
  }
}
