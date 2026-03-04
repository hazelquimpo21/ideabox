/**
 * TimelinessIcon Component
 *
 * Small SVG icons representing the six timeliness nature values.
 * These communicate an email's temporal character at a glance.
 *
 * | Nature     | Icon          | Visual meaning               |
 * |------------|---------------|-------------------------------|
 * | ephemeral  | Lightning     | Fleeting, act in seconds      |
 * | today      | Sun           | Relevant today only           |
 * | upcoming   | Calendar      | Future event/deadline         |
 * | asap       | Exclamation   | Needs action now              |
 * | reference  | Bookmark      | File for later retrieval      |
 * | evergreen  | Leaf          | Read whenever, no pressure    |
 *
 * @module components/inbox/TimelinessIcon
 * @since March 2026 — Taxonomy v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import type { TimelinessNature } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TimelinessIconProps {
  /** The timeliness nature value to render */
  nature: TimelinessNature | null | undefined;
  /** Icon size in pixels (default: 14) */
  size?: number;
  /** Additional className */
  className?: string;
  /** Show tooltip label on hover */
  showTooltip?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR MAP — each nature has a distinct color for instant recognition
// ═══════════════════════════════════════════════════════════════════════════════

const NATURE_COLORS: Record<TimelinessNature, string> = {
  ephemeral: 'text-red-500 dark:text-red-400',       // Urgent red — fleeting
  today:     'text-amber-500 dark:text-amber-400',    // Warm amber — today
  upcoming:  'text-blue-500 dark:text-blue-400',      // Calm blue — future
  asap:      'text-orange-500 dark:text-orange-400',   // Alert orange — act now
  reference: 'text-slate-400 dark:text-slate-500',     // Muted gray — file away
  evergreen: 'text-green-500 dark:text-green-400',     // Living green — anytime
};

const NATURE_LABELS: Record<TimelinessNature, string> = {
  ephemeral: 'Expires quickly',
  today:     'Relevant today',
  upcoming:  'Upcoming event',
  asap:      'Needs action now',
  reference: 'Reference / file',
  evergreen: 'Read anytime',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVG WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

function IconSvg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Lightning bolt — ephemeral */
function LightningIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </IconSvg>
  );
}

/** Sun — today */
function SunIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </IconSvg>
  );
}

/** Calendar with forward arrow — upcoming */
function CalendarIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M12 16l3-3-3-3" />
    </IconSvg>
  );
}

/** Exclamation in circle — asap */
function ExclamationIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </IconSvg>
  );
}

/** Bookmark — reference */
function BookmarkIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
    </IconSvg>
  );
}

/** Leaf — evergreen */
function LeafIcon({ size }: { size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 20 4 20 4s-.9 4.5-2.9 10.2A7 7 0 0 1 11 20Z" />
      <path d="M4 21c1.5-2.5 3-4.5 5-6" />
    </IconSvg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const NATURE_ICONS: Record<TimelinessNature, React.FC<{ size: number }>> = {
  ephemeral: LightningIcon,
  today: SunIcon,
  upcoming: CalendarIcon,
  asap: ExclamationIcon,
  reference: BookmarkIcon,
  evergreen: LeafIcon,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const TimelinessIcon = React.memo(function TimelinessIcon({
  nature,
  size = 14,
  className,
  showTooltip = true,
}: TimelinessIconProps) {
  if (!nature) return null;

  const IconComponent = NATURE_ICONS[nature];
  const color = NATURE_COLORS[nature];
  const label = NATURE_LABELS[nature];

  if (!IconComponent) return null;

  return (
    <span
      className={cn('inline-flex items-center shrink-0', color, className)}
      title={showTooltip ? label : undefined}
      aria-label={label}
    >
      <IconComponent size={size} />
    </span>
  );
});

export default TimelinessIcon;
