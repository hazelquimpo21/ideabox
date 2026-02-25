/**
 * useSummary Hook
 *
 * Fetches the latest email summary and auto-regenerates when stale.
 * Provides loading, generating, and error states for the UI.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { useSummary } from '@/hooks';
 *
 * function SummarySection() {
 *   const { summary, isLoading, isGenerating, isStale, regenerate } = useSummary();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (isGenerating) return <p>Summarizing your latest emails...</p>;
 *   if (!summary) return <p>No summary yet</p>;
 *
 *   return <EmailSummaryCard summary={summary} onRefresh={regenerate} />;
 * }
 * ```
 *
 * @module hooks/useSummary
 * @since February 2026
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { EmailSummary } from '@/services/summary';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseSummaryOptions {
  /** Poll interval for staleness check in ms (default: 5 min) */
  refreshInterval?: number;
  /** Auto-generate when stale (default: true) */
  autoGenerate?: boolean;
  /** Skip initial fetch */
  skip?: boolean;
}

export interface UseSummaryReturn {
  /** The current summary, or null if none exists */
  summary: EmailSummary | null;
  /** True during initial fetch */
  isLoading: boolean;
  /** True while AI is synthesizing a new summary */
  isGenerating: boolean;
  /** Whether the current summary is stale */
  isStale: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually trigger regeneration */
  regenerate: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useSummary(options: UseSummaryOptions = {}): UseSummaryReturn {
  const {
    refreshInterval = 5 * 60 * 1000, // 5 minutes
    autoGenerate = true,
    skip = false,
  } = options;

  const [summary, setSummary] = useState<EmailSummary | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track whether we've already triggered a generation this session
  const hasTriggeredGeneration = useRef(false);

  /**
   * Fetch the latest summary + staleness info.
   */
  const fetchLatest = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/summaries/latest');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch summary');
      }

      const data = await response.json();
      setSummary(data.summary);
      setIsStale(data.is_stale);

      return data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return null;
    }
  }, []);

  /**
   * Generate a new summary.
   */
  const generate = useCallback(async (force = false) => {
    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch('/api/summaries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);
      setIsStale(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Manual regenerate (force).
   */
  const regenerate = useCallback(async () => {
    await generate(true);
  }, [generate]);

  // ─── Initial fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (skip) return;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const result = await fetchLatest();
      if (cancelled) return;
      setIsLoading(false);

      // Auto-generate if stale and we haven't already triggered
      if (result?.is_stale && autoGenerate && !hasTriggeredGeneration.current) {
        hasTriggeredGeneration.current = true;
        generate();
      }
    })();

    return () => { cancelled = true; };
  }, [skip, fetchLatest, autoGenerate, generate]);

  // ─── Polling for staleness ─────────────────────────────────────────────
  useEffect(() => {
    if (skip || refreshInterval <= 0) return;

    const interval = setInterval(async () => {
      const result = await fetchLatest();

      // Auto-generate if it became stale since last check
      if (result?.is_stale && autoGenerate && !isGenerating) {
        hasTriggeredGeneration.current = true;
        generate();
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [skip, refreshInterval, autoGenerate, fetchLatest, generate, isGenerating]);

  return {
    summary,
    isLoading,
    isGenerating,
    isStale,
    error,
    regenerate,
  };
}

export default useSummary;
