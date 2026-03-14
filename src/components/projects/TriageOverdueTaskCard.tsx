/**
 * Triage Overdue Task Card
 *
 * Renders an overdue project_item that has re-surfaced in the triage stream.
 * These are tasks already on the board that passed their due date without
 * being completed. Displayed with a red "overdue" urgency and firmness badge.
 *
 * @module components/projects/TriageOverdueTaskCard
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import {
  AlertTriangle,
  Clock,
  ArrowUpRight,
  X,
  AlarmClock,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { TriageItem, OverdueProjectItem } from '@/hooks/useTriageItems';

const logger = createLogger('TriageOverdueTaskCard');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const FIRMNESS_BADGES: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  hard: { label: 'Hard deadline', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: ShieldAlert },
  soft: { label: 'Commitment', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: Shield },
  flexible: { label: 'Flexible', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400', icon: Clock },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TriageOverdueTaskCardProps {
  item: TriageItem;
  onDismiss: (item: TriageItem) => void;
  onSnooze: (item: TriageItem) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TriageOverdueTaskCard({ item, onDismiss, onSnooze }: TriageOverdueTaskCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const raw = item.raw as OverdueProjectItem;
  const firmness = item.firmness ?? 'flexible';
  const badge = FIRMNESS_BADGES[firmness] ?? FIRMNESS_BADGES.flexible!;
  const BadgeIcon = badge.icon;

  const handleDismiss = React.useCallback(() => {
    // Hard-firmness items require confirmation before dismissing
    if (firmness === 'hard') {
      const confirmed = window.confirm(
        `"${item.title}" is a hard deadline. Are you sure you want to dismiss it?`
      );
      if (!confirmed) return;
    }
    logger.info('Overdue task dismissed', { itemId: item.id, firmness });
    setDismissed(true);
    setTimeout(() => onDismiss(item), 300);
  }, [item, onDismiss, firmness]);

  const handleSnooze = React.useCallback(() => {
    logger.info('Overdue task snoozed', { itemId: item.id });
    onSnooze(item);
  }, [item, onSnooze]);

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border group',
      'transition-all duration-300 ease-out',
      firmness === 'hard'
        ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10 hover:border-red-400 hover:shadow-md'
        : 'border-border/50 hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.title}</span>
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 inline-flex items-center gap-0.5', badge.color)}>
            <BadgeIcon className="h-2.5 w-2.5" />
            {badge.label}
          </span>
        </div>

        {raw.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{raw.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
            <AlertTriangle className="h-3 w-3" />
            {item.subtitle}
          </span>

          {raw.priority && raw.priority !== 'medium' && (
            <span className="px-1.5 py-0.5 rounded-full bg-muted/60 capitalize">
              {raw.priority}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Link href="/tasks?tab=board">
          <button className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground text-xs font-medium shadow-sm hover:bg-primary/90 transition-colors">
            <ArrowUpRight className="h-3.5 w-3.5" />
            View on board
          </button>
        </Link>
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
          title={firmness === 'hard' ? 'Dismiss (requires confirmation)' : 'Dismiss'}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
