/**
 * 🏷️ Badge Component for IdeaBox
 *
 * Small status indicators for categories, tags, and labels.
 * Essential for displaying email categories, client tags, and action status.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Compact and non-intrusive
 * 2. Color-coded for quick scanning
 * 3. Consistent with email category colors
 * 4. Can include icons for extra context
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Badge>New</Badge>
 * <Badge variant="secondary">Draft</Badge>
 * <Badge variant="destructive">Urgent</Badge>
 * ```
 *
 * With icon:
 * ```tsx
 * <Badge>
 *   <CheckCircle className="mr-1 h-3 w-3" />
 *   Complete
 * </Badge>
 * ```
 *
 * Email category:
 * ```tsx
 * <CategoryBadge category="action_required" />
 * ```
 *
 * @module components/ui/badge
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Badge variant styles using class-variance-authority.
 */
const badgeVariants = cva(
  // Base styles
  [
    'inline-flex items-center rounded-full',
    'border px-2.5 py-0.5',
    'text-xs font-semibold',
    'transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  ],
  {
    variants: {
      /**
       * Visual style variants:
       * - default: Primary badge (filled)
       * - secondary: Subtle gray badge
       * - destructive: Error/danger badge
       * - outline: Bordered only
       *
       * Email category variants:
       * - actionRequired: Red for items needing action
       * - event: Purple for calendar events
       * - newsletter: Blue for newsletters
       * - promo: Orange for promotions
       * - admin: Gray for administrative
       * - personal: Green for personal
       * - noise: Light gray for noise
       * - client: Teal for client-related
       */
      variant: {
        // Standard variants
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline:
          'text-foreground',

        // Email category variants (matching the 7 categories)
        actionRequired:
          'border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
        event:
          'border-purple-200 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
        newsletter:
          'border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        promo:
          'border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        admin:
          'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
        personal:
          'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
        noise:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400',

        // Special variants
        client:
          'border-teal-200 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
        success:
          'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        warning:
          'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Badge component props.
 */
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Badge component for displaying status labels and tags.
 *
 * @example
 * ```tsx
 * // Standard variants
 * <Badge>Default</Badge>
 * <Badge variant="secondary">Secondary</Badge>
 * <Badge variant="destructive">Error</Badge>
 * <Badge variant="outline">Outline</Badge>
 *
 * // Email category badges
 * <Badge variant="actionRequired">Action Required</Badge>
 * <Badge variant="event">Event</Badge>
 * <Badge variant="newsletter">Newsletter</Badge>
 *
 * // With icon
 * <Badge variant="success">
 *   <Check className="mr-1 h-3 w-3" />
 *   Done
 * </Badge>
 * ```
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Badge, badgeVariants };
