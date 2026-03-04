/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Smart Views API Route — Timeliness-powered inbox views
 *
 * NEW (Mar 2026): Taxonomy v2 — uses timeliness JSONB and scoring columns
 * to power intelligent email views beyond simple category filtering.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/emails/smart-views?view=today
 *   Emails with timeliness.nature = 'today' or 'asap', sorted by surface_priority
 *
 * GET /api/emails/smart-views?view=upcoming
 *   Emails with timeliness.nature = 'upcoming', sorted by relevant_date ASC
 *
 * GET /api/emails/smart-views?view=expiring
 *   Emails with timeliness.expires set, sorted by expires ASC (soonest first)
 *
 * GET /api/emails/smart-views?view=reading-list
 *   Emails with timeliness.nature = 'evergreen' or 'reference', newsletters
 *
 * GET /api/emails/smart-views?view=high-priority
 *   Emails with surface_priority >= 0.7, sorted by surface_priority DESC
 *
 * GET /api/emails/smart-views?view=needs-action
 *   Emails with action_score >= 0.5, sorted by urgency DESC
 *
 * Common query params: page, limit
 *
 * @module app/api/emails/smart-views/route
 * @since March 2026 — Taxonomy v2
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiError,
  paginatedResponse,
  getPagination,
  requireAuth,
} from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:SmartViews');

// ═══════════════════════════════════════════════════════════════════════════════
// VALID SMART VIEW NAMES
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_VIEWS = [
  'today',         // Today's actionable items
  'upcoming',      // Future events and deadlines
  'expiring',      // Items about to expire
  'reading-list',  // Evergreen/reference content to read later
  'high-priority', // High surface_priority emails
  'needs-action',  // Emails requiring user action
] as const;

type SmartView = typeof VALID_VIEWS[number];

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/emails/smart-views
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') as SmartView | null;

  if (!view || !VALID_VIEWS.includes(view)) {
    return apiError(
      `Invalid view. Must be one of: ${VALID_VIEWS.join(', ')}`,
      400
    );
  }

  logger.start(`Fetching smart view: ${view}`);

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const userId = userResult.id;

    // Pagination
    const { page, limit } = getPagination(searchParams);
    const offset = (page - 1) * limit;

    // Build query based on view type
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', false);

    // Apply view-specific filters and sorting
    switch (view) {
      case 'today':
        // Emails that matter right now: today's content + urgent items
        query = query
          .or('timeliness->>nature.eq.today,timeliness->>nature.eq.asap')
          .order('surface_priority', { ascending: false, nullsFirst: false });
        break;

      case 'upcoming':
        // Future events and deadlines, sorted by when they happen
        query = query
          .eq('timeliness->>nature', 'upcoming')
          .not('timeliness->>relevant_date', 'is', null)
          .order('timeliness->>relevant_date', { ascending: true });
        break;

      case 'expiring':
        // Items about to expire, soonest first
        query = query
          .not('timeliness->>expires', 'is', null)
          .order('timeliness->>expires', { ascending: true });
        break;

      case 'reading-list':
        // Evergreen content and reference material for later reading
        query = query
          .or('timeliness->>nature.eq.evergreen,timeliness->>nature.eq.reference')
          .order('surface_priority', { ascending: false, nullsFirst: false });
        break;

      case 'high-priority':
        // High-priority emails across all categories
        query = query
          .gte('surface_priority', 0.7)
          .order('surface_priority', { ascending: false, nullsFirst: false });
        break;

      case 'needs-action':
        // Emails that need the user to do something
        query = query
          .gte('action_score', 0.5)
          .order('urgency_score', { ascending: false, nullsFirst: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: emails, error, count } = await query;

    if (error) {
      logger.error(`Smart view query failed: ${view}`, {
        view,
        error: error.message,
      });
      return apiError('Failed to fetch smart view', 500);
    }

    logger.info(`Smart view fetched: ${view}`, {
      view,
      count: count ?? 0,
      page,
      limit,
    });

    return paginatedResponse(emails ?? [], count ?? 0, page, limit);
  } catch (err) {
    logger.error('Smart view error', {
      view,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return apiError('Internal server error', 500);
  }
}
