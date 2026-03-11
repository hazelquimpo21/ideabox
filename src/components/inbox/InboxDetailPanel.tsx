/**
 * InboxDetailPanel — right panel in the split-panel inbox.
 *
 * Fetches the full email (including body_html/body_text) when a new
 * selectedEmailId is received. Fires useEmailAnalysis and useExtractedDates
 * in parallel to eliminate request waterfalls.
 *
 * Replaces EmailDetailModal — same data-fetching logic, rendered inline
 * instead of inside a Dialog overlay.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Parent (InboxSplitLayout) passes selectedEmailId
 *     → This component fetches full email from Supabase
 *     → useEmailAnalysis(emailId) fires in parallel
 *     → useExtractedDates({ emailId }) fires in parallel
 *     → Renders EmailDetail with all data as props
 *     → Action callbacks (star/archive/read) call onEmailUpdated
 *       so the parent list reflects changes optimistically
 *
 * @module components/inbox/InboxDetailPanel
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailDetail } from '@/components/email/EmailDetail';
import { InboxDetailEmpty } from './InboxDetailEmpty';
import { InboxDetailToolbar } from './InboxDetailToolbar';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import { useExtractedDates } from '@/hooks/useExtractedDates';
import { cn } from '@/lib/utils/cn';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxDetailPanel');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxDetailPanelProps {
  /** The email ID to display (null = show empty state) */
  selectedEmailId: string | null;
  /** Callback when an email is updated (star, archive, read) for optimistic list updates */
  onEmailUpdated?: (emailId: string, updates: Partial<Email>) => void;
  /** Mobile: callback to go back to the list view */
  onClose?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxDetailPanel({
  selectedEmailId,
  onEmailUpdated,
  onClose,
  className,
}: InboxDetailPanelProps) {
  const supabase = React.useMemo(() => createClient(), []);

  const [email, setEmail] = React.useState<Email | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  // ─── Hoisted analysis hooks — fire in parallel with email fetch ────────────

  const {
    analysis,
    isLoading: isLoadingAnalysis,
    refetch: refetchAnalysis,
  } = useEmailAnalysis(selectedEmailId);

  const {
    dates: extractedDates,
  } = useExtractedDates(selectedEmailId ? { emailId: selectedEmailId } : {});

  // ─── Fetch full email data when selectedEmailId changes ────────────────────

  React.useEffect(() => {
    if (!selectedEmailId) {
      setEmail(null);
      setError(null);
      return;
    }

    let isMounted = true;

    async function fetchEmail() {
      setIsLoading(true);
      setError(null);
      logger.start('Fetching email for detail panel', { emailId: selectedEmailId });

      try {
        const { data, error: queryError } = await supabase
          .from('emails')
          .select('*')
          .eq('id', selectedEmailId)
          .single();

        if (!isMounted) return;

        if (queryError) {
          if (queryError.code === 'PGRST116') {
            throw new Error('Email not found');
          }
          throw new Error(queryError.message);
        }

        setEmail(data);
        logger.success('Email loaded in detail panel', {
          emailId: selectedEmailId,
          subject: data?.subject,
        });

        // Mark as read if unread
        if (data && !data.is_read) {
          logger.info('Marking email as read', { emailId: selectedEmailId });
          await supabase
            .from('emails')
            .update({ is_read: true })
            .eq('id', selectedEmailId);

          if (isMounted) {
            setEmail((prev) => (prev ? { ...prev, is_read: true } : null));
            onEmailUpdated?.(selectedEmailId, { is_read: true });
          }
        }
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load email';
        setError(message);
        logger.error('Failed to fetch email', { emailId: selectedEmailId, error: message });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchEmail();
    return () => { isMounted = false; };
  }, [selectedEmailId, supabase, onEmailUpdated]);

  // ─── Action Handlers (optimistic updates) ─────────────────────────────────

  const handleStar = React.useCallback(async (_emailId?: string) => {
    if (!email || !selectedEmailId) return;

    const newStarred = !email.is_starred;
    setEmail((prev) => (prev ? { ...prev, is_starred: newStarred } : null));
    onEmailUpdated?.(selectedEmailId, { is_starred: newStarred });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_starred: newStarred })
        .eq('id', selectedEmailId);

      if (updateError) throw updateError;
      logger.info('Star toggled', { emailId: selectedEmailId, isStarred: newStarred });
    } catch (err) {
      setEmail((prev) => (prev ? { ...prev, is_starred: !newStarred } : null));
      onEmailUpdated?.(selectedEmailId, { is_starred: !newStarred });
      logger.error('Failed to toggle star', { error: String(err) });
    }
  }, [email, selectedEmailId, supabase, onEmailUpdated]);

  const handleArchive = React.useCallback(async (_emailId?: string) => {
    if (!email || !selectedEmailId) return;

    logger.info('Email archived from detail panel', { emailId: selectedEmailId });
    onEmailUpdated?.(selectedEmailId, { is_archived: true });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', selectedEmailId);

      if (updateError) throw updateError;
      logger.success('Email archived', { emailId: selectedEmailId });
    } catch (err) {
      onEmailUpdated?.(selectedEmailId, { is_archived: false });
      logger.error('Failed to archive', { error: String(err) });
    }
  }, [email, selectedEmailId, supabase, onEmailUpdated]);

  const handleToggleRead = React.useCallback(async (_emailId?: string) => {
    if (!email || !selectedEmailId) return;

    const newRead = !email.is_read;
    setEmail((prev) => (prev ? { ...prev, is_read: newRead } : null));
    onEmailUpdated?.(selectedEmailId, { is_read: newRead });

    try {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ is_read: newRead })
        .eq('id', selectedEmailId);

      if (updateError) throw updateError;
      logger.info('Read status toggled', { emailId: selectedEmailId, isRead: newRead });
    } catch (err) {
      setEmail((prev) => (prev ? { ...prev, is_read: !newRead } : null));
      onEmailUpdated?.(selectedEmailId, { is_read: !newRead });
      logger.error('Failed to toggle read', { error: String(err) });
    }
  }, [email, selectedEmailId, supabase, onEmailUpdated]);

  const handleAnalyze = React.useCallback(async (_emailId?: string) => {
    if (!selectedEmailId) return;

    setIsAnalyzing(true);
    logger.info('Re-analyzing email', { emailId: selectedEmailId });

    try {
      const response = await fetch(`/api/emails/${selectedEmailId}/analyze`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Analysis failed');

      const { data } = await supabase
        .from('emails')
        .select('*')
        .eq('id', selectedEmailId)
        .single();

      if (data) setEmail(data);
      await refetchAnalysis();
      logger.success('Email re-analyzed', { emailId: selectedEmailId });
    } catch (err) {
      logger.error('Failed to analyze', { error: String(err) });
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedEmailId, supabase, refetchAnalysis]);

  // ─── Build full-page URL ──────────────────────────────────────────────────

  const fullPageUrl = selectedEmailId && email?.category
    ? `/inbox/${email.category}/${selectedEmailId}`
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  // No email selected → empty state
  if (!selectedEmailId) {
    return (
      <div className={cn('flex-1 bg-background', className)}>
        <InboxDetailEmpty />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex-1 bg-background p-6 space-y-4', className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex-1 bg-background flex items-center justify-center', className)}>
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Email loaded
  if (email) {
    return (
      <div className={cn('flex-1 bg-background flex flex-col overflow-hidden', className)}>
        {/* Action toolbar */}
        <InboxDetailToolbar
          email={email}
          onStar={handleStar}
          onArchive={handleArchive}
          onToggleRead={handleToggleRead}
          onClose={onClose}
          fullPageUrl={fullPageUrl}
        />

        {/* Email content (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          <EmailDetail
            email={email}
            onStar={handleStar}
            onArchive={handleArchive}
            onToggleRead={handleToggleRead}
            onAnalyze={handleAnalyze}
            isAnalyzing={isAnalyzing}
            analysis={analysis}
            isLoadingAnalysis={isLoadingAnalysis}
            extractedDates={extractedDates}
            refetchAnalysis={refetchAnalysis}
          />
        </div>
      </div>
    );
  }

  return null;
}

export default InboxDetailPanel;
