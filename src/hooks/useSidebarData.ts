/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useSidebarData Hook
 *
 * Fetches category counts and client list for the sidebar.
 * Updates periodically to keep counts fresh.
 *
 * @module hooks/useSidebarData
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useSidebarData');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Category counts for sidebar badges.
 */
export type CategoryCounts = Partial<Record<EmailCategory, number>>;

/**
 * Simplified client data for sidebar display.
 */
export interface SidebarClient {
  id: string;
  name: string;
  unreadCount?: number;
}

/**
 * Return type from useSidebarData hook.
 */
export interface UseSidebarDataReturn {
  categoryCounts: CategoryCounts;
  clients: SidebarClient[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch sidebar data including category counts and client list.
 *
 * @returns Category counts, client list, loading state, error, and refetch function
 */
export function useSidebarData(): UseSidebarDataReturn {
  const [categoryCounts, setCategoryCounts] = React.useState<CategoryCounts>({});
  const [clients, setClients] = React.useState<SidebarClient[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchData = React.useCallback(async () => {
    logger.debug('Fetching sidebar data');

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No user found');
        return;
      }

      // Fetch category counts in parallel with clients
      const [categoryResult, clientsResult] = await Promise.all([
        // Get emails grouped by category
        supabase
          .from('emails')
          .select('category')
          .eq('user_id', user.id)
          .eq('is_archived', false),

        // Get active clients with email counts
        supabase
          .from('clients')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('name', { ascending: true })
          .limit(10),
      ]);

      // Process category counts
      if (categoryResult.data) {
        const counts: CategoryCounts = {};
        for (const email of categoryResult.data) {
          if (email.category) {
            const cat = email.category as EmailCategory;
            counts[cat] = (counts[cat] || 0) + 1;
          }
        }
        setCategoryCounts(counts);
      }

      // Process clients
      if (clientsResult.data) {
        // Get unread counts for each client
        const clientIds = clientsResult.data.map(c => c.id);

        let clientsWithCounts: SidebarClient[] = clientsResult.data.map(c => ({
          id: c.id,
          name: c.name,
          unreadCount: 0,
        }));

        if (clientIds.length > 0) {
          const { data: emailCounts } = await supabase
            .from('emails')
            .select('client_id')
            .eq('user_id', user.id)
            .eq('is_read', false)
            .eq('is_archived', false)
            .in('client_id', clientIds);

          if (emailCounts) {
            const countMap: Record<string, number> = {};
            for (const email of emailCounts) {
              if (email.client_id) {
                countMap[email.client_id] = (countMap[email.client_id] || 0) + 1;
              }
            }
            clientsWithCounts = clientsWithCounts.map(c => ({
              ...c,
              unreadCount: countMap[c.id] || 0,
            }));
          }
        }

        setClients(clientsWithCounts);
      }

      logger.success('Sidebar data fetched');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch sidebar data', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Fetch on mount
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    categoryCounts,
    clients,
    isLoading,
    error,
    refetch: fetchData,
  };
}

export default useSidebarData;
