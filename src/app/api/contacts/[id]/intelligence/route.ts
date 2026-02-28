/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Contact Intelligence API Route
 *
 * Server-side aggregation of analyzer intelligence for a specific contact.
 * Computes relationship signal trends, common topics, extracted dates,
 * and communication stats from emails associated with the contact.
 *
 * GET /api/contacts/[id]/intelligence
 *   Returns aggregated intelligence data for the contact.
 *
 * @module app/api/contacts/[id]/intelligence/route
 * @since February 2026 — Phase 1: Contact intelligence
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:ContactIntelligence');

/** Route params type */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Zod schema for contact ID validation */
const contactIdSchema = z.string().uuid();

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/[id]/intelligence
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching contact intelligence', { contactId: id });

  try {
    // Validate contact ID
    const parseResult = contactIdSchema.safeParse(id);
    if (!parseResult.success) {
      return apiError('Invalid contact ID', 400);
    }

    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Fetch recent emails for this contact (up to 20)
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('id, date, topics, category')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(20);

    if (emailsError) {
      logger.error('Failed to fetch contact emails', { error: emailsError.message });
      return apiError('Failed to fetch emails', 500);
    }

    // Fetch extracted dates for this contact
    const { data: extractedDates, error: datesError } = await supabase
      .from('extracted_dates')
      .select('title, date, date_type, priority_score')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .limit(10);

    if (datesError) {
      logger.warn('Failed to fetch extracted dates', { error: datesError.message });
    }

    // ── Compute relationship trend ──────────────────────────────────────────
    // NOTE: relationship_signal column doesn't exist yet (migration 043 not applied).
    // Default to 'unknown' until the migration is run.
    const dominantSignal: string = 'unknown';

    // ── Aggregate topics ────────────────────────────────────────────────────
    const topicCounts: Record<string, number> = {};
    for (const email of emails || []) {
      if (email.topics) {
        for (const topic of email.topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
    }

    // Sort by count, take top 5
    const commonTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    // ── Communication frequency (emails per month, last 6 months) ───────────
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthCounts: Record<string, number> = {};

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[key] = 0;
    }

    for (const email of emails || []) {
      const emailDate = new Date(email.date);
      if (emailDate >= sixMonthsAgo) {
        const key = `${emailDate.getFullYear()}-${String(emailDate.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthCounts) {
          monthCounts[key]++;
        }
      }
    }

    const communicationStats = Object.entries(monthCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    const result = {
      relationshipTrend: {
        dominant: dominantSignal,
        counts: signalCounts,
        totalEmails: emails?.length ?? 0,
      },
      commonTopics,
      extractedDates: (extractedDates || []).map(d => ({
        title: d.title,
        date: d.date,
        dateType: d.date_type,
        priorityScore: d.priority_score,
      })),
      communicationStats,
    };

    logger.success('Contact intelligence computed', {
      contactId: id,
      emailCount: emails?.length ?? 0,
      topicCount: commonTopics.length,
      dateCount: extractedDates?.length ?? 0,
    });

    return apiResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Contact intelligence failed', { contactId: id, error: message });
    return apiError('Failed to compute intelligence', 500);
  }
}
