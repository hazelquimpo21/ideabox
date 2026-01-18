/**
 * 🔄 Spinner Component for IdeaBox
 *
 * Loading spinners for inline loading states and overlays.
 * Provides visual feedback during async operations.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Multiple sizes for different contexts
 * 2. Smooth, consistent animation
 * 3. Accessible with proper ARIA attributes
 * 4. Can include loading text
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic:
 * ```tsx
 * <Spinner />
 * <Spinner size="sm" />
 * <Spinner size="lg" />
 * ```
 *
 * With text:
 * ```tsx
 * <LoadingState>Loading emails...</LoadingState>
 * ```
 *
 * Full page:
 * ```tsx
 * <FullPageLoader message="Syncing your inbox..." />
 * ```
 *
 * @module components/ui/spinner
 */

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// SPINNER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Spinner size variants.
 */
const spinnerSizes = {
  sm: 'h-4 w-4',
  default: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
} as const;

/**
 * Spinner component props.
 */
export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /** Size of the spinner */
  size?: keyof typeof spinnerSizes;
}

/**
 * Spinner component for loading states.
 *
 * @example
 * ```tsx
 * // Inline loading
 * <Spinner size="sm" />
 *
 * // Default size
 * <Spinner />
 *
 * // Large spinner
 * <Spinner size="lg" />
 *
 * // Custom styling
 * <Spinner className="text-blue-500" />
 * ```
 */
function Spinner({ size = 'default', className, ...props }: SpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-muted-foreground',
        spinnerSizes[size],
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING STATE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loading state props.
 */
export interface LoadingStateProps {
  /** Loading message to display */
  children?: React.ReactNode;
  /** Spinner size */
  size?: keyof typeof spinnerSizes;
  /** Additional class names */
  className?: string;
}

/**
 * Loading state with spinner and optional text.
 *
 * @example
 * ```tsx
 * <LoadingState>Loading emails...</LoadingState>
 * <LoadingState size="lg">Syncing your inbox...</LoadingState>
 * ```
 */
function LoadingState({
  children,
  size = 'default',
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} />
      {children && <span className="text-sm">{children}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL PAGE LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full page loader props.
 */
export interface FullPageLoaderProps {
  /** Loading message to display */
  message?: string;
}

/**
 * Full page loading overlay.
 *
 * @example
 * ```tsx
 * {isLoading && <FullPageLoader message="Syncing your inbox..." />}
 * ```
 */
function FullPageLoader({ message = 'Loading...' }: FullPageLoaderProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'flex flex-col items-center justify-center gap-4',
        'bg-background/80 backdrop-blur-sm'
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size="xl" className="text-primary" />
      <p className="text-lg font-medium text-foreground">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inline loading indicator props.
 */
export interface InlineLoaderProps {
  /** Whether loading is active */
  loading?: boolean;
  /** Content to show when not loading */
  children: React.ReactNode;
  /** Spinner size */
  size?: keyof typeof spinnerSizes;
}

/**
 * Inline loader that replaces content while loading.
 *
 * @example
 * ```tsx
 * <Button>
 *   <InlineLoader loading={isSubmitting}>
 *     Save Changes
 *   </InlineLoader>
 * </Button>
 * ```
 */
function InlineLoader({
  loading = false,
  children,
  size = 'sm',
}: InlineLoaderProps) {
  if (loading) {
    return <Spinner size={size} />;
  }
  return <>{children}</>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Spinner, LoadingState, FullPageLoader, InlineLoader };
