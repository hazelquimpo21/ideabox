/**
 * 🏷️ Label Component for IdeaBox
 *
 * Accessible form labels built on Radix UI Label primitive.
 * Properly associates labels with form controls for accessibility.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Always use with htmlFor to link to input id
 * 2. Consistent typography across all forms
 * 3. Proper disabled styling when associated control is disabled
 * 4. Screen reader friendly
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * With input:
 * ```tsx
 * <div className="space-y-2">
 *   <Label htmlFor="email">Email address</Label>
 *   <Input id="email" type="email" placeholder="you@example.com" />
 * </div>
 * ```
 *
 * With checkbox:
 * ```tsx
 * <div className="flex items-center space-x-2">
 *   <Checkbox id="terms" />
 *   <Label htmlFor="terms">Accept terms and conditions</Label>
 * </div>
 * ```
 *
 * @module components/ui/label
 */

'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Label variant styles.
 */
const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Label component props.
 */
export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

/**
 * Label component for form controls.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Label htmlFor="name">Name</Label>
 * <Input id="name" />
 *
 * // With required indicator
 * <Label htmlFor="email">
 *   Email <span className="text-red-500">*</span>
 * </Label>
 *
 * // With helper text
 * <div className="space-y-2">
 *   <Label htmlFor="password">Password</Label>
 *   <Input id="password" type="password" />
 *   <p className="text-xs text-muted-foreground">
 *     Must be at least 8 characters
 *   </p>
 * </div>
 * ```
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Label };
