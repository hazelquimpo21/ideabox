/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * QuickActionButtons Component
 *
 * Small inline buttons that appear on hover over inbox rows for quick actions.
 * Reply opens Gmail compose, Done marks action as completed, Archive archives the email.
 *
 * Only shown for actionable emails (urgency_score >= 7 OR reply_worthiness = 'must_reply').
 *
 * @module components/email/QuickActionButtons
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { MessageSquare, Check, Archive } from 'lucide-react';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('QuickActionButtons');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface QuickActionButtonsProps {
  /** Email ID for API calls */
  emailId: string;
  /** Sender email for compose URL */
  senderEmail: string;
  /** Email subject for compose URL */
  subject: string | null;
  /** Callback after archive action */
  onArchive?: (emailId: string) => void;
  /** Callback after done action */
  onDone?: (emailId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * QuickActionButtons — compact action buttons for inbox rows.
 *
 * Positioned to appear on hover over the row. Each button prevents
 * event propagation so clicks don't open the email.
 */
export function QuickActionButtons({
  emailId,
  senderEmail,
  subject,
  onArchive,
  onDone,
}: QuickActionButtonsProps) {
  const supabase = React.useMemo(() => createClient(), []);

  /** Reply — opens Gmail compose in a new tab */
  const handleReply = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const composeUrl = `https://mail.google.com/mail/?compose=new&to=${encodeURIComponent(senderEmail)}&su=${encodeURIComponent('Re: ' + (subject || ''))}`;
    window.open(composeUrl, '_blank');
    logger.debug('Quick action: reply', { emailId });
  }, [emailId, senderEmail, subject]);

  /** Done — marks the email's action as completed */
  const handleDone = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    logger.debug('Quick action: done', { emailId });

    try {
      // Find and complete the action for this email
      const { data: actions } = await supabase
        .from('actions')
        .select('id')
        .eq('email_id', emailId)
        .neq('status', 'completed')
        .limit(1);

      if (actions && actions.length > 0) {
        await supabase
          .from('actions')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', actions[0].id);
        logger.success('Action completed', { emailId, actionId: actions[0].id });
      }

      onDone?.(emailId);
    } catch (err) {
      logger.error('Failed to complete action', { emailId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }, [emailId, supabase, onDone]);

  /** Archive — archives the email */
  const handleArchive = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    logger.debug('Quick action: archive', { emailId });

    try {
      await supabase
        .from('emails')
        .update({ is_archived: true })
        .eq('id', emailId);

      logger.success('Email archived', { emailId });
      onArchive?.(emailId);
    } catch (err) {
      logger.error('Failed to archive email', { emailId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }, [emailId, supabase, onArchive]);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleReply}
        title="Reply"
        aria-label="Reply to email"
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleDone}
        title="Mark as done"
        aria-label="Mark action as done"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleArchive}
        title="Archive"
        aria-label="Archive email"
      >
        <Archive className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default QuickActionButtons;
