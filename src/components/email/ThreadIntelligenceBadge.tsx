/**
 * ThreadIntelligenceBadge Component
 *
 * Small inline badge showing aggregated thread intelligence.
 * Only renders for threads with > 1 email.
 * Shows email count, action count, and nearest deadline.
 *
 * Performance: Uses cached thread data from useThreadIntelligence.
 * Only fetches on hover to avoid N+1 for every row.
 *
 * @module components/email/ThreadIntelligenceBadge
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { MessageSquareMore, CheckSquare, Calendar } from 'lucide-react';
import { useThreadIntelligence } from '@/hooks/useThreadIntelligence';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ThreadIntelligenceBadge');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ThreadIntelligenceBadgeProps {
  /** Gmail thread_id */
  threadId: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ThreadIntelligenceBadge — compact badge showing thread-level intelligence.
 *
 * Only fetches and renders when threadId is provided.
 * Shows: "3 msgs · 2 actions · deadline Mar 3"
 */
export function ThreadIntelligenceBadge({ threadId }: ThreadIntelligenceBadgeProps) {
  const thread = useThreadIntelligence(threadId);

  // Don't render for single-email threads or while loading
  if (!threadId || thread.emailCount <= 1) {
    return null;
  }

  // Format deadline
  const deadlineText = thread.latestDeadline
    ? formatDeadline(thread.latestDeadline)
    : null;

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
      <MessageSquareMore className="h-2.5 w-2.5" />
      <span>{thread.emailCount} msgs</span>
      {thread.actionCount > 0 && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <CheckSquare className="h-2.5 w-2.5" />
          <span>{thread.actionCount} action{thread.actionCount !== 1 ? 's' : ''}</span>
        </>
      )}
      {deadlineText && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <Calendar className="h-2.5 w-2.5" />
          <span>{deadlineText}</span>
        </>
      )}
    </span>
  );
}

/**
 * Formats a deadline date for compact display.
 */
function formatDeadline(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'overdue';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default ThreadIntelligenceBadge;
