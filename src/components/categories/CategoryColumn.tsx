/**
 * CategoryColumn Component for Category Cards View
 *
 * Displays a vertical column/pile of emails for a single category.
 * Part of the Kanban-style category view.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Category header with icon, label, and count
 * - Scrollable list of email cards
 * - Shows top N emails with "show more" option
 * - Click on category header to view all in inbox
 * - Collapse/expand functionality
 *
 * @module components/categories/CategoryColumn
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_DISPLAY, type EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';
import { EmailCard } from './EmailCard';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryColumnProps {
  /** The category this column represents */
  category: EmailCategory;
  /** Emails in this category */
  emails: Email[];
  /** Total count (may be more than emails array if paginated) */
  totalCount?: number;
  /** Number of unread emails */
  unreadCount?: number;
  /** Max emails to show initially (default: 5) */
  maxVisible?: number;
  /** Whether the column is loading */
  isLoading?: boolean;
  /** Handler when email card is clicked */
  onEmailClick?: (email: Email) => void;
  /** Handler when star is toggled */
  onToggleStar?: (email: Email) => void;
  /** Handler to load more emails */
  onLoadMore?: () => void;
  /** Whether more emails can be loaded */
  hasMore?: boolean;
  /** Whether column starts collapsed */
  defaultCollapsed?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MAX_VISIBLE = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays a column of emails for a single category.
 *
 * @example
 * ```tsx
 * <CategoryColumn
 *   category="client_pipeline"
 *   emails={clientEmails}
 *   totalCount={47}
 *   unreadCount={5}
 *   onEmailClick={(e) => setSelectedEmail(e)}
 * />
 * ```
 */
export function CategoryColumn({
  category,
  emails,
  totalCount,
  unreadCount = 0,
  maxVisible = DEFAULT_MAX_VISIBLE,
  isLoading = false,
  onEmailClick,
  onToggleStar,
  onLoadMore,
  hasMore = false,
  defaultCollapsed = false,
}: CategoryColumnProps) {
  const router = useRouter();
  const display = CATEGORY_DISPLAY[category];

  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const [showAll, setShowAll] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived State
  // ───────────────────────────────────────────────────────────────────────────

  const displayCount = totalCount ?? emails.length;
  const visibleEmails = showAll ? emails : emails.slice(0, maxVisible);
  const hiddenCount = emails.length - maxVisible;
  const remainingCount = (totalCount ?? emails.length) - emails.length;

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleHeaderClick = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/inbox?category=${category}`);
  };

  const handleShowMore = () => {
    if (hiddenCount > 0 && !showAll) {
      setShowAll(true);
    } else if (hasMore && onLoadMore) {
      onLoadMore();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Loading State
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card className={cn('min-w-[300px] w-[300px] shrink-0', display.bgColor)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{display.icon}</span>
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-5 w-8" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (emails.length === 0 && displayCount === 0) {
    return (
      <Card className={cn(
        'min-w-[300px] w-[300px] shrink-0 opacity-60',
        display.bgColor
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{display.icon}</span>
              <h3 className="font-semibold text-sm">{display.label}</h3>
            </div>
            <Badge variant="secondary" className="text-xs">0</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No emails in this category
          </p>
        </CardContent>
      </Card>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card className={cn(
      'min-w-[300px] w-[300px] shrink-0 flex flex-col',
      'max-h-[calc(100vh-12rem)]',
      display.bgColor
    )}>
      {/* Header */}
      <CardHeader
        className="pb-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-t-lg"
        onClick={handleHeaderClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Collapse indicator */}
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}

            {/* Category icon and label */}
            <span className="text-xl">{display.icon}</span>
            <h3 className={cn('font-semibold text-sm', display.color)}>
              {display.label}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Unread badge */}
            {unreadCount > 0 && (
              <Badge variant="default" className="text-xs">
                {unreadCount} new
              </Badge>
            )}

            {/* Total count */}
            <Badge variant="secondary" className={cn('text-xs', display.color)}>
              {displayCount}
            </Badge>

            {/* View all button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleViewAll}
              title={`View all in inbox`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Content - Email Cards */}
      {!isCollapsed && (
        <CardContent className="flex-1 overflow-y-auto space-y-2 pt-0">
          {visibleEmails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              onClick={onEmailClick}
              onToggleStar={onToggleStar}
            />
          ))}

          {/* Show More Button */}
          {(hiddenCount > 0 && !showAll) || hasMore ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={handleShowMore}
            >
              {hiddenCount > 0 && !showAll
                ? `Show ${hiddenCount} more`
                : hasMore
                ? `Load more (${remainingCount} remaining)`
                : null}
            </Button>
          ) : null}
        </CardContent>
      )}

      {/* Collapsed indicator */}
      {isCollapsed && (
        <CardContent className="py-2">
          <p className="text-xs text-muted-foreground text-center">
            {displayCount} email{displayCount !== 1 ? 's' : ''} • Click to expand
          </p>
        </CardContent>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default CategoryColumn;
