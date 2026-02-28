/**
 * useEmailStyleIdeas Hook
 *
 * Fetches email style/design ideas from the `/api/style-ideas` endpoint.
 * Returns observations about layout, tone, CTA, subject lines, etc.
 * extracted from incoming emails by the ContentDigest analyzer.
 *
 * @module hooks/useEmailStyleIdeas
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useEmailStyleIdeas');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A single style idea from the API */
export interface StyleIdea {
  idea: string;
  type: string;
  whyItWorks: string;
  confidence: number;
  sourceEmail: {
    id: string;
    subject: string | null;
    senderName: string | null;
    date: string;
  };
}

/** Options for the hook */
export interface UseEmailStyleIdeasOptions {
  /** Filter by style type */
  type?: string;
  /** Skip fetching (for conditional loading) */
  skip?: boolean;
}

/** Return type from the hook */
export interface UseEmailStyleIdeasReturn {
  ideas: StyleIdea[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch email style ideas from the API.
 *
 * @param options - Optional type filter and skip flag
 * @returns Style ideas, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { ideas, isLoading } = useEmailStyleIdeas({ type: 'layout' });
 * ```
 */
export function useEmailStyleIdeas(options: UseEmailStyleIdeasOptions = {}): UseEmailStyleIdeasReturn {
  const { type, skip = false } = options;
  const [ideas, setIdeas] = React.useState<StyleIdea[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchIdeas = React.useCallback(async () => {
    if (skip) return;

    setIsLoading(true);
    setError(null);
    logger.start('Fetching style ideas', { type });

    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);

      const response = await fetch(`/api/style-ideas?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setIdeas(data.ideas || []);
      logger.success('Style ideas fetched', { count: data.ideas?.length || 0 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch style ideas', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [type, skip]);

  React.useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  return { ideas, isLoading, error, refetch: fetchIdeas };
}

export default useEmailStyleIdeas;
