/**
 * Email Summaries — History API Route
 *
 * GET /api/summaries/history
 *
 * Returns a paginated list of past email summaries for the authenticated user.
 * Results are ordered by created_at DESC (newest first).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUERY PARAMETERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - page (number, default: 1) — Page number (1-indexed)
 * - limit (number, default: 10, max: 30) — Summaries per page
 * - from (string, ISO date) — Filter: summaries created after this date
 * - to (string, ISO date) — Filter: summaries created before this date
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 200:
 * ```json
 * {
 *   "items": [EmailSummary, ...],
 *   "total": 42,
 *   "page": 1,
 *   "limit": 10,
 *   "hasMore": true
 * }
 * ```
 *
 * @module app/api/summaries/history/route
 * @since February 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import type { EmailSummary, SummarySection, SummaryStats } from '@/services/summary';

const logger = createLogger('SummariesHistoryAPI');

/**
 * GET /api/summaries/history
 *
 * Response:
 * - 200: { items, total, page, limit, hasMore }
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ─── Auth ──────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse query params ────────────────────────────────────────────
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '10', 10)), 30);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const offset = (page - 1) * limit;

    logger.debug('Fetching summary history', {
      userId: user.id,
      page,
      limit,
      from,
      to,
    });

    // ─── Build query ───────────────────────────────────────────────────
    let query = supabase
      .from('email_summaries')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply optional date filters
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    // ─── Execute ───────────────────────────────────────────────────────
    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch summary history', {
        userId: user.id,
        error: error.message,
        durationMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: 'Failed to fetch summary history', details: error.message },
        { status: 500 }
      );
    }

    // ─── Transform rows to typed summaries ─────────────────────────────
    const items: EmailSummary[] = (data || []).map((row) => ({
      ...row,
      sections: row.sections as SummarySection[],
      stats: row.stats as SummaryStats,
    }));

    const total = count || 0;
    const hasMore = offset + limit < total;

    logger.success('Summary history fetched', {
      userId: user.id,
      returned: items.length,
      total,
      page,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      hasMore,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching summary history', {
      error: errorMessage,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: 'Failed to fetch summary history', details: errorMessage },
      { status: 500 }
    );
  }
}
