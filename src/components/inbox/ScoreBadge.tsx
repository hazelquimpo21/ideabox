/**
 * ScoreBadge Component
 *
 * Visual indicator for the composite surface_priority score.
 * Displays as a small colored dot or bar that communicates
 * how urgently an email should be seen.
 *
 * | Score Range | Color  | Label      | Behavior              |
 * |-------------|--------|------------|-----------------------|
 * | > 0.8       | Red    | Critical   | Push notification     |
 * | 0.5–0.8     | Orange | Important  | Include in summary    |
 * | 0.3–0.5     | Yellow | Moderate   | Daily digest          |
 * | < 0.3       | Green  | Low        | Silent, archive-ready |
 *
 * @module components/inbox/ScoreBadge
 * @since March 2026 — Taxonomy v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ScoreBadgeProps {
  /** The surface priority score (0.0–1.0) */
  score: number | null | undefined;
  /** Display variant — 'dot' for minimal, 'bar' for wider context */
  variant?: 'dot' | 'bar' | 'pill';
  /** Show the numeric score value */
  showValue?: boolean;
  /** Additional className */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

interface ScoreLevel {
  min: number;
  label: string;
  dotColor: string;
  barColor: string;
  textColor: string;
  pillBg: string;
  animate: boolean;
}

const SCORE_LEVELS: ScoreLevel[] = [
  {
    min: 0.8,
    label: 'Critical',
    dotColor: 'bg-red-500',
    barColor: 'bg-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    pillBg: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
    animate: true,
  },
  {
    min: 0.5,
    label: 'Important',
    dotColor: 'bg-orange-500',
    barColor: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
    pillBg: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
    animate: false,
  },
  {
    min: 0.3,
    label: 'Moderate',
    dotColor: 'bg-yellow-500',
    barColor: 'bg-yellow-500',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    pillBg: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300',
    animate: false,
  },
  {
    min: 0,
    label: 'Low',
    dotColor: 'bg-green-500',
    barColor: 'bg-green-400',
    textColor: 'text-green-600 dark:text-green-400',
    pillBg: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
    animate: false,
  },
];

/** Get the score level config for a given score */
function getScoreLevel(score: number): ScoreLevel {
  for (const level of SCORE_LEVELS) {
    if (score >= level.min) return level;
  }
  return SCORE_LEVELS[SCORE_LEVELS.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ScoreBadge = React.memo(function ScoreBadge({
  score,
  variant = 'dot',
  showValue = false,
  className,
}: ScoreBadgeProps) {
  if (score == null) return null;

  const level = getScoreLevel(score);
  const tooltip = `Priority: ${level.label} (${Math.round(score * 100)}%)`;

  // ── Dot variant — minimal colored circle ─────────────────────────────────
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-block w-2 h-2 rounded-full shrink-0',
          level.dotColor,
          level.animate && 'animate-pulse',
          className,
        )}
        title={tooltip}
        aria-label={tooltip}
      />
    );
  }

  // ── Bar variant — horizontal fill bar ────────────────────────────────────
  if (variant === 'bar') {
    return (
      <div
        className={cn('w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden', className)}
        title={tooltip}
        aria-label={tooltip}
      >
        <div
          className={cn('h-full rounded-full transition-all', level.barColor)}
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
    );
  }

  // ── Pill variant — labeled badge ─────────────────────────────────────────
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        level.pillBg,
        className,
      )}
      title={tooltip}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', level.dotColor, level.animate && 'animate-pulse')} />
      {showValue ? `${Math.round(score * 100)}%` : level.label}
    </span>
  );
});

export default ScoreBadge;
