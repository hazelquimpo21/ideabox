/**
 * CategorySummaryPanel Component
 *
 * Desktop-only right sidebar showing email distribution by category.
 * Provides a quick overview of where emails land and allows one-click
 * filtering by clicking any category row.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   ┌──────────────────────┐
 *   │  Categories           │
 *   │  142 emails · 8 unread│
 *   ├──────────────────────┤
 *   │  WORK                 │
 *   │  💼 Client      12 ██ │
 *   │  🏢 Work         8 █  │
 *   ├──────────────────────┤
 *   │  PERSONAL             │
 *   │  👫 Personal    15 ██ │
 *   │  ...                  │
 *   └──────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CATEGORY GROUPS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Categories are organized into four groups matching the filter bar order:
 *   1. Professional — clients, work, job_search
 *   2. People — personal, family, parenting
 *   3. Life Admin — health, finance, billing
 *   4. Lifestyle — travel, shopping, deals
 *   5. Community — local, civic, sports
 *   6. Information — news, politics, newsletters, product_updates
 *
 * Groups with zero emails are hidden entirely.
 *
 * @module components/inbox/CategorySummaryPanel
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_DISPLAY, CATEGORY_SHORT_LABELS, CATEGORY_ACCENT_COLORS } from '@/types/discovery';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategorySummaryPanel');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategorySummaryPanelProps {
  /** Category → email count mapping */
  categoryCounts: Partial<Record<string, number>>;
  /** Currently active category filter (null = all) */
  activeCategory: EmailCategory | null;
  /** Callback when a category is clicked (toggles filter) */
  onCategoryClick: (category: EmailCategory | null) => void;
  /** Total email count */
  totalCount: number;
  /** Unread email count */
  unreadCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY GROUPS — matches the conceptual ordering used in CategoryFilterBar
// ═══════════════════════════════════════════════════════════════════════════════

interface CategoryGroup {
  label: string;
  categories: EmailCategory[];
}

/**
 * Category groups for the summary panel — Taxonomy v2 (Mar 2026).
 * Groups the 20 categories into logical sections for visual overview.
 */
const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Professional',
    categories: ['clients', 'work', 'job_search'],
  },
  {
    label: 'People',
    categories: ['personal', 'family', 'parenting'],
  },
  {
    label: 'Life Admin',
    categories: ['health', 'finance', 'billing'],
  },
  {
    label: 'Lifestyle',
    categories: ['travel', 'shopping', 'deals'],
  },
  {
    label: 'Community',
    categories: ['local', 'civic', 'sports'],
  },
  {
    label: 'Information',
    categories: ['news', 'politics', 'newsletters', 'product_updates'],
  },
];

// BAR_COLORS and SHORT_LABELS — now using centralized CATEGORY_ACCENT_COLORS
// and CATEGORY_SHORT_LABELS from @/types/discovery

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
  // Calculate max count for proportional bar widths
  const maxCount = Math.max(
    1,
    ...Object.values(categoryCounts).map((v) => v || 0)
  );

  return (
    <div className="space-y-4" role="complementary" aria-label="Category summary">
      {/* ── Summary Header ───────────────────────────────────────────── */}
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
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
            {unreadCount} unread
          </p>
        )}
      </div>

      {/* ── Category Groups ──────────────────────────────────────────── */}
      {CATEGORY_GROUPS.map((group) => {
        // Only show groups that have at least one email
        const groupCategories = group.categories.filter(
          (cat) => (categoryCounts[cat] || 0) > 0
        );
        if (groupCategories.length === 0) return null;

        return (
          <div key={group.label}>
            {/* Group label */}
            <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider px-1 mb-1.5">
              {group.label}
            </p>

            {/* Category rows within this group */}
            <div className="space-y-0.5">
              {groupCategories.map((category) => {
                const count = categoryCounts[category] || 0;
                const display = CATEGORY_DISPLAY[category];
                const barColor = CATEGORY_ACCENT_COLORS[category] || 'bg-gray-400';
                const isActive = activeCategory === category;
                // Minimum bar width so even small counts are visible
                const barWidth = Math.max(8, (count / maxCount) * 100);

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      logger.info('Sidebar category clicked', { category, isActive });
                      onCategoryClick(isActive ? null : category);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left',
                      'transition-colors group',
                      isActive
                        ? 'bg-muted/80 ring-1 ring-border/60'
                        : 'hover:bg-muted/40',
                    )}
                    aria-pressed={isActive}
                  >
                    {/* Category emoji */}
                    <span className="text-sm leading-none shrink-0" aria-hidden="true">
                      {display?.icon || '📧'}
                    </span>

                    {/* Label + bar chart */}
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
                          {CATEGORY_SHORT_LABELS[category] || display?.label?.split(' - ')[0]?.split('/')[0] || category}
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

                      {/* Mini proportional bar chart */}
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-300', barColor)}
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
