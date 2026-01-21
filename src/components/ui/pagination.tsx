/**
 * 📄 Pagination Component for IdeaBox
 *
 * A flexible pagination component for navigating through paged data.
 * Supports page numbers, previous/next buttons, and ellipsis for large page counts.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Page number buttons with current page highlight
 * - Previous/Next navigation buttons
 * - Smart ellipsis for large page counts (e.g., 1, 2, ..., 9, 10)
 * - Configurable visible page range
 * - "Showing X-Y of Z" info display
 * - Fully accessible with ARIA labels
 * - Keyboard navigation support
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic usage:
 * ```tsx
 * <Pagination
 *   currentPage={1}
 *   totalPages={10}
 *   onPageChange={(page) => setPage(page)}
 * />
 * ```
 *
 * With item count info:
 * ```tsx
 * <Pagination
 *   currentPage={2}
 *   totalPages={17}
 *   totalItems={847}
 *   pageSize={50}
 *   onPageChange={handlePageChange}
 *   showInfo
 * />
 * // Renders: "Showing 51-100 of 847"
 * ```
 *
 * Compact variant:
 * ```tsx
 * <Pagination
 *   currentPage={5}
 *   totalPages={20}
 *   onPageChange={handlePageChange}
 *   variant="compact"
 * />
 * // Only shows prev/next and current page indicator
 * ```
 *
 * @module components/ui/pagination
 * @version 1.0.0
 * @since January 2026
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from './button';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logger for pagination component.
 * Tracks page changes and navigation for debugging.
 */
const logger = createLogger('Pagination');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the Pagination component.
 */
export interface PaginationProps {
  /** Current active page (1-indexed) */
  currentPage: number;

  /** Total number of pages */
  totalPages: number;

  /** Callback when page changes */
  onPageChange: (page: number) => void;

  /** Total number of items (for "Showing X of Y" display) */
  totalItems?: number;

  /** Number of items per page (for calculating range display) */
  pageSize?: number;

  /** Show "Showing X-Y of Z" info */
  showInfo?: boolean;

  /** Number of page buttons to show on each side of current page */
  siblingCount?: number;

  /** Display variant */
  variant?: 'default' | 'compact';

  /** Additional class name */
  className?: string;

  /** Disable all controls */
  disabled?: boolean;
}

/**
 * Data about the current pagination state.
 * Returned from the usePagination hook.
 */
export interface PaginationInfo {
  /** Current page number (1-indexed) */
  page: number;

  /** Total number of pages */
  totalPages: number;

  /** Total number of items */
  totalCount: number;

  /** Items per page */
  pageSize: number;

  /** Whether there's a next page */
  hasNext: boolean;

  /** Whether there's a previous page */
  hasPrev: boolean;

  /** First item index on current page (1-indexed) */
  startItem: number;

