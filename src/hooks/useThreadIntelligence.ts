/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useThreadIntelligence Hook
 *
 * Aggregates analyzer outputs across an email thread.
 * Groups emails by thread_id and computes:
 * - Total email count in thread
 * - Action count across the thread
 * - Latest deadline from any email
 * - Signal trend (how signal_strength changes over time)
 * - Event count
 *
 * Performance: Caches per thread_id to avoid re-fetching.
 * Only fetches when explicitly given a thread_id with > 1 email.
 *
 * @module hooks/useThreadIntelligence
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useThreadIntelligence');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Aggregated intelligence for a thread */
export interface ThreadIntelligence {
  /** Number of emails in this thread */
  emailCount: number;
  /** Total actions across all emails in the thread */
  actionCount: number;
  /** The nearest future deadline from any email in the thread */
  latestDeadline: string | null;
  /** Signal strength trend: improving, declining, or stable */
  signalTrend: 'improving' | 'declining' | 'stable' | null;
  /** Number of events detected across the thread */
  eventCount: number;
  /** Whether the thread intelligence has loaded */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD CACHE
// ═══════════════════════════════════════════════════════════════════════════════

/** Simple in-memory cache for thread intelligence to avoid re-fetching */
const threadCache = new Map<string, ThreadIntelligence>();

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL STRENGTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Numeric values for signal strength comparison */
const SIGNAL_VALUES: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  noise: 0,
};

/**
 * Determines the signal trend from a sequence of signal strengths.
 * Compares the first half average to the second half average.
 */
function computeSignalTrend(signals: string[]): 'improving' | 'declining' | 'stable' | null {
  if (signals.length < 2) return null;

  const values = signals.map((s) => SIGNAL_VALUES[s] ?? 1);
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(secondHalf) - avg(firstHalf);

  if (diff > 0.5) return 'improving';
  if (diff < -0.5) return 'declining';
  return 'stable';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch and aggregate thread intelligence.
 *
 * @param threadId - The Gmail thread_id. Pass null to skip fetching.
 * @returns Aggregated thread intelligence
 *
 * @example
 * ```tsx
 * const thread = useThreadIntelligence(email.thread_id);
 * if (thread.emailCount > 1) {
 *   // Show thread badge
 * }
 * ```
 */
export function useThreadIntelligence(threadId: string | null): ThreadIntelligence {
  const [intelligence, setIntelligence] = React.useState<ThreadIntelligence>({
    emailCount: 0,
    actionCount: 0,
    latestDeadline: null,
    signalTrend: null,
    eventCount: 0,
    isLoading: false,
  });

  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (!threadId) return;

    // Check cache first
    const cached = threadCache.get(threadId);
    if (cached) {
      setIntelligence(cached);
      return;
    }

    let cancelled = false;

    async function fetchThreadData() {
      setIntelligence((prev) => ({ ...prev, isLoading: true }));
      logger.debug('Fetching thread intelligence', { threadId });

      try {
        // Fetch all emails in the thread, ordered by date
        const { data: emails, error } = await supabase
          .from('emails')
          .select('id, date, signal_strength, labels, urgency_score')
          .eq('thread_id', threadId!)
          .order('date', { ascending: true });

        if (error || !emails || cancelled) return;

        // Only compute if thread has multiple emails
        if (emails.length <= 1) {
          const result: ThreadIntelligence = {
            emailCount: emails.length,
            actionCount: 0,
            latestDeadline: null,
            signalTrend: null,
            eventCount: 0,
            isLoading: false,
          };
          threadCache.set(threadId!, result);
          if (!cancelled) setIntelligence(result);
          return;
        }

        // Fetch actions for emails in this thread
        const emailIds = emails.map((e) => e.id);
        const { data: actions } = await supabase
          .from('actions')
          .select('id, deadline, status')
          .in('email_id', emailIds);

        if (cancelled) return;

        // Aggregate
        const activeActions = (actions || []).filter((a) => a.status !== 'completed' && a.status !== 'cancelled');
        const deadlines = activeActions
          .map((a) => a.deadline)
          .filter(Boolean)
          .filter((d) => new Date(d!) > new Date())
          .sort() as string[];

        const signals = emails
          .map((e) => e.signal_strength as string)
          .filter(Boolean);

        const eventCount = emails.filter((e) => {
          const labels = e.labels as string[] | null;
          return labels && Array.isArray(labels) && labels.includes('has_event');
        }).length;

        const result: ThreadIntelligence = {
          emailCount: emails.length,
          actionCount: activeActions.length,
          latestDeadline: deadlines[0] || null,
          signalTrend: computeSignalTrend(signals),
          eventCount,
          isLoading: false,
        };

        threadCache.set(threadId!, result);
        if (!cancelled) setIntelligence(result);

        logger.debug('Thread intelligence computed', { threadId, ...result });
      } catch (err) {
        logger.error('Failed to fetch thread intelligence', {
          threadId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
        if (!cancelled) setIntelligence((prev) => ({ ...prev, isLoading: false }));
      }
    }

    fetchThreadData();
    return () => { cancelled = true; };
  }, [threadId, supabase]);

  return intelligence;
}

export default useThreadIntelligence;
