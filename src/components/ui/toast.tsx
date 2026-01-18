/**
 * 🍞 Toast Component for IdeaBox
 *
 * Toast notifications for feedback on user actions.
 * Built on Radix UI Toast primitive for accessibility.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Non-blocking - doesn't interrupt user flow
 * 2. Auto-dismiss with configurable duration
 * 3. Multiple variants for different message types
 * 4. Swipe to dismiss on touch devices
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * With toast hook (recommended):
 * ```tsx
 * import { useToast } from '@/components/ui/use-toast';
 *
 * function MyComponent() {
 *   const { toast } = useToast();
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       toast({
 *         title: "Success!",
 *         description: "Your changes have been saved.",
 *       });
 *     } catch (error) {
 *       toast({
 *         variant: "destructive",
 *         title: "Error",
 *         description: "Something went wrong.",
 *       });
 *     }
 *   };
 * }
 * ```
 *
 * @module components/ui/toast
 */

'use client';

import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

const ToastProvider = ToastPrimitives.Provider;

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast viewport - the container that holds toasts.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // Positioning
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4',
      'sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col',
      'md:max-w-[420px]',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast variant styles.
 */
const toastVariants = cva(
  [
    // Base styles
    'group pointer-events-auto relative flex w-full items-center justify-between',
    'space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg',
    'transition-all',
    // Animation
    'data-[swipe=cancel]:translate-x-0',
    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
    'data-[swipe=move]:transition-none',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[swipe=end]:animate-out',
    'data-[state=closed]:fade-out-80',
    'data-[state=closed]:slide-out-to-right-full',
    'data-[state=open]:slide-in-from-top-full',
    'data-[state=open]:sm:slide-in-from-bottom-full',
  ],
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        success:
          'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/50 dark:text-green-100',
        warning:
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast component props.
 */
export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>,
    VariantProps<typeof toastVariants> {}

/**
 * Toast component for notifications.
 */
const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  ToastProps
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST ACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast action button.
 */
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center',
      'rounded-md border bg-transparent px-3',
      'text-sm font-medium',
      'ring-offset-background transition-colors',
      'hover:bg-secondary',
      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'group-[.destructive]:border-muted/40',
      'group-[.destructive]:hover:border-destructive/30',
      'group-[.destructive]:hover:bg-destructive',
      'group-[.destructive]:hover:text-destructive-foreground',
      'group-[.destructive]:focus:ring-destructive',
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST CLOSE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast close button.
 */
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2',
      'rounded-md p-1',
      'text-foreground/50',
      'opacity-0 transition-opacity',
      'hover:text-foreground',
      'focus:opacity-100 focus:outline-none focus:ring-2',
      'group-hover:opacity-100',
      'group-[.destructive]:text-red-300',
      'group-[.destructive]:hover:text-red-50',
      'group-[.destructive]:focus:ring-red-400',
      'group-[.destructive]:focus:ring-offset-red-600',
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" aria-hidden="true" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST TITLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast title.
 */
const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST DESCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast description.
 */
const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

type ToastActionElement = React.ReactElement<typeof ToastAction>;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
