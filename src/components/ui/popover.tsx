/**
 * Lightweight Popover Component
 *
 * A simple popover built without additional npm packages.
 * Uses a state-controlled absolute-positioned div anchored
 * to a trigger button ref. Includes click-outside-to-close.
 *
 * @module components/ui/popover
 * @since March 2026 — Phase 2 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the Popover component.
 *
 * @module components/ui/popover
 * @since March 2026
 */
export interface PopoverProps {
  /** Whether the popover is currently open */
  open: boolean;
  /** Callback when open state should change */
  onOpenChange: (open: boolean) => void;
  /** The trigger element that opens the popover */
  trigger: React.ReactNode;
  /** The popover content */
  children: React.ReactNode;
  /** Alignment relative to trigger: 'start' | 'end' | 'center' */
  align?: 'start' | 'end' | 'center';
  /** Additional className for the content container */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lightweight Popover — renders content in an absolute-positioned div
 * anchored below a trigger element. Closes on click outside or Escape.
 *
 * @module components/ui/popover
 * @since March 2026
 */
export function Popover({ open, onOpenChange, trigger, children, align = 'end', className }: PopoverProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {trigger}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[240px] rounded-lg border border-border bg-card p-3 shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            align === 'end' && 'right-0',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
