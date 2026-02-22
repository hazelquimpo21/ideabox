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
const PILL_COLORS: Record<string, { active: string; inactive: string }> = {
  clients: {
    active: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-800',
    inactive: 'hover:bg-blue-50/80 dark:hover:bg-blue-950/20',
  },
  work: {
    active: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/50 dark:text-violet-200 dark:border-violet-800',
    inactive: 'hover:bg-violet-50/80 dark:hover:bg-violet-950/20',
  },
  personal_friends_family: {
    active: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/50 dark:text-pink-200 dark:border-pink-800',
    inactive: 'hover:bg-pink-50/80 dark:hover:bg-pink-950/20',
  },
  family: {
    active: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-800',
    inactive: 'hover:bg-amber-50/80 dark:hover:bg-amber-950/20',
  },
  finance: {
    active: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800',
    inactive: 'hover:bg-green-50/80 dark:hover:bg-green-950/20',
  },
  travel: {
    active: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-800',
    inactive: 'hover:bg-sky-50/80 dark:hover:bg-sky-950/20',
  },
  shopping: {
    active: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-800',
    inactive: 'hover:bg-orange-50/80 dark:hover:bg-orange-950/20',
  },
  local: {
    active: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/50 dark:text-teal-200 dark:border-teal-800',
    inactive: 'hover:bg-teal-50/80 dark:hover:bg-teal-950/20',
  },
  newsletters_creator: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-800',
    inactive: 'hover:bg-emerald-50/80 dark:hover:bg-emerald-950/20',
  },
  newsletters_industry: {
    active: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/50 dark:text-cyan-200 dark:border-cyan-800',
    inactive: 'hover:bg-cyan-50/80 dark:hover:bg-cyan-950/20',
  },
  news_politics: {
    active: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700',
    inactive: 'hover:bg-slate-50/80 dark:hover:bg-slate-950/20',
  },
  product_updates: {
    active: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:border-indigo-800',
    inactive: 'hover:bg-indigo-50/80 dark:hover:bg-indigo-950/20',
  },
  other: {
    active: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-200 dark:border-gray-700',
    inactive: 'hover:bg-gray-50/80 dark:hover:bg-gray-950/20',
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

  logger.debug('Rendering filter bar', {
    activeCategory: activeCategory || 'all',
    visibleCount: visibleCategories.length,
    totalCount,
  });

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
