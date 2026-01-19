/**
 * Hub Priorities API Route
 *
 * GET /api/hub/priorities
 *
 * Returns the top priority items for the authenticated user's Hub view.
 * Uses AI-driven scoring to determine the most important items.
 *
 * @module app/api/hub/priorities/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTopPriorityItems } from '@/services/hub';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('HubPrioritiesAPI');

/**
 * GET /api/hub/priorities
 *
 * Query params:
 * - limit: Number of items to return (default: 3, max: 10)
 *
 * Response:
 * - 200: Hub priorities with items, stats, and lastUpdated
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized hub priorities request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '3', 10), 1), 10);

    logger.start('Fetching hub priorities', { userId: user.id, limit });

    // Get priority items
    const result = await getTopPriorityItems(user.id, { limit });

    logger.success('Hub priorities fetched', {
      userId: user.id,
      itemCount: result.items.length,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Hub priorities fetch failed', { error: errorMessage });

    return NextResponse.json(
      { error: 'Failed to fetch hub priorities', details: errorMessage },
      { status: 500 }
    );
  }
}
