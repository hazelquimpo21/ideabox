/**
 * Tooltip Component — three-tier tooltip system built on Radix UI.
 * Implements §3a from VIEW_REDESIGN_PLAN.md.
 *
 * Tiers:
 * - **Info** (default): 300ms delay, small gray bg, 1-2 lines. Icon labels, badge explanations.
 * - **Preview**: 400ms delay, card-like white bg with shadow-lg, up to 5 lines. Email previews, score breakdowns.
 * - **Rich**: Stays open while cursor is inside, card with sections. Priority reasoning, detailed breakdowns.
 *
 * @module components/ui/tooltip
 */

'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils/cn';

// Re-export provider for app root
const TooltipProvider = TooltipPrimitive.Provider;

// Low-level primitives for advanced usage
const TooltipTrigger = TooltipPrimitive.Trigger;

type TooltipVariant = 'info' | 'preview' | 'rich';

const VARIANT_DELAY: Record<TooltipVariant, number> = {
  info: 300,
  preview: 400,
  rich: 400,
};

const VARIANT_STYLES: Record<TooltipVariant, string> = {
  info: 'bg-popover text-popover-foreground text-xs px-2.5 py-1.5 max-w-[220px]',
  preview: 'bg-card text-card-foreground text-sm px-3 py-2.5 max-w-[320px] shadow-lg border',
  rich: 'bg-card text-card-foreground text-sm px-4 py-3 max-w-[380px] shadow-lg border',
};

/**
 * TooltipContent — styled Radix tooltip content.
 * Applies variant-based styling and entrance animation.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    variant?: TooltipVariant;
  }
>(({ className, variant = 'info', sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 rounded-md animate-in fade-in-0 zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      VARIANT_STYLES[variant],
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = 'TooltipContent';

// ─── Compound Tooltip Component ──────────────────────────────────────────────

interface TooltipProps {
  /** Content to display in the tooltip — string or ReactNode */
  content: React.ReactNode;
  /** Tooltip variant controls delay, sizing, and styling */
  variant?: TooltipVariant;
  /** Side to display the tooltip on */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment of tooltip relative to trigger */
  align?: 'start' | 'center' | 'end';
  /** The trigger element(s) */
  children: React.ReactNode;
  /** Whether the tooltip is open (controlled mode) */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Tooltip — compound component wrapping Radix primitives.
 *
 * Simple usage:
 * ```tsx
 * <Tooltip content="Archive this email">
 *   <Button>...</Button>
 * </Tooltip>
 * ```
 *
 * Preview usage:
 * ```tsx
 * <Tooltip variant="preview" content={<PreviewContent />}>
 *   <Badge>Priority: 82</Badge>
 * </Tooltip>
 * ```
 */
function Tooltip({
  content,
  variant = 'info',
  side = 'top',
  align = 'center',
  children,
  open,
  onOpenChange,
}: TooltipProps) {
  // Rich tooltips stay open while cursor is inside the tooltip content
  const disableHoverableContent = variant !== 'rich';

  return (
    <TooltipPrimitive.Root
      delayDuration={VARIANT_DELAY[variant]}
      open={open}
      onOpenChange={onOpenChange}
      disableHoverableContent={disableHoverableContent}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipContent variant={variant} side={side} align={align}>
          {content}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
};
