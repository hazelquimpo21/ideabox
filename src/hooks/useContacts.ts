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
 * - Page-based pagination with navigation controls
 * - Optimistic updates for VIP and muted toggles
 * - Comprehensive error handling and logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage - fetch all contacts
 * const { contacts, isLoading, pagination, goToPage } = useContacts();
 *
 * // With pagination
 * const { contacts, pagination, goToPage, nextPage, prevPage } = useContacts({
 *   page: 1,
 *   pageSize: 50,
 * });
 *
 * // Filter by VIP status
 * const { contacts } = useContacts({ isVip: true });
 *
 * // Search contacts
 * const { contacts } = useContacts({ search: 'john' });
 *
 * // Sort by email count (most emails first)
 * const { contacts } = useContacts({ sortBy: 'email_count', sortOrder: 'desc' });
 * ```
 *
 * @module hooks/useContacts
 * @version 2.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of contacts to fetch per page */
const DEFAULT_PAGE_SIZE = 50;

/** Default starting page (1-indexed) */
const DEFAULT_PAGE = 1;

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
 * Sender types for classifying contacts (NEW Jan 2026).
 *
 * Distinguishes real contacts from newsletters/broadcasts:
 * - direct: Real person who knows you
 * - broadcast: Newsletter/marketing sender
 * - cold_outreach: Cold emails from strangers
 * - opportunity: HARO-style mailing lists
 * - unknown: Not yet classified
 * - all: No filter (show all)
 */
export type SenderType =
  | 'direct'
  | 'broadcast'
  | 'cold_outreach'
  | 'opportunity'
  | 'unknown'
  | 'all';

/**
 * Broadcast subtypes for newsletter classification.
 */
export type BroadcastSubtype =
  | 'newsletter_author'
  | 'company_newsletter'
  | 'digest_service'
  | 'transactional';

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
  /** Inferred relationship type (only meaningful for direct senders) */
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE FIELDS (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Sender type classification: direct, broadcast, cold_outreach, opportunity, unknown */
  sender_type: SenderType | null;
  /** Broadcast subtype (only for sender_type='broadcast') */
  broadcast_subtype: BroadcastSubtype | null;
  /** Confidence in sender type classification (0-1) */
  sender_type_confidence: number | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT FIELDS (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Whether this contact is a client (merged from clients table) */
  is_client: boolean;
  /** Client status: active, inactive, or archived (null if not a client) */
  client_status: string | null;
  /** Client priority: vip, high, medium, or low (null if not a client) */
  client_priority: string | null;
  /** Email domains for auto-matching emails to this client */
  email_domains: string[] | null;
  /** Keywords for categorizing emails related to this client */
  keywords: string[] | null;
}

/**
 * Options for filtering, sorting, and paginating contacts.
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
  /** Current page number (1-indexed) */
  page?: number;
  /** Number of contacts per page */
  pageSize?: number;

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE FILTERING (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Filter by sender type:
   * - 'direct': Real contacts who know you
   * - 'broadcast': Newsletter/marketing senders
   * - 'cold_outreach': Cold emails from strangers
   * - 'opportunity': HARO-style mailing lists
   * - 'unknown': Not yet classified
   * - 'all' or undefined: No filter (return all)
   */
  senderType?: SenderType;
  /** Filter by broadcast subtype (only when senderType='broadcast') */
  broadcastSubtype?: BroadcastSubtype;

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT FILTERING (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Filter by is_client column — true for clients, false for non-clients */
  isClient?: boolean;
  /** Filter by client status: active, inactive, or archived */
  clientStatus?: 'active' | 'inactive' | 'archived';
  /** Filter by client priority: vip, high, medium, or low */
  clientPriority?: 'vip' | 'high' | 'medium' | 'low';
}

/**
 * Sender type statistics for tab badges.
 */
export interface SenderTypeStats {
  /** Real contacts who know you */
  direct: number;
  /** Newsletter/marketing senders */
  broadcast: number;
  /** Cold emails from strangers */
  cold_outreach: number;
  /** HARO-style mailing lists */
  opportunity: number;
  /** Not yet classified */
  unknown: number;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE STATS (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Counts by sender type (for tab badges) */
  bySenderType: SenderTypeStats;
}

/**
 * Pagination state and computed values.
 */
export interface ContactsPagination {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalCount: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrev: boolean;
  /** Index of first item on current page (1-indexed) */
  startItem: number;
  /** Index of last item on current page (1-indexed) */
  endItem: number;
}

/**
 * Return value from the useContacts hook.
 */
export interface UseContactsReturn {
  /** Array of contact objects for current page */
  contacts: Contact[];
  /** Loading state for fetch operations */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Refetch contacts with current filters and page */
  refetch: () => Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Pagination
  // ─────────────────────────────────────────────────────────────────────────────

  /** Pagination state and computed values */
  pagination: ContactsPagination;
  /** Navigate to a specific page (1-indexed) */
  goToPage: (page: number) => void;
  /** Navigate to the next page */
  nextPage: () => void;
  /** Navigate to the previous page */
  prevPage: () => void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Legacy support (deprecated - use pagination object instead)
  // ─────────────────────────────────────────────────────────────────────────────

  /** @deprecated Use pagination.hasNext instead */
  hasMore: boolean;
  /** @deprecated Use goToPage(pagination.page + 1) instead */
  loadMore: () => Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Stats and Actions
  // ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Client Operations (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Promote a contact to client status via the promote API endpoint */
  promoteToClient: (contactId: string, clientData: {
    clientStatus: 'active' | 'inactive' | 'archived';
    clientPriority: 'vip' | 'high' | 'medium' | 'low';
    emailDomains?: string[];
    keywords?: string[];
  }) => Promise<void>;
  /** Update client-specific fields on a contact */
  updateClientFields: (contactId: string, fields: Partial<{
    client_status: string;
    client_priority: string;
    email_domains: string[];
    keywords: string[];
  }>) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing contacts from Supabase.
 *
 * @param options - Filtering, sorting, and pagination options
 * @returns Contact data, loading state, pagination, and control functions
 *
 * @example
 * ```tsx
 * function ContactsPage() {
 *   const [page, setPage] = React.useState(1);
 *
 *   const {
 *     contacts,
 *     isLoading,
 *     error,
 *     pagination,
 *     goToPage,
 *     stats,
 *     toggleVip,
 *   } = useContacts({
 *     page,
 *     pageSize: 50,
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
 *       <ContactList contacts={contacts} onToggleVip={toggleVip} />
 *       <Pagination
 *         currentPage={pagination.page}
 *         totalPages={pagination.totalPages}
 *         totalItems={pagination.totalCount}
 *         pageSize={pagination.pageSize}
 *         onPageChange={(newPage) => {
 *           setPage(newPage);
 *           goToPage(newPage);
 *         }}
 *         showInfo
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
  const [totalCount, setTotalCount] = React.useState(0);
  const [stats, setStats] = React.useState<ContactStats>({
    total: 0,
    vip: 0,
    muted: 0,
    clients: 0,
    lastGoogleSync: null,
    bySenderType: {
      direct: 0,
      broadcast: 0,
      cold_outreach: 0,
      opportunity: 0,
      unknown: 0,
    },
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
    page: requestedPage = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    senderType,
    broadcastSubtype,
    isClient,
    clientStatus,
    clientPriority,
  } = options;

  // Internal page state - allows navigation without requiring parent to track page
  const [internalPage, setInternalPage] = React.useState(requestedPage);

  // Sync internal page with requested page when it changes externally
  React.useEffect(() => {
    if (requestedPage !== internalPage) {
      logger.debug('Page sync from parent', {
        from: internalPage,
        to: requestedPage,
      });
      setInternalPage(requestedPage);
    }
  }, [requestedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed Pagination Values
  // ─────────────────────────────────────────────────────────────────────────────

  const pagination = React.useMemo((): ContactsPagination => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(Math.max(1, internalPage), totalPages);
    const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalCount);

    return {
      page: currentPage,
      pageSize,
      totalCount,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1,
      startItem,
      endItem,
    };
  }, [internalPage, pageSize, totalCount]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Contacts
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches contacts from Supabase with the current filters and pagination.
   * Called on mount and when filter/page options change.
   */
  const fetchContacts = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Calculate offset from page number (1-indexed)
    const offset = (internalPage - 1) * pageSize;

    logger.start('Fetching contacts', {
      page: internalPage,
      pageSize,
      offset,
      isVip,
      isMuted,
      relationshipType,
      senderType: senderType ?? 'all',
      broadcastSubtype,
      search: search ? `"${search}"` : undefined,
      sortBy,
      sortOrder,
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Build base query with count for pagination
      // ─────────────────────────────────────────────────────────────────────────
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' });

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

      // ─────────────────────────────────────────────────────────────────────────
      // SENDER TYPE FILTER (NEW Jan 2026)
      // Allows filtering to show only real contacts, newsletters, etc.
      // ─────────────────────────────────────────────────────────────────────────
      if (senderType && senderType !== 'all') {
        query = query.eq('sender_type', senderType);
        logger.debug('Applying sender type filter', { senderType });

        // Additional subtype filter for broadcasts
        if (senderType === 'broadcast' && broadcastSubtype) {
          query = query.eq('broadcast_subtype', broadcastSubtype);
          logger.debug('Applying broadcast subtype filter', { broadcastSubtype });
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // CLIENT FILTERING (NEW Feb 2026 — Phase 3 Navigation Redesign)
      // ─────────────────────────────────────────────────────────────────────────
      if (isClient !== undefined) {
        query = query.eq('is_client', isClient);
        logger.debug('Applying is_client filter', { isClient });
      }

      if (clientStatus) {
        query = query.eq('client_status', clientStatus);
        logger.debug('Applying client_status filter', { clientStatus });
      }

      if (clientPriority) {
        query = query.eq('client_priority', clientPriority);
        logger.debug('Applying client_priority filter', { clientPriority });
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
      // Apply pagination using range (offset-based)
      // ─────────────────────────────────────────────────────────────────────────
      query = query.range(offset, offset + pageSize - 1);

      // ─────────────────────────────────────────────────────────────────────────
      // Execute query
      // ─────────────────────────────────────────────────────────────────────────
      const { data, error: queryError, count } = await query;

      if (queryError) {
        logger.error('Database query failed', {
          error: queryError.message,
          code: queryError.code,
          page: internalPage,
        });
        throw new Error(`Failed to fetch contacts: ${queryError.message}`);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Update state with fetched data
      // ─────────────────────────────────────────────────────────────────────────
      const fetchedContacts = (data || []) as Contact[];
      setContacts(fetchedContacts);
      setTotalCount(count || 0);

      logger.success('Contacts fetched', {
        page: internalPage,
        pageSize,
        count: fetchedContacts.length,
        totalCount: count,
        totalPages: Math.ceil((count || 0) / pageSize),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch contacts', {
        error: errorMessage,
        page: internalPage,
      });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, internalPage, pageSize, isVip, isMuted, relationshipType, senderType, broadcastSubtype, isClient, clientStatus, clientPriority, search, sortBy, sortOrder]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Page Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Navigates to a specific page.
   * Validates the page number and triggers a refetch.
   *
   * @param targetPage - The page to navigate to (1-indexed)
   */
  const goToPage = React.useCallback((targetPage: number) => {
    // Calculate max page based on current total
    const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));

    // Clamp to valid range
    const validPage = Math.min(Math.max(1, targetPage), maxPage);

    if (validPage === internalPage) {
      logger.debug('Page navigation skipped - same page', {
        requested: targetPage,
        current: internalPage,
      });
      return;
    }

    logger.info('Page navigation', {
      from: internalPage,
      to: validPage,
      totalPages: maxPage,
    });

    setInternalPage(validPage);
  }, [totalCount, pageSize, internalPage]);

  /**
   * Navigates to the next page if available.
   */
  const nextPage = React.useCallback(() => {
    if (pagination.hasNext) {
      goToPage(internalPage + 1);
    } else {
      logger.debug('Next page skipped - no more pages', {
        currentPage: internalPage,
        totalPages: pagination.totalPages,
      });
    }
  }, [pagination.hasNext, pagination.totalPages, internalPage, goToPage]);

  /**
   * Navigates to the previous page if available.
   */
  const prevPage = React.useCallback(() => {
    if (pagination.hasPrev) {
      goToPage(internalPage - 1);
    } else {
      logger.debug('Previous page skipped - already on first page', {
        currentPage: internalPage,
      });
    }
  }, [pagination.hasPrev, internalPage, goToPage]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Legacy loadMore (for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * @deprecated Use goToPage(pagination.page + 1) or nextPage() instead.
   * This is kept for backward compatibility but simply calls nextPage.
   */
  const loadMore = React.useCallback(async () => {
    logger.warn('loadMore() is deprecated - use nextPage() or goToPage() instead');
    nextPage();
  }, [nextPage]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Global Stats (separate from filtered contacts)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches global contact statistics from the dedicated stats endpoint.
   * This ensures accurate totals regardless of current filters.
   * Now includes sender type statistics (NEW Jan 2026).
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
          // Sender type stats (NEW Jan 2026)
          bySenderType: data.bySenderType || {
            direct: 0,
            broadcast: 0,
            cold_outreach: 0,
            opportunity: 0,
            unknown: 0,
          },
        });
        logger.debug('Global stats fetched', {
          total: data.total,
          bySenderType: data.bySenderType,
        });
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
  // Promote to Client (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Promotes a contact to client status by calling the promote API endpoint.
   * Updates local state optimistically, then calls the server endpoint.
   *
   * @param contactId - The ID of the contact to promote
   * @param clientData - Client-specific fields to set
   */
  const promoteToClient = React.useCallback(
    async (contactId: string, clientData: {
      clientStatus: 'active' | 'inactive' | 'archived';
      clientPriority: 'vip' | 'high' | 'medium' | 'low';
      emailDomains?: string[];
      keywords?: string[];
    }) => {
      logger.start('Promoting contact to client', {
        contactId: contactId.substring(0, 8),
        clientStatus: clientData.clientStatus,
        clientPriority: clientData.clientPriority,
      });

      try {
        const response = await fetch('/api/contacts/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId,
            clientStatus: clientData.clientStatus,
            clientPriority: clientData.clientPriority,
            emailDomains: clientData.emailDomains,
            keywords: clientData.keywords,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to promote contact');
        }

        const result = await response.json();
        const updatedContact = result.data || result;

        // Update local state with the server response
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, ...updatedContact } : c))
        );

        logger.success('Contact promoted to client', {
          contactId: contactId.substring(0, 8),
        });

        // Refresh stats to update client count
        fetchStats();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to promote contact to client', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        throw err;
      }
    },
    [fetchStats]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Update Client Fields (NEW Feb 2026 — Phase 3 Navigation Redesign)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Updates client-specific fields on a contact.
   * Uses optimistic update pattern with rollback on error.
   *
   * @param contactId - The ID of the contact to update
   * @param fields - Partial client fields to update
   */
  const updateClientFields = React.useCallback(
    async (contactId: string, fields: Partial<{
      client_status: string;
      client_priority: string;
      email_domains: string[];
      keywords: string[];
    }>) => {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) {
        logger.warn('Update client fields: Contact not found', {
          contactId: contactId.substring(0, 8),
        });
        return;
      }

      logger.start('Updating client fields', {
        contactId: contactId.substring(0, 8),
        fields: Object.keys(fields),
      });

      // Save original for rollback
      const originalContact = { ...contact };

      // Optimistic update
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, ...fields } : c))
      );

      try {
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', contactId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        logger.success('Client fields updated', {
          contactId: contactId.substring(0, 8),
        });
      } catch (err) {
        // Rollback on error
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Rolling back client fields update', { error: errorMessage });

        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? originalContact : c))
        );

        setError(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [supabase, contacts]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch contacts when filter options or page change
  React.useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Fetch global stats on mount and after certain actions
  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Reset to page 1 when filters change (but not when page changes)
  const filterKey = `${isVip}-${isMuted}-${relationshipType}-${senderType}-${broadcastSubtype}-${isClient}-${clientStatus}-${clientPriority}-${search}-${sortBy}-${sortOrder}`;
  const prevFilterKeyRef = React.useRef(filterKey);

  React.useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      logger.debug('Filters changed, resetting to page 1', {
        previousFilters: prevFilterKeyRef.current,
        newFilters: filterKey,
      });
      prevFilterKeyRef.current = filterKey;
      if (internalPage !== 1) {
        setInternalPage(1);
      }
    }
  }, [filterKey, internalPage]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Hook API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    contacts,
    isLoading,
    error,
    refetch: fetchContacts,

    // Pagination
    pagination,
    goToPage,
    nextPage,
    prevPage,

    // Legacy (deprecated)
    hasMore: pagination.hasNext,
    loadMore,

    // Stats and actions
    stats,
    refreshStats: fetchStats,
    toggleVip,
    toggleMuted,
    updateRelationship,

    // Client operations (NEW Feb 2026 — Phase 3 Navigation Redesign)
    promoteToClient,
    updateClientFields,
  };
}

export default useContacts;
