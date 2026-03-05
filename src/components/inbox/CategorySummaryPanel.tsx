/**
 * CategorySummaryPanel — desktop sidebar showing email distribution.
 * Implements §5e from VIEW_REDESIGN_PLAN.md.
 *
 * Enhanced with 7-day sparkline trends, "new today" badges, and
 * preview-tier tooltips showing top sender + recent subject.
 *
 * Sparkline data is computed client-side from emails passed via props,
 * grouped by category + date. Wrapped in useMemo for performance.
 *
 * @module components/inbox/CategorySummaryPanel
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_DISPLAY, CATEGORY_SHORT_LABELS, CATEGORY_ACCENT_COLORS } from '@/types/discovery';
import { createLogger } from '@/lib/utils/logger';
import { Tooltip } from '@/components/ui/tooltip';
import { CategorySparkline } from './CategorySparkline';
import type { EmailCategory } from '@/types/discovery';

const logger = createLogger('CategorySummaryPanel');

export interface CategorySummaryPanelProps {
  categoryCounts: Partial<Record<string, number>>;
  activeCategory: EmailCategory | null;
  onCategoryClick: (category: EmailCategory | null) => void;
  totalCount: number;
  unreadCount: number;
  /** Optional: email dates grouped by category for sparkline computation */
  emailDates?: Array<{ category: string; date: string }>;
  /** Optional: today's unread counts per category */
  todayUnread?: Partial<Record<string, number>>;
  /** Optional: top sender + recent subject per category for tooltip */
  categoryTooltips?: Partial<Record<string, { topSender: string; recentSubject: string }>>;
}

interface CategoryGroup {
  label: string;
  categories: EmailCategory[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  { label: 'Professional', categories: ['clients', 'work', 'job_search'] },
  { label: 'People', categories: ['personal', 'family', 'parenting'] },
  { label: 'Life Admin', categories: ['health', 'finance', 'billing'] },
  { label: 'Lifestyle', categories: ['travel', 'shopping', 'deals'] },
  { label: 'Community', categories: ['local', 'civic', 'sports'] },
  { label: 'Information', categories: ['news', 'politics', 'newsletters', 'product_updates'] },
];

/**
 * Computes 7-day sparkline data per category from a list of email dates.
 * Returns a map of category → 7 numbers (one per day, oldest first).
 */
function computeSparklines(
  emailDates: Array<{ category: string; date: string }> | undefined,
): Record<string, number[]> {
  if (!emailDates || emailDates.length === 0) return {};

  const now = new Date();
  const result: Record<string, number[]> = {};

  for (const { category, date } of emailDates) {
    const d = new Date(date);
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo < 0 || daysAgo >= 7) continue;

    if (!result[category]) result[category] = [0, 0, 0, 0, 0, 0, 0];
    // Index 0 = 6 days ago, index 6 = today
    result[category][6 - daysAgo]++;
  }

  return result;
}

export function CategorySummaryPanel({
  categoryCounts,
  activeCategory,
  onCategoryClick,
  totalCount,
  unreadCount,
  emailDates,
  todayUnread,
  categoryTooltips,
}: CategorySummaryPanelProps) {
  const maxCount = Math.max(1, ...Object.values(categoryCounts).map((v) => v || 0));

  // Sparkline data — memoized to avoid recomputation on every render
  const sparklines = React.useMemo(() => computeSparklines(emailDates), [emailDates]);

  return (
    <div className="space-y-4" role="complementary" aria-label="Category summary">
      {/* Summary Header */}
      <div className="px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Categories</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{totalCount}</span>
          <span className="text-xs text-muted-foreground">email{totalCount !== 1 ? 's' : ''}</span>
        </div>
        {unreadCount > 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">{unreadCount} unread</p>
        )}
      </div>

      {/* Category Groups */}
      {CATEGORY_GROUPS.map((group) => {
        const groupCategories = group.categories.filter((cat) => (categoryCounts[cat] || 0) > 0);
        if (groupCategories.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider px-1 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {groupCategories.map((category) => {
                const count = categoryCounts[category] || 0;
                const display = CATEGORY_DISPLAY[category];
                const barColor = CATEGORY_ACCENT_COLORS[category] || 'bg-gray-400';
                const isActive = activeCategory === category;
                const barWidth = Math.max(8, (count / maxCount) * 100);
                const sparkData = sparklines[category];
                const newToday = todayUnread?.[category];
                const tooltip = categoryTooltips?.[category];

                const rowContent = (
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
                      isActive ? 'bg-muted/80 ring-1 ring-border/60' : 'hover:bg-muted/40',
                    )}
                    aria-pressed={isActive}
                  >
                    <span className="text-sm leading-none shrink-0" aria-hidden="true">
                      {display?.icon || '📧'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={cn('text-xs truncate', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                          {CATEGORY_SHORT_LABELS[category] || display?.label?.split(' - ')[0]?.split('/')[0] || category}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          {/* New today badge */}
                          {newToday && newToday > 0 && (
                            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                              +{newToday}
                            </span>
                          )}
                          <span className={cn('text-[10px] tabular-nums', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                            {count}
                          </span>
                        </div>
                      </div>
                      {/* Mini bar + sparkline row */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-300', barColor)} style={{ width: `${barWidth}%` }} />
                        </div>
                        {sparkData && (
                          <CategorySparkline data={sparkData} width={36} height={12} className="text-muted-foreground/40 shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>
                );

                // Wrap in tooltip if we have tooltip data
                if (tooltip) {
                  return (
                    <Tooltip
                      key={category}
                      variant="preview"
                      content={
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Top sender: {tooltip.topSender}</p>
                          <p className="text-xs text-muted-foreground truncate">Latest: {tooltip.recentSubject}</p>
                        </div>
                      }
                    >
                      {rowContent}
                    </Tooltip>
                  );
                }

                return <React.Fragment key={category}>{rowContent}</React.Fragment>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CategorySummaryPanel;
