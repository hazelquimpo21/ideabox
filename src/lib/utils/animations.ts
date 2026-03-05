/**
 * Animation Utilities — staggered entrance and animated numbers.
 * Implements §3b from VIEW_REDESIGN_PLAN.md.
 *
 * Pure utility functions + one React hook. No external dependencies.
 *
 * @module lib/utils/animations
 */

'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Returns Tailwind classes and inline style for staggered list entrance.
 * Each item fades and slides up with an increasing delay.
 *
 * Delay is capped at 300ms to avoid perceptible lag on long lists.
 * Only use on initial mount — see `hasMounted` ref pattern in consuming components.
 *
 * @param index - Item position in the list (0-based)
 * @param baseDelay - Starting delay in ms (default: 50)
 * @returns Object with className and style for the element
 */
export function staggeredEntrance(
  index: number,
  baseDelay: number = 50
): { className: string; style: React.CSSProperties } {
  const delay = Math.min(index * baseDelay, 300);
  return {
    className: 'animate-fade-slide-up opacity-0',
    style: { animationDelay: `${delay}ms` },
  };
}

/**
 * Hook for smoothly animating a number between values.
 * Uses requestAnimationFrame for 60fps interpolation.
 *
 * Cleans up animation frame on unmount to prevent memory leaks.
 *
 * @param value - Target value to animate to
 * @param duration - Animation duration in ms (default: 400)
 * @returns Current interpolated value (rounded to integer)
 */
export function useAnimatedNumber(value: number, duration: number = 400): number {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    const from = previousValue.current;
    const to = value;
    previousValue.current = value;

    // Skip animation for initial render or zero-change
    if (from === to) {
      setDisplayValue(to);
      return;
    }

    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);

      setDisplayValue(current);

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      }
    }

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [value, duration]);

  return displayValue;
}
