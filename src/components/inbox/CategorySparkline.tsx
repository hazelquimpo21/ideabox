/**
 * CategorySparkline — tiny inline SVG sparkline for 7-day email volume.
 * Implements §5e from VIEW_REDESIGN_PLAN.md.
 *
 * Pure component: receives 7 numbers (one per day) and returns an SVG.
 * Normalized to 0-16px height. Color: text-muted-foreground.
 * No side effects, no state.
 *
 * @module components/inbox/CategorySparkline
 * @since Phase 2 — March 2026
 */

import * as React from 'react';

export interface CategorySparklineProps {
  /** 7 data points (one per day, oldest first) */
  data: number[];
  /** Width in pixels (default: 40) */
  width?: number;
  /** Height in pixels (default: 16) */
  height?: number;
  className?: string;
}

/**
 * Renders a 7-point sparkline as an inline SVG polyline.
 * Values are normalized so the max fills the full height.
 */
export const CategorySparkline = React.memo(function CategorySparkline({
  data,
  width = 40,
  height = 16,
  className,
}: CategorySparklineProps) {
  // Need at least 2 points to draw a line
  if (!data || data.length < 2) return null;

  const max = Math.max(...data, 1); // avoid div-by-zero
  const padding = 1; // small padding so lines don't clip

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
      // Invert y — SVG y=0 is top
      const y = height - padding - ((val / max) * (height - padding * 2));
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export default CategorySparkline;
