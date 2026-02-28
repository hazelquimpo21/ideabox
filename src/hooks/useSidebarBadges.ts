/**
 * useSidebarBadges — Fetches lightweight counts for sidebar action badges.
 *
 * Queries:
 * 1. Must-reply count: emails where reply_worthiness = 'must_reply' AND is_read = false
 * 2. Today's deadlines count: actions where deadline is today and status != 'completed'
 *
 * Refreshes every 5 minutes. Returns { mustReplyCount, todayDeadlineCount, isLoading }.
 *
 * @module hooks/useSidebarBadges
 * @since February 2026 — Phase 1: Sidebar actionable badges
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useSidebarBadges');

/** Refresh interval: 5 minutes in milliseconds */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Return type for the useSidebarBadges hook */
export interface SidebarBadges {
  /** Count of unread emails that must be replied to */
  mustReplyCount: number;
  /** Count of action items with deadlines today that aren't completed */
  todayDeadlineCount: number;
  /** Whether data is currently being fetched */
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches lightweight badge counts for the sidebar navigation items.
 * Auto-refreshes every 5 minutes and cleans up on unmount.
 */
export function useSidebarBadges(): SidebarBadges {
  const [mustReplyCount, setMustReplyCount] = React.useState(0);
  const [todayDeadlineCount, setTodayDeadlineCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchBadges = React.useCallback(async () => {
    logger.start('Fetching sidebar badge counts');

    try {
      const supabase = createClient();

      // Today's date range for deadline query
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Run both queries in parallel
      const [replyResult, deadlineResult] = await Promise.all([
        // Query 1: Must-reply unread emails
        supabase
          .from('emails')
          .select('id', { count: 'exact', head: true })
          .eq('reply_worthiness', 'must_reply')
          .eq('is_read', false)
          .eq('is_archived', false),

        // Query 2: Today's incomplete deadlines
        supabase
          .from('actions')
          .select('id', { count: 'exact', head: true })
          .gte('deadline', todayStart.toISOString())
          .lte('deadline', todayEnd.toISOString())
          .neq('status', 'completed'),
      ]);

      const replyCount = replyResult.count ?? 0;
      const deadlineCount = deadlineResult.count ?? 0;

      setMustReplyCount(replyCount);
      setTodayDeadlineCount(deadlineCount);

      logger.success('Sidebar badge counts fetched', {
        mustReplyCount: replyCount,
        todayDeadlineCount: deadlineCount,
      });
    } catch (error) {
      logger.error('Failed to fetch sidebar badge counts', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    logger.debug('useSidebarBadges mounted');
    fetchBadges();

    const interval = setInterval(fetchBadges, REFRESH_INTERVAL_MS);

    return () => {
      logger.debug('useSidebarBadges unmounting, clearing interval');
      clearInterval(interval);
    };
  }, [fetchBadges]);

  return { mustReplyCount, todayDeadlineCount, isLoading };
}
