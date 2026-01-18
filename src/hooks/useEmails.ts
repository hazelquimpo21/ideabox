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
      const fetchedEmails = data || [];
      setStats({
        total: count || fetchedEmails.length,
        unread: fetchedEmails.filter((e) => !e.is_read).length,
        actionRequired: fetchedEmails.filter((e) => e.category === 'action_required').length,
        starred: fetchedEmails.filter((e) => e.is_starred).length,
        events: fetchedEmails.filter((e) => e.category === 'event').length,
      });

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
  }, [supabase, category, clientId, limit, includeArchived, unreadOnly, starredOnly]);

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
    if ('is_read' in updates || 'is_starred' in updates || 'category' in updates) {
      setStats((prev) => {
        const updatedEmails = emails.map((email) =>
          email.id === id ? { ...email, ...updates } : email
        );
        return {
          total: prev.total,
          unread: updatedEmails.filter((e) => !e.is_read).length,
          actionRequired: updatedEmails.filter((e) => e.category === 'action_required').length,
          starred: updatedEmails.filter((e) => e.is_starred).length,
          events: updatedEmails.filter((e) => e.category === 'event').length,
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
  };
}

export default useEmails;
