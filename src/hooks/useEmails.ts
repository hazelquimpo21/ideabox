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
import type { Email, EmailCategory, QuickActionDb } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of emails to fetch per request */
const DEFAULT_LIMIT = 50;

/**
 * Fields needed for email list views.
 * Excludes body_html, body_text, and other heavy fields that are only
 * needed in the full email detail view. This reduces data transfer
 * by ~80-90% compared to select('*').
 * Now includes urgency_score, relationship_signal (migration 043) and
 * golden_nugget_count (migration 044) as denormalized columns.
 *
 * @see INBOX_PERFORMANCE_AUDIT.md — P0-B
 */
const EMAIL_LIST_FIELDS = 'id, gmail_id, gmail_account_id, subject, sender_name, sender_email, date, snippet, category, additional_categories, is_read, is_starred, is_archived, quick_action, gist, summary, priority_score, key_points, topics, labels, analyzed_at, analysis_error, contact_id, signal_strength, reply_worthiness, email_type, urgency_score, relationship_signal, golden_nugget_count' as const;

/** Logger instance for this hook */
const logger = createLogger('useEmails');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for filtering and paginating emails.
 *
 * ENHANCED (Jan 2026): Added quickAction filter for AI-powered action filtering.
 */
export interface UseEmailsOptions {
  /** Filter by email category (life-bucket) */
  category?: EmailCategory | 'all' | 'clients';
  /** Filter by AI-suggested quick action (respond, review, calendar, etc.) */
  quickAction?: QuickActionDb | null;
  /** Filter by client ID */
  clientId?: string;
  /** Maximum number of emails to fetch */
  limit?: number;
  /** Include archived emails (default: false) */
  includeArchived?: boolean;
  /**
   * Only show archived emails (default: false).
   * When true, adds `.eq('is_archived', true)` to the query so
   * filtering happens server-side instead of in JavaScript.
   *
   * @see INBOX_PERFORMANCE_AUDIT.md — P2-A
   */
  archivedOnly?: boolean;
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
 * Quick action statistics for filter bar display.
 * Counts emails by their AI-suggested quick action.
 *
 * ADDED (Jan 2026): For the new interactive filter bar.
 */
export interface QuickActionStats {
  respond: number;
  review: number;
  calendar: number;
  follow_up: number;
  save: number;
  archive: number;
  unsubscribe: number;
  none: number;
}

/**
 * Category statistics for filter bar display.
 * Counts emails by their life-bucket category.
 *
 * ADDED (Jan 2026): For the new interactive filter bar.
 */
export interface CategoryStats {
  clients: number;
  work: number;
  personal_friends_family: number;
  family: number;
  finance: number;
  shopping: number;
  newsletters_creator: number;
  newsletters_industry: number;
  news_politics: number;
  product_updates: number;
  local: number;
  travel: number;
}

/**
 * Email statistics for dashboard display.
 *
 * ENHANCED (Jan 2026): Added quickActionStats and categoryStats for filter bar.
 */
export interface EmailStats {
  /** Total number of emails */
  total: number;
  /** Number of unread emails */
  unread: number;
  /** Number of starred emails */
  starred: number;
  /** Number of emails with events (from has_event label) */
  events: number;
  /** Counts by quick action type for filter bar */
  quickActionStats: QuickActionStats;
  /** Counts by category for filter bar */
  categoryStats: CategoryStats;
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

  /**
   * Email statistics state.
   * ENHANCED (Jan 2026): Now includes quickActionStats and categoryStats
   * for the new interactive filter bar.
   */
  const [stats, setStats] = React.useState<EmailStats>({
    total: 0,
    unread: 0,
    starred: 0,
    events: 0,
    quickActionStats: {
      respond: 0,
      review: 0,
      calendar: 0,
      follow_up: 0,
      save: 0,
      archive: 0,
      unsubscribe: 0,
      none: 0,
    },
    categoryStats: {
      clients: 0,
      work: 0,
      personal_friends_family: 0,
      family: 0,
      finance: 0,
      shopping: 0,
      newsletters_creator: 0,
      newsletters_industry: 0,
      news_politics: 0,
      product_updates: 0,
      local: 0,
      travel: 0,
    },
  });
  const [eventData, setEventData] = React.useState<Map<string, EventPreviewData>>(new Map());

