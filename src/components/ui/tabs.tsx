/**
 * Tabs UI Component
 *
 * A tabbed interface component built on Radix UI primitives.
 * Provides accessible, keyboard-navigable tabs for organizing content.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic usage:
 * ```tsx
 * <Tabs defaultValue="account">
 *   <TabsList>
 *     <TabsTrigger value="account">Account</TabsTrigger>
 *     <TabsTrigger value="settings">Settings</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="account">Account content here</TabsContent>
 *   <TabsContent value="settings">Settings content here</TabsContent>
 * </Tabs>
 * ```
 *
 * Controlled usage:
 * ```tsx
 * const [tab, setTab] = useState('account');
 * <Tabs value={tab} onValueChange={setTab}>
 *   ...
 * </Tabs>
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ACCESSIBILITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Full keyboard navigation (Arrow keys, Home, End)
 * - ARIA roles and attributes
 * - Focus management
 * - Screen reader announcements
 *
 * @module components/ui/tabs
 * @since January 2026
 */

'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Root tabs container.
 * Manages state and provides context to child components.
 */
const Tabs = TabsPrimitive.Root;

// ═══════════════════════════════════════════════════════════════════════════════
// TABS LIST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for TabsList component.
 */
export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** Visual variant of the tabs list */
  variant?: 'default' | 'underline' | 'pills';
}

/**
 * Container for tab triggers.
 * Displays the clickable tab buttons.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = 'default', ...props }, ref) => {
  const variantStyles = {
    default:
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
    underline:
      'inline-flex h-10 items-center justify-start border-b border-border w-full gap-2',
    pills:
      'inline-flex h-10 items-center justify-start gap-2 flex-wrap',
  };

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(variantStyles[variant], className)}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TABS TRIGGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for TabsTrigger component.
 */
export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Visual variant (should match parent TabsList variant) */
  variant?: 'default' | 'underline' | 'pills';
  /** Optional icon to display before label */
  icon?: React.ReactNode;
}

/**
 * Individual tab button.
 * Clickable trigger that activates its corresponding content panel.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = 'default', icon, children, ...props }, ref) => {
  const variantStyles = {
    default:
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
    underline:
      'inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground',
    pills:
      'inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-muted-foreground border border-transparent transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary',
  };

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(variantStyles[variant], className)}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// TABS CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for TabsContent component.
 */
export type TabsContentProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

/**
 * Content panel for a tab.
 * Only visible when its corresponding trigger is active.
 */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Tabs, TabsList, TabsTrigger, TabsContent };
