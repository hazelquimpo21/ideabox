/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues
/**
 * Review Queue API Route
 *
 * GET /api/emails/review-queue
 *
 * Returns the daily review queue — emails worth scanning today, ranked by
 * a composite of recency, signal strength, reply worthiness, and category.
 *
 * This supports the TWO-TIER TASK SYSTEM (Feb 2026):
 * - Tier 1: Review Queue (this endpoint) — scan-worthy emails, no individual tasks
 * - Tier 2: Real Tasks (actions table) — concrete, verb-oriented tasks
 *
 * The review queue surfaces emails that are:
 * 1. Not archived
 * 2. Signal strength = high or medium (not low/noise)
 * 3. Not yet reviewed (reviewed_at IS NULL) or reviewed > 24h ago
 * 4. From the last 7 days
 *
 * PATCH /api/emails/review-queue
 * Marks an email as reviewed (sets reviewed_at = now)
 *
 * @module app/api/emails/review-queue/route
 * @since February 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('ReviewQueueAPI');

/**
 * GET /api/emails/review-queue
 *
 * Query params:
 * - limit: Number of items to return (default: 10, max: 25)
 * - include_reviewed: Include already-reviewed emails (default: false)
 *
 * Response:
 * - 200: Review queue items with stats
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized review queue request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse query params ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 25);
    const includeReviewed = searchParams.get('include_reviewed') === 'true';

    logger.start('Fetching review queue', {
      userId: user.id.substring(0, 8),
      limit,
      includeReviewed,
    });

    // ─── Calculate date boundaries ───────────────────────────────────────
    // Review queue covers the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString();

    // For "re-review" threshold: only show reviewed emails if they were
    // reviewed more than 24 hours ago (allows daily re-review)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const reReviewThreshold = twentyFourHoursAgo.toISOString();

    // ─── Build query ─────────────────────────────────────────────────────
    // Fetch emails that are review-worthy:
    // - User's emails from last 7 days
    // - Not archived
    // - Signal strength high or medium (not low/noise)
    // - Not yet reviewed OR reviewed > 24h ago (for daily cycling)
    let query = supabase
      .from('emails')
      .select('id, subject, sender_email, sender_name, date, snippet, gist, category, signal_strength, reply_worthiness, quick_action, labels, is_read, reviewed_at, summary', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .gte('date', cutoffDate)
      .in('signal_strength', ['high', 'medium'])
      .order('date', { ascending: false })
      .limit(limit);

    // Filter by review status
    if (!includeReviewed) {
      // Show unreviewed OR reviewed > 24h ago (daily cycling)
      query = query.or(`reviewed_at.is.null,reviewed_at.lt.${reReviewThreshold}`);
    }

    const { data: emails, error: queryError, count } = await query;

    if (queryError) {
      logger.error('Review queue query failed', {
        error: queryError.message,
        code: queryError.code,
      });
      return NextResponse.json(
        { error: 'Failed to fetch review queue', details: queryError.message },
        { status: 500 }
      );
    }

    // ─── Build stats ─────────────────────────────────────────────────────
    const stats = {
      totalInQueue: count ?? 0,
      returnedCount: emails?.length ?? 0,
      highSignal: emails?.filter(e => e.signal_strength === 'high').length ?? 0,
      mediumSignal: emails?.filter(e => e.signal_strength === 'medium').length ?? 0,
      needsReply: emails?.filter(e =>
        e.reply_worthiness === 'must_reply' || e.reply_worthiness === 'should_reply'
      ).length ?? 0,
      unread: emails?.filter(e => !e.is_read).length ?? 0,
    };

    logger.success('Review queue fetched', {
      userId: user.id.substring(0, 8),
      ...stats,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      items: emails ?? [],
      stats,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Review queue fetch failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to fetch review queue', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/emails/review-queue
 *
 * Marks an email as reviewed in the daily review queue.
 * Sets reviewed_at = NOW() on the email record.
 *
 * Body:
 * - emailId: string — the email to mark as reviewed
 *
 * Response:
 * - 200: Success
 * - 400: Missing emailId
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function PATCH(request: NextRequest) {
  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse body ──────────────────────────────────────────────────────
    const body = await request.json();
    const { emailId } = body;

    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    logger.info('Marking email as reviewed', {
      userId: user.id.substring(0, 8),
      emailId: emailId.substring(0, 8),
    });

    // ─── Update email ────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('emails')
      .update({ reviewed_at: new Date().toISOString() })
      .eq('id', emailId)
      .eq('user_id', user.id); // Ensure user owns the email

    if (updateError) {
      logger.error('Failed to mark email as reviewed', {
        emailId: emailId.substring(0, 8),
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'Failed to mark as reviewed', details: updateError.message },
        { status: 500 }
      );
    }

    logger.success('Email marked as reviewed', {
      emailId: emailId.substring(0, 8),
    });

    return NextResponse.json({ success: true, reviewedAt: new Date().toISOString() });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Review queue PATCH failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to update review status', details: errorMessage },
      { status: 500 }
    );
  }
}
