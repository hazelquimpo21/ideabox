/**
 * EmailKeyPoints Component
 *
 * Displays key points extracted from email analysis in an expandable format.
 * Surfaces the most important information without requiring the user to read
 * the full email.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Expandable/collapsible key points list
 * - Shows first N points with "show more" option
 * - Visual hierarchy with bullet styling
 * - Accessible with keyboard navigation
 * - Smooth expand/collapse animation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * <EmailKeyPoints points={['Deadline Friday EOD', 'Budget approved', 'Needs headcount']} />
 *
 * // Always expanded (for detail view)
 * <EmailKeyPoints points={keyPoints} defaultExpanded />
 *
 * // Limit visible points
 * <EmailKeyPoints points={keyPoints} maxVisible={2} />
 * ```
 *
 * @module components/categories/EmailKeyPoints
 */

'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailKeyPoints');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailKeyPointsProps {
  /** Array of key point strings */
  points: string[];
  /** Maximum number of points to show when collapsed (default: 2) */
  maxVisible?: number;
  /** Start expanded (default: false) */
  defaultExpanded?: boolean;
  /** Compact mode - less padding */
  compact?: boolean;
  /** Show expand toggle even if fewer points than maxVisible */
  alwaysShowToggle?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Callback when expanded state changes */
  onExpandChange?: (expanded: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays expandable key points from email analysis.
 *
 * @example
 * ```tsx
 * // In an email card
 * <EmailKeyPoints
 *   points={email.key_points || []}
 *   maxVisible={2}
 *   compact
 * />
 * ```
 */
export function EmailKeyPoints({
  points,
  maxVisible = 2,
  defaultExpanded = false,
  compact = false,
  alwaysShowToggle = false,
  className,
  onExpandChange,
}: EmailKeyPointsProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  // ───────────────────────────────────────────────────────────────────────────
  // Debug logging
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (points.length > 0) {
      logger.debug('Rendering key points', {
        count: points.length,
        maxVisible,
        isExpanded,
      });
    }
  }, [points.length, maxVisible, isExpanded]);

  // ───────────────────────────────────────────────────────────────────────────
  // Early return if no points
  // ───────────────────────────────────────────────────────────────────────────

  if (!points || points.length === 0) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Calculate visibility
  // ───────────────────────────────────────────────────────────────────────────

  const hasMorePoints = points.length > maxVisible;
  const visiblePoints = isExpanded ? points : points.slice(0, maxVisible);
  const hiddenCount = points.length - maxVisible;
  const showToggle = alwaysShowToggle || hasMorePoints;

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);

    logger.debug('Key points toggle', { isExpanded: newExpanded });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'space-y-1',
        compact ? 'text-xs' : 'text-sm',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
          Key Points
        </span>
        {showToggle && hasMorePoints && (
          <button
            onClick={handleToggle}
            className={cn(
              'flex items-center gap-0.5 text-muted-foreground hover:text-foreground',
              'transition-colors text-[10px]',
              'focus:outline-none focus:ring-1 focus:ring-primary rounded px-1'
            )}
            aria-expanded={isExpanded}
            aria-controls="key-points-list"
          >
            {isExpanded ? (
              <>
                <span>Less</span>
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                <span>+{hiddenCount} more</span>
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Points list */}
      <ul
        id="key-points-list"
        className={cn(
          'space-y-1',
          compact ? 'pl-0' : 'pl-1'
        )}
        role="list"
        aria-label="Key points from email"
      >
        {visiblePoints.map((point, index) => (
          <li
            key={`key-point-${index}`}
            className={cn(
              'flex items-start gap-1.5',
              'text-muted-foreground',
              // Animate in when expanding
              !isExpanded && index >= maxVisible && 'animate-in fade-in slide-in-from-top-1 duration-200'
            )}
          >
            <CircleDot className={cn(
              'shrink-0 text-primary/60',
              compact ? 'h-2.5 w-2.5 mt-0.5' : 'h-3 w-3 mt-0.5'
            )} />
            <span className="leading-snug">{point}</span>
          </li>
        ))}
      </ul>

      {/* Show all button (alternative to header toggle) */}
      {!isExpanded && hasMorePoints && (
        <button
          onClick={handleToggle}
          className={cn(
            'w-full text-center py-1 rounded',
            'text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50',
            'transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-primary'
          )}
        >
          Show {hiddenCount} more point{hiddenCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default EmailKeyPoints;
