/**
 * Card Component for IdeaBox — upgraded with elevation, accent, and interactive props.
 * Implements §2d from VIEW_REDESIGN_PLAN.md.
 *
 * Three elevation levels:
 * - **Flat**: Background sections, completed items.
 * - **Raised** (default): Default cards, list items.
 * - **Elevated**: Active/focused, modals, top-priority items.
 *
 * Accent border driven by timeliness color system (§2a).
 * All new props are optional — existing usage is fully backwards compatible.
 *
 * @module components/ui/card
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// ELEVATION STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const ELEVATION_STYLES = {
  flat: 'bg-muted/50 border-0 shadow-none',
  raised: 'bg-card border shadow-sm',
  elevated: 'bg-card border shadow-md ring-1 ring-primary/10',
} as const;

const ELEVATION_HOVER = {
  flat: 'hover:bg-muted/80 hover:shadow-sm',
  raised: 'hover:shadow',
  elevated: '', // Already prominent
} as const;

type CardElevation = keyof typeof ELEVATION_STYLES;

// ═══════════════════════════════════════════════════════════════════════════════
// CARD CONTAINER
// ═══════════════════════════════════════════════════════════════════════════════

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card elevation level — controls shadow and bg. Default: 'raised' */
  elevation?: CardElevation;
  /** Timeliness accent color, e.g. 'amber-500'. Renders as left or top border. */
  accent?: string;
  /** Accent border position. Default: 'left' */
  accentPosition?: 'left' | 'top';
  /** Adds hover elevation bump + cursor-pointer for clickable cards */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation = 'raised', accent, accentPosition = 'left', interactive, ...props }, ref) => {
    // Build accent border class from the color name
    const accentClass = accent
      ? accentPosition === 'left'
        ? `border-l-[3px] border-l-${accent}`
        : `border-t-[3px] border-t-${accent}`
      : '';

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg text-card-foreground transition-all duration-200',
          ELEVATION_STYLES[elevation],
          interactive && cn(
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ELEVATION_HOVER[elevation]
          ),
          accentClass,
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD HEADER
// ═══════════════════════════════════════════════════════════════════════════════

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-4 pb-2', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD TITLE
// ═══════════════════════════════════════════════════════════════════════════════

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD DESCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD FOOTER
// ═══════════════════════════════════════════════════════════════════════════════

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-4 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};

export type { CardProps, CardElevation };
