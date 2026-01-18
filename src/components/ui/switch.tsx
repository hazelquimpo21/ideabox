/**
 * 🔀 Switch Component for IdeaBox
 *
 * A toggle switch for boolean settings and preferences.
 * Used for enabling/disabling features like email sync, notifications, etc.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Clear on/off visual states
 * 2. Fully accessible with keyboard support
 * 3. Smooth transition animation
 * 4. Consistent with iOS/Android toggle patterns
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
 * ```
 *
 * With label:
 * ```tsx
 * <div className="flex items-center space-x-2">
 *   <Switch id="sync" />
 *   <Label htmlFor="sync">Enable email sync</Label>
 * </div>
 * ```
 *
 * Settings row:
 * ```tsx
 * <div className="flex items-center justify-between">
 *   <div>
 *     <p className="font-medium">Notifications</p>
 *     <p className="text-sm text-muted-foreground">
 *       Receive notifications for new actions
 *     </p>
 *   </div>
 *   <Switch checked={notifications} onCheckedChange={setNotifications} />
 * </div>
 * ```
 *
 * @module components/ui/switch
 */

'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Switch component props.
 * Extends Radix Switch primitive props.
 */
export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {}

/**
 * Switch toggle component built on Radix UI.
 *
 * @example
 * ```tsx
 * // Controlled
 * const [enabled, setEnabled] = useState(false);
 * <Switch checked={enabled} onCheckedChange={setEnabled} />
 *
 * // Uncontrolled
 * <Switch defaultChecked />
 *
 * // Disabled
 * <Switch disabled />
 *
 * // In settings form
 * <div className="space-y-4">
 *   <div className="flex justify-between">
 *     <Label htmlFor="sync">Auto-sync</Label>
 *     <Switch id="sync" />
 *   </div>
 * </div>
 * ```
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Base styles
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center',
      'rounded-full border-2 border-transparent',
      // Transition
      'transition-colors',
      // Focus ring
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      // Disabled state
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Checked/unchecked colors
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Base thumb styles
        'pointer-events-none block h-5 w-5 rounded-full',
        'bg-background shadow-lg ring-0',
        // Transition for sliding animation
        'transition-transform',
        // Position based on state
        'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Switch };
