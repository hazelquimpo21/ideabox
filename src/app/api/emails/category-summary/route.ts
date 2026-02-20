/**
 * Category Summary API Route
 *
 * GET /api/emails/category-summary
 *
 * Returns live category summaries built from the actual emails table.
 * Used as a fallback when the cached sync_progress result is empty/stale
 * (e.g., after onboarding completes with 0 analyzed emails but background
 * sync has since fetched real emails).
 *
 * @module app/api/emails/category-summary/route
 * @since February 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { CATEGORY_DISPLAY } from '@/types/discovery';
import { CATEGORY_INSIGHT_TEMPLATES } from '@/config/initial-sync';
import type { CategorySummary, SenderInfo, InitialSyncResponse, SyncStats } from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('API:CategorySummary');

// =============================================================================
// TYPES
// =============================================================================

interface CategorySummaryResponse {
  categories: CategorySummary[];
  stats: {
    total: number;
    analyzed: number;
    unanalyzed: number;
  };
  /** Full result object matching InitialSyncResponse shape for easy swap-in */
  result: InitialSyncResponse;
}

// =============================================================================
// GET HANDLER
// =============================================================================

export async function GET(): Promise<NextResponse<CategorySummaryResponse | { error: string }>> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Building live category summary', { userId: user.id.slice(0, 8) });

    // ─── Count totals ─────────────────────────────────────────────────────
    const { count: totalCount } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_archived', false);

    const { count: analyzedCount } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .not('analyzed_at', 'is', null);

    const total = totalCount || 0;
    const analyzed = analyzedCount || 0;
    const unanalyzed = total - analyzed;

    // ─── If no analyzed emails, return empty result quickly ────────────────
    if (analyzed === 0) {
      logger.info('No analyzed emails yet', { userId: user.id.slice(0, 8), total, unanalyzed });

      const emptyStats: SyncStats = {
        totalFetched: total,
        preFiltered: 0,
        analyzed: 0,
        failed: 0,
        totalTokensUsed: 0,
        estimatedCost: 0,
        processingTimeMs: 0,
      };

      return NextResponse.json({
        categories: [],
        stats: { total, analyzed: 0, unanalyzed },
        result: {
          success: true,
          stats: emptyStats,
          categories: [],
          clientInsights: [],
          failures: [],
          suggestedActions: [],
        },
      });
    }

    // ─── Fetch analyzed emails grouped by category ────────────────────────
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('id, category, is_read, sender_email, sender_name, subject')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .not('analyzed_at', 'is', null)
      .not('category', 'is', null)
      .order('date', { ascending: false })
      .limit(500);

    if (emailsError) {
      logger.error('Failed to fetch emails for category summary', { error: emailsError.message });
      return NextResponse.json({ error: 'Failed to build category summary' }, { status: 500 });
    }

    // ─── Build category summaries ─────────────────────────────────────────
    const categoryMap = new Map<string, {
      count: number;
      unreadCount: number;
      senders: Map<string, { name: string; email: string; count: number }>;
      subjects: string[];
    }>();

    for (const email of emails || []) {
      const cat = email.category as string;
      if (!cat) continue;

      let entry = categoryMap.get(cat);
      if (!entry) {
        entry = { count: 0, unreadCount: 0, senders: new Map(), subjects: [] };
        categoryMap.set(cat, entry);
      }

      entry.count++;
      if (!email.is_read) entry.unreadCount++;

      // Track senders
      const senderKey = email.sender_email || 'unknown';
      const existing = entry.senders.get(senderKey);
      if (existing) {
        existing.count++;
      } else {
        entry.senders.set(senderKey, {
          name: email.sender_name || email.sender_email || 'Unknown',
          email: email.sender_email || '',
          count: 1,
        });
      }

      // Collect subjects (max 3)
      if (entry.subjects.length < 3 && email.subject) {
        entry.subjects.push(email.subject);
      }
    }

    // ─── Convert to CategorySummary array ─────────────────────────────────
    const categories: CategorySummary[] = [];

    for (const [category, data] of categoryMap.entries()) {
      // Only include known categories
      if (!(category in CATEGORY_DISPLAY)) continue;

      // Get top 3 senders sorted by count
      const topSenders: SenderInfo[] = Array.from(data.senders.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // Build insight text
      const template = CATEGORY_INSIGHT_TEMPLATES[category as keyof typeof CATEGORY_INSIGHT_TEMPLATES];
      let insight = `${data.count} emails`;
      if (template) {
        if (data.count === 0) insight = template.empty;
        else if (data.count === 1) insight = template.singular;
        else insight = template.plural(data.count);
      }

      categories.push({
        category: category as CategorySummary['category'],
        count: data.count,
        unreadCount: data.unreadCount,
        topSenders,
        sampleSubjects: data.subjects,
        insight,
      });
    }

    // Sort by count descending
    categories.sort((a, b) => b.count - a.count);

    // ─── Build full result ────────────────────────────────────────────────
    const stats: SyncStats = {
      totalFetched: total,
      preFiltered: 0,
      analyzed,
      failed: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
      processingTimeMs: 0,
    };

    const result: InitialSyncResponse = {
      success: true,
      stats,
      categories,
      clientInsights: [],
      failures: [],
      suggestedActions: [],
    };

    logger.info('Live category summary built', {
      userId: user.id.slice(0, 8),
      total,
      analyzed,
      categoryCount: categories.length,
    });

    return NextResponse.json({
      categories,
      stats: { total, analyzed, unanalyzed },
      result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Category summary request failed', { error: msg });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
