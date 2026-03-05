/**
 * CollapsibleSection — wrapper for below-fold content.
 * Implements §4c "Below-Fold Sections" from VIEW_REDESIGN_PLAN.md.
 *
 * Collapsed by default (unless `defaultOpen` is set). Shows header text,
 * badge count, and chevron indicator. Uses CSS grid-template-rows trick
 * for smooth height animation.
 *
 * Lazy-renders children: content is not mounted until first expanded,
 * then stays mounted to preserve state on collapse.
 *
 * @module components/shared/CollapsibleSection
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';

interface CollapsibleSectionProps {
  /** Section heading */
  title: string;
  /** Badge count shown next to the title */
  count?: number;
  /** Start expanded */
  defaultOpen?: boolean;
  /** Section content — lazy-rendered on first expand */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  // Track whether section has ever been expanded — for lazy rendering
  const hasExpanded = React.useRef(defaultOpen);

  if (isOpen && !hasExpanded.current) {
    hasExpanded.current = true;
  }

  return (
    <div className={cn('border-t pt-4', className)}>
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left group"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
        <span className="text-sm font-medium group-hover:text-foreground transition-colors">
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-xs ml-1">
            {count}
          </Badge>
        )}
      </button>

      {/* Smooth height animation via CSS grid trick */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          {hasExpanded.current && (
            <div className="pt-3">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
