/**
 * Triage Deadline Card
 *
 * Renders a deadline, payment due, or expiration item in the triage list.
 * Follows the same structure as TriageActionCard with a red/amber icon
 * and "Create task" as the primary action.
 *
 * @module components/projects/TriageDeadlineCard
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  AlertTriangle,
  Mail,
  Clock,
  ListTodo,
  X,
  AlarmClock,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { QuickAcceptPopover } from './QuickAcceptPopover';
import { SourceChip } from '@/components/shared/SourceChip';
import type { TriageItem } from '@/hooks/useTriageItems';
import type { Project } from '@/types/database';

const logger = createLogger('TriageDeadlineCard');

/** Date type badge colors */
const DATE_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  deadline: { label: 'Deadline', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  payment_due: { label: 'Payment Due', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  expiration: { label: 'Expiration', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

/**
 * Format a deadline date into a human-readable label.
 */
function formatDeadline(dateStr: string): { text: string; isUrgent: boolean } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', isUrgent: true };
  if (diffDays === 0) return { text: 'Today!', isUrgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `${diffDays}d`, isUrgent: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isUrgent: false };
}

export interface TriageDeadlineCardProps {
  item: TriageItem;
  onAccept: (item: TriageItem) => void;
  onDismiss: (item: TriageItem) => void;
  onSnooze: (item: TriageItem) => void;
  projects?: Project[];
  onCreateItem?: (projectId: string, priority: string) => Promise<void>;
}

export function TriageDeadlineCard({ item, onAccept, onDismiss, onSnooze, projects, onCreateItem }: TriageDeadlineCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const dateType = item.subtitle || 'deadline';
  const badge = DATE_TYPE_BADGES[dateType] || DATE_TYPE_BADGES.deadline!;
  const deadline = item.deadline ? formatDeadline(item.deadline) : null;

  const handleDismiss = React.useCallback(() => {
    logger.info('Deadline dismissed', { itemId: item.id });
    setDismissed(true);
    setTimeout(() => onDismiss(item), 300);
  }, [item, onDismiss]);

  const handleAccept = React.useCallback(() => {
    logger.info('Deadline accepted (create task)', { itemId: item.id });
    onAccept(item);
  }, [item, onAccept]);

  const handleSnooze = React.useCallback(() => {
    logger.info('Deadline snoozed', { itemId: item.id });
    onSnooze(item);
  }, [item, onSnooze]);

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.title}</span>
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', badge.color)}>
            {badge.label}
          </span>
        </div>

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
            <SourceChip
              type="email"
              id={item.sourceEmailId}
              label={item.sourceEmailSubject || item.sourceEmailSender || 'Source email'}
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {projects && onCreateItem ? (
          <QuickAcceptPopover
            item={item}
            projects={projects}
            onAccept={onCreateItem}
            trigger={
              <Button variant="default" size="sm" className="h-7 px-2.5 text-xs shadow-sm">
                <ListTodo className="h-3.5 w-3.5 mr-1" />
                Create task
              </Button>
            }
          />
        ) : (
          <Button variant="default" size="sm" className="h-7 px-2.5 text-xs shadow-sm" onClick={handleAccept}>
            <ListTodo className="h-3.5 w-3.5 mr-1" />
            Create task
          </Button>
        )}
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
