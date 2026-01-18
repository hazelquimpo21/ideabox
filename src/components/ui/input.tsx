/**
 * 📝 Input Component for IdeaBox
 *
 * A styled text input with consistent appearance and accessibility.
 * Supports all standard HTML input types with enhanced styling.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Consistent height with other form controls (40px)
 * 2. Clear focus states for accessibility
 * 3. Proper disabled and error states
 * 4. Works with react-hook-form and other form libraries
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Input placeholder="Enter email" />
 * <Input type="password" placeholder="Password" />
 * ```
 *
 * With label:
 * ```tsx
 * <div className="space-y-2">
 *   <Label htmlFor="email">Email</Label>
 *   <Input id="email" type="email" placeholder="you@example.com" />
 * </div>
 * ```
 *
 * With error:
 * ```tsx
 * <Input
 *   placeholder="Email"
 *   aria-invalid={!!errors.email}
 *   className={errors.email ? 'border-red-500' : ''}
 * />
 * ```
 *
 * With icon (wrap in relative container):
 * ```tsx
 * <div className="relative">
 *   <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
 *   <Input className="pl-10" placeholder="Search emails..." />
 * </div>
 * ```
 *
 * @module components/ui/input
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input component props.
 * Extends standard input attributes.
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Additional wrapper class name for the input container.
   * Use when you need to style the wrapper (e.g., for icons).
   */
  wrapperClassName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input component with consistent styling.
 *
 * @example
 * ```tsx
 * // Basic text input
 * <Input placeholder="Enter your name" />
 *
 * // Email input
 * <Input type="email" placeholder="you@example.com" />
 *
 * // Password input
 * <Input type="password" placeholder="••••••••" />
 *
 * // Disabled input
 * <Input disabled placeholder="Can't edit this" />
 *
 * // With react-hook-form
 * <Input {...register('email')} />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles
          'flex h-10 w-full rounded-md border border-input bg-background',
          'px-3 py-2 text-sm',
          // Placeholder
          'placeholder:text-muted-foreground',
          // Focus state
          'ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2',
          // Disabled state
          'disabled:cursor-not-allowed disabled:opacity-50',
          // File input specific
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'file:text-foreground',
          // Custom classes
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Input };
