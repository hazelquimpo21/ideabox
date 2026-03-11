/**
 * DateGroupHeader — section divider for date-grouped email lists.
 *
 * Renders labels like "Today", "Yesterday", "This Week", etc.
 * Styled as a compact, uppercase, muted section header.
 *
 * @module components/inbox/DateGroupHeader
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import { cn } from '@/lib/utils/cn';

export interface DateGroupHeaderProps {
  /** Display label ("Today", "Yesterday", etc.) */
  label: string;
  /** Number of emails in this group */
  count?: number;
  /** Whether this is the first group (no top padding) */
  isFirst?: boolean;
}

export function DateGroupHeader({ label, count, isFirst = false }: DateGroupHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 bg-muted/30',
        !isFirst && 'mt-1',
      )}
    >
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

export default DateGroupHeader;
