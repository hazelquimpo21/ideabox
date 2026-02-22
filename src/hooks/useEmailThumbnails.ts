/**
 * useEmailThumbnails Hook
 *
 * Fetches and extracts the first meaningful image URL from email HTML bodies.
 * Used by the card view to display image thumbnails for emails that contain
 * visual content (newsletters, promotions, etc.).
 *
 * Performance considerations:
 * - Only fetches body_html when explicitly called (not on mount)
 * - Limits batch size to avoid large payloads
 * - Filters out tracking pixels, spacers, and tiny images
 * - Caches results to avoid re-fetching
 *
 * @module hooks/useEmailThumbnails
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useEmailThumbnails');

/** Maximum emails to fetch thumbnails for in a single batch */
const BATCH_SIZE = 20;

/**
 * Minimum image dimension to consider as a "real" image (not a tracking pixel).
 * Images with explicit width/height below this are filtered out.
 */
const MIN_IMAGE_SIZE = 40;

/**
 * Patterns that indicate tracking pixels or invisible images.
 * These are filtered out when looking for thumbnail candidates.
 */
const TRACKING_PATTERNS = [
  /open\./i,
  /track/i,
  /pixel/i,
  /beacon/i,
  /1x1/i,
  /spacer/i,
  /blank\./i,
  /transparent/i,
  /unsubscribe/i,
  /list-manage/i,
];

/**
 * Extracts the first meaningful image URL from an HTML string.
 * Filters out tracking pixels, spacers, and tiny images.
 */
function extractFirstImageUrl(html: string): string | null {
  if (!html) return null;

  // Match <img> tags with src attribute
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    const fullTag = match[0];

    // Skip data URIs (usually tiny icons or spacers)
    if (src.startsWith('data:')) continue;

    // Skip tracking pixel patterns
    if (TRACKING_PATTERNS.some((pattern) => pattern.test(src))) continue;

    // Check for explicit small dimensions in the tag
    const widthMatch = fullTag.match(/width=["']?(\d+)/i);
    const heightMatch = fullTag.match(/height=["']?(\d+)/i);

    if (widthMatch && parseInt(widthMatch[1], 10) < MIN_IMAGE_SIZE) continue;
    if (heightMatch && parseInt(heightMatch[1], 10) < MIN_IMAGE_SIZE) continue;

    // Skip common icon/social media button patterns
    if (/\.(ico|svg)$/i.test(src)) continue;
    if (/social|facebook|twitter|linkedin|instagram|icon/i.test(src)) continue;

    // Found a candidate — return it
    return src;
  }

  return null;
}

/**
 * Hook return type for useEmailThumbnails.
 */
export interface UseEmailThumbnailsReturn {
  /** Map of email ID to thumbnail image URL */
  thumbnails: Map<string, string>;
  /** Whether thumbnails are currently loading */
  isLoading: boolean;
}

/**
 * Hook that fetches and extracts thumbnail images from email HTML bodies.
 *
 * @param emailIds - Array of email IDs to extract thumbnails for
 * @param enabled - Whether to fetch thumbnails (set to false in list mode)
 * @returns Map of email ID to first image URL found in the email body
 */
export function useEmailThumbnails(
  emailIds: string[],
  enabled: boolean = true,
): UseEmailThumbnailsReturn {
  const [thumbnails, setThumbnails] = React.useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = React.useState(false);

  // Cache already-fetched IDs to avoid re-fetching
  const fetchedIdsRef = React.useRef<Set<string>>(new Set());

  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (!enabled || emailIds.length === 0) return;

    // Only fetch IDs we haven't already fetched
    const newIds = emailIds.filter((id) => !fetchedIdsRef.current.has(id));
    if (newIds.length === 0) return;

    // Limit batch size
    const batchIds = newIds.slice(0, BATCH_SIZE);

    let cancelled = false;

    async function fetchThumbnails() {
      setIsLoading(true);
      logger.debug('Fetching thumbnails', { count: batchIds.length });

      try {
        const { data, error } = await supabase
          .from('emails')
          .select('id, body_html')
          .in('id', batchIds);

        if (error) {
          logger.warn('Failed to fetch email bodies for thumbnails', {
            error: error.message,
          });
          return;
        }

        if (cancelled) return;

        const newThumbnails = new Map<string, string>();

        for (const email of data || []) {
          fetchedIdsRef.current.add(email.id);

          if (email.body_html) {
            const imageUrl = extractFirstImageUrl(email.body_html);
            if (imageUrl) {
              newThumbnails.set(email.id, imageUrl);
            }
          }
        }

        if (newThumbnails.size > 0) {
          logger.debug('Extracted thumbnails', { count: newThumbnails.size });
          setThumbnails((prev) => {
            const merged = new Map(prev);
            for (const [id, url] of newThumbnails) {
              merged.set(id, url);
            }
            return merged;
          });
        }
      } catch (err) {
        logger.warn('Error fetching thumbnails', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchThumbnails();

    return () => {
      cancelled = true;
    };
  }, [emailIds.join(','), enabled, supabase]);

  return { thumbnails, isLoading };
}

export default useEmailThumbnails;
