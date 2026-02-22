/**
 * useReviewQueue Hook
 *
 * Fetches the daily review queue — emails worth scanning today.
 * Supports marking emails as reviewed and auto-refresh.
 *
 * NEW (Feb 2026): Part of the two-tier task system.
 * - Tier 1: Review Queue (this hook) — scan-worthy emails
 * - Tier 2: Real Tasks (useActions) — concrete action items
 *
 * @module hooks/useReviewQueue
 * @since February 2026
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useReviewQueue');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single email in the review queue.
 */
export interface ReviewQueueItem {
  id: string;
  subject: string | null;
  sender_email: string;
  sender_name: string | null;
  date: string;
  snippet: string | null;
  gist: string | null;
  category: string | null;
  signal_strength: string | null;
  reply_worthiness: string | null;
  quick_action: string | null;
  labels: string[] | null;
  is_read: boolean;
  reviewed_at: string | null;
  summary: string | null;
}

/**
 * Statistics about the review queue.
 */
export interface ReviewQueueStats {
  totalInQueue: number;
  returnedCount: number;
  highSignal: number;
  mediumSignal: number;
  needsReply: number;
  unread: number;
}

/**
 * Options for the hook.
 */
export interface UseReviewQueueOptions {
  /** Number of items to fetch (default: 8) */
  limit?: number;
  /** Auto-refresh interval in milliseconds (0 = disabled, default: 0) */
  refreshInterval?: number;
  /** Skip initial fetch */
  skip?: boolean;
}

/**
 * Return type for the hook.
 */
export interface UseReviewQueueReturn {
  /** Review queue items sorted by date (most recent first) */
  items: ReviewQueueItem[];
  /** Statistics about the queue */
  stats: ReviewQueueStats | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually refetch the queue */
  refetch: () => Promise<void>;
  /** Mark an email as reviewed */
  markReviewed: (emailId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch and manage the daily review queue.
 *
 * @param options - Configuration options
 * @returns Review queue items with loading/error states and actions
 *
 * @example
 * ```tsx
 * const { items, stats, isLoading, markReviewed } = useReviewQueue({ limit: 8 });
 *
 * return items.map(email => (
 *   <ReviewItem
 *     key={email.id}
 *     email={email}
 *     onReviewed={() => markReviewed(email.id)}
 *   />
 * ));
 * ```
 */
export function useReviewQueue(
  options: UseReviewQueueOptions = {}
): UseReviewQueueReturn {
  const { limit = 8, refreshInterval = 0, skip = false } = options;

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [stats, setStats] = useState<ReviewQueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch review queue from API.
   */
  const fetchQueue = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      logger.debug('Fetching review queue', { limit });

      const response = await fetch(`/api/emails/review-queue?limit=${limit}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch review queue');
      }

      const result = await response.json();

      setItems(result.items || []);
      setStats(result.stats || null);

      logger.debug('Review queue fetched', {
        itemCount: result.items?.length ?? 0,
        totalInQueue: result.stats?.totalInQueue ?? 0,
      });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Unknown error');
      logger.error('Review queue fetch failed', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  /**
   * Mark an email as reviewed and remove it from the queue.
   * Optimistically removes the item before the API call.
   */
  const markReviewed = useCallback(async (emailId: string) => {
    logger.info('Marking email as reviewed', { emailId: emailId.substring(0, 8) });

    // Optimistic removal
    setItems(prev => prev.filter(item => item.id !== emailId));
    if (stats) {
      setStats(prev => prev ? { ...prev, totalInQueue: prev.totalInQueue - 1 } : prev);
    }

    try {
      const response = await fetch('/api/emails/review-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId }),
      });

      if (!response.ok) {
        // Revert on failure
        logger.warn('Failed to mark as reviewed, reverting', { emailId: emailId.substring(0, 8) });
        await fetchQueue();
      } else {
        logger.success('Email marked as reviewed', { emailId: emailId.substring(0, 8) });
      }
    } catch (err) {
      logger.error('Mark reviewed failed', {
        emailId: emailId.substring(0, 8),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      // Revert on error
      await fetchQueue();
    }
  }, [stats, fetchQueue]);

  // Initial fetch
  useEffect(() => {
    if (!skip) {
      fetchQueue();
    }
  }, [skip, fetchQueue]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval > 0 && !skip) {
      const interval = setInterval(fetchQueue, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, skip, fetchQueue]);

  return {
    items,
    stats,
    isLoading,
    error,
    refetch: fetchQueue,
    markReviewed,
  };
}

export default useReviewQueue;
