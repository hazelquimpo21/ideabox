/**
 * InboxDetailEmpty — empty state for the detail panel.
 *
 * Shown when no email is selected in the split-panel inbox layout.
 * Centered vertically with a subtle icon and guidance text.
 *
 * @module components/inbox/InboxDetailEmpty
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface InboxDetailEmptyProps {
  className?: string;
}

export function InboxDetailEmpty({ className }: InboxDetailEmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full text-center px-8',
        className,
      )}
    >
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <Mail className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-sm font-medium text-muted-foreground mb-1">
        Select an email to read
      </h3>
      <p className="text-xs text-muted-foreground/60 max-w-[240px]">
        Choose a conversation from the list to view its contents.
      </p>
    </div>
  );
}

export default InboxDetailEmpty;
