/**
 * 💀 Skeleton Component for IdeaBox
 *
 * Loading placeholder that mimics content layout while data loads.
 * Essential for providing good UX during async operations.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Match the approximate size of real content
 * 2. Use subtle animation to indicate loading
 * 3. Reduce perceived wait time
 * 4. Provide visual structure before content loads
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic shapes:
 * ```tsx
 * <Skeleton className="h-4 w-[200px]" />  // Text line
 * <Skeleton className="h-10 w-full" />    // Input
 * <Skeleton className="h-12 w-12 rounded-full" /> // Avatar
 * ```
 *
 * Email card skeleton:
 * ```tsx
 * <div className="flex flex-col space-y-2">
 *   <Skeleton className="h-4 w-[250px]" />   // Subject
 *   <Skeleton className="h-3 w-[150px]" />   // Sender
 *   <Skeleton className="h-3 w-[300px]" />   // Snippet
 * </div>
 * ```
 *
 * @module components/ui/skeleton
 */

import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Skeleton component props.
 */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton loading placeholder component.
 *
 * @example
 * ```tsx
 * // Simple line
 * <Skeleton className="h-4 w-32" />
 *
 * // Circle (avatar)
 * <Skeleton className="h-12 w-12 rounded-full" />
 *
 * // Card placeholder
 * <div className="space-y-2">
 *   <Skeleton className="h-4 w-3/4" />
 *   <Skeleton className="h-4 w-1/2" />
 * </div>
 *
 * // Full email card skeleton
 * <EmailCardSkeleton />
 * ```
 */
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-BUILT SKELETONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email card skeleton for loading states in the inbox.
 *
 * @example
 * ```tsx
 * {isLoading ? (
 *   <>
 *     <EmailCardSkeleton />
 *     <EmailCardSkeleton />
 *     <EmailCardSkeleton />
 *   </>
 * ) : (
 *   emails.map(email => <EmailCard key={email.id} email={email} />)
 * )}
 * ```
 */
function EmailCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-4 border-b">
      {/* Header: sender + time */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-[140px]" />
        <Skeleton className="h-3 w-[60px]" />
      </div>
      {/* Subject */}
      <Skeleton className="h-4 w-[280px]" />
      {/* Snippet */}
      <Skeleton className="h-3 w-full" />
      {/* Meta: badges */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-[80px] rounded-full" />
        <Skeleton className="h-5 w-[60px] rounded-full" />
      </div>
    </div>
  );
}

/**
 * Action item skeleton for loading states in the actions list.
 */
function ActionItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 border-b">
      {/* Checkbox */}
      <Skeleton className="h-5 w-5 rounded" />
      {/* Content */}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-3 w-full" />
        {/* Meta */}
        <div className="flex gap-2">
          <Skeleton className="h-4 w-[80px] rounded-full" />
          <Skeleton className="h-4 w-[60px] rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Client card skeleton for loading states.
 */
function ClientCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg">
      {/* Avatar */}
      <Skeleton className="h-10 w-10 rounded-full" />
      {/* Info */}
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-[120px]" />
        <Skeleton className="h-3 w-[80px]" />
      </div>
      {/* Badge */}
      <Skeleton className="h-5 w-[50px] rounded-full" />
    </div>
  );
}

/**
 * Table row skeleton for loading states.
 */
function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 p-4 border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === 0 ? 'w-[200px]' : 'w-[100px]'
          )}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Skeleton,
  EmailCardSkeleton,
  ActionItemSkeleton,
  ClientCardSkeleton,
  TableRowSkeleton,
};
