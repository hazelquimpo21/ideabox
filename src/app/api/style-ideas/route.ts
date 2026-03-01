/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues
/**
 * Style Ideas API Route
 *
 * GET /api/style-ideas — Fetch email style/design ideas from ContentDigest analysis
 *
 * Returns style observations (layout, tone, CTA, subject_line, etc.) extracted by
 * the ContentDigest analyzer, sorted by confidence. Useful for solopreneurs
 * wanting to improve their own email marketing.
 *
 * @module app/api/style-ideas/route
 * @since February 2026 — Phase 2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('StyleIdeasAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface StyleIdea {
  idea: string;
  type: string;
  whyItWorks: string;
  confidence: number;
  sourceEmail: {
    id: string;
    subject: string | null;
    senderName: string | null;
    date: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET — Fetch style ideas from email analyses
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/style-ideas
 *
 * Query params:
 * - limit: Max source emails to query (default: 30)
 * - type: Filter by style type (tone, layout, subject_line, cta, visual, storytelling)
 *
 * Response: { ideas: StyleIdea[] }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ─── Authentication ──────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication failed', { error: authError?.message });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Parse Query Params ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || '30'), 50);
    const typeFilter = searchParams.get('type') || null;

    logger.start('Fetching style ideas', { userId: user.id, limit, typeFilter });

    // ─── Query email_analyses for content_digest containing emailStyleIdeas ─
    // NOTE: The email_analyses table stores analyzers in individual JSONB columns
    // (content_digest, action_extraction, etc.) — there is no analysis_data column.
    const { data: analyses, error: queryError } = await supabase
      .from('email_analyses')
      .select('email_id, content_digest, emails!inner(subject, sender_name, sender_email, date)')
      .eq('user_id', user.id)
      .not('content_digest', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (queryError) {
      logger.error('Failed to fetch style ideas', { error: queryError.message });
      return NextResponse.json({ error: 'Failed to fetch style ideas' }, { status: 500 });
    }

    // ─── Extract and flatten style ideas ──────────────────────────────────
    const ideas = extractStyleIdeas(analyses || [], typeFilter);

    logger.success('Style ideas fetched', { count: ideas.length, duration: Date.now() - startTime });
    return NextResponse.json({ ideas });
  } catch (error) {
    logger.error('Unhandled error in style ideas API', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and flattens style ideas from analysis records.
 * Sorts by confidence, deduplicates, returns top 20.
 */
function extractStyleIdeas(
  analyses: Array<Record<string, unknown>>,
  typeFilter: string | null,
): StyleIdea[] {
  const allIdeas: StyleIdea[] = [];

  for (const record of analyses) {
    const emailData = record.emails as Record<string, unknown> | null;
    if (!emailData) continue;

    // Extract style ideas from the content_digest JSONB column
    const digest = record.content_digest as Record<string, unknown> | null;
    if (!digest) continue;
    const styleIdeas: Array<Record<string, unknown>> =
      (digest.emailStyleIdeas as Array<Record<string, unknown>>)
        || (digest.email_style_ideas as Array<Record<string, unknown>>)
        || [];

    for (const si of styleIdeas) {
      const type = (si.type as string) || 'tone';
      if (typeFilter && type !== typeFilter) continue;

      allIdeas.push({
        idea: (si.idea as string) || '',
        type,
        whyItWorks: (si.why_it_works as string) || (si.whyItWorks as string) || '',
        confidence: (si.confidence as number) || 0.5,
        sourceEmail: {
          id: record.email_id as string,
          subject: (emailData.subject as string) || null,
          senderName: (emailData.sender_name as string) || null,
          date: (emailData.date as string) || '',
        },
      });
    }
  }

  // Sort by confidence descending, deduplicate by idea text, take top 20
  const seen = new Set<string>();
  return allIdeas
    .sort((a, b) => b.confidence - a.confidence)
    .filter((idea) => {
      const key = idea.idea.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
