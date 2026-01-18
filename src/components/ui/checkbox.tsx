/**
 * ☑️ Checkbox Component for IdeaBox
 *
 * An accessible checkbox built on Radix UI primitives.
 * Used for action item completion, multi-select, and form inputs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Fully accessible with keyboard navigation
 * 2. Consistent 20x20px size matching design system
 * 3. Clear checked/unchecked/indeterminate states
 * 4. Works seamlessly with react-hook-form
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Checkbox checked={isChecked} onCheckedChange={setIsChecked} />
 * ```
 *
 * With label:
 * ```tsx
 * <div className="flex items-center space-x-2">
 *   <Checkbox id="terms" />
 *   <Label htmlFor="terms">Accept terms and conditions</Label>
 * </div>
 * ```
 *
 * Action item:
 * ```tsx
 * <Checkbox
 *   checked={action.status === 'completed'}
 *   onCheckedChange={(checked) => updateAction(action.id, { status: checked ? 'completed' : 'pending' })}
 * />
 * ```
 *
 * @module components/ui/checkbox
 */

'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checkbox component props.
 * Extends Radix Checkbox primitive props.
 */
export type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

/**
 * Checkbox component built on Radix UI.
 *
 * @example
 * ```tsx
 * // Controlled
 * const [checked, setChecked] = useState(false);
 * <Checkbox checked={checked} onCheckedChange={setChecked} />
 *
 * // Uncontrolled
 * <Checkbox defaultChecked />
 *
 * // Disabled
 * <Checkbox disabled />
 *
 * // With label
 * <div className="flex items-center gap-2">
 *   <Checkbox id="notify" />
 *   <Label htmlFor="notify">Notify me</Label>
 * </div>
 * ```
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Base styles
      'peer h-5 w-5 shrink-0 rounded-sm border border-primary',
      // Ring for focus
      'ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      // Disabled state
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Checked state
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn('flex items-center justify-center text-current')}
    >
      <Check className="h-4 w-4" aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Checkbox };
