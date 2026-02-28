/**
 * useContactIntelligence — Fetches aggregated analyzer intelligence for a contact.
 *
 * Calls the /api/contacts/[id]/intelligence endpoint which computes:
 * - Relationship signal trend (positive/neutral/negative from recent emails)
 * - Common topics (aggregated from email topics)
 * - Extracted dates (birthdays, deadlines, events from their emails)
 * - Communication stats (email frequency per month for last 6 months)
 *
 * @module hooks/useContactIntelligence
 * @since February 2026 — Phase 1: Contact intelligence
 */

'use client';

import * as React from 'react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('useContactIntelligence');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Relationship trend data */
export interface RelationshipTrend {
  /** Dominant signal across recent emails */
  dominant: string;
  /** Counts per signal type */
  counts: Record<string, number>;
  /** Total emails analyzed */
  totalEmails: number;
}

/** Topic with occurrence count */
export interface TopicEntry {
  topic: string;
  count: number;
}

/** Extracted date item */
export interface ExtractedDateEntry {
  title: string;
  date: string;
  dateType: string;
  priorityScore: number;
}

/** Monthly email count */
export interface MonthlyStats {
  month: string;
  count: number;
}

/** Full intelligence data */
export interface ContactIntelligence {
  relationshipTrend: RelationshipTrend;
  commonTopics: TopicEntry[];
  extractedDates: ExtractedDateEntry[];
  communicationStats: MonthlyStats[];
}

/** Hook return type */
export interface UseContactIntelligenceReturn {
  data: ContactIntelligence | null;
  isLoading: boolean;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches aggregated intelligence for a specific contact.
 * Returns relationship trend, common topics, extracted dates, and communication stats.
 *
 * @param contactId - UUID of the contact to fetch intelligence for
 */
export function useContactIntelligence(contactId: string | null): UseContactIntelligenceReturn {
  const [data, setData] = React.useState<ContactIntelligence | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!contactId) return;

    let cancelled = false;

    async function fetchIntelligence() {
      logger.start('Fetching contact intelligence', { contactId });
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/contacts/${contactId}/intelligence`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        if (!cancelled) {
          setData(json.data ?? json);
          logger.success('Contact intelligence fetched', {
            contactId,
            hasTopics: (json.data?.commonTopics?.length ?? 0) > 0,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) {
          setError(message);
          logger.error('Failed to fetch contact intelligence', { contactId, error: message });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchIntelligence();

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return { data, isLoading, error };
}
