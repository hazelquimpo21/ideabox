/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useCategoryPreviews Hook
 *
 * Fetches a preview summary for each email category in a single efficient
 * query. Powers the Category Overview tab — one card per category with
 * count, unread count, top 3 emails, and top senders.
 *
 * @module hooks/useCategoryPreviews
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { useAuth } from '@/lib/auth/auth-context';
import { EMAIL_CATEGORIES } from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useCategoryPreviews');

/** Fields to fetch per email — lightweight for preview cards */
const PREVIEW_FIELDS = 'id, subject, sender_name, sender_email, date, gist, is_read, priority_score, quick_action' as const;

/** Max emails to fetch per category for preview */
const EMAILS_PER_CATEGORY = 3;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryPreview {
  category: EmailCategory;
  totalCount: number;
  unreadCount: number;
  topEmails: Pick<Email, 'id' | 'subject' | 'sender_name' | 'sender_email' | 'date' | 'gist' | 'is_read' | 'priority_score' | 'quick_action'>[];
  topSenders: { name: string; email: string; count: number }[];
  avgPriority: number;
}

export interface UseCategoryPreviewsReturn {
  previews: CategoryPreview[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useCategoryPreviews(): UseCategoryPreviewsReturn {
  const { user } = useAuth();
  const supabase = React.useMemo(() => createClient(), []);

  const [previews, setPreviews] = React.useState<CategoryPreview[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchPreviews = React.useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      logger.info('Fetching category previews');

      // Fetch all non-archived emails with category assigned — one query
      const { data: allEmails, error: fetchError } = await supabase
        .from('emails')
        .select(PREVIEW_FIELDS)
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .not('category', 'is', null)
        .order('date', { ascending: false })
        .limit(500);

      if (fetchError) throw fetchError;

      // Group by category client-side
      const grouped = new Map<EmailCategory, typeof allEmails>();
      for (const cat of EMAIL_CATEGORIES) {
        grouped.set(cat, []);
      }

      for (const email of allEmails || []) {
        const cat = email.category as EmailCategory;
        if (grouped.has(cat)) {
          grouped.get(cat)!.push(email);
        }
      }

      // Build preview for each category
      const results: CategoryPreview[] = [];
      for (const [category, emails] of grouped) {
        if (emails.length === 0) continue;

        // Top 3 most recent emails
        const topEmails = emails.slice(0, EMAILS_PER_CATEGORY);

        // Count unread
        const unreadCount = emails.filter(e => !e.is_read).length;

        // Top senders by frequency
        const senderCounts = new Map<string, { name: string; email: string; count: number }>();
        for (const e of emails) {
          const key = e.sender_email;
          const existing = senderCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            senderCounts.set(key, {
              name: e.sender_name || e.sender_email.split('@')[0],
              email: e.sender_email,
              count: 1,
            });
          }
        }
        const topSenders = Array.from(senderCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        // Average priority
        const priorities = emails
          .map(e => e.priority_score)
          .filter((p): p is number => p !== null && p !== undefined);
        const avgPriority = priorities.length > 0
          ? Math.round(priorities.reduce((a, b) => a + b, 0) / priorities.length)
          : 0;

        results.push({
          category,
          totalCount: emails.length,
          unreadCount,
          topEmails,
          topSenders,
          avgPriority,
        });
      }

      // Sort by total count descending
      results.sort((a, b) => b.totalCount - a.totalCount);

      logger.info('Category previews fetched', { categories: results.length });
      setPreviews(results);
    } catch (err) {
      logger.error('Failed to fetch category previews', { error: String(err) });
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchPreviews();
  }, [fetchPreviews]);

  return { previews, isLoading, error, refetch: fetchPreviews };
}

export default useCategoryPreviews;
