/**
 * useHubPriorities Hook
 *
 * Fetches and manages the Hub's priority items.
 * Provides the top 3 (or configured N) most important items for the user.
 *
 * ===============================================================================
 * USAGE
 * ===============================================================================
 *
 * ```tsx
 * import { useHubPriorities } from '@/hooks';
 *
 * function HubPage() {
 *   const { items, stats, isLoading, error, refetch } = useHubPriorities();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return (
 *     <div>
 *       {items.map(item => (
 *         <PriorityCard key={item.id} item={item} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @module hooks/useHubPriorities
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { HubPriorityItem, HubPriorityResult } from '@/services/hub';

// ===============================================================================
// TYPES
// ===============================================================================

/**
 * Options for the hook.
 */
export interface UseHubPrioritiesOptions {
  /** Number of items to fetch (default: 3) */
  limit?: number;
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval?: number;
  /** Skip initial fetch */
  skip?: boolean;
}

/**
 * Return type for the hook.
 */
export interface UseHubPrioritiesReturn {
  /** Priority items sorted by score */
  items: HubPriorityItem[];
  /** Statistics about the calculation */
  stats: HubPriorityResult['stats'] | null;
  /** When priorities were last updated */
  lastUpdated: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually refetch priorities */
  refetch: () => Promise<void>;
}

// ===============================================================================
// HOOK
// ===============================================================================

/**
 * Hook to fetch Hub priority items.
 *
 * @param options - Configuration options
 * @returns Priority items with loading/error states
 */
export function useHubPriorities(
  options: UseHubPrioritiesOptions = {}
): UseHubPrioritiesReturn {
  const { limit = 3, refreshInterval = 0, skip = false } = options;

  const [items, setItems] = useState<HubPriorityItem[]>([]);
  const [stats, setStats] = useState<HubPriorityResult['stats'] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch priorities from API.
   */
  const fetchPriorities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/hub/priorities?limit=${limit}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch priorities');
      }

      const result: HubPriorityResult = await response.json();

      setItems(result.items);
      setStats(result.stats);
      setLastUpdated(result.lastUpdated);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  /**
   * Manual refetch function.
   */
  const refetch = useCallback(async () => {
    await fetchPriorities();
  }, [fetchPriorities]);

  // Initial fetch
  useEffect(() => {
    if (!skip) {
      fetchPriorities();
    }
  }, [skip, fetchPriorities]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval > 0 && !skip) {
      const interval = setInterval(fetchPriorities, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, skip, fetchPriorities]);

  return {
    items,
    stats,
    lastUpdated,
    isLoading,
    error,
    refetch,
  };
}

export default useHubPriorities;
