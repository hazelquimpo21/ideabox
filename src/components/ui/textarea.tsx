/**
 * 📝 Textarea Component for IdeaBox
 *
 * A styled multi-line text input with consistent appearance and accessibility.
 * Used for notes, comments, and longer text entries.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Consistent styling with other form controls
 * 2. Clear focus states for accessibility
 * 3. Proper disabled and error states
 * 4. Works with react-hook-form and other form libraries
 * 5. Supports resizing control via className
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Textarea placeholder="Enter notes..." />
 * ```
 *
 * With rows:
 * ```tsx
 * <Textarea rows={5} placeholder="Describe in detail..." />
 * ```
 *
 * No resize:
 * ```tsx
 * <Textarea className="resize-none" placeholder="Fixed size..." />
 * ```
 *
 * With label:
 * ```tsx
 * <div className="space-y-2">
 *   <Label htmlFor="notes">Notes</Label>
 *   <Textarea id="notes" placeholder="Add notes about this contact..." />
 * </div>
 * ```
 *
 * @module components/ui/textarea
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Textarea component props.
 * Extends standard textarea attributes.
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Textarea component with consistent styling.
 *
 * @example
 * ```tsx
 * // Basic textarea
 * <Textarea placeholder="Enter your message" />
 *
 * // With specific rows
 * <Textarea rows={4} placeholder="Describe the issue..." />
 *
 * // Disabled textarea
 * <Textarea disabled placeholder="Can't edit this" />
 *
 * // With react-hook-form
 * <Textarea {...register('description')} />
 * ```
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Base styles
          'flex min-h-[80px] w-full rounded-md border border-input bg-background',
          'px-3 py-2 text-sm',
          // Placeholder
          'placeholder:text-muted-foreground',
          // Focus state
          'ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2',
          // Disabled state
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Custom classes
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Textarea };
