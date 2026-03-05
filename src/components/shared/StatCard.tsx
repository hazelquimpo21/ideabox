/**
 * StatCard — compact stat display with animated number.
 * Implements §3e from VIEW_REDESIGN_PLAN.md.
 *
 * Shows a label, animated value, optional subtitle, and trend indicator.
 * Uses the upgraded Card component with flat elevation for a subtle look.
 * Tooltip on hover shows trend context.
 *
 * @module components/shared/StatCard
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { useAnimatedNumber } from '@/lib/utils/animations';
import { Tooltip } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  /** Display label (e.g. "Events") */
  label: string;
  /** Numeric value to display (animated on change) */
  value: number;
  /** Optional subtitle below the value */
  subtitle?: string;
  /** Tooltip content shown on hover */
  tooltipContent?: React.ReactNode;
  /** Trend direction for visual indicator */
  trend?: 'up' | 'down' | 'flat';
  /** Click handler — navigates to filtered view */
  onClick?: () => void;
  /** Additional className */
  className?: string;
}

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-emerald-500' },
  down: { icon: TrendingDown, color: 'text-red-500' },
  flat: { icon: Minus, color: 'text-muted-foreground' },
} as const;

export function StatCard({
  label,
  value,
  subtitle,
  tooltipContent,
  trend,
  onClick,
  className,
}: StatCardProps) {
  const animatedValue = useAnimatedNumber(value);

  const TrendIcon = trend ? TREND_CONFIG[trend].icon : null;
  const trendColor = trend ? TREND_CONFIG[trend].color : '';

  const content = (
    <div
      className={cn(
        'rounded-lg bg-muted/50 p-3 text-center transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/80',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className="flex items-center justify-center gap-1">
        <span className="text-2xl font-semibold tabular-nums">{animatedValue}</span>
        {TrendIcon && <TrendIcon className={cn('h-4 w-4', trendColor)} />}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>
      )}
    </div>
  );

  if (tooltipContent) {
    return (
      <Tooltip variant="preview" content={tooltipContent}>
        {content}
      </Tooltip>
    );
  }

  return content;
}
