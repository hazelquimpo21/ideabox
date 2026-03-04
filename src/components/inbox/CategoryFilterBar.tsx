/**
 * CategoryFilterBar Component
 *
 * Horizontal scrollable row of category filter pills for the inbox.
 * Shows all 12 life-bucket categories with email counts.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEHAVIOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - "All" pill is always first and always visible
 * - Category pills only appear when they have at least 1 email
 * - Clicking an active pill deselects it (toggles back to "All")
 * - Ordering: Work → Personal → Life Admin → Information
 * - Each pill has a unique color theme with light/dark mode support
 * - Scrollbar is hidden for a clean horizontal swipe experience
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Wrapped in React.memo to prevent re-renders when sibling components
 * update. Only re-renders when activeCategory, categoryCounts, or
 * totalCount change.
 *
 * @module components/inbox/CategoryFilterBar
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_DISPLAY, CATEGORY_SHORT_LABELS_PLURAL, CATEGORIES_DISPLAY_ORDER } from '@/types/discovery';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryFilterBar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryFilterBarProps {
  /** Currently active category filter (null = all) */
  activeCategory: EmailCategory | null;
  /** Callback when a category is selected or deselected */
  onCategoryChange: (category: EmailCategory | null) => void;
  /** Category counts from the email data */
  categoryCounts: Partial<Record<string, number>>;
  /** Total email count (for "All" pill) */
  totalCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY ORDERING — uses centralized CATEGORIES_DISPLAY_ORDER from discovery.ts
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// PILL COLOR THEMES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-category color themes for active and hover states.
 * Active: solid background with matching text.
 * Inactive: subtle hover tint matching the category color family.
 */
/**
 * Per-category color themes for active pill and hover states.
 * Updated Mar 2026: Taxonomy v2 — 20 categories.
 */
const PILL_COLORS: Record<string, { active: string; inactive: string }> = {
  // Professional
  clients: {
    active: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-800',
    inactive: 'hover:bg-blue-50/80 dark:hover:bg-blue-950/20',
  },
  work: {
    active: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/50 dark:text-violet-200 dark:border-violet-800',
    inactive: 'hover:bg-violet-50/80 dark:hover:bg-violet-950/20',
  },
  job_search: {
    active: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-800',
    inactive: 'hover:bg-purple-50/80 dark:hover:bg-purple-950/20',
  },
  // People
  personal: {
    active: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/50 dark:text-pink-200 dark:border-pink-800',
    inactive: 'hover:bg-pink-50/80 dark:hover:bg-pink-950/20',
  },
  family: {
    active: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-800',
    inactive: 'hover:bg-amber-50/80 dark:hover:bg-amber-950/20',
  },
  parenting: {
    active: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/50 dark:text-rose-200 dark:border-rose-800',
    inactive: 'hover:bg-rose-50/80 dark:hover:bg-rose-950/20',
  },
  // Life Admin
  health: {
    active: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800',
    inactive: 'hover:bg-red-50/80 dark:hover:bg-red-950/20',
  },
  finance: {
    active: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800',
    inactive: 'hover:bg-green-50/80 dark:hover:bg-green-950/20',
  },
  billing: {
    active: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-900/50 dark:text-lime-200 dark:border-lime-800',
    inactive: 'hover:bg-lime-50/80 dark:hover:bg-lime-950/20',
  },
  // Lifestyle
  travel: {
    active: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-800',
    inactive: 'hover:bg-sky-50/80 dark:hover:bg-sky-950/20',
  },
  shopping: {
    active: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-800',
    inactive: 'hover:bg-orange-50/80 dark:hover:bg-orange-950/20',
  },
  deals: {
    active: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-800',
    inactive: 'hover:bg-yellow-50/80 dark:hover:bg-yellow-950/20',
  },
  // Community
  local: {
    active: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/50 dark:text-teal-200 dark:border-teal-800',
    inactive: 'hover:bg-teal-50/80 dark:hover:bg-teal-950/20',
  },
  civic: {
    active: 'bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900/50 dark:text-stone-200 dark:border-stone-700',
    inactive: 'hover:bg-stone-50/80 dark:hover:bg-stone-950/20',
  },
  sports: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-800',
    inactive: 'hover:bg-emerald-50/80 dark:hover:bg-emerald-950/20',
  },
  // Information
  news: {
    active: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700',
    inactive: 'hover:bg-slate-50/80 dark:hover:bg-slate-950/20',
  },
  politics: {
    active: 'bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-800/50 dark:text-gray-200 dark:border-gray-700',
    inactive: 'hover:bg-gray-50/80 dark:hover:bg-gray-950/20',
  },
  newsletters: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-800',
    inactive: 'hover:bg-emerald-50/80 dark:hover:bg-emerald-950/20',
  },
  product_updates: {
    active: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:border-indigo-800',
    inactive: 'hover:bg-indigo-50/80 dark:hover:bg-indigo-950/20',
  },
  // System
  notifications: {
    active: 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-200 dark:border-zinc-800',
    inactive: 'hover:bg-zinc-50/80 dark:hover:bg-zinc-950/20',
  },
};

// SHORT_LABELS — now using centralized CATEGORY_SHORT_LABELS_PLURAL from discovery.ts

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CategoryFilterBar = React.memo(function CategoryFilterBar({
  activeCategory,
  onCategoryChange,
  categoryCounts,
  totalCount,
}: CategoryFilterBarProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Only render pills for categories that have at least one email
  const visibleCategories = CATEGORIES_DISPLAY_ORDER.filter(
    (cat) => (categoryCounts[cat] || 0) > 0
  );

  return (
    <div className="relative" role="toolbar" aria-label="Category filters">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* "All" pill — always visible, inverted colors when active */}
        <button
          type="button"
          onClick={() => {
            logger.info('Filter reset to All');
            onCategoryChange(null);
          }}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
            'text-xs font-medium border transition-all duration-150',
            activeCategory === null
              ? 'bg-foreground text-background border-foreground shadow-sm'
              : 'bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
          )}
          aria-pressed={activeCategory === null}
        >
          All
          {totalCount !== undefined && totalCount > 0 && (
            <span className={cn(
              'text-[10px] tabular-nums',
              activeCategory === null ? 'opacity-70' : 'opacity-50',
            )}>
              {totalCount}
            </span>
          )}
        </button>

        {/* Category pills */}
        {visibleCategories.map((category) => {
          const isActive = activeCategory === category;
          const count = categoryCounts[category] || 0;
          const display = CATEGORY_DISPLAY[category];
          const colors = PILL_COLORS[category];
          const label = CATEGORY_SHORT_LABELS_PLURAL[category] || display?.label || category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => {
                logger.info('Category pill clicked', { category, isActive });
                onCategoryChange(isActive ? null : category);
              }}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'text-xs font-medium border transition-all duration-150',
                isActive
                  ? cn(colors?.active || 'bg-accent text-accent-foreground border-accent', 'shadow-sm')
                  : cn(
                      'bg-background text-muted-foreground border-border',
                      colors?.inactive || 'hover:bg-muted/50',
                      'hover:text-foreground',
                    ),
              )}
              aria-pressed={isActive}
            >
              {/* Category emoji icon */}
              <span className="text-sm leading-none" aria-hidden="true">
                {display?.icon}
              </span>
              {label}
              {/* Email count badge */}
              {count > 0 && (
                <span className={cn(
                  'text-[10px] tabular-nums',
                  isActive ? 'opacity-70' : 'opacity-50',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default CategoryFilterBar;
