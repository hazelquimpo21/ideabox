/**
 * InboxSearchBar — search input with keyboard shortcut hint.
 * Implements §5a from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a ⌘K / Ctrl+K shortcut hint badge on desktop.
 * Registers the global keyboard shortcut to focus the input.
 *
 * @module components/inbox/InboxSearchBar
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export interface InboxSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export function InboxSearchBar({
  value,
  onChange,
  onClear,
  placeholder = 'Search emails...',
  className,
}: InboxSearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Register ⌘K / Ctrl+K shortcut to focus search
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className={cn('relative flex-1', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="pl-9 pr-20 h-9 text-sm bg-muted/30 border-border/50 focus:bg-background transition-colors"
      />

      {/* Keyboard shortcut hint — desktop only (md+ as proxy for hover-capable) */}
      {!value && (
        <kbd
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2',
            'hidden md:inline-flex pointer-events-none',
            'px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60',
            'bg-muted/60 border border-border/40 rounded',
          )}
        >
          ⌘K
        </kbd>
      )}

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export default InboxSearchBar;
