/**
 * RelatedItemRow — single row in the RelatedItems section.
 *
 * Displays a type icon, truncated title, optional subtitle,
 * and navigates to the entity on click.
 *
 * @module components/shared/RelatedItemRow
 * @since March 2026 — Phase 2 Cross-Entity Navigation
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Mail,
  CheckSquare,
  Calendar,
  AlertTriangle,
  User,
  Link2,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { RelatedItem } from '@/hooks/useRelatedItems';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE ICON MAP
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_CONFIG: Record<
  RelatedItem['type'],
  { icon: React.ElementType; color: string }
> = {
  email:    { icon: Mail,          color: 'text-blue-500' },
  task:     { icon: CheckSquare,   color: 'text-blue-600' },
  event:    { icon: Calendar,      color: 'text-purple-500' },
  deadline: { icon: AlertTriangle, color: 'text-red-500' },
  contact:  { icon: User,          color: 'text-green-500' },
  link:     { icon: Link2,         color: 'text-cyan-500' },
  idea:     { icon: Lightbulb,     color: 'text-amber-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface RelatedItemRowProps {
  item: RelatedItem;
}

export function RelatedItemRow({ item }: RelatedItemRowProps) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.email;
  const Icon = config.icon;

  return (
    <Link
      href={item.url}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md',
        'hover:bg-muted/60 transition-colors text-sm',
      )}
      title={item.title}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color)} />
      <span className="truncate flex-1 min-w-0">{item.title}</span>
      {item.subtitle && (
        <span className="text-xs text-muted-foreground/60 shrink-0 capitalize">
          {item.subtitle}
        </span>
      )}
      {item.status && (
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
          item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-muted/60',
        )}>
          {item.status}
        </span>
      )}
    </Link>
  );
}
