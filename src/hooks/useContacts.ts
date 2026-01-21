/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * 👥 useContacts Hook
 *
 * React hook for fetching, filtering, and managing contacts from Supabase.
 * Provides a clean interface for the Contacts page and contact-related features.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches contacts with VIP/muted/relationship filtering
 * - Supports text search across name and email
 * - Supports sorting by email_count, last_seen_at, or name
 * - Pagination with load more capability
 * - Optimistic updates for VIP and muted toggles
 * - Comprehensive error handling and logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage - fetch all contacts
 * const { contacts, isLoading, error, refetch } = useContacts();
 *
 * // Filter by VIP status
 * const { contacts } = useContacts({ isVip: true });
 *
 * // Search contacts
 * const { contacts } = useContacts({ search: 'john' });
 *
 * // Sort by email count (most emails first)
 * const { contacts } = useContacts({ sortBy: 'email_count', sortOrder: 'desc' });
 *
 * // Toggle VIP status
 * await toggleVip('contact-id');
 * ```
 *
 * @module hooks/useContacts
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of contacts to fetch per request */
const DEFAULT_LIMIT = 50;

/** Logger instance for this hook - enables consistent, structured logging */
const logger = createLogger('useContacts');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Relationship types for contacts.
 * Matches the contact_relationship_type enum in the database.
 */
export type ContactRelationshipType =
  | 'client'
  | 'colleague'
  | 'vendor'
  | 'friend'
  | 'family'
  | 'recruiter'
  | 'service'
  | 'unknown';

/**
 * Contact entity from the database.
 * Represents a person the user has exchanged emails with.
 */
export interface Contact {
  /** Unique identifier (UUID) */
  id: string;
  /** User who owns this contact */
  user_id: string;
  /** Contact's email address (primary key for matching) */
  email: string;
  /** Contact's display name (extracted from email headers or signature) */
  name: string | null;
  /** Company/organization (extracted from email signature) */
  company: string | null;
  /** Job title (extracted from email signature) */
  job_title: string | null;
  /** Inferred relationship type */
  relationship_type: ContactRelationshipType;
  /** Whether this contact is marked as VIP (high priority) */
  is_vip: boolean;
  /** Whether this contact is muted (hidden from inbox) */
  is_muted: boolean;
  /** Total number of emails exchanged with this contact */
  email_count: number;
  /** When first seen in user's emails */
  first_seen_at: string;
  /** When last seen in user's emails */
  last_seen_at: string;
  /** Additional notes about the contact */
  notes: string | null;
  /** Record timestamps */
  created_at: string;
  updated_at: string;
}

/**
 * Options for filtering and paginating contacts.
 */
export interface UseContactsOptions {
  /** Filter to only VIP contacts */
  isVip?: boolean;
  /** Filter to only muted contacts */
  isMuted?: boolean;
  /** Filter by relationship type */
  relationshipType?: ContactRelationshipType;
  /** Search by name or email (case-insensitive) */
  search?: string;
  /** Sort field */
  sortBy?: 'email_count' | 'last_seen_at' | 'name';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Maximum number of contacts to fetch */
  limit?: number;
}

/**
 * Contact statistics for dashboard display.
 */
export interface ContactStats {
  /** Total number of contacts */
  total: number;
  /** Number of VIP contacts */
  vip: number;
  /** Number of muted contacts */
  muted: number;
  /** Number of client contacts */
  clients: number;
  /** Last Google contacts sync timestamp */
  lastGoogleSync: string | null;
}

/**
 * Return value from the useContacts hook.
 */
export interface UseContactsReturn {
  /** Array of contact objects */
  contacts: Contact[];
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch contacts with current filters */
  refetch: () => Promise<void>;
  /** Load more contacts (pagination) */
  loadMore: () => Promise<void>;
  /** Whether more contacts are available */
  hasMore: boolean;
  /** Contact statistics (global, not affected by filters) */
  stats: ContactStats;
  /** Refresh just the stats (useful after external changes like sync) */
  refreshStats: () => Promise<void>;
  /** Toggle VIP status for a contact (optimistic update) */
  toggleVip: (contactId: string) => Promise<void>;
  /** Toggle muted status for a contact (optimistic update) */
  toggleMuted: (contactId: string) => Promise<void>;
  /** Update relationship type for a contact */
  updateRelationship: (contactId: string, type: ContactRelationshipType) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing contacts from Supabase.
 *
 * @param options - Filtering, sorting, and pagination options
 * @returns Contact data, loading state, and control functions
 *
 * @example
 * ```tsx
 * function ContactsPage() {
 *   const {
 *     contacts,
 *     isLoading,
 *     error,
 *     stats,
 *     toggleVip,
 *     toggleMuted,
 *   } = useContacts({
 *     sortBy: 'last_seen_at',
 *     sortOrder: 'desc',
 *   });
 *
 *   if (isLoading) return <LoadingSkeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       <StatsBar stats={stats} />
 *       <ContactList
 *         contacts={contacts}
 *         onToggleVip={toggleVip}
 *         onToggleMuted={toggleMuted}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useContacts(options: UseContactsOptions = {}): UseContactsReturn {
  // ─────────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────────

  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [stats, setStats] = React.useState<ContactStats>({
    total: 0,
    vip: 0,
    muted: 0,
    clients: 0,
    lastGoogleSync: null,
  });

  // Memoize the Supabase client to prevent recreation on each render
  const supabase = React.useMemo(() => createClient(), []);

  // Destructure options with defaults for stable dependency array
  const {
    isVip,
    isMuted,
    relationshipType,
    search = '',
    sortBy = 'last_seen_at',
    sortOrder = 'desc',
    limit = DEFAULT_LIMIT,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Contacts
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches contacts from Supabase with the current filters.
   * Called on mount and when filter options change.
   */
  const fetchContacts = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching contacts', {
      isVip,
      isMuted,
      relationshipType,
      search: search ? `"${search}"` : undefined,
      sortBy,
      sortOrder,
      limit,
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Build base query with count for pagination
      // ─────────────────────────────────────────────────────────────────────────
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .limit(limit);

      // ─────────────────────────────────────────────────────────────────────────
      // Apply filters based on options
      // ─────────────────────────────────────────────────────────────────────────

      // VIP filter - only show VIP or non-VIP contacts
      if (isVip !== undefined) {
        query = query.eq('is_vip', isVip);
        logger.debug('Applying VIP filter', { isVip });
      }

      // Muted filter - only show muted or non-muted contacts
      if (isMuted !== undefined) {
        query = query.eq('is_muted', isMuted);
        logger.debug('Applying muted filter', { isMuted });
      }

      // Relationship type filter
      if (relationshipType) {
        query = query.eq('relationship_type', relationshipType);
        logger.debug('Applying relationship filter', { relationshipType });
      }

      // Text search - searches across both name and email fields
      if (search && search.trim()) {
        const searchTerm = search.trim();
        query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        logger.debug('Applying search filter', { search: searchTerm });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Apply sorting
      // ─────────────────────────────────────────────────────────────────────────
      const ascending = sortOrder === 'asc';
      query = query.order(sortBy, { ascending, nullsFirst: false });

      // ─────────────────────────────────────────────────────────────────────────
      // Execute query
      // ─────────────────────────────────────────────────────────────────────────
      const { data, error: queryError, count } = await query;

      if (queryError) {
        logger.error('Database query failed', {
          error: queryError.message,
          code: queryError.code,
        });
        throw new Error(`Failed to fetch contacts: ${queryError.message}`);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Update state with fetched data
      // ─────────────────────────────────────────────────────────────────────────
      const fetchedContacts = (data || []) as Contact[];
      setContacts(fetchedContacts);
      setHasMore(fetchedContacts.length >= limit);

      // Note: Global stats are now fetched separately via /api/contacts/stats
      // to ensure accurate totals regardless of filters

      logger.success('Contacts fetched', {
        count: fetchedContacts.length,
        total: count,
        hasMore: fetchedContacts.length >= limit,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch contacts', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, isVip, isMuted, relationshipType, search, sortBy, sortOrder, limit]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load More (Pagination)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads the next page of contacts using offset-based pagination.
   * Appends to the existing contacts array.
   */
  const loadMore = React.useCallback(async () => {
    // Guard: Don't load if already loading or no more data
    if (!hasMore || isLoading) {
      logger.debug('Load more skipped', { hasMore, isLoading });
      return;
    }

    logger.start('Loading more contacts', { currentCount: contacts.length });

    try {
      // Build query with same filters as initial fetch
      let query = supabase
        .from('contacts')
        .select('*')
        .range(contacts.length, contacts.length + limit - 1);

      // Apply the same filters as the main query
      if (isVip !== undefined) {
        query = query.eq('is_vip', isVip);
      }
      if (isMuted !== undefined) {
        query = query.eq('is_muted', isMuted);
      }
      if (relationshipType) {
        query = query.eq('relationship_type', relationshipType);
      }
      if (search && search.trim()) {
        const searchTerm = search.trim();
        query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }

      // Apply sorting
      const ascending = sortOrder === 'asc';
      query = query.order(sortBy, { ascending, nullsFirst: false });

      const { data, error: queryError } = await query;

      if (queryError) {
        logger.error('Load more query failed', {
          error: queryError.message,
          code: queryError.code,
        });
        throw new Error(`Failed to load more contacts: ${queryError.message}`);
      }

      const newContacts = (data || []) as Contact[];
      setContacts((prev) => [...prev, ...newContacts]);
      setHasMore(newContacts.length >= limit);

      logger.success('Loaded more contacts', {
        newCount: newContacts.length,
        totalCount: contacts.length + newContacts.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load more contacts', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [
    supabase,
    contacts.length,
    limit,
    hasMore,
    isLoading,
    isVip,
    isMuted,
    relationshipType,
    search,
    sortBy,
    sortOrder,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Global Stats (separate from filtered contacts)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches global contact statistics from the dedicated stats endpoint.
   * This ensures accurate totals regardless of current filters.
   */
  const fetchStats = React.useCallback(async () => {
    try {
      const response = await fetch('/api/contacts/stats');
      if (response.ok) {
        const data = await response.json();
        setStats({
          total: data.total || 0,
          vip: data.vip || 0,
          muted: data.muted || 0,
          clients: data.clients || 0,
          lastGoogleSync: data.lastGoogleSync || null,
        });
        logger.debug('Global stats fetched', data);
      }
    } catch (err) {
      // Don't throw - stats are non-critical
      logger.warn('Failed to fetch global stats', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Toggle VIP Status (Optimistic Update)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggles the VIP status of a contact.
   * Uses optimistic update pattern - updates UI immediately, then syncs with server.
   * Rolls back on error.
   *
   * @param contactId - The ID of the contact to toggle
   */
  const toggleVip = React.useCallback(
    async (contactId: string) => {
      // Find the contact to toggle
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) {
        logger.warn('Toggle VIP: Contact not found', { contactId: contactId.substring(0, 8) });
        return;
      }

      const newVipStatus = !contact.is_vip;
      logger.start('Toggling VIP status', {
        contactId: contactId.substring(0, 8),
        from: contact.is_vip,
        to: newVipStatus,
      });

      // Optimistic update - update UI immediately
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, is_vip: newVipStatus } : c))
      );

      try {
        // Persist to database
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ is_vip: newVipStatus, updated_at: new Date().toISOString() })
          .eq('id', contactId);

        if (updateError) {
          logger.error('Toggle VIP database update failed', {
            error: updateError.message,
            contactId: contactId.substring(0, 8),
          });
          throw new Error(updateError.message);
        }

        logger.success('VIP status toggled', {
          contactId: contactId.substring(0, 8),
          newStatus: newVipStatus,
        });

        // Refresh global stats after successful toggle
        fetchStats();
      } catch (err) {
        // Rollback optimistic update on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back VIP toggle', { error: errorMessage });

        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, is_vip: contact.is_vip } : c))
        );

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, contacts, fetchStats]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Toggle Muted Status (Optimistic Update)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggles the muted status of a contact.
   * Uses optimistic update pattern - updates UI immediately, then syncs with server.
   * Rolls back on error.
   *
   * @param contactId - The ID of the contact to toggle
   */
  const toggleMuted = React.useCallback(
    async (contactId: string) => {
      // Find the contact to toggle
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) {
        logger.warn('Toggle muted: Contact not found', { contactId: contactId.substring(0, 8) });
        return;
      }

      const newMutedStatus = !contact.is_muted;
      logger.start('Toggling muted status', {
        contactId: contactId.substring(0, 8),
        from: contact.is_muted,
        to: newMutedStatus,
      });

      // Optimistic update - update UI immediately
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, is_muted: newMutedStatus } : c))
      );

      try {
        // Persist to database
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ is_muted: newMutedStatus, updated_at: new Date().toISOString() })
          .eq('id', contactId);

        if (updateError) {
          logger.error('Toggle muted database update failed', {
            error: updateError.message,
            contactId: contactId.substring(0, 8),
          });
          throw new Error(updateError.message);
        }

        logger.success('Muted status toggled', {
          contactId: contactId.substring(0, 8),
          newStatus: newMutedStatus,
        });

        // Refresh global stats after successful toggle
        fetchStats();
      } catch (err) {
        // Rollback optimistic update on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back muted toggle', { error: errorMessage });

        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, is_muted: contact.is_muted } : c))
        );

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, contacts, fetchStats]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Relationship Type
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Updates the relationship type for a contact.
   *
   * @param contactId - The ID of the contact to update
   * @param type - The new relationship type
   */
  const updateRelationship = React.useCallback(
    async (contactId: string, type: ContactRelationshipType) => {
      // Find the contact to update
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) {
        logger.warn('Update relationship: Contact not found', {
          contactId: contactId.substring(0, 8),
        });
        return;
      }

      const previousType = contact.relationship_type;
      logger.start('Updating relationship type', {
        contactId: contactId.substring(0, 8),
        from: previousType,
        to: type,
      });

      // Optimistic update
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, relationship_type: type } : c))
      );

      try {
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ relationship_type: type, updated_at: new Date().toISOString() })
          .eq('id', contactId);

        if (updateError) {
          logger.error('Update relationship database update failed', {
            error: updateError.message,
            contactId: contactId.substring(0, 8),
          });
          throw new Error(updateError.message);
        }

        logger.success('Relationship type updated', {
          contactId: contactId.substring(0, 8),
          newType: type,
        });

        // Refresh stats if client count changed
        if (type === 'client' || previousType === 'client') {
          fetchStats();
        }
      } catch (err) {
        // Rollback on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back relationship update', { error: errorMessage });

        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId ? { ...c, relationship_type: previousType } : c
          )
        );

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, contacts, fetchStats]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch contacts when filter options change
  React.useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Fetch global stats on mount and after certain actions
  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    contacts,
    isLoading,
    error,
    refetch: fetchContacts,
    loadMore,
    hasMore,
    stats,
    refreshStats: fetchStats,
    toggleVip,
    toggleMuted,
    updateRelationship,
  };
}

export default useContacts;
