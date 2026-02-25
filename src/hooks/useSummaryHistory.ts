/**
 * useSummaryHistory Hook
 *
 * Fetches paginated email summary history for the summary history page.
 * Supports page-based pagination, date filtering, and auto-refresh.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * import { useSummaryHistory } from '@/hooks';
 *
 * function SummaryHistoryPage() {
 *   const {
 *     items,
 *     total,
 *     page,
 *     hasMore,
 *     isLoading,
 *     error,
 *     goToPage,
 *     nextPage,
 *     prevPage,
 *   } = useSummaryHistory({ limit: 10 });
 *
 *   if (isLoading) return <Skeleton />;
 *   if (items.length === 0) return <EmptyState />;
 *
 *   return (
 *     <>
 *       {items.map(summary => <SummaryCard key={summary.id} summary={summary} />)}
 *       {hasMore && <Button onClick={nextPage}>Load more</Button>}
 *     </>
 *   );
 * }
 * ```
 *
 * @module hooks/useSummaryHistory
 * @since February 2026
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/lib/utils/logger';
import type { EmailSummary } from '@/services/summary';

const logger = createLogger('useSummaryHistory');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseSummaryHistoryOptions {
  /** Summaries per page (default: 10, max: 30) */
  limit?: number;
  /** Filter: only summaries after this ISO date */
  from?: string;
  /** Filter: only summaries before this ISO date */
  to?: string;
  /** Skip initial fetch (e.g. when tab is not active) */
  skip?: boolean;
}

export interface UseSummaryHistoryReturn {
  /** Current page of summaries */
  items: EmailSummary[];
  /** Total number of summaries across all pages */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Whether more pages exist after the current page */
  hasMore: boolean;
  /** True during fetch */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Navigate to a specific page */
  goToPage: (page: number) => void;
  /** Go to the next page (no-op if on last page) */
  nextPage: () => void;
  /** Go to the previous page (no-op if on first page) */
  prevPage: () => void;
  /** Re-fetch the current page */
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useSummaryHistory(
  options: UseSummaryHistoryOptions = {}
): UseSummaryHistoryReturn {
  const { limit = 10, from, to, skip = false } = options;

  const [items, setItems] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetches a specific page of summaries from the API.
   */
  const fetchPage = useCallback(async (targetPage: number) => {
    try {
      setIsLoading(true);
      setError(null);

      logger.debug('Fetching summary history page', { page: targetPage, limit, from, to });

      // Build query string
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
      });
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const response = await fetch(`/api/summaries/history?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch summary history');
      }

      const data = await response.json();

      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || targetPage);
      setHasMore(data.hasMore || false);

      logger.debug('Summary history fetched', {
        returned: data.items?.length ?? 0,
        total: data.total,
        page: data.page,
        hasMore: data.hasMore,
      });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Unknown error');
      logger.error('Summary history fetch failed', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [limit, from, to]);

  /**
   * Navigate to a specific page.
   */
  const goToPage = useCallback((targetPage: number) => {
    const safePage = Math.max(1, targetPage);
    setPage(safePage);
    fetchPage(safePage);
  }, [fetchPage]);

  /**
   * Go to the next page.
   */
  const nextPage = useCallback(() => {
    if (hasMore) {
      goToPage(page + 1);
    }
  }, [hasMore, page, goToPage]);

  /**
   * Go to the previous page.
   */
  const prevPage = useCallback(() => {
    if (page > 1) {
      goToPage(page - 1);
    }
  }, [page, goToPage]);

  /**
   * Re-fetch the current page.
   */
  const refetch = useCallback(async () => {
    await fetchPage(page);
  }, [fetchPage, page]);

  // ─── Initial fetch ───────────────────────────────────────────────────
  useEffect(() => {
    if (!skip) {
      fetchPage(1);
    }
  }, [skip, fetchPage]);

  return {
    items,
    total,
    page,
    hasMore,
    isLoading,
    error,
    goToPage,
    nextPage,
    prevPage,
    refetch,
  };
}

export default useSummaryHistory;
