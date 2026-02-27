/**
 * Project Date Range Component
 *
 * Visual date range bar showing start→end with progress indicator.
 * Used in ProjectCard and project detail header.
 *
 * @module components/projects/ProjectDateRange
 * @since February 2026
 */

'use client';

import { Calendar } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectDateRangeProps {
  startDate: string | null;
  endDate: string | null;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00').getTime();
  const end = new Date(endDate + 'T00:00:00').getTime();
  const now = Date.now();

  if (now <= start) return 0;
  if (now >= end) return 100;

  return Math.round(((now - start) / (end - start)) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectDateRange({ startDate, endDate, compact = false }: ProjectDateRangeProps) {
  if (!startDate && !endDate) return null;

  const hasRange = startDate && endDate;
  const progress = hasRange ? getProgress(startDate, endDate) : null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
        {startDate && formatDate(startDate)}
        {hasRange && ' — '}
        {endDate && formatDate(endDate)}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {startDate ? formatDate(startDate) : 'No start'}
        </span>
        <span>{endDate ? formatDate(endDate) : 'No end'}</span>
      </div>
      {progress !== null && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
