/**
 * Summary Generator Service
 *
 * Core service for generating AI-synthesized email summaries.
 * Orchestrates: staleness check → query → cluster → synthesize → persist.
 *
 * Summaries are generated when ALL of these are true:
 * 1. New emails have been synced since the last summary (is_stale = true)
 * 2. At least 1 hour has passed since the last summary
 * 3. Triggered by user visit (lazy) or post-sync hook (eager)
 *
 * @module services/summary/summary-generator
 * @since February 2026
 */

import { createLogger, logAI } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { analyzeWithFunction, withRetry } from '@/lib/ai/openai-client';
import { analyzerConfig } from '@/config/analyzers';
import {
  buildSummarySystemPrompt,
  buildSummaryUserContent,
  SUMMARY_FUNCTION_SCHEMA,
} from './summary-prompt';
import type {
  EmailSummary,
  UserSummaryState,
  SummaryResult,
  SummaryInputData,
  SummaryEmailIndex,
  ThreadSummary,
  GenerateSummaryResult,
} from './types';

const logger = createLogger('SummaryGenerator');

/** Minimum interval between summaries (1 hour in ms). */
const MIN_INTERVAL_MS = 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a new email summary for a user, or returns the existing one
 * if it's still fresh (< 1 hour old and not stale).
 *
 * Idempotent: safe to call multiple times concurrently.
 */
