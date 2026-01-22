/**
 * RelationshipHealth Component
 *
 * Displays aggregated relationship health based on relationship signals
 * from email analysis. Shows the overall "pulse" of relationships in
 * a category or set of emails.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Aggregates positive/neutral/negative signals
 * - Emoji-based visual indicators for quick scanning
 * - Highlights negative signals as needing attention
 * - Compact and expanded display modes
 * - Accessible with screen reader support
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage with signal counts
 * <RelationshipHealth positive={5} neutral={10} negative={2} />
 *
 * // Compact mode for card headers
 * <RelationshipHealth positive={5} neutral={10} negative={2} compact />
 *
 * // Bar mode for visual representation
 * <RelationshipHealth positive={5} neutral={10} negative={2} variant="bar" />
 * ```
 *
 * @module components/categories/RelationshipHealth
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { RelationshipSignal } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('RelationshipHealth');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RelationshipHealthProps {
  /** Count of positive relationship signals */
  positive: number;
  /** Count of neutral relationship signals */
  neutral: number;
  /** Count of negative relationship signals (needs attention) */
  negative: number;
  /** Display variant: 'badges' (default), 'bar', or 'compact' */
  variant?: 'badges' | 'bar' | 'compact';
  /** Additional CSS classes */
  className?: string;
  /** Show only if there are negative signals */
  showOnlyIfConcern?: boolean;
}

/**
 * Health status configuration
 */
