/**
 * Email Summaries — Generate API Route
 *
 * POST /api/summaries/generate
 *
 * Generates a new email summary if stale + enough time has passed.
 * Idempotent: if a fresh summary exists (< 1 hour, not stale), returns it.
 *
 * @module app/api/summaries/generate/route
 * @since February 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateSummary } from '@/services/summary';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('SummariesGenerateAPI');

/**
 * POST /api/summaries/generate
 *
 * Body (optional):
 * - force: boolean — Force regeneration even if not stale
 *
 * Response:
 * - 200: { summary, was_cached }
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse optional body
    let force = false;
    try {
      const body = await request.json();
      force = body?.force === true;
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Fetch user context for personalization
    const { data: userContext } = await supabase
      .from('user_context')
      .select('role, company')
      .eq('user_id', user.id)
      .single();

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const result = await generateSummary(user.id, {
      force,
      userName: profile?.full_name?.split(' ')[0] || undefined,
      role: userContext?.role || undefined,
      company: userContext?.company || undefined,
    });

    if (!result.success) {
      logger.error('Summary generation failed', { userId: user.id, error: result.error });
      return NextResponse.json(
        { error: 'Summary generation failed', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      summary: result.summary,
      was_cached: result.was_cached,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Summary generation request failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to generate summary', details: errorMessage },
      { status: 500 }
    );
  }
}