  // Memoize the Supabase client to prevent recreation on each render
  const supabase = React.useMemo(() => createClient(), []);

  // Memoize options to prevent unnecessary refetches
  // ENHANCED (Jan 2026): Added quickAction for AI-powered filtering
  const {
    category = 'all',
    quickAction = null,
    clientId,
    limit = DEFAULT_LIMIT,
    includeArchived = false,
    archivedOnly = false,
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
   *
   * ENHANCED (Jan 2026):
   * - Added quickAction filtering for AI-powered triage
   * - Calculate quickActionStats and categoryStats for filter bar
   * - Event count now calculated from has_event label
   */
  const fetchEmails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching emails', {
      category,
      quickAction,
      clientId,
      limit,
      includeArchived,
      unreadOnly,
      starredOnly,
    });

    try {
      // Build the base query — select only list-view fields to avoid
      // pulling body_html/body_text (~50-100KB per email)
      let query = supabase
        .from('emails')
        .select(EMAIL_LIST_FIELDS, { count: 'exact' })
        .order('date', { ascending: false })
        .limit(limit);

      // Apply archive filter — archivedOnly takes precedence over includeArchived
      if (archivedOnly) {
        // Server-side filtering: only fetch archived emails
        query = query.eq('is_archived', true);
      } else if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (starredOnly) {
        query = query.eq('is_starred', true);
      }

      // Category filtering
      // "clients" is a special filter that checks for non-null contact_id
      // NEW Feb 2026: Also matches emails with this category in additional_categories
      if (category === 'clients') {
        query = query.not('contact_id', 'is', null);
      } else if (category !== 'all') {
        query = query.or(`category.eq.${category},additional_categories.cs.{${category}}`);
      }

      // Quick action filtering (NEW Jan 2026)
      // Filters by AI-suggested action type
      if (quickAction) {
        query = query.eq('quick_action', quickAction);
        logger.debug('Applied quick action filter', { quickAction });
      }

      // Client ID filter
      if (clientId) {
        query = query.eq('contact_id', clientId);
      }

      // Execute query
      const { data, error: queryError, count } = await query;

      if (queryError) {
        throw new Error(queryError.message);
      }

      // Update state
      setEmails(data || []);
      setHasMore((data?.length || 0) >= limit);

      const fetchedEmails = data || [];

      // ─────────────────────────────────────────────────────────────────────────
      // STATS CALCULATION (ENHANCED Jan 2026)
      // Calculate comprehensive stats for the filter bar
      // ─────────────────────────────────────────────────────────────────────────

      // Calculate quick action stats - count emails by quick_action field
      const quickActionStats: QuickActionStats = {
        respond: 0,
        review: 0,
        calendar: 0,
        follow_up: 0,
        save: 0,
        archive: 0,
        unsubscribe: 0,
        none: 0,
      };

      // Calculate category stats - count emails by category field
      const categoryStats: CategoryStats = {
        clients: 0,
        work: 0,
        personal_friends_family: 0,
        family: 0,
        finance: 0,
        shopping: 0,
        newsletters_creator: 0,
        newsletters_industry: 0,
        news_politics: 0,
        product_updates: 0,
        local: 0,
        travel: 0,
      };

      // Count events from labels array (has_event label)
      let eventCount = 0;

      for (const email of fetchedEmails) {
        // Count quick actions
        const qa = email.quick_action as QuickActionDb | null;
        if (qa && qa in quickActionStats) {
          quickActionStats[qa]++;
        }

        // Count categories
        const cat = email.category as EmailCategory | null;
        if (cat && cat in categoryStats) {
          categoryStats[cat]++;
        }

        // Count events from labels array
        // labels field contains strings like 'has_event', 'urgent', etc.
        const labels = email.labels as string[] | null;
        if (labels && Array.isArray(labels) && labels.includes('has_event')) {
          eventCount++;
        }
      }

      logger.debug('Stats calculated', {
        total: count || fetchedEmails.length,
        unread: fetchedEmails.filter((e) => !e.is_read).length,
        events: eventCount,
        quickActionStats,
        categoryStats,
      });

      setStats({
        total: count || fetchedEmails.length,
        unread: fetchedEmails.filter((e) => !e.is_read).length,
        starred: fetchedEmails.filter((e) => e.is_starred).length,
        events: eventCount,
        quickActionStats,
        categoryStats,
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
  }, [supabase, category, quickAction, clientId, limit, includeArchived, archivedOnly, unreadOnly, starredOnly, includeEventData]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load More (Pagination)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Loads the next page of emails.
   * Uses offset-based pagination for simplicity.
   *
   * ENHANCED (Jan 2026): Added quickAction filtering support.
   */
  const loadMore = React.useCallback(async () => {
    if (!hasMore || isLoading) return;

    logger.start('Loading more emails', { currentCount: emails.length });

    try {
      // Load more with same list-view fields (no body content needed)
      let query = supabase
        .from('emails')
        .select(EMAIL_LIST_FIELDS)
        .order('date', { ascending: false })
        .range(emails.length, emails.length + limit - 1);

      // Apply the same filters as the main query
      if (archivedOnly) {
        query = query.eq('is_archived', true);
      } else if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (starredOnly) {
        query = query.eq('is_starred', true);
      }

      if (category === 'clients') {
        query = query.not('contact_id', 'is', null);
      } else if (category !== 'all') {
        query = query.or(`category.eq.${category},additional_categories.cs.{${category}}`);
      }

      // Quick action filtering (NEW Jan 2026)
      if (quickAction) {
        query = query.eq('quick_action', quickAction);
      }

      if (clientId) {
        query = query.eq('contact_id', clientId);
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
    quickAction,
    clientId,
    includeArchived,
    archivedOnly,
    unreadOnly,
    starredOnly,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Optimistic Update
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Updates a single email in the local state.
   * Use for optimistic updates while the server request completes.
   *
   * ENHANCED (Jan 2026): Updates quickActionStats and categoryStats
   * when relevant fields change.
   */
  const updateEmail = React.useCallback((id: string, updates: Partial<Email>) => {
    setEmails((prev) =>
      prev.map((email) => (email.id === id ? { ...email, ...updates } : email))
    );

    // Update stats if relevant fields changed
    // This recalculates affected stats for optimistic UI updates
    if ('is_read' in updates || 'is_starred' in updates || 'category' in updates || 'quick_action' in updates) {
      setStats((prev) => {
        const updatedEmails = emails.map((email) =>
          email.id === id ? { ...email, ...updates } : email
        );

        // Recalculate quick action stats
        const quickActionStats: QuickActionStats = {
          respond: 0,
          review: 0,
          calendar: 0,
          follow_up: 0,
          save: 0,
          archive: 0,
          unsubscribe: 0,
          none: 0,
        };

        // Recalculate category stats
        const categoryStats: CategoryStats = {
          clients: 0,
          work: 0,
          personal_friends_family: 0,
          family: 0,
          finance: 0,
          shopping: 0,
          newsletters_creator: 0,
          newsletters_industry: 0,
          news_politics: 0,
          product_updates: 0,
          local: 0,
          travel: 0,
        };

        for (const email of updatedEmails) {
          const qa = email.quick_action as QuickActionDb | null;
          if (qa && qa in quickActionStats) {
            quickActionStats[qa]++;
          }

          const cat = email.category as EmailCategory | null;
          if (cat && cat in categoryStats) {
            categoryStats[cat]++;
          }
        }

        return {
          total: prev.total,
          unread: updatedEmails.filter((e) => !e.is_read).length,
          starred: updatedEmails.filter((e) => e.is_starred).length,
          events: prev.events, // Events are detected via labels, keep existing count
          quickActionStats,
          categoryStats,
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