export async function generateSummary(
  userId: string,
  options?: { force?: boolean; userName?: string; role?: string; company?: string }
): Promise<GenerateSummaryResult> {
  const startTime = Date.now();

  logger.start('Summary generation requested', { userId, force: options?.force });

  try {
    const supabase = await createServerClient();

    // ─── Step 1: Check staleness ─────────────────────────────────────────
    const state = await getSummaryState(supabase, userId);

    if (!options?.force && state) {
      const lastSummaryAt = state.last_summary_at ? new Date(state.last_summary_at).getTime() : 0;
      const timeSince = Date.now() - lastSummaryAt;

      // If not stale OR less than 1 hour since last → return existing
      if (!state.is_stale || timeSince < MIN_INTERVAL_MS) {
        const existing = await getLatestSummary(supabase, userId);
        if (existing) {
          logger.info('Returning existing summary (still fresh)', {
            userId,
            isStale: state.is_stale,
            minutesSinceLast: Math.round(timeSince / 60000),
          });
          return { success: true, summary: existing, was_cached: true };
        }
      }
    }

    // ─── Step 2: Query all inputs ────────────────────────────────────────
    const lastSummaryAt = state?.last_summary_at || null;
    const inputData = await gatherInputData(supabase, userId, lastSummaryAt);

    // If no new emails and no pending actions, skip generation
    if (inputData.threads.length === 0 && inputData.actions.length === 0) {
      const existing = await getLatestSummary(supabase, userId);
      logger.info('No new data for summary', { userId });
      return { success: true, summary: existing, was_cached: true };
    }

    // ─── Step 3: Synthesize with AI ──────────────────────────────────────
    const config = analyzerConfig.summaryGenerator;

    const systemPrompt = buildSummarySystemPrompt({
      userName: options?.userName,
      role: options?.role,
      company: options?.company,
    });
    const userContent = buildSummaryUserContent(inputData);

    logAI.callStart({ model: config.model, emailId: `summary-${userId}` });

    const result = await withRetry(() =>
      analyzeWithFunction<SummaryResult>(
        systemPrompt,
        userContent,
        SUMMARY_FUNCTION_SCHEMA,
        {
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        }
      )
    );

    logAI.callComplete({
      model: config.model,
      emailId: `summary-${userId}`,
      tokensUsed: result.tokensTotal,
      estimatedCost: result.estimatedCost,
      durationMs: result.durationMs,
    });

    // ─── Step 4: Compute coverage window + email index ─────────────────
    const allDates = inputData.threads.map(t => t.latest_date).sort();
    const periodStart = allDates[0] || new Date().toISOString();
    const periodEnd = allDates[allDates.length - 1] || new Date().toISOString();
    const totalEmails = inputData.threads.reduce((sum, t) => sum + t.email_count, 0);
    const totalThreads = inputData.threads.length;

    // Build email_index: map of email_id → {subject, sender, category}
    // This lets the UI render clickable links to source emails without extra queries
    const emailIndex = buildEmailIndex(inputData.threads);

    // ─── Step 5: Persist to email_summaries ──────────────────────────────
    const processingTimeMs = Date.now() - startTime;

    const { data: inserted, error: insertError } = await supabase
      .from('email_summaries')
      .insert({
        user_id: userId,
        headline: result.data.headline,
        sections: result.data.sections as unknown as Record<string, unknown>[],
        stats: result.data.stats as unknown as Record<string, unknown>,
        email_index: emailIndex as unknown as Record<string, unknown>,
        period_start: periodStart,
        period_end: periodEnd,
        emails_included: totalEmails,
        threads_included: totalThreads,
        tokens_used: result.tokensTotal,
        estimated_cost: result.estimatedCost,
        processing_time_ms: processingTimeMs,
        model: config.model,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to persist summary', { userId, error: insertError.message });
      return { success: false, summary: null, was_cached: false, error: insertError.message };
    }

    // ─── Step 6: Update summary state ────────────────────────────────────
    await upsertSummaryState(supabase, userId, {
      last_summary_at: new Date().toISOString(),
      is_stale: false,
      emails_since_last: 0,
    });

    const summary: EmailSummary = {
      id: inserted.id,
      user_id: inserted.user_id,
      headline: result.data.headline,
      sections: result.data.sections,
      stats: result.data.stats,
      email_index: emailIndex,
      period_start: periodStart,
      period_end: periodEnd,
      emails_included: totalEmails,
      threads_included: totalThreads,
      tokens_used: result.tokensTotal,
      estimated_cost: result.estimatedCost,
      processing_time_ms: processingTimeMs,
      model: config.model,
      created_at: inserted.created_at,
    };

    logger.success('Summary generated', {
      userId,
      emails: totalEmails,
      threads: totalThreads,
      sections: result.data.sections.length,
      tokensUsed: result.tokensTotal,
      cost: result.estimatedCost,
      processingTimeMs,
    });

    return { success: true, summary, was_cached: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Summary generation failed', { userId, error: errorMessage });
    return { success: false, summary: null, was_cached: false, error: errorMessage };
  }
}

/**
 * Gets the latest summary for a user along with staleness info.
 * Used by GET /api/summaries/latest.
 */
export async function getLatestSummaryWithState(userId: string): Promise<{
  summary: EmailSummary | null;
  is_stale: boolean;
  generated_at: string | null;
}> {
  const supabase = await createServerClient();

  const [summary, state] = await Promise.all([
    getLatestSummary(supabase, userId),
    getSummaryState(supabase, userId),
  ]);

  return {
    summary,
    is_stale: state?.is_stale ?? true,
    generated_at: summary?.created_at ?? null,
  };
}

/**
 * Marks summary as stale for a user. Called after email sync completes.
 */
export async function markSummaryStale(
  userId: string,
  newEmailCount: number = 1
): Promise<void> {
  const supabase = await createServerClient();

  // Upsert: if no row exists yet, create one; otherwise update
  const { error } = await supabase.rpc('upsert_summary_state_stale', {
    p_user_id: userId,
    p_new_emails: newEmailCount,
  });

  // If the RPC doesn't exist yet, fall back to manual upsert
  if (error) {
    logger.debug('Falling back to manual summary state upsert', { userId });
    await upsertSummaryState(supabase, userId, {
      is_stale: true,
      emails_since_last: newEmailCount, // Will be overwritten, but good enough
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets the current summary state for a user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSummaryState(supabase: any, userId: string): Promise<UserSummaryState | null> {
  const { data, error } = await supabase
    .from('user_summary_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as UserSummaryState;
}

/**
 * Gets the latest email summary for a user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLatestSummary(supabase: any, userId: string): Promise<EmailSummary | null> {
  const { data, error } = await supabase
    .from('email_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    sections: data.sections as EmailSummary['sections'],
    stats: data.stats as EmailSummary['stats'],
    email_index: (data.email_index || {}) as EmailSummary['email_index'],
  };
}

/**
 * Upserts the user_summary_state row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertSummaryState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  updates: Partial<Omit<UserSummaryState, 'user_id'>>
): Promise<void> {
  const { error } = await supabase
    .from('user_summary_state')
    .upsert(
      {
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    logger.warn('Failed to upsert summary state', { userId, error: error.message });
  }
}

/**
 * Gathers all input data needed for summary synthesis.
 * Queries emails, actions, dates, ideas, and news since the last summary.
 */
async function gatherInputData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  lastSummaryAt: string | null
): Promise<SummaryInputData> {
  const sinceDate = lastSummaryAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Run all queries in parallel
  const [emailsResult, actionsResult, datesResult, ideasResult, newsResult] = await Promise.all([
    // Emails since last summary
    supabase
      .from('emails')
      .select('id, thread_id, subject, sender_name, sender_email, category, signal_strength, reply_worthiness, ai_brief, date')
      .eq('user_id', userId)
      .gte('date', sinceDate)
      .order('date', { ascending: false })
      .limit(200),

    // Pending actions
    supabase
      .from('actions')
      .select('id, title, action_type, priority, deadline, email_id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('urgency_score', { ascending: false })
      .limit(20),

    // Upcoming dates (next 7 days, not acknowledged)
    supabase
      .from('extracted_dates')
      .select('title, date, date_type')
      .eq('user_id', userId)
      .eq('is_acknowledged', false)
      .eq('is_hidden', false)
      .gte('date', new Date().toISOString().split('T')[0])
      .lte('date', sevenDaysFromNow)
      .order('date', { ascending: true })
      .limit(15),

    // New ideas since last summary
    supabase
      .from('email_ideas')
      .select('idea')
      .eq('user_id', userId)
      .eq('status', 'new')
      .gte('created_at', sinceDate)
      .limit(10),

    // New news since last summary
    supabase
      .from('saved_news')
      .select('headline')
      .eq('user_id', userId)
      .eq('status', 'new')
      .gte('created_at', sinceDate)
      .limit(10),
  ]);

  // ─── Cluster emails by thread ──────────────────────────────────────────
  const threads = clusterByThread(emailsResult.data || []);

  // ─── Build input data ──────────────────────────────────────────────────
  return {
    threads,
    actions: (actionsResult.data || []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      title: a.title as string,
      action_type: a.action_type as string | null,
      priority: a.priority as string,
      deadline: a.deadline as string | null,
      email_id: a.email_id as string | null,
    })),
    upcoming_dates: (datesResult.data || []).map((d: Record<string, unknown>) => ({
      title: d.title as string,
      date: d.date as string,
      date_type: d.date_type as string,
    })),
    new_ideas: (ideasResult.data || []).map((i: Record<string, unknown>) => i.idea as string),
    new_news: (newsResult.data || []).map((n: Record<string, unknown>) => n.headline as string),
  };
}

/**
 * Clusters emails by thread_id.
 * For each thread, picks the latest ai_brief and counts messages.
 */
function clusterByThread(
  emails: Array<{
    id: string;
    thread_id: string;
    subject: string | null;
    sender_name: string | null;
    sender_email: string;
    category: string | null;
    signal_strength: string | null;
    reply_worthiness: string | null;
    ai_brief: string | null;
    date: string;
  }>
): ThreadSummary[] {
  const threadMap = new Map<string, ThreadSummary>();

  for (const email of emails) {
    const existing = threadMap.get(email.thread_id);

    if (!existing) {
      threadMap.set(email.thread_id, {
        thread_id: email.thread_id,
        subject: email.subject,
        sender_name: email.sender_name,
        sender_email: email.sender_email,
        category: email.category,
        signal_strength: email.signal_strength,
        reply_worthiness: email.reply_worthiness,
        ai_brief: email.ai_brief,
        email_count: 1,
        email_ids: [email.id],
        latest_date: email.date,
      });
    } else {
      existing.email_count++;
      existing.email_ids.push(email.id);
      // Keep the latest email's brief (emails are sorted desc by date)
      if (!existing.ai_brief && email.ai_brief) {
        existing.ai_brief = email.ai_brief;
      }
      // Keep highest signal strength
      if (isHigherSignal(email.signal_strength, existing.signal_strength)) {
        existing.signal_strength = email.signal_strength;
        existing.reply_worthiness = email.reply_worthiness;
      }
    }
  }

  return Array.from(threadMap.values());
}

/**
 * Compares signal strengths. Returns true if `a` is higher than `b`.
 */
function isHigherSignal(a: string | null, b: string | null): boolean {
  const order: Record<string, number> = { high: 3, medium: 2, low: 1, noise: 0 };
  return (order[a || ''] ?? -1) > (order[b || ''] ?? -1);
}

/**
 * Builds a lightweight email_id → metadata index from thread data.
 * Stored in the summary so the UI can render clickable links without extra queries.
 *
 * For multi-email threads, each email_id maps to the thread's subject/sender/category
 * (the most recent info from the thread leader).
 */
function buildEmailIndex(threads: ThreadSummary[]): SummaryEmailIndex {
  const index: SummaryEmailIndex = {};

  for (const thread of threads) {
    for (const emailId of thread.email_ids) {
      index[emailId] = {
        subject: thread.subject,
        sender: thread.sender_name || thread.sender_email,
        category: thread.category,
      };
    }
  }

  return index;
}
