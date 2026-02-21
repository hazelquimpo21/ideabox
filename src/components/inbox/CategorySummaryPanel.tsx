/**
 * CategorySummaryPanel Component
 *
 * Right sidebar panel showing compact category summaries.
 * Provides quick overview of email distribution and allows
 * clicking to filter the main email list.
 *
 * Hidden on mobile, visible on large screens (lg+).
 *
 * @module components/inbox/CategorySummaryPanel
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

export interface CategorySummaryPanelProps {
  /** Category counts from the email data */
  categoryCounts: Partial<Record<string, number>>;
  /** Currently active category filter (null = all) */
  activeCategory: EmailCategory | null;
  /** Callback when a category is clicked */
  onCategoryClick: (category: EmailCategory | null) => void;
  /** Total email count */
  totalCount: number;
  /** Unread email count */
  unreadCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY GROUPS
// ═══════════════════════════════════════════════════════════════════════════════

interface CategoryGroup {
  label: string;
  categories: EmailCategory[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Work',
    categories: ['client_pipeline', 'business_work_general'],
  },
  {
    label: 'Personal',
    categories: ['personal_friends_family', 'family_kids_school', 'family_health_appointments'],
  },
  {
    label: 'Life Admin',
    categories: ['finance', 'travel', 'shopping', 'local'],
  },
  {
    label: 'Information',
    categories: ['newsletters_general', 'news_politics', 'product_updates'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BAR COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const BAR_COLORS: Record<string, string> = {
  client_pipeline: 'bg-blue-500',
  business_work_general: 'bg-violet-500',
  personal_friends_family: 'bg-pink-500',
  family_kids_school: 'bg-amber-500',
  family_health_appointments: 'bg-rose-500',
  finance: 'bg-green-600',
  travel: 'bg-sky-500',
  shopping: 'bg-orange-500',
  local: 'bg-teal-500',
  newsletters_general: 'bg-emerald-500',
  news_politics: 'bg-slate-500',
  product_updates: 'bg-indigo-500',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CategorySummaryPanel({
  categoryCounts,
  activeCategory,
  onCategoryClick,
  totalCount,
  unreadCount,
}: CategorySummaryPanelProps) {
  const maxCount = Math.max(
    1,
    ...Object.values(categoryCounts).map((v) => v || 0)
  );

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Categories
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{totalCount}</span>
          <span className="text-xs text-muted-foreground">
            email{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
        {unreadCount > 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            {unreadCount} unread
          </p>
        )}
      </div>

      {/* Category groups */}
      {CATEGORY_GROUPS.map((group) => {
        const groupCategories = group.categories.filter(
          (cat) => (categoryCounts[cat] || 0) > 0
        );
        if (groupCategories.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {groupCategories.map((category) => {
                const count = categoryCounts[category] || 0;
                const display = CATEGORY_DISPLAY[category];
                const barColor = BAR_COLORS[category] || 'bg-gray-400';
                const isActive = activeCategory === category;
                const barWidth = Math.max(8, (count / maxCount) * 100);

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() =>
                      onCategoryClick(isActive ? null : category)
                    }
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors group',
                      isActive
                        ? 'bg-muted/80'
                        : 'hover:bg-muted/40',
                    )}
                  >
                    <span className="text-sm leading-none shrink-0">
                      {display?.icon || '📧'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={cn(
                            'text-xs truncate',
                            isActive
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        >
                          {display?.label?.split(' - ')[0]?.split('/')[0] || category}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] tabular-nums shrink-0 ml-1',
                            isActive
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {count}
                        </span>
                      </div>
                      {/* Mini bar chart */}
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', barColor)}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CategorySummaryPanel;
