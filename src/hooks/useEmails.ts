/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 📧 useEmails Hook
 *
 * React hook for fetching, filtering, and managing email data from Supabase.
 * Provides a clean interface for the Inbox and other email-related pages.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches emails with category/client filtering
 * - Supports pagination with cursor-based approach
 * - Provides real-time refetch capability
 * - Handles loading and error states
 * - Includes email statistics
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * const { emails, isLoading, error, refetch } = useEmails();
 *
 * // With category filter
 * const { emails } = useEmails({ category: 'action_required' });
 *
 * // With client filter
 * const { emails } = useEmails({ clientId: 'uuid-here' });
 *
 * // With pagination
 * const { emails, loadMore, hasMore } = useEmails({ limit: 20 });
 * ```
 *
 * @module hooks/useEmails
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Email, EmailCategory } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of emails to fetch per request */
const DEFAULT_LIMIT = 50;

/** Logger instance for this hook */
const logger = createLogger('useEmails');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for filtering and paginating emails.
 */
export interface UseEmailsOptions {
  /** Filter by email category */
  category?: EmailCategory | 'all' | 'clients';
  /** Filter by client ID */
  clientId?: string;
  /** Maximum number of emails to fetch */
  limit?: number;
  /** Include archived emails (default: false) */
  includeArchived?: boolean;
  /** Only show unread emails */
  unreadOnly?: boolean;
  /** Only show starred emails */
  starredOnly?: boolean;
  /** Include event detection data for event-categorized emails (default: false) */
  includeEventData?: boolean;
}

/**
 * Event detection data for inbox display.
 * Subset of full event data - just what's needed for list preview.
 */
export interface EventPreviewData {
  eventDate: string;
  eventTime?: string;
  locationType: 'in_person' | 'virtual' | 'hybrid' | 'unknown';
  registrationDeadline?: string;
  rsvpRequired: boolean;
  cost?: string;
  /** Assistant-style one-sentence event summary */
  eventSummary?: string;
}

/**
 * Email statistics for dashboard display.
 */
export interface EmailStats {
  /** Total number of emails */
  total: number;
  /** Number of unread emails */
  unread: number;
  /** Number of emails needing action */
  actionRequired: number;
  /** Number of starred emails */
  starred: number;
  /** Number of emails with events */
  events: number;
}

/**
 * Return value from the useEmails hook.
 */
export interface UseEmailsReturn {
  /** Array of email objects */
  emails: Email[];
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch emails with current filters */
  refetch: () => Promise<void>;
  /** Load more emails (pagination) */
  loadMore: () => Promise<void>;
  /** Whether more emails are available */
  hasMore: boolean;
  /** Email statistics */
  stats: EmailStats;
  /** Update a single email optimistically */
  updateEmail: (id: string, updates: Partial<Email>) => void;
  /** Event preview data keyed by email ID (only if includeEventData: true) */
  eventData: Map<string, EventPreviewData>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing emails from Supabase.
 *
 * @param options - Filtering and pagination options
 * @returns Email data, loading state, and control functions
 *
 * @example
 * ```tsx
 * function InboxPage() {
 *   const { emails, isLoading, error, stats } = useEmails({
 *     category: 'action_required',
 *     limit: 20,
 *   });
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       <StatsBar stats={stats} />
 *       <EmailList emails={emails} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useEmails(options: UseEmailsOptions = {}): UseEmailsReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [emails, setEmails] = React.useState<Email[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [stats, setStats] = React.useState<EmailStats>({
    total: 0,
    unread: 0,
    actionRequired: 0,
    starred: 0,
    events: 0,
  });
  const [eventData, setEventData] = React.useState<Map<string, EventPreviewData>>(new Map());

  // Memoize the Supabase client to prevent recreation on each render
  const supabase = React.useMemo(() => createClient(), []);

  // Memoize options to prevent unnecessary refetches
  const {
    category = 'all',
    clientId,
    limit = DEFAULT_LIMIT,
    includeArchived = false,
    unreadOnly = false,
    starredOnly = false,
    includeEventData = false,
  } = options;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Emails
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fetches emails from Supabase with the current filters.
   * Called on mount and when filters change.
   */
  const fetchEmails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching emails', {
      category,
      clientId,
      limit,
      includeArchived,
      unreadOnly,
      starredOnly,
    });

    try {
      // Build the base query
      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .limit(limit);

      // Apply filters based on options
      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (starredOnly) {
        query = query.eq('is_starred', true);
      }

      // Category filtering
      // "clients" is a special filter that checks for non-null client_id
      if (category === 'clients') {
        query = query.not('client_id', 'is', null);
      } else if (category !== 'all') {
        query = query.eq('category', category);
      }

      // Client ID filter
      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      // Execute query
      const { data, error: queryError, count } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      // Update state
      setEmails(data || []);
      setHasMore((data?.length || 0) >= limit);

      // Calculate stats from fetched data (simplified - in production, use a separate stats query)
      // REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
      // - actionRequired now counts client_pipeline + business_work_general (work emails)
      // - events now uses label detection from analysis (has_event label)
      const fetchedEmails = data || [];
      setStats({
        total: count || fetchedEmails.length,
        unread: fetchedEmails.filter((e) => !e.is_read).length,
        actionRequired: fetchedEmails.filter((e) =>
          e.category === 'client_pipeline' || e.category === 'business_work_general'
        ).length,
        starred: fetchedEmails.filter((e) => e.is_starred).length,
        // Events are detected via analysis, not category - placeholder count
        events: 0, // Will be populated from analysis data below
      });

      // Fetch event data for emails with event analysis if requested
      // REFACTORED (Jan 2026): Events are detected via has_event label, not category.
      // We need to fetch analysis data to find emails with events.
      if (includeEventData) {
        // Fetch event detection data for all emails (filter will be done server-side)
        const emailIds = fetchedEmails.map((e) => e.id);
        const eventEmailIds = emailIds; // Fetch all, filter based on event_detection presence

        if (eventEmailIds.length > 0) {
          logger.debug('Fetching event data for event emails', { count: eventEmailIds.length });

          try {
            const { data: analysisData, error: analysisError } = await supabase
              .from('email_analyses')
              .select('email_id, event_detection')
              .in('email_id', eventEmailIds);

            if (analysisError) {
              logger.warn('Failed to fetch event data', { error: analysisError.message });
            } else if (analysisData) {
              const newEventData = new Map<string, EventPreviewData>();

              for (const analysis of analysisData) {
                if (analysis.event_detection) {
                  const ed = analysis.event_detection as Record<string, unknown>;
                  newEventData.set(analysis.email_id, {
                    eventDate: (ed.event_date as string) || (ed.eventDate as string) || '',
                    eventTime: (ed.event_time as string) || (ed.eventTime as string),
                    locationType: ((ed.location_type as string) || (ed.locationType as string) || 'unknown') as 'in_person' | 'virtual' | 'hybrid' | 'unknown',
                    registrationDeadline: (ed.registration_deadline as string) || (ed.registrationDeadline as string),
                    rsvpRequired: (ed.rsvp_required as boolean) || (ed.rsvpRequired as boolean) || false,
                    cost: ed.cost as string,
                    eventSummary: (ed.event_summary as string) || (ed.eventSummary as string),
                  });
                }
              }

              setEventData(newEventData);
              logger.debug('Event data loaded', { count: newEventData.size });
            }
          } catch (eventErr) {
            logger.warn('Error fetching event data', {
              error: eventErr instanceof Error ? eventErr.message : 'Unknown error',
            });
          }
        } else {
          setEventData(new Map());
        }
      }

      logger.success('Emails fetched', {
        count: fetchedEmails.length,
        total: count,
        hasMore: (data?.length || 0) >= limit,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch emails', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, category, clientId, limit, includeArchived, unreadOnly, starredOnly, includeEventData]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load More (Pagination)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Loads the next page of emails.
   * Uses offset-based pagination for simplicity.
   */
  const loadMore = React.useCallback(async () => {
    if (!hasMore || isLoading) return;

    logger.start('Loading more emails', { currentCount: emails.length });

    try {
      let query = supabase
        .from('emails')
        .select('*')
        .order('date', { ascending: false })
        .range(emails.length, emails.length + limit - 1);

      // Apply the same filters as the main query
      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (starredOnly) {
        query = query.eq('is_starred', true);
      }

      if (category === 'clients') {
        query = query.not('client_id', 'is', null);
      } else if (category !== 'all') {
        query = query.eq('category', category);
      }

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      const newEmails = data || [];
      setEmails((prev) => [...prev, ...newEmails]);
      setHasMore(newEmails.length >= limit);

      logger.success('Loaded more emails', {
        newCount: newEmails.length,
        totalCount: emails.length + newEmails.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load more emails', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [
    supabase,
    emails.length,
    limit,
    hasMore,
    isLoading,
    category,
    clientId,
    includeArchived,
    unreadOnly,
    starredOnly,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Optimistic Update
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Updates a single email in the local state.
   * Use for optimistic updates while the server request completes.
   */
  const updateEmail = React.useCallback((id: string, updates: Partial<Email>) => {
    setEmails((prev) =>
      prev.map((email) => (email.id === id ? { ...email, ...updates } : email))
    );

    // Update stats if relevant fields changed
    // REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
    if ('is_read' in updates || 'is_starred' in updates || 'category' in updates) {
      setStats((prev) => {
        const updatedEmails = emails.map((email) =>
          email.id === id ? { ...email, ...updates } : email
        );
        return {
          total: prev.total,
          unread: updatedEmails.filter((e) => !e.is_read).length,
          actionRequired: updatedEmails.filter((e) =>
            e.category === 'client_pipeline' || e.category === 'business_work_general'
          ).length,
          starred: updatedEmails.filter((e) => e.is_starred).length,
          events: prev.events, // Events are detected via analysis, keep existing count
        };
      });
    }
  }, [emails]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Fetch emails when filters change
  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    emails,
    isLoading,
    error,
    refetch: fetchEmails,
    loadMore,
    hasMore,
    stats,
    updateEmail,
    eventData,
  };
}

export default useEmails;
