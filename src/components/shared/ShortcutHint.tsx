/**
 * ShortcutHint — small keyboard shortcut badge for desktop users.
 * Implements §7 from VIEW_REDESIGN_PLAN.md (Phase 4).
 *
 * Renders inline `<kbd>` elements styled as key caps.
 * Hidden on touch/mobile devices via `hidden md:inline-flex`.
 *
 * @module components/shared/ShortcutHint
 * @since Phase 4 — March 2026
 */

import { cn } from '@/lib/utils/cn';

export interface ShortcutHintProps {
  /** Key labels to display, e.g. ['⌘', 'K'] or ['N'] */
  keys: string[];
  className?: string;
}

export function ShortcutHint({ keys, className }: ShortcutHintProps) {
  return (
    <span className={cn('hidden md:inline-flex items-center gap-0.5', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border/50 text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
