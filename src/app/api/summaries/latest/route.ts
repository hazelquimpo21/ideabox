/**
 * Email Summaries — Latest API Route
 *
 * GET /api/summaries/latest
 *
 * Returns the most recent email summary for the authenticated user,
 * along with staleness info so the frontend knows whether to regenerate.
 *
 * @module app/api/summaries/latest/route
 * @since February 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getLatestSummaryWithState } from '@/services/summary';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('SummariesLatestAPI');

/**
 * GET /api/summaries/latest
 *
 * Response:
 * - 200: { summary, is_stale, generated_at }
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getLatestSummaryWithState(user.id);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch latest summary', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to fetch latest summary', details: errorMessage },
      { status: 500 }
    );
  }
}
