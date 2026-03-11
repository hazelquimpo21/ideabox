/**
 * InboxListFilters — horizontal filter tabs + overflow dropdown.
 *
 * Primary filters: All, Unread, Starred, Priority
 * Overflow menu: Categories, Discoveries, Archive
 *
 * Inspired by the reference inbox designs that use 3-4 clean filter
 * tabs instead of heavy top-level page tabs.
 *
 * @module components/inbox/InboxListFilters
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import { MoreHorizontal, LayoutGrid, Sparkles, Archive } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxListFilters');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Primary email list filters */
export type InboxFilter = 'all' | 'unread' | 'starred' | 'priority';

/** Secondary views accessible from the overflow menu */
export type InboxView = 'emails' | 'categories' | 'discoveries' | 'archive';

export interface InboxListFiltersProps {
  /** Currently active filter */
  activeFilter: InboxFilter;
  /** Currently active view */
  activeView: InboxView;
  /** Callback when a filter tab is clicked */
  onFilterChange: (filter: InboxFilter) => void;
  /** Callback when a secondary view is selected from overflow */
  onViewChange: (view: InboxView) => void;
  /** Optional counts to display on filter tabs */
  counts?: {
    all?: number;
    unread?: number;
    starred?: number;
    priority?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Primary filter tab config */
const FILTER_TABS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All Inbox' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'priority', label: 'Priority' },
];

/** Overflow menu items */
const VIEW_ITEMS: { key: InboxView; label: string; icon: React.ElementType }[] = [
  { key: 'categories', label: 'Categories', icon: LayoutGrid },
  { key: 'discoveries', label: 'Discoveries', icon: Sparkles },
  { key: 'archive', label: 'Archive', icon: Archive },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxListFilters({
  activeFilter,
  activeView,
  onFilterChange,
  onViewChange,
  counts,
}: InboxListFiltersProps) {
  /** Handle filter tab click — also switch back to emails view if in a secondary view */
  const handleFilterClick = React.useCallback(
    (filter: InboxFilter) => {
      logger.info('Filter tab clicked', { filter });
      onFilterChange(filter);
      if (activeView !== 'emails') {
        onViewChange('emails');
      }
    },
    [activeView, onFilterChange, onViewChange],
  );

  /** Handle overflow menu item click */
  const handleViewClick = React.useCallback(
    (view: InboxView) => {
      logger.info('View switched from overflow', { view });
      onViewChange(view);
    },
    [onViewChange],
  );

  // When a secondary view is active, show its label as an active tab-like indicator
  const activeViewItem = VIEW_ITEMS.find((v) => v.key === activeView);

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      {/* Primary filter tabs */}
      {FILTER_TABS.map((tab) => {
        const isActive = activeView === 'emails' && activeFilter === tab.key;
        const count = counts?.[tab.key];

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleFilterClick(tab.key)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {tab.label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">{count > 99 ? '99+' : count}</span>
            )}
          </button>
        );
      })}

      {/* Active secondary view indicator */}
      {activeView !== 'emails' && activeViewItem && (
        <button
          type="button"
          onClick={() => handleViewClick(activeView)}
          className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary whitespace-nowrap"
        >
          {activeViewItem.label}
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Overflow menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="More views"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {VIEW_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            return (
              <DropdownMenuItem
                key={item.key}
                onClick={() => handleViewClick(item.key)}
                className={cn(isActive && 'bg-accent')}
              >
                <Icon className="h-4 w-4 mr-2" />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default InboxListFilters;
