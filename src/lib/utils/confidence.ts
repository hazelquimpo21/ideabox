/**
 * Confidence-Based Visual Affordances Utility
 *
 * Returns CSS classes and optional prefix/indicator based on AI confidence score.
 * Helps users distinguish when the AI is guessing vs. certain.
 *
 * Thresholds:
 * - score >= 0.9: "verified" — subtle checkmark, normal styling
 * - score >= 0.5: "normal" — default styling, no indicators
 * - score < 0.5: "uncertain" — faded/italic, "?" indicator
 *
 * @module lib/utils/confidence
 * @since February 2026 — Phase 2
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Confidence level buckets */
export type ConfidenceLevel = 'verified' | 'normal' | 'uncertain';

/** Return type from getConfidenceStyle */
export interface ConfidenceStyle {
  /** CSS classes to apply to the element */
  className: string;
  /** Optional prefix text for low-confidence items (e.g., "Suggested: ") */
  prefix: string | null;
  /** Whether to show a visual indicator (checkmark or question mark) */
  showIndicator: boolean;
  /** The confidence level bucket */
  level: ConfidenceLevel;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

/** Score at or above which items are considered "verified" */
const VERIFIED_THRESHOLD = 0.9;

/** Score below which items are considered "uncertain" */
const UNCERTAIN_THRESHOLD = 0.5;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * getConfidenceStyle — Returns CSS classes and optional prefix based on confidence score.
 *
 * @param score - Confidence score from 0 to 1 (null/undefined treated as normal)
 * @returns Object with className, prefix, showIndicator, and level
 *
 * @example
 * ```tsx
 * const { className, prefix, showIndicator, level } = getConfidenceStyle(0.95);
 * // { className: '', prefix: null, showIndicator: true, level: 'verified' }
 *
 * const uncertain = getConfidenceStyle(0.3);
 * // { className: 'opacity-60 italic', prefix: 'Suggested: ', showIndicator: true, level: 'uncertain' }
 * ```
 */
export function getConfidenceStyle(score: number | null | undefined): ConfidenceStyle {
  // Treat null/undefined as normal confidence — don't show any indicator
  if (score === null || score === undefined) {
    return {
      className: '',
      prefix: null,
      showIndicator: false,
      level: 'normal',
    };
  }

  if (score >= VERIFIED_THRESHOLD) {
    return {
      className: '',
      prefix: null,
      showIndicator: true,
      level: 'verified',
    };
  }

  if (score < UNCERTAIN_THRESHOLD) {
    return {
      className: 'opacity-60 italic',
      prefix: 'Suggested: ',
      showIndicator: true,
      level: 'uncertain',
    };
  }

  // Normal range (0.5 - 0.9)
  return {
    className: '',
    prefix: null,
    showIndicator: false,
    level: 'normal',
  };
}
