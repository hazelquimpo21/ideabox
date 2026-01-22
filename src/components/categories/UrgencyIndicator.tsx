/**
 * UrgencyIndicator Component
 *
 * Displays visual urgency dots based on urgency scores from email analysis.
 * Provides at-a-glance understanding of how many urgent items exist.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Color-coded dots: red (8-10), orange (5-7), yellow (3-4)
 * - Animated pulse for critical items (8+)
 * - Overflow indicator (+N) when too many to display
 * - Compact and full display modes
 * - Accessible with screen reader support
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage with urgency scores
 * <UrgencyIndicator scores={[9, 8, 6, 4]} />
 *
 * // Compact mode for tight spaces
 * <UrgencyIndicator scores={[9, 8, 6]} compact />
 *
 * // With custom max dots
 * <UrgencyIndicator scores={[9, 8, 6, 4, 3]} maxDots={3} />
 * ```
 *
 * @module components/categories/UrgencyIndicator
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('UrgencyIndicator');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UrgencyIndicatorProps {
  /** Array of urgency scores (0-10) */
  scores: number[];
  /** Maximum number of dots to display (default: 4) */
  maxDots?: number;
  /** Compact mode - smaller dots, no labels */
  compact?: boolean;
  /** Show count label (e.g., "4 urgent") */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Urgency level configuration
 */
interface UrgencyLevel {
  min: number;
  max: number;
  color: string;
  bgColor: string;
  pulseColor: string;
  label: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Urgency level thresholds and styling
 * - Critical (8-10): Red, animated pulse
 * - High (5-7): Orange
 * - Medium (3-4): Yellow
 * - Low (0-2): Not displayed
 */
const URGENCY_LEVELS: UrgencyLevel[] = [
  {
    min: 8,
    max: 10,
    color: 'bg-red-500',
    bgColor: 'bg-red-100',
    pulseColor: 'bg-red-400',
    label: 'critical',
  },
  {
    min: 5,
    max: 7,
    color: 'bg-orange-500',
    bgColor: 'bg-orange-100',
    pulseColor: 'bg-orange-400',
    label: 'high',
  },
  {
    min: 3,
    max: 4,
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-100',
    pulseColor: 'bg-yellow-400',
    label: 'medium',
  },
];

/**
 * Get urgency level config for a given score
 */
function getUrgencyLevel(score: number): UrgencyLevel | null {
  for (const level of URGENCY_LEVELS) {
    if (score >= level.min && score <= level.max) {
      return level;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays visual urgency indicator dots based on urgency scores.
 *
 * @example
 * ```tsx
 * // In a category card header
 * <div className="flex items-center gap-2">
 *   <span>Client Pipeline</span>
 *   <UrgencyIndicator scores={[9, 8, 6, 4]} showLabel />
 * </div>
 * ```
 */
export function UrgencyIndicator({
  scores,
  maxDots = 4,
  compact = false,
  showLabel = false,
  className,
}: UrgencyIndicatorProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // Filter and sort scores
  // ───────────────────────────────────────────────────────────────────────────

  // Only consider scores >= 3 (medium urgency or higher)
  const significantScores = React.useMemo(() => {
    const filtered = scores.filter((s) => s >= 3);
    // Sort descending so most urgent appear first
    return filtered.sort((a, b) => b - a);
  }, [scores]);

  // ───────────────────────────────────────────────────────────────────────────
  // Debug logging
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (significantScores.length > 0) {
      logger.debug('Rendering urgency indicator', {
        totalScores: scores.length,
        significantCount: significantScores.length,
        criticalCount: significantScores.filter((s) => s >= 8).length,
      });
    }
  }, [scores, significantScores]);

  // ───────────────────────────────────────────────────────────────────────────
  // Early return if no significant urgency
  // ───────────────────────────────────────────────────────────────────────────

  if (significantScores.length === 0) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Calculate display values
  // ───────────────────────────────────────────────────────────────────────────

  const displayScores = significantScores.slice(0, maxDots);
  const overflowCount = significantScores.length - maxDots;
  const criticalCount = significantScores.filter((s) => s >= 8).length;
  const urgentCount = significantScores.filter((s) => s >= 5).length;

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        className
      )}
      role="status"
      aria-label={`${urgentCount} urgent items, ${criticalCount} critical`}
    >
      {/* Urgency label */}
      {showLabel && urgentCount > 0 && (
        <span className={cn(
          'text-xs font-medium text-red-600 dark:text-red-400 mr-1',
          compact && 'sr-only'
        )}>
          {criticalCount > 0 ? `${criticalCount} urgent` : `${urgentCount} need attention`}
        </span>
      )}

      {/* Urgency dots */}
      <div className="flex items-center gap-0.5">
        {displayScores.map((score, index) => {
          const level = getUrgencyLevel(score);
          if (!level) return null;

          const isCritical = score >= 8;
          const dotSize = compact ? 'h-1.5 w-1.5' : 'h-2 w-2';

          return (
            <span
              key={`urgency-${index}-${score}`}
              className={cn(
                'rounded-full relative',
                dotSize,
                level.color,
                // Pulse animation for critical items
                isCritical && 'animate-pulse'
              )}
              title={`Urgency: ${score}/10 (${level.label})`}
            >
              {/* Pulse ring for critical items */}
              {isCritical && !compact && (
                <span
                  className={cn(
                    'absolute inset-0 rounded-full animate-ping opacity-75',
                    level.pulseColor
                  )}
                  style={{ animationDuration: '2s' }}
                />
              )}
            </span>
          );
        })}

        {/* Overflow indicator */}
        {overflowCount > 0 && (
          <span
            className={cn(
              'text-muted-foreground',
              compact ? 'text-[10px]' : 'text-xs'
            )}
            title={`${overflowCount} more urgent items`}
          >
            +{overflowCount}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default UrgencyIndicator;
