/**
 * Inbox Category Detail Page — Emails in a Single Category
 *
 * Displays all emails for a specific category with filtering and actions.
 * Route: /inbox/[category]
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIX (February 2026) — Performance Audit P1-A
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Previously this page imported from the deleted `discover/[category]/page`
 * which caused a build-time error. Now uses an inline component that fetches
 * emails with `useEmails({ category })` directly.
 *
 * Dynamic Params:
 *   - category: Email category slug (e.g., 'client_pipeline', 'newsletters_general')
 *
 * @module app/(auth)/inbox/[category]/page
 * @since February 2026
 * @see INBOX_PERFORMANCE_AUDIT.md — P1-A
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Inbox } from 'lucide-react';
import { Button, Badge, Skeleton } from '@/components/ui';
import { useEmails } from '@/hooks';
import { ModalEmailItem } from '@/components/discover/ModalEmailItem';
import {
  type EmailCategory,
  CATEGORY_DISPLAY,
  EMAIL_CATEGORIES_SET,
} from '@/types/discovery';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxCategoryPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox category detail page — shows all emails for a single category.
 *
 * Uses `useEmails` hook with the category filter to fetch emails.
 * Supports star/archive actions with optimistic updates.
 */
export default function InboxCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const category = params.category as string;
  const supabase = React.useMemo(() => createClient(), []);

  const isValidCategory = EMAIL_CATEGORIES_SET.has(category);
  const categoryDisplay = isValidCategory
    ? CATEGORY_DISPLAY[category as EmailCategory]
    : null;

  logger.info('Rendering category page', { category, isValid: isValidCategory });

  const {
    emails,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    stats,
    updateEmail,
  } = useEmails({
    category: isValidCategory ? (category as EmailCategory) : undefined,
    limit: 50,
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    router.push('/inbox');
  };

  const handleEmailClick = (email: Email) => {
    logger.info('Navigating to email detail', { emailId: email.id, category });
    router.push(`/inbox/${category}/${email.id}`);
  };

  const handleToggleStar = async (email: Email) => {
    const newStarred = !email.is_starred;
    updateEmail(email.id, { is_starred: newStarred });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', email.id);

      if (updateError) throw updateError;
      logger.success('Star toggled', { emailId: email.id, isStarred: newStarred });
    } catch (err) {
      // Revert optimistic update
      updateEmail(email.id, { is_starred: !newStarred });
      logger.error('Failed to toggle star', { emailId: email.id, error: String(err) });
    }
  };

  const handleArchive = async (email: Email) => {
    updateEmail(email.id, { is_archived: true });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', email.id);

      if (updateError) throw updateError;
      logger.success('Email archived', { emailId: email.id });
    } catch (err) {
      updateEmail(email.id, { is_archived: false });
      logger.error('Failed to archive', { emailId: email.id, error: String(err) });
    }
  };

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div>
        <Button variant="ghost" onClick={handleBack} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Inbox
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-destructive mb-4">{error.message}</p>
          <Button variant="outline" onClick={refetch}>Try Again</Button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Filter out archived emails from the display
  const visibleEmails = emails.filter((e) => !e.is_archived);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryDisplay?.icon || '📧'}</span>
            <div>
              <h1 className="text-xl font-semibold">
                {categoryDisplay?.label || category.replace(/_/g, ' ')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {stats.total} email{stats.total !== 1 ? 's' : ''}
                {stats.unread > 0 && ` · ${stats.unread} unread`}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Email List */}
      {visibleEmails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No emails in this category</h3>
          <p className="text-muted-foreground">
            Emails categorized as {categoryDisplay?.label || category} will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleEmails.map((email) => (
            <ModalEmailItem
              key={email.id}
              email={email}
              onClick={() => handleEmailClick(email)}
              onToggleStar={() => handleToggleStar(email)}
              onArchive={() => handleArchive(email)}
            />
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
