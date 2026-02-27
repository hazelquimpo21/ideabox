/**
 * useLinks Hook
 *
 * Fetches analyzed links from email content and provides actions
 * for saving/dismissing links.
 *
 * NEW (Feb 2026): Deep URL intelligence from email analysis.
 * Links are analyzed by the LinkAnalyzer and stored in
 * email_analyses.url_extraction. This hook reads them via the Links API.
 *
 * LINK PRIORITIES:
 * - must_read:      Directly relevant to user's active interests/projects
 * - worth_reading:  Tangentially interesting, broadens perspective
 * - reference:      Useful documentation/tools to have on hand
 * - skip:           Tracking pixels, generic footers (hidden by default)
 *
 * @module hooks/useLinks
 * @since February 2026
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useLinks');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single analyzed link from email analysis.
 */
export interface LinkItem {
  /** The URL */
  url: string;
  /** Link type: article, registration, document, video, etc. */
  type: string;
  /** Title or label for the link */
  title: string;
  /** Brief description of why this link matters */
  description: string;
  /** Whether this is the main content link of the email */
  isMainContent: boolean;
  /** Priority: must_read, worth_reading, reference, skip */
  priority: string;
  /** Topic tags for filtering (1-3 short tags) */
  topics: string[];
  /** Whether worth bookmarking */
  saveWorthy: boolean;
  /** Expiration date if time-limited (ISO date string) */
  expires: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source email ID */
  emailId: string;
  /** Source email subject (for context) */
  emailSubject: string | null;
  /** Source email sender name/email */
  emailSender: string | null;
  /** When the email was analyzed (ISO string) */
  analyzedAt: string;
}

/**
 * Statistics about analyzed links.
 */
export interface LinksStats {
  totalLinks: number;
  savedLinks: number;
  saveWorthyCount: number;
  expiringCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  topTopics: string[];
  avgConfidence: number;
}

/**
 * Options for the hook.
 */
export interface UseLinksOptions {
  /** Number of emails to check for links (default: 15) */
  limit?: number;
  /** Filter by priority (e.g., 'must_read') */
  priority?: string;
  /** Filter by link type (e.g., 'article') */
  type?: string;
  /** Filter by topic tag */
  topic?: string;
  /** Only return save-worthy links */
  saveWorthyOnly?: boolean;
  /** Minimum confidence threshold (default: 0.3) */
  minConfidence?: number;
  /** Auto-refresh interval in ms (0 = disabled, default: 0) */
  refreshInterval?: number;
  /** Skip initial fetch */
  skip?: boolean;
}

/**
 * Return type for the hook.
 */
export interface UseLinksReturn {
  /** Analyzed link items */
  items: LinkItem[];
  /** Statistics */
  stats: LinksStats | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually refetch links */
  refetch: () => Promise<void>;
  /** Save a link to the saved_links table */
  saveLink: (link: LinkItem) => Promise<void>;
  /** Dismiss a link (remove from list) */
  dismissLink: (link: LinkItem) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch and manage analyzed links from email content.
 *
 * @param options - Configuration options
 * @returns Link items with loading/error states and actions
 *
 * @example
 * ```tsx
 * const { items, stats, isLoading, saveLink, dismissLink } = useLinks({
 *   limit: 15,
 *   priority: 'must_read',
 * });
 *
 * return items.map(link => (
 *   <LinkCard
 *     key={link.url}
 *     link={link}
 *     onSave={() => saveLink(link)}
 *     onDismiss={() => dismissLink(link)}
 *   />
 * ));
 * ```
 */
export function useLinks(options: UseLinksOptions = {}): UseLinksReturn {
  const {
    limit = 15,
    priority,
    type,
    topic,
    saveWorthyOnly = false,
    minConfidence = 0.3,
    refreshInterval = 0,
    skip = false,
  } = options;

  const [items, setItems] = useState<LinkItem[]>([]);
  const [stats, setStats] = useState<LinksStats | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch analyzed links from the API.
   */
  const fetchLinks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      logger.debug('Fetching analyzed links', { limit, priority, type, topic, saveWorthyOnly, minConfidence });

      // Build query parameters
      const params = new URLSearchParams({ limit: String(limit) });
      if (priority) params.set('priority', priority);
      if (type) params.set('type', type);
      if (topic) params.set('topic', topic);
      if (saveWorthyOnly) params.set('save_worthy', 'true');
      if (minConfidence !== 0.3) params.set('min_confidence', String(minConfidence));

      const response = await fetch(`/api/links?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch links');
      }

      const result = await response.json();

      setItems(result.items || []);
      setStats(result.stats || null);

      logger.debug('Links fetched', {
        linkCount: result.items?.length ?? 0,
        mustReadCount: result.stats?.byPriority?.must_read ?? 0,
        savedCount: result.stats?.savedLinks ?? 0,
      });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Unknown error');
      logger.error('Links fetch failed', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [limit, priority, type, topic, saveWorthyOnly, minConfidence]);

  /**
   * Save a link to the saved_links table.
   * Removes it from the current list (it's now "saved").
   */
  const saveLink = useCallback(async (link: LinkItem) => {
    logger.info('Saving link', {
      type: link.type,
      priority: link.priority,
      emailId: link.emailId.substring(0, 8),
      titlePreview: link.title.substring(0, 40),
    });

    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: link.url,
          title: link.title,
          description: link.description,
          linkType: link.type,
          priority: link.priority,
          topics: link.topics,
          confidence: link.confidence,
          expiresAt: link.expires,
          emailId: link.emailId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save link');
      }

      // Remove from current list and update stats
      setItems(prev => prev.filter(l => l.url !== link.url));
      setStats(prev => prev ? {
        ...prev,
        savedLinks: prev.savedLinks + 1,
        totalLinks: prev.totalLinks - 1,
      } : prev);

      logger.success('Link saved', { type: link.type, priority: link.priority });
    } catch (err) {
      logger.error('Save link failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }, []);

  /**
   * Dismiss a link — removes it from the current view.
   * Does NOT persist the dismissal (links regenerate on refresh).
   */
  const dismissLink = useCallback((link: LinkItem) => {
    logger.debug('Dismissing link', { type: link.type, url: link.url.substring(0, 40) });
    setItems(prev => prev.filter(l => l.url !== link.url));
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!skip) {
      fetchLinks();
    }
  }, [skip, fetchLinks]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval > 0 && !skip) {
      const interval = setInterval(fetchLinks, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, skip, fetchLinks]);

  return {
    items,
    stats,
    isLoading,
    error,
    refetch: fetchLinks,
    saveLink,
    dismissLink,
  };
}

export default useLinks;
