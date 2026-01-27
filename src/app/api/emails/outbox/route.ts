/**
 * Email Outbox API Route
 *
 * Lists sent, scheduled, and draft emails for the authenticated user.
 * Includes pagination and filtering by status.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/emails/outbox
 *   - List outbound emails with pagination
 *   - Filter by status (sent, scheduled, draft, failed)
 *   - Includes open tracking stats
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUERY PARAMETERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - status: Filter by status (sent, scheduled, draft, failed, all)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - accountId: Filter by Gmail account (optional)
 *
 * @module app/api/emails/outbox/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('OutboxAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Valid status filters for outbox queries.
 */
const VALID_STATUSES = ['sent', 'scheduled', 'draft', 'failed', 'queued', 'all'] as const;
type StatusFilter = typeof VALID_STATUSES[number];

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emails/outbox
 *
 * Lists outbound emails for the authenticated user.
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching outbox emails');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Parse query parameters
    // ─────────────────────────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10))
    );
    const accountId = searchParams.get('accountId');

    // Validate status parameter
    const status: StatusFilter = VALID_STATUSES.includes(statusParam as StatusFilter)
      ? (statusParam as StatusFilter)
      : 'all';

    logger.debug('Query parameters', {
      userId: user.id.substring(0, 8),
      status,
      page,
      limit,
      hasAccountFilter: !!accountId,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Build and execute query
    // ─────────────────────────────────────────────────────────────────────────

    const offset = (page - 1) * limit;

    // Base query
    let query = supabase
      .from('outbound_emails')
      .select(`
        id,
        to_email,
        to_name,
        subject,
        status,
        scheduled_at,
        sent_at,
        created_at,
        open_count,
        first_opened_at,
        last_opened_at,
        has_reply,
        reply_received_at,
        tracking_enabled,
        error_message,
        gmail_accounts!inner (
          id,
          email
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply account filter
    if (accountId) {
      query = query.eq('gmail_account_id', accountId);
    }

    const { data: emails, error: queryError, count } = await query;

    if (queryError) {
      logger.error('Failed to fetch outbox emails', {
        error: queryError.message,
      });
      return createApiError('Failed to fetch emails', 500, 'DATABASE_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Return response with pagination
    // ─────────────────────────────────────────────────────────────────────────

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    logger.success('Fetched outbox emails', {
      userId: user.id.substring(0, 8),
      count: emails?.length || 0,
      totalCount,
      page,
      totalPages,
    });

    return createApiSuccess({
      emails: emails || [],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    logger.error('Unexpected error in outbox API', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
