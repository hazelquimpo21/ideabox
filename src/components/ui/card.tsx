/**
 * 🃏 Card Component for IdeaBox
 *
 * A flexible card component with header, content, and footer sections.
 * Used for grouping related content throughout the application.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Composable: Use Card, CardHeader, CardContent, CardFooter as needed
 * 2. Consistent spacing and borders throughout the app
 * 3. Semantic structure with proper heading hierarchy
 * 4. Works as clickable elements when needed
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic card:
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Card Title</CardTitle>
 *     <CardDescription>Card description goes here</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Card content</p>
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 * ```
 *
 * Simple card:
 * ```tsx
 * <Card className="p-6">
 *   <p>Simple content without sections</p>
 * </Card>
 * ```
 *
 * Clickable card:
 * ```tsx
 * <Card
 *   className="cursor-pointer hover:shadow-md transition-shadow"
 *   onClick={handleClick}
 * >
 *   <CardContent>Click me!</CardContent>
 * </Card>
 * ```
 *
 * @module components/ui/card
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD CONTAINER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Card container component.
 * Provides the outer wrapper with border and background.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border bg-card text-card-foreground shadow-sm',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD HEADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Card header section.
 * Contains the title and optional description.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD TITLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Card title component.
 * Renders as an h3 by default for proper heading hierarchy.
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD DESCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Card description component.
 * Provides secondary text below the title.
 */
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

/**
 * Card content section.
 * Main area for card content.
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD FOOTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Card footer section.
 * Typically contains action buttons.
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
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
