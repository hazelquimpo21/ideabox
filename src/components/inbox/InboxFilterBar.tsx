/**
 * InboxFilterBar Component
 *
 * A horizontal bar of toggle chips above the email list that lets users
 * quickly filter by analyzer intelligence: must-reply, high-signal,
 * golden nuggets, and events.
 *
 * Multiple filters can be active simultaneously (AND logic).
 * Active chips use primary colors, inactive use muted styling.
 *
 * @module components/inbox/InboxFilterBar
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { Reply, Zap, Gem, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { EmailStats } from '@/hooks/useEmails';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxFilterBar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Active filter state — keys match filter chip identifiers */
export interface InboxFilters {
  mustReply: boolean;
  highSignal: boolean;
  hasNuggets: boolean;
  hasEvents: boolean;
}

export interface InboxFilterBarProps {
  /** Email stats containing counts for each filter */
  stats: EmailStats;
  /** Currently active filters */
  activeFilters: InboxFilters;
  /** Callback when a filter is toggled */
  onFilterToggle: (key: keyof InboxFilters) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER CHIP CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

interface FilterChipConfig {
  key: keyof InboxFilters;
  label: string;
  icon: React.ElementType;
  /** Function to extract count from stats */
  getCount: (stats: EmailStats) => number;
  activeClass: string;
}

const FILTER_CHIPS: FilterChipConfig[] = [
  {
    key: 'mustReply',
    label: 'Must Reply',
    icon: Reply,
    getCount: (s) => s.mustReplyCount,
    activeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  },
  {
    key: 'highSignal',
    label: 'High Signal',
    icon: Zap,
    getCount: (s) => s.highSignalCount,
    activeClass: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
  },
  {
    key: 'hasNuggets',
    label: 'Has Nuggets',
    icon: Gem,
    getCount: (s) => s.nuggetCount,
    activeClass: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  },
  {
    key: 'hasEvents',
    label: 'Events',
    icon: Calendar,
    getCount: (s) => s.events,
    activeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InboxFilterBar — horizontal toggle chips for filtering emails by intelligence.
 *
 * Renders only chips that have a count > 0 to avoid visual clutter.
 * When no filters are active, this row is compact and unobtrusive.
 */
export function InboxFilterBar({ stats, activeFilters, onFilterToggle }: InboxFilterBarProps) {
  // Only show chips that have relevant emails
  const visibleChips = FILTER_CHIPS.filter((chip) => chip.getCount(stats) > 0);

  // Don't render if no filters are relevant
  if (visibleChips.length === 0) {
    return null;
  }

  const hasActiveFilter = Object.values(activeFilters).some(Boolean);

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5"
      role="toolbar"
      aria-label="Email intelligence filters"
    >
      {visibleChips.map((chip) => {
        const isActive = activeFilters[chip.key];
        const count = chip.getCount(stats);
        const Icon = chip.icon;

        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => {
              logger.debug('Filter toggled', { filter: chip.key, active: !isActive, stats });
              onFilterToggle(chip.key);
            }}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0',
              isActive
                ? chip.activeClass
                : 'bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:border-border',
            )}
            aria-pressed={isActive}
          >
            <Icon className="h-3 w-3" />
            {chip.label}
            <span className={cn(
              'tabular-nums',
              isActive ? 'opacity-80' : 'opacity-60',
            )}>
              ({count})
            </span>
          </button>
        );
      })}

      {/* Clear all filters button — only show when filters are active */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={() => {
            logger.debug('All filters cleared');
            for (const chip of FILTER_CHIPS) {
              if (activeFilters[chip.key]) {
                onFilterToggle(chip.key);
              }
            }
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default InboxFilterBar;
