/**
 * useRelatedItems — fetches cross-entity related items for navigation.
 *
 * Given an anchor (emailId, contactId, or projectId), calls the
 * GET /api/related endpoint and returns a deduplicated list of
 * related items across emails, tasks, events, contacts, and links.
 *
 * @module hooks/useRelatedItems
 * @since March 2026 — Phase 2 Cross-Entity Navigation
 */

'use client';

import * as React from 'react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useRelatedItems');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Unified related item shape (mirrors API response) */
export interface RelatedItem {
  type: 'email' | 'task' | 'event' | 'deadline' | 'contact' | 'link' | 'idea';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  status?: string;
}

export interface UseRelatedItemsOptions {
  emailId?: string;
  contactId?: string;
  projectId?: string;
}

export interface UseRelatedItemsReturn {
  items: RelatedItem[];
  isLoading: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches related items for cross-entity navigation.
 *
 * @example
 * const { items, isLoading } = useRelatedItems({ emailId: email.id });
 * const { items, isLoading } = useRelatedItems({ contactId: contact.id });
 */
export function useRelatedItems({ emailId, contactId, projectId }: UseRelatedItemsOptions): UseRelatedItemsReturn {
  const [items, setItems] = React.useState<RelatedItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Build stable cache key from anchor params
  const anchorKey = emailId || contactId || projectId || '';

  React.useEffect(() => {
    if (!anchorKey) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function fetchRelated() {
      setIsLoading(true);
      try {
        // Build query params based on which anchor is provided
        const params = new URLSearchParams();
        if (emailId) params.set('emailId', emailId);
        if (contactId) params.set('contactId', contactId);

        const response = await fetch(`/api/related?${params.toString()}`);
        if (!response.ok) {
          logger.error('Failed to fetch related items', { status: response.status });
          return;
        }

        const json = await response.json();
        if (!cancelled && json.success && json.data?.items) {
          logger.info('Related items loaded', { count: json.data.items.length, anchor: anchorKey.substring(0, 8) });
          setItems(json.data.items);
        }
      } catch (err) {
        logger.error('Error fetching related items', { error: String(err) });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchRelated();

    return () => {
      cancelled = true;
    };
  }, [anchorKey, emailId, contactId]);

  return { items, isLoading };
}
