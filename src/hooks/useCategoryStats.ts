/**
 * 🔮 useCategoryStats Hook
 *
 * React hook for fetching live category statistics from the emails table.
 * Single source of truth for category counts used by both Discover and Inbox.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 * This hook solves the data synchronization issue where Discover showed snapshot
 * data from sync time, while Inbox queried live data. Now both use this hook
 * to ensure counts always match.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // In Discover page
 * const { stats, isLoading, refetch } = useCategoryStats();
 *
 * // In Inbox filter bar
 * const { stats } = useCategoryStats();
 *
 * // Access counts
 * stats.newsletters_creator.count      // Total emails
 * stats.newsletters_creator.unreadCount // Unread emails
 * ```
 *
 * @module hooks/useCategoryStats
 * @since Jan 2026 - Discover-first architecture refactor
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logDiscover } from '@/lib/utils/logger';
import {
  type EmailCategory,
  EMAIL_CATEGORIES,
  CATEGORY_DISPLAY,
} from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Logger instance for this hook */
const logger = createLogger('useCategoryStats');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Statistics for a single category.
 */
export interface CategoryStat {
  /** The category identifier */
  category: EmailCategory;
  /** Display label (e.g., "Newsletters - General") */
  label: string;
  /** Display icon (emoji) */
  icon: string;
  /** Total email count in this category */
  count: number;
  /** Unread email count */
  unreadCount: number;
  /** Starred email count */
  starredCount: number;
}

/**
 * Complete category stats keyed by category name.
 */
export type CategoryStatsMap = Record<EmailCategory, CategoryStat>;

/**
 * Return value from the useCategoryStats hook.
 */
export interface UseCategoryStatsReturn {
  /** Stats for each category */
  stats: CategoryStatsMap;
  /** Stats as an array (for iteration) */
  statsArray: CategoryStat[];
  /** Total email count across all categories */
  totalCount: number;
  /** Total unread count across all categories */
  totalUnread: number;
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch stats */
  refetch: () => Promise<void>;
  /** Last fetched timestamp */
  lastUpdated: Date | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates the initial empty stats map with all categories.
 */
function createEmptyStats(): CategoryStatsMap {
  const stats = {} as CategoryStatsMap;
  for (const category of EMAIL_CATEGORIES) {
    const display = CATEGORY_DISPLAY[category];
    stats[category] = {
      category,
      label: display?.label || category,
      icon: display?.icon || '📧',
      count: 0,
      unreadCount: 0,
      starredCount: 0,
    };
  }
  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching live category statistics from Supabase.
 *
 * Queries the emails table directly to get accurate counts per category.
 * This ensures Discover cards and Inbox filters always show matching numbers.
 *
 * @returns Category statistics, loading state, and control functions
 *
 * @example
 * ```tsx
 * function DiscoverPage() {
 *   const { stats, statsArray, isLoading, totalCount } = useCategoryStats();
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *
 *   return (
 *     <div>
 *       <h1>You have {totalCount} emails</h1>
 *       {statsArray.map(stat => (
 *         <CategoryCard
 *           key={stat.category}
 *           category={stat.category}
 *           count={stat.count}
 *           unreadCount={stat.unreadCount}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCategoryStats(): UseCategoryStatsReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [stats, setStats] = React.useState<CategoryStatsMap>(createEmptyStats);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  // Memoize the Supabase client
  const supabase = React.useMemo(() => createClient(), []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Stats
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fetches category statistics from Supabase.
   *
   * Queries emails table grouped by category to get counts.
   * Only includes non-archived emails.
   */
  const fetchStats = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching category stats');
    const startTime = performance.now();

    try {
      // Fetch all non-archived emails with their category, is_read, and is_starred
      // We do this in a single query and aggregate client-side for simplicity
      // For very large datasets, consider a server-side aggregation
      const { data: emails, error: queryError } = await supabase
        .from('emails')
        .select('category, is_read, is_starred')
        .eq('is_archived', false);

      if (queryError) {
        throw new Error(queryError.message);
      }

      // Aggregate counts by category
      const newStats = createEmptyStats();
      let totalCount = 0;
      let totalUnread = 0;

      for (const email of emails || []) {
        const rawCategory = email.category as string | null;

        // Every email must have a category — normalize any missing/invalid ones
        const category: EmailCategory = (rawCategory && rawCategory in newStats)
          ? rawCategory as EmailCategory
          : 'personal_friends_family';

        newStats[category].count++;
        totalCount++;

        if (!email.is_read) {
          newStats[category].unreadCount++;
          totalUnread++;
        }

        if (email.is_starred) {
          newStats[category].starredCount++;
        }
      }

      setStats(newStats);
      setLastUpdated(new Date());

      const durationMs = Math.round(performance.now() - startTime);

      logDiscover.statsFetched({
        totalCount,
        totalUnread,
        categoriesWithEmails: Object.values(newStats).filter(s => s.count > 0).length,
        durationMs,
      });

      logger.success('Category stats fetched', {
        totalCount,
        totalUnread,
        durationMs,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch category stats', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived Values
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Stats as an array for easy iteration.
   * Sorted by count (highest first) for display priority.
   */
  const statsArray = React.useMemo(() => {
    return Object.values(stats).sort((a, b) => b.count - a.count);
  }, [stats]);

  /**
   * Total count across all categories.
   */
  const totalCount = React.useMemo(() => {
    return Object.values(stats).reduce((sum, s) => sum + s.count, 0);
  }, [stats]);

  /**
   * Total unread count across all categories.
   */
  const totalUnread = React.useMemo(() => {
    return Object.values(stats).reduce((sum, s) => sum + s.unreadCount, 0);
  }, [stats]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Fetch stats on mount
  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    stats,
    statsArray,
    totalCount,
    totalUnread,
    isLoading,
    error,
    refetch: fetchStats,
    lastUpdated,
  };
}

export default useCategoryStats;
