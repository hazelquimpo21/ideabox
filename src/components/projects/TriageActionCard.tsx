/**
 * Triage Action Card
 *
 * Renders a single email-extracted action suggestion in the triage list.
 * Based on the ActionSuggestion pattern from TriageTray.tsx, with an
 * added Snooze button between Accept and Dismiss.
 *
 * @module components/projects/TriageActionCard
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  CheckSquare,
  Mail,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  X,
  AlarmClock,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { TriageItem } from '@/hooks/useTriageItems';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TriageActionCard');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  respond: { label: 'Reply', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  review: { label: 'Review', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  create: { label: 'Create', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  schedule: { label: 'Schedule', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  decide: { label: 'Decide', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  pay: { label: 'Pay', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  submit: { label: 'Submit', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  register: { label: 'Register', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  book: { label: 'Book', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  follow_up: { label: 'Follow up', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

/**
 * Format a deadline string into a human-readable label with urgency flag.
 */
function formatDeadline(dateStr: string): { text: string; isUrgent: boolean } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', isUrgent: true };
  if (diffDays === 0) return { text: 'Today', isUrgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `${diffDays}d`, isUrgent: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isUrgent: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for TriageActionCard.
 *
 * @module components/projects/TriageActionCard
 * @since March 2026
 */
export interface TriageActionCardProps {
  item: TriageItem;
  onAccept: (item: TriageItem) => void;
  onDismiss: (item: TriageItem) => void;
  onSnooze: (item: TriageItem) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action suggestion card for the triage list.
 * Displays action title, type badge, deadline, source email link,
 * and Accept / Snooze / Dismiss action buttons.
 *
 * @module components/projects/TriageActionCard
 * @since March 2026
 */
export function TriageActionCard({ item, onAccept, onDismiss, onSnooze }: TriageActionCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const raw = item.raw as { action_type?: string; description?: string; email_id?: string };
  const typeInfo = raw.action_type ? ACTION_TYPE_LABELS[raw.action_type] : null;
  const deadline = item.deadline ? formatDeadline(item.deadline) : null;

  const handleDismiss = React.useCallback(() => {
    logger.info('Action dismissed', { itemId: item.id });
    setDismissed(true);
    setTimeout(() => onDismiss(item), 300);
  }, [item, onDismiss]);

  const handleAccept = React.useCallback(() => {
    logger.info('Action accepted', { itemId: item.id });
    onAccept(item);
  }, [item, onAccept]);

  const handleSnooze = React.useCallback(() => {
    logger.info('Action snoozed', { itemId: item.id });
    onSnooze(item);
  }, [item, onSnooze]);

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Type icon */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
        <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.title}</span>
          {typeInfo && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', typeInfo.color)}>
              {typeInfo.label}
            </span>
          )}
        </div>

        {raw.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{raw.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {deadline && (
            <span className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full',
              deadline.isUrgent
                ? 'bg-destructive/10 text-destructive font-medium'
                : 'bg-muted/60',
            )}>
              {deadline.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {deadline.text}
            </span>
          )}

          {item.sourceEmailId && (
            <Link
              href={`/inbox?email=${item.sourceEmailId}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.sourceEmailSubject || item.sourceEmailSender || 'Source email'}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Accept / Snooze / Dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2.5 text-xs shadow-sm"
          onClick={handleAccept}
        >
          <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
          Accept
        </Button>
        <button
          onClick={handleSnooze}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          title="Snooze"
        >
          <AlarmClock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDismiss}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
