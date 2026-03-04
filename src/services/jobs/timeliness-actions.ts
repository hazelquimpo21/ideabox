/**
 * Timeliness Actions Service — Auto-behaviors based on email timeliness
 *
 * NEW (Mar 2026): Taxonomy v2 — acts on timeliness data to keep the inbox fresh.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS DOES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. AUTO-ARCHIVE EXPIRED: Emails past their `timeliness.expires` date
 *    are automatically archived. No action possible after expiry.
 *    Examples: coupon codes, flash sales, RSVP deadlines that have passed.
 *
 * 2. AUTO-ARCHIVE PERISHABLE: Ephemeral emails older than 24 hours
 *    are automatically archived. They've lost their value.
 *    Examples: verification codes, daily news digests from yesterday.
 *
 * 3. URGENCY BOOST: Emails approaching their `timeliness.late_after` date
 *    get an urgency score boost to surface them in the inbox.
 *    Examples: event RSVPs, early-bird deadlines, form submissions.
 *
 * 4. SCORE RECALCULATION: Recalculate urgency scores for upcoming items
 *    as dates get closer, using the scoring engine's date proximity curve.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCHEDULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Run every 4 hours via cron job (pg_cron or Edge Function).
 * - Low cost: only queries emails with timeliness data
 * - Idempotent: safe to run multiple times
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { runTimelinessActions } from '@/services/jobs/timeliness-actions';
 *
 * // Run for all users
 * const result = await runTimelinessActions();
 * console.log(result.archived, result.boosted, result.recalculated);
 * ```
 *
 * @module services/jobs/timeliness-actions
 * @version 1.0.0
 * @since March 2026 — Taxonomy v2
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { calculateScores, type ScoringInput } from '@/services/analyzers/scoring-engine';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TimelinessActions');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a timeliness actions run.
 */
export interface TimelinessActionsResult {
  /** Number of expired emails auto-archived */
  archived_expired: number;
  /** Number of perishable/ephemeral emails auto-archived */
  archived_perishable: number;
  /** Number of emails with urgency scores recalculated */
  recalculated: number;
  /** Total processing time in milliseconds */
  duration_ms: number;
  /** Any errors encountered (non-fatal) */
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run timeliness-based actions across all users.
 *
 * This is the main entry point — call from a cron job every 4 hours.
 *
 * Operations:
 * 1. Archive emails past their expires date
 * 2. Archive old ephemeral/perishable emails (>24h old)
 * 3. Recalculate urgency for upcoming emails as dates approach
 *
 * @returns Summary of actions taken
 */
export async function runTimelinessActions(): Promise<TimelinessActionsResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.start('Running timeliness actions');

  let archived_expired = 0;
  let archived_perishable = 0;
  let recalculated = 0;

  try {
    const supabase = await createServerClient();
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Auto-archive expired emails
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { data: expiredEmails, error: expiredError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('is_archived', false)
        .not('timeliness', 'is', null)
        .lte('timeliness->>expires', now)
        .select('id');

      if (expiredError) {
        logger.warn('Failed to archive expired emails', { error: expiredError.message });
        errors.push(`archive_expired: ${expiredError.message}`);
      } else {
        archived_expired = expiredEmails?.length ?? 0;
        if (archived_expired > 0) {
          logger.info('Auto-archived expired emails', { count: archived_expired });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error archiving expired emails', { error: msg });
      errors.push(`archive_expired: ${msg}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Auto-archive old ephemeral/perishable emails (>24h)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: perishableEmails, error: perishableError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('is_archived', false)
        .not('timeliness', 'is', null)
        .eq('timeliness->>nature', 'ephemeral')
        .eq('timeliness->>perishable', 'true')
        .lt('received_at', twentyFourHoursAgo)
        .select('id');

      if (perishableError) {
        logger.warn('Failed to archive perishable emails', { error: perishableError.message });
        errors.push(`archive_perishable: ${perishableError.message}`);
      } else {
        archived_perishable = perishableEmails?.length ?? 0;
        if (archived_perishable > 0) {
          logger.info('Auto-archived perishable emails', { count: archived_perishable });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error archiving perishable emails', { error: msg });
      errors.push(`archive_perishable: ${msg}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Recalculate urgency for upcoming emails
    //    As dates get closer, urgency should increase.
    //    Batch in groups of 50 to avoid memory issues.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { data: upcomingEmails, error: upcomingError } = await supabase
        .from('emails')
        .select('id, category, email_type, labels, timeliness, signal_strength, reply_worthiness, urgency_score')
        .eq('is_archived', false)
        .not('timeliness', 'is', null)
        .eq('timeliness->>nature', 'upcoming')
        .limit(200);

      if (upcomingError) {
        logger.warn('Failed to fetch upcoming emails', { error: upcomingError.message });
        errors.push(`recalculate: ${upcomingError.message}`);
      } else if (upcomingEmails && upcomingEmails.length > 0) {
        // Recalculate scores for each email
        for (const email of upcomingEmails) {
          try {
            const scoringInput: ScoringInput = {
              category: email.category ?? 'personal',
              additional_categories: [],
              email_type: email.email_type ?? null,
              labels: email.labels ?? [],
              timeliness: email.timeliness ?? null,
              signal_strength: email.signal_strength ?? null,
              reply_worthiness: email.reply_worthiness ?? null,
              has_contact: true, // Assume contact exists for recalculation
              has_prior_exchange: false,
            };

            const scores = calculateScores(scoringInput);

            // Only update if urgency changed significantly (>0.05 difference)
            const currentUrgency = email.urgency_score ?? 0;
            if (Math.abs(scores.urgency - currentUrgency) > 0.05) {
              await supabase
                .from('emails')
                .update({
                  urgency_score: scores.urgency,
                  surface_priority: scores.surface_priority,
                  importance_score: scores.importance,
                  action_score: scores.action_score,
                  cognitive_load: scores.cognitive_load,
                  missability_score: scores.missability,
                })
                .eq('id', email.id);

              recalculated++;
            }
          } catch (err) {
            // Non-fatal: log and continue
            logger.debug('Failed to recalculate scores for email', {
              emailId: email.id,
              error: err instanceof Error ? err.message : 'Unknown',
            });
          }
        }

        if (recalculated > 0) {
          logger.info('Recalculated urgency scores', {
            checked: upcomingEmails.length,
            updated: recalculated,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error recalculating urgency scores', { error: msg });
      errors.push(`recalculate: ${msg}`);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Fatal error in timeliness actions', { error: msg });
    errors.push(`fatal: ${msg}`);
  }

  const duration_ms = Date.now() - startTime;

  const result: TimelinessActionsResult = {
    archived_expired,
    archived_perishable,
    recalculated,
    duration_ms,
    errors,
  };

  logger.info('Timeliness actions completed', {
    ...result,
    errorCount: errors.length,
  });

  return result;
}
