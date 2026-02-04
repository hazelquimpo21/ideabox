/**
 * CategoryCardGrid Component
 *
 * Displays a responsive grid of category cards.
 * Automatically arranges cards and handles empty states.
 *
 * @module components/discover/CategoryCardGrid
 */

'use client';

import { CategoryCard } from './CategoryCard';
import type { CategorySummary } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface CategoryCardGridProps {
  /** Array of category summaries to display */
  categories: CategorySummary[];
  /** Show cards in compact mode */
  compact?: boolean;
  /** Custom click handler for cards */
  onCategoryClick?: (category: CategorySummary) => void;
  /** Whether to hide empty categories */
  hideEmpty?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays a responsive grid of category cards.
 *
 * @example
 * ```tsx
 * <CategoryCardGrid
 *   categories={result.categories}
 *   onCategoryClick={(cat) => router.push(`/discover/${cat.category}`)}
 * />
 * ```
 */
export function CategoryCardGrid({
  categories,
  compact = false,
  onCategoryClick,
  hideEmpty = false,
}: CategoryCardGridProps) {
  // Filter out empty categories if requested
  const visibleCategories = hideEmpty
    ? categories.filter((c) => c.count > 0)
    : categories;

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (visibleCategories.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No categories to display</p>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`
        grid gap-4
        grid-cols-1
        sm:grid-cols-2
        lg:grid-cols-3
        xl:grid-cols-4
      `}
    >
      {visibleCategories.map((summary) => (
        <CategoryCard
          key={summary.category}
          summary={summary}
          compact={compact}
          onClick={onCategoryClick}
        />
      ))}
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CategoryCardGrid;