  /** Last item index on current page (1-indexed) */
  endItem: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates an array of page numbers and ellipsis markers for the pagination.
 * Uses a smart algorithm to show relevant pages while keeping the UI compact.
 *
 * Examples:
 * - totalPages=5, currentPage=3 → [1, 2, 3, 4, 5]
 * - totalPages=10, currentPage=1 → [1, 2, 3, '...', 10]
 * - totalPages=10, currentPage=5 → [1, '...', 4, 5, 6, '...', 10]
 * - totalPages=10, currentPage=10 → [1, '...', 8, 9, 10]
 *
 * @param currentPage - Current active page (1-indexed)
 * @param totalPages - Total number of pages
 * @param siblingCount - Number of pages to show on each side of current
 * @returns Array of page numbers and 'ellipsis' markers
 */
function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount: number = 1
): (number | 'ellipsis')[] {
  // If total pages is small, show all pages
  const totalPageNumbers = siblingCount * 2 + 5; // siblings + first + last + current + 2 ellipsis
  if (totalPages <= totalPageNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Calculate range around current page
  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  // Determine if we need ellipsis on either side
  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  const pages: (number | 'ellipsis')[] = [];

  // Always show first page
  pages.push(1);

  // Left ellipsis or page 2
  if (showLeftEllipsis) {
    pages.push('ellipsis');
  } else if (leftSiblingIndex > 1) {
    // Show page 2 if we're close to start
    for (let i = 2; i < leftSiblingIndex; i++) {
      pages.push(i);
    }
  }

  // Pages around current page
  for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
    if (i !== 1 && i !== totalPages) {
      pages.push(i);
    }
  }

  // Right ellipsis or remaining pages
  if (showRightEllipsis) {
    pages.push('ellipsis');
  } else if (rightSiblingIndex < totalPages) {
    // Show remaining pages if we're close to end
    for (let i = rightSiblingIndex + 1; i < totalPages; i++) {
      pages.push(i);
    }
  }

  // Always show last page (if more than 1 page)
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Calculates pagination info for display.
 *
 * @param page - Current page (1-indexed)
 * @param pageSize - Items per page
 * @param totalItems - Total number of items
 * @returns Object with start/end item numbers
 */
function calculateItemRange(
  page: number,
  pageSize: number,
  totalItems: number
): { startItem: number; endItem: number } {
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);
  return { startItem, endItem };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single page number button.
 */
function PageButton({
  page,
  isActive,
  onClick,
  disabled,
}: {
  page: number;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={isActive ? 'default' : 'outline'}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Go to page ${page}`}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'h-9 w-9 text-sm',
        isActive && 'pointer-events-none'
      )}
    >
      {page}
    </Button>
  );
}

/**
 * Ellipsis indicator between page ranges.
 */
function EllipsisIndicator() {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center text-muted-foreground"
      aria-hidden="true"
    >
      <MoreHorizontal className="h-4 w-4" />
    </span>
  );
}

/**
 * Navigation button (previous/next).
 */
function NavButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled?: boolean;
}) {
  const isPrev = direction === 'prev';
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  const label = isPrev ? 'Previous page' : 'Next page';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="gap-1"
    >
      {isPrev && <Icon className="h-4 w-4" />}
      <span className="hidden sm:inline">{isPrev ? 'Previous' : 'Next'}</span>
      {!isPrev && <Icon className="h-4 w-4" />}
    </Button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pagination component for navigating through paged data.
 *
 * Features:
 * - Page number buttons with smart ellipsis
 * - Previous/Next navigation
 * - Optional "Showing X-Y of Z" info
 * - Compact variant for tight spaces
 * - Full keyboard and screen reader support
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={currentPage}
 *   totalPages={Math.ceil(totalItems / pageSize)}
 *   totalItems={totalItems}
 *   pageSize={pageSize}
 *   onPageChange={(page) => {
 *     setCurrentPage(page);
 *     // Optionally update URL
 *     router.push(`/contacts?page=${page}`);
 *   }}
 *   showInfo
 * />
 * ```
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize = 50,
  showInfo = false,
  siblingCount = 1,
  variant = 'default',
  className,
  disabled = false,
}: PaginationProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Computed values
  // ─────────────────────────────────────────────────────────────────────────────

  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const pageNumbers = generatePageNumbers(currentPage, totalPages, siblingCount);

  // Calculate item range for "Showing X-Y of Z" display
  const { startItem, endItem } = totalItems
    ? calculateItemRange(currentPage, pageSize, totalItems)
    : { startItem: 0, endItem: 0 };

  // ─────────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handlePageChange = (page: number) => {
    // Guard against invalid pages
    if (page < 1 || page > totalPages || page === currentPage) {
      logger.debug('Page change ignored', {
        requested: page,
        current: currentPage,
        total: totalPages,
        reason: page === currentPage ? 'same page' : 'out of bounds',
      });
      return;
    }

    logger.debug('Page changed', {
      from: currentPage,
      to: page,
      totalPages,
    });

    onPageChange(page);
  };

  const handlePrevPage = () => handlePageChange(currentPage - 1);
  const handleNextPage = () => handlePageChange(currentPage + 1);

  // ─────────────────────────────────────────────────────────────────────────────
  // Don't render if only one page
  // ─────────────────────────────────────────────────────────────────────────────

  if (totalPages <= 1 && !showInfo) {
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Compact variant
  // ─────────────────────────────────────────────────────────────────────────────

  if (variant === 'compact') {
    return (
      <nav
        className={cn('flex items-center justify-between gap-2', className)}
        aria-label="Pagination"
        role="navigation"
      >
        <NavButton
          direction="prev"
          onClick={handlePrevPage}
          disabled={disabled || !hasPrevPage}
        />
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <NavButton
          direction="next"
          onClick={handleNextPage}
          disabled={disabled || !hasNextPage}
        />
      </nav>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Default variant
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <nav
      className={cn(
        'flex flex-col items-center gap-4 sm:flex-row sm:justify-between',
        className
      )}
      aria-label="Pagination"
      role="navigation"
    >
      {/* Info section: "Showing X-Y of Z" */}
      {showInfo && totalItems !== undefined && totalItems > 0 && (
        <p className="text-sm text-muted-foreground order-2 sm:order-1">
          Showing{' '}
          <span className="font-medium text-foreground">{startItem}</span>
          {' - '}
          <span className="font-medium text-foreground">{endItem}</span>
          {' of '}
          <span className="font-medium text-foreground">{totalItems.toLocaleString()}</span>
        </p>
      )}

      {/* Empty spacer if no info but need alignment */}
      {!showInfo && <div className="hidden sm:block" />}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 order-1 sm:order-2">
          {/* Previous button */}
          <NavButton
            direction="prev"
            onClick={handlePrevPage}
            disabled={disabled || !hasPrevPage}
          />

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {pageNumbers.map((pageNum, index) =>
              pageNum === 'ellipsis' ? (
                <EllipsisIndicator key={`ellipsis-${index}`} />
              ) : (
                <PageButton
                  key={pageNum}
                  page={pageNum}
                  isActive={pageNum === currentPage}
                  onClick={() => handlePageChange(pageNum)}
                  disabled={disabled}
                />
              )
            )}
          </div>

          {/* Next button */}
          <NavButton
            direction="next"
            onClick={handleNextPage}
            disabled={disabled || !hasNextPage}
          />
        </div>
      )}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for creating pagination state and info.
 * Useful for computing pagination info from API response.
 *
 * @example
 * ```tsx
 * const { paginationInfo, setPage } = usePaginationInfo({
 *   initialPage: 1,
 *   pageSize: 50,
 *   totalItems: response.totalCount,
 * });
 * ```
 */
export function usePaginationInfo(options: {
  page: number;
  pageSize: number;
  totalCount: number;
}): PaginationInfo {
  const { page, pageSize, totalCount } = options;
  const totalPages = Math.ceil(totalCount / pageSize);
  const { startItem, endItem } = calculateItemRange(page, pageSize, totalCount);

  return {
    page,
    totalPages,
    totalCount,
    pageSize,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    startItem,
    endItem,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type { PaginationProps, PaginationInfo };
