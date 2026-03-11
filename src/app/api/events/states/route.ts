/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Batch Event States API Route
 *
 * Fetches states for multiple events in a single request, replacing the
 * N+1 pattern where useEvents fetched states one-by-one for each event.
 *
 * GET /api/events/states?ids=abc123,def456,ghi789
 *   Returns a map of event ID → state array.
 *
 * @module app/api/events/states/route
 * @version 1.0.0
 * @since March 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:EventStates:Batch');

type EventState = 'dismissed' | 'maybe' | 'saved_to_calendar';

interface StateRecord {
  email_id: string;
  state: EventState;
  notes: string | null;
  event_index: number | null;
  created_at: string;
}

/**
 * GET /api/events/states?ids=id1,id2,id3
 *
 * Returns states for multiple events in one query.
 * Response: { [emailId]: EventState[] }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.start('Batch fetching event states');

  try {
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Parse comma-separated IDs from query string
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');

    if (!idsParam) {
      return apiError('Missing required query parameter: ids', 400);
    }

    // Extract base email IDs from potentially synthetic event IDs (e.g., "abc-me0" → "abc")
    const rawIds = idsParam.split(',').filter(Boolean).slice(0, 200); // cap at 200
    const emailIds = [...new Set(rawIds.map(id => id.replace(/-me\d+$/, '')))];

    if (emailIds.length === 0) {
      return apiResponse({});
    }

    logger.debug('Fetching states for events', {
      requestedCount: rawIds.length,
      uniqueEmailIds: emailIds.length,
    });

    // Single query for all states
    const { data: records, error } = await supabase
      .from('user_event_states')
      .select('email_id, state, notes, event_index, created_at')
      .eq('user_id', user.id)
      .in('email_id', emailIds);

    if (error) {
      // Handle missing table or missing column gracefully
      // PGRST205 = table not in schema cache, 42703 = column does not exist
      // These occur when migrations haven't been applied yet
      if (error.code === 'PGRST205' || error.code === '42703' || error.message?.includes('schema cache')) {
        logger.debug('user_event_states table/column not available, returning empty', {
          code: error.code,
        });
        return apiResponse({});
      }

      logger.error('Failed to batch fetch states', {
        error: error.message,
        code: error.code,
      });
      return apiError(`Failed to fetch states: ${error.message}`, 500);
    }

    // Build map: emailId → states array
    const statesMap: Record<string, EventState[]> = {};
    for (const record of (records || []) as StateRecord[]) {
      if (!statesMap[record.email_id]) {
        statesMap[record.email_id] = [];
      }
      if (!statesMap[record.email_id].includes(record.state)) {
        statesMap[record.email_id].push(record.state);
      }
    }

    // Also map synthetic IDs back to their parent email's states
    // so "abc-me0" gets the states from "abc"
    const result: Record<string, EventState[]> = {};
    for (const rawId of rawIds) {
      const baseId = rawId.replace(/-me\d+$/, '');
      result[rawId] = statesMap[baseId] || [];
    }

    const durationMs = Date.now() - startTime;
    logger.success('Batch states fetched', {
      eventsRequested: rawIds.length,
      eventsWithStates: Object.keys(statesMap).length,
      durationMs,
    });

    return apiResponse(result);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in GET /api/events/states', { error: message });
    return apiError('Internal server error', 500);
  }
}
