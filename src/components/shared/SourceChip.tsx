/**
 * SourceChip — standardized source/forward link pill.
 *
 * Replaces inconsistent inline source email links across triage cards,
 * project item rows, and date expanded views with a uniform component.
 *
 * Two directions:
 * - backward (default): "from" semantics — muted bg, shows where item came from
 * - forward: "became" semantics — slightly more prominent, shows what was produced
 *
 * @module components/shared/SourceChip
 * @since March 2026 — Phase 2 Source Chip Standardization
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Mail,
  CheckSquare,
  Calendar,
  User,
  Link2,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SourceChipProps {
  /** Entity type for icon and navigation */
  type: 'email' | 'task' | 'event' | 'contact' | 'link' | 'idea';
  /** Entity ID for navigation */
  id: string;
  /** Display label (truncated) */
  label: string;
  /** Direction: backward = "from", forward = "became" */
  direction?: 'backward' | 'forward';
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION MAP
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps entity type to navigation URL */
function getEntityUrl(type: SourceChipProps['type'], id: string): string {
  switch (type) {
    case 'email':   return `/inbox?email=${id}`;
    case 'task':    return `/tasks?item=${id}`;
    case 'event':   return `/calendar?highlight=${id}`;
    case 'contact': return `/contacts/${id}`;
    case 'link':    return `/inbox?link=${id}`;
    case 'idea':    return `/tasks?item=${id}`;
    default:        return '#';
  }
}

/** Maps entity type to icon component */
const TYPE_ICONS: Record<SourceChipProps['type'], React.ElementType> = {
  email:   Mail,
  task:    CheckSquare,
  event:   Calendar,
  contact: User,
  link:    Link2,
  idea:    Lightbulb,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standardized source/forward link pill.
 *
 * @example
 * // Backward: "from email"
 * <SourceChip type="email" id={emailId} label={emailSubject} />
 *
 * // Forward: "became task"
 * <SourceChip type="task" id={taskId} label={taskTitle} direction="forward" />
 */
export function SourceChip({ type, id, label, direction = 'backward' }: SourceChipProps) {
  const Icon = TYPE_ICONS[type] || Mail;
  const href = getEntityUrl(type, id);
  const isForward = direction === 'forward';

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full',
        'text-[10px] transition-colors truncate max-w-[160px]',
        isForward
          ? 'bg-primary/10 text-primary hover:bg-primary/20 font-medium'
          : 'bg-muted/60 hover:bg-muted hover:text-foreground text-muted-foreground',
      )}
      title={label}
    >
      {isForward && <ArrowRight className="h-2.5 w-2.5 shrink-0" />}
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
