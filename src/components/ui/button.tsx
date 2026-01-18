/**
 * 🔘 Button Component for IdeaBox
 *
 * A versatile button component with multiple variants, sizes, and states.
 * Built with class-variance-authority for type-safe variant management.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Variants define visual style (primary, secondary, destructive, etc.)
 * 2. Sizes are consistent across the app (sm, default, lg, icon)
 * 3. All interactive states are handled (hover, focus, disabled, loading)
 * 4. Fully accessible with proper ARIA attributes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Button>Click me</Button>
 * <Button variant="secondary">Secondary</Button>
 * <Button variant="destructive">Delete</Button>
 * ```
 *
 * With icon:
 * ```tsx
 * <Button>
 *   <Mail className="mr-2 h-4 w-4" />
 *   Connect Gmail
 * </Button>
 * ```
 *
 * Loading state:
 * ```tsx
 * <Button isLoading>Saving...</Button>
 * ```
 *
 * As link:
 * ```tsx
 * <Button asChild>
 *   <a href="/inbox">Go to Inbox</a>
 * </Button>
 * ```
 *
 * @module components/ui/button
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Button variant styles using class-variance-authority.
 * This creates type-safe variants that can be used throughout the app.
 */
const buttonVariants = cva(
  // Base styles applied to all buttons
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-md text-sm font-medium',
    'ring-offset-background transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      /**
       * Visual style variants:
       * - default: Primary action (blue)
       * - secondary: Secondary action (gray)
       * - destructive: Dangerous action (red)
       * - outline: Bordered style
       * - ghost: No background until hover
       * - link: Looks like a link
       */
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        link:
          'text-primary underline-offset-4 hover:underline',
      },
      /**
       * Size variants:
       * - default: Standard button height (40px)
       * - sm: Compact buttons (36px)
       * - lg: Large prominent buttons (44px)
       * - icon: Square icon-only buttons (40px)
       */
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Button component props.
 * Extends standard button attributes with variant options.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, renders children as the button element.
   * Useful for wrapping links or other elements.
   * @example
   * ```tsx
   * <Button asChild>
   *   <a href="/inbox">Go to Inbox</a>
   * </Button>
   * ```
   */
  asChild?: boolean;

  /**
   * Shows a loading spinner and disables the button.
   * Use when the button triggers an async action.
   */
  isLoading?: boolean;

  /**
   * Text to show when loading.
   * Defaults to the button's children.
   */
  loadingText?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Button component with variants, sizes, and loading state.
 *
 * @example
 * ```tsx
 * // Primary button
 * <Button onClick={handleClick}>Save Changes</Button>
 *
 * // Secondary button with icon
 * <Button variant="secondary">
 *   <Settings className="mr-2 h-4 w-4" />
 *   Settings
 * </Button>
 *
 * // Loading state
 * <Button isLoading loadingText="Saving...">Save</Button>
 *
 * // Destructive button
 * <Button variant="destructive">Delete Account</Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // Use Slot for asChild pattern (renders children as the element)
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Button, buttonVariants };