interface HealthStatus {
  emoji: string;
  label: string;
  color: string;
  bgColor: string;
  count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const HEALTH_CONFIG = {
  positive: {
    emoji: '😊',
    label: 'positive',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  neutral: {
    emoji: '😐',
    label: 'neutral',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  negative: {
    emoji: '😟',
    label: 'needs attention',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate overall health status based on signal counts
 */
function calculateOverallHealth(
  positive: number,
  neutral: number,
  negative: number
): 'healthy' | 'mixed' | 'concern' {
  const total = positive + neutral + negative;
  if (total === 0) return 'healthy';

  const negativeRatio = negative / total;
  const positiveRatio = positive / total;

  if (negativeRatio > 0.3) return 'concern';
  if (positiveRatio > 0.5) return 'healthy';
  return 'mixed';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays relationship health indicator for a category or email set.
 *
 * @example
 * ```tsx
 * // In a category card footer
 * <RelationshipHealth
 *   positive={categoryData.positiveSignals}
 *   neutral={categoryData.neutralSignals}
 *   negative={categoryData.negativeSignals}
 * />
 * ```
 */
export function RelationshipHealth({
  positive,
  neutral,
  negative,
  variant = 'badges',
  className,
  showOnlyIfConcern = false,
}: RelationshipHealthProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // Calculate health
  // ───────────────────────────────────────────────────────────────────────────

  const total = positive + neutral + negative;
  const overallHealth = calculateOverallHealth(positive, neutral, negative);

  // ───────────────────────────────────────────────────────────────────────────
  // Debug logging
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (total > 0) {
      logger.debug('Rendering relationship health', {
        positive,
        neutral,
        negative,
        total,
        overallHealth,
      });
    }
  }, [positive, neutral, negative, total, overallHealth]);

  // ───────────────────────────────────────────────────────────────────────────
  // Early returns
  // ───────────────────────────────────────────────────────────────────────────

  if (total === 0) {
    return null;
  }

  // Only show if there are concerns (when showOnlyIfConcern is true)
  if (showOnlyIfConcern && negative === 0) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Compact variant (just emoji with count)
  // ───────────────────────────────────────────────────────────────────────────

  if (variant === 'compact') {
    return (
      <div
        className={cn('flex items-center gap-1 text-xs', className)}
        role="status"
        aria-label={`Relationship health: ${positive} positive, ${neutral} neutral, ${negative} need attention`}
      >
        {positive > 0 && (
          <span className={HEALTH_CONFIG.positive.color} title={`${positive} positive`}>
            {HEALTH_CONFIG.positive.emoji}{positive}
          </span>
        )}
        {neutral > 0 && (
          <span className={HEALTH_CONFIG.neutral.color} title={`${neutral} neutral`}>
            {HEALTH_CONFIG.neutral.emoji}{neutral}
          </span>
        )}
        {negative > 0 && (
          <span
            className={cn(HEALTH_CONFIG.negative.color, 'font-medium')}
            title={`${negative} need attention`}
          >
            {HEALTH_CONFIG.negative.emoji}{negative}
          </span>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Bar variant (visual proportion bar)
  // ───────────────────────────────────────────────────────────────────────────

  if (variant === 'bar') {
    const positivePercent = Math.round((positive / total) * 100);
    const neutralPercent = Math.round((neutral / total) * 100);
    const negativePercent = Math.round((negative / total) * 100);

    return (
      <div
        className={cn('space-y-1', className)}
        role="status"
        aria-label={`Relationship health: ${positivePercent}% positive, ${neutralPercent}% neutral, ${negativePercent}% need attention`}
      >
        {/* Progress bar */}
        <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
          {positive > 0 && (
            <div
              className="bg-green-500"
              style={{ width: `${positivePercent}%` }}
              title={`${positive} positive (${positivePercent}%)`}
            />
          )}
          {neutral > 0 && (
            <div
              className="bg-gray-400"
              style={{ width: `${neutralPercent}%` }}
              title={`${neutral} neutral (${neutralPercent}%)`}
            />
          )}
          {negative > 0 && (
            <div
              className="bg-amber-500"
              style={{ width: `${negativePercent}%` }}
              title={`${negative} need attention (${negativePercent}%)`}
            />
          )}
        </div>

        {/* Summary text */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} total</span>
          {negative > 0 && (
            <span className={HEALTH_CONFIG.negative.color}>
              {negative} need attention
            </span>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Badges variant (default)
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('flex items-center gap-2 flex-wrap text-xs', className)}
      role="status"
      aria-label={`Relationship health: ${positive} positive, ${neutral} neutral, ${negative} need attention`}
    >
      {positive > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded',
            HEALTH_CONFIG.positive.bgColor,
            HEALTH_CONFIG.positive.color
          )}
          title={`${positive} emails with positive tone`}
        >
          {HEALTH_CONFIG.positive.emoji}
          <span>{positive}</span>
        </span>
      )}

      {neutral > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded',
            HEALTH_CONFIG.neutral.bgColor,
            HEALTH_CONFIG.neutral.color
          )}
          title={`${neutral} emails with neutral tone`}
        >
          {HEALTH_CONFIG.neutral.emoji}
          <span>{neutral}</span>
        </span>
      )}

      {negative > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium',
            HEALTH_CONFIG.negative.bgColor,
            HEALTH_CONFIG.negative.color
          )}
          title={`${negative} emails that may need attention`}
        >
          {HEALTH_CONFIG.negative.emoji}
          <span>{negative}</span>
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTION - Aggregate signals from email analyses
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregates relationship signals from an array of signals.
 * Use this to prepare data for the RelationshipHealth component.
 *
 * @example
 * ```typescript
 * const signals = emails.map(e => e.relationshipSignal);
 * const counts = aggregateSignals(signals);
 * // { positive: 5, neutral: 10, negative: 2 }
 * ```
 */
export function aggregateSignals(signals: (RelationshipSignal | null | undefined)[]): {
  positive: number;
  neutral: number;
  negative: number;
} {
  const result = { positive: 0, neutral: 0, negative: 0 };

  for (const signal of signals) {
    if (signal === 'positive') {
      result.positive++;
    } else if (signal === 'negative') {
      result.negative++;
    } else if (signal === 'neutral' || signal === 'unknown' || signal === null || signal === undefined) {
      result.neutral++;
    }
  }

  logger.debug('Aggregated relationship signals', {
    totalSignals: signals.length,
    ...result,
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default RelationshipHealth;
