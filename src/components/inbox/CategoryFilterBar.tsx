/**
 * CategoryFilterBar Component
 *
 * Horizontal scrollable category filter pills for the inbox.
 * Shows all 12 life-bucket categories with email counts.
 * Click to filter the email list; "All" to clear the filter.
 *
 * @module components/inbox/CategoryFilterBar
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_DISPLAY } from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryFilterBarProps {
  /** Currently active category filter (null = all) */
  activeCategory: EmailCategory | null;
  /** Callback when a category is selected */
  onCategoryChange: (category: EmailCategory | null) => void;
  /** Category counts from the email data */
  categoryCounts: Partial<Record<string, number>>;
  /** Total email count (for "All" pill) */
  totalCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERED CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categories ordered by priority/importance for display.
 * Work-related first, then personal, then informational.
 */
const ORDERED_CATEGORIES: EmailCategory[] = [
  'client_pipeline',
  'business_work_general',
  'personal_friends_family',
  'family_kids_school',
  'family_health_appointments',
  'finance',
  'travel',
  'shopping',
  'local',
  'newsletters_general',
  'news_politics',
  'product_updates',
];

// ═══════════════════════════════════════════════════════════════════════════════
// PILL COLORS (muted, not overwhelming)
// ═══════════════════════════════════════════════════════════════════════════════

const PILL_COLORS: Record<string, { active: string; inactive: string }> = {
  client_pipeline: {
    active: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
    inactive: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
  },
  business_work_general: {
    active: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700',
    inactive: 'hover:bg-violet-50 dark:hover:bg-violet-950/20',
  },
  personal_friends_family: {
    active: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-200 dark:border-pink-700',
    inactive: 'hover:bg-pink-50 dark:hover:bg-pink-950/20',
  },
  family_kids_school: {
    active: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
    inactive: 'hover:bg-amber-50 dark:hover:bg-amber-950/20',
  },
  family_health_appointments: {
    active: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700',
    inactive: 'hover:bg-rose-50 dark:hover:bg-rose-950/20',
  },
  finance: {
    active: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700',
    inactive: 'hover:bg-green-50 dark:hover:bg-green-950/20',
  },
  travel: {
    active: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700',
    inactive: 'hover:bg-sky-50 dark:hover:bg-sky-950/20',
  },
  shopping: {
    active: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700',
    inactive: 'hover:bg-orange-50 dark:hover:bg-orange-950/20',
  },
  local: {
    active: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700',
    inactive: 'hover:bg-teal-50 dark:hover:bg-teal-950/20',
  },
  newsletters_general: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
    inactive: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
  },
  news_politics: {
    active: 'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-800/40 dark:text-slate-200 dark:border-slate-600',
    inactive: 'hover:bg-slate-50 dark:hover:bg-slate-950/20',
  },
  product_updates: {
    active: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700',
    inactive: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHORT LABELS
// ═══════════════════════════════════════════════════════════════════════════════

const SHORT_LABELS: Record<string, string> = {
  client_pipeline: 'Clients',
  business_work_general: 'Work',
  family_kids_school: 'School',
  family_health_appointments: 'Health',
  personal_friends_family: 'Personal',
  finance: 'Finance',
  travel: 'Travel',
  shopping: 'Shopping',
  local: 'Local',
  newsletters_general: 'Newsletters',
  news_politics: 'News',
  product_updates: 'Updates',
};

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

  // Only show categories that have emails
  const visibleCategories = ORDERED_CATEGORIES.filter(
    (cat) => (categoryCounts[cat] || 0) > 0
  );

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* "All" pill */}
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            activeCategory === null
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
          )}
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
          const label = SHORT_LABELS[category] || display?.label || category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(isActive ? null : category)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                isActive
                  ? colors?.active || 'bg-accent text-accent-foreground border-accent'
                  : cn(
                      'bg-background text-muted-foreground border-border',
                      colors?.inactive || 'hover:bg-muted/50',
                    ),
              )}
            >
              <span className="text-sm leading-none">{display?.icon}</span>
              {label}
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
