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
 * Individual event data for sidebar preview cards.
 * Minimal data needed for compact display.
 */
export interface UpcomingEvent {
  /** Unique event identifier */
  id: string;
  /** Event title */
  title: string;
  /** Event date (YYYY-MM-DD format) */
  date: string;
  /** Event time (HH:MM format, optional) */
  time?: string;
  /** Days until event (0 = today, 1 = tomorrow, etc.) */
  daysUntil: number;
}

/**
 * Upcoming events summary for sidebar display.
 */
export interface UpcomingEventsSummary {
  /** Total count of upcoming events */
  count: number;
  /** Next upcoming event date (ISO string) */
  nextEventDate?: string;
  /** Days until next event */
  daysUntilNext?: number;
  /** Preview events for sidebar cards (max 3) */
  previewEvents?: UpcomingEvent[];
}

/**
 * Return type from useSidebarData hook.
 */
export interface UseSidebarDataReturn {
  categoryCounts: CategoryCounts;
  clients: SidebarClient[];
  upcomingEvents: UpcomingEventsSummary;
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
  const [upcomingEvents, setUpcomingEvents] = React.useState<UpcomingEventsSummary>({ count: 0 });
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

      // Get today's date for upcoming event filtering
      const today = new Date().toISOString().split('T')[0];

      // Fetch category counts, clients, and upcoming events in parallel
      const [categoryResult, clientsResult, upcomingEventsResult] = await Promise.all([
        // Get emails grouped by category
        supabase
          .from('emails')
          .select('category')
          .eq('user_id', user.id)
          .eq('is_archived', false),

        // Get client contacts (clients table deprecated, use contacts with is_client)
        supabase
          .from('contacts')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_client', true)
          .order('name', { ascending: true })
          .limit(10),

        // Get upcoming events from extracted_dates table
        // Fetch id, title, date, event_time for preview cards
        supabase
          .from('extracted_dates')
          .select('id, title, date, event_time')
          .eq('user_id', user.id)
          .eq('date_type', 'event')
          .eq('is_hidden', false)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(20),
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

      // Process client contacts
      if (clientsResult.data) {
        // Get unread counts for each client contact
        const contactIds = clientsResult.data.map(c => c.id);

        let clientsWithCounts: SidebarClient[] = clientsResult.data.map(c => ({
          id: c.id,
          name: c.name,
          unreadCount: 0,
        }));

        if (contactIds.length > 0) {
          const { data: emailCounts } = await supabase
            .from('emails')
            .select('contact_id')
            .eq('user_id', user.id)
            .eq('is_read', false)
            .eq('is_archived', false)
            .in('contact_id', contactIds);

          if (emailCounts) {
            const countMap: Record<string, number> = {};
            for (const email of emailCounts) {
              if (email.contact_id) {
                countMap[email.contact_id] = (countMap[email.contact_id] || 0) + 1;
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

      // Process upcoming events
      if (upcomingEventsResult.data && upcomingEventsResult.data.length > 0) {
        const nextEvent = upcomingEventsResult.data[0];
        const nextEventDate = nextEvent.date;

        // Calculate days until next event
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        const calculateDaysUntil = (dateStr: string): number => {
          const eventDate = new Date(dateStr + 'T00:00:00');
          const diffMs = eventDate.getTime() - todayDate.getTime();
          return Math.round(diffMs / (1000 * 60 * 60 * 24));
        };

        const daysUntilNext = calculateDaysUntil(nextEventDate);

        // Build preview events for sidebar cards (first 3)
        const previewEvents: UpcomingEvent[] = upcomingEventsResult.data
          .slice(0, 3)
          .map((event) => ({
            id: event.id,
            title: event.title || 'Untitled Event',
            date: event.date,
            time: event.event_time || undefined,
            daysUntil: calculateDaysUntil(event.date),
          }));

        setUpcomingEvents({
          count: upcomingEventsResult.data.length,
          nextEventDate,
          daysUntilNext,
          previewEvents,
        });

        logger.debug('Upcoming events processed', {
          count: upcomingEventsResult.data.length,
          nextEventDate,
          daysUntilNext,
          previewCount: previewEvents.length,
        });
      } else {
        setUpcomingEvents({ count: 0, previewEvents: [] });
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
    upcomingEvents,
    isLoading,
    error,
    refetch: fetchData,
  };
}

export default useSidebarData;
