/**
 * CategoryPageToolbar Component
 *
 * Toolbar for the category detail page with bulk actions, filters, and refresh.
 *
 * @module components/discover/CategoryPageToolbar
 * @since Jan 2026
 */

'use client';

import {
  Archive,
  CheckCheck,
  Filter,
  Loader2,
  MailOpen,
  RefreshCw,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryPageToolbarProps {
  /** Number of unread emails */
  unreadCount: number;
  /** Number of read emails */
  readCount: number;
  /** Whether bulk actions are loading */
  isBulkActionLoading: boolean;
  /** Whether list is refreshing */
  isRefreshing: boolean;
  /** Show unread only filter */
  showUnreadOnly: boolean;
  /** Show starred only filter */
  showStarredOnly: boolean;
  /** Handlers */
  onMarkAllRead: () => void;
  onArchiveAllRead: () => void;
  onRefresh: () => void;
  onUnreadFilterChange: (value: boolean) => void;
  onStarredFilterChange: (value: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CategoryPageToolbar({
  unreadCount,
  readCount,
  isBulkActionLoading,
  isRefreshing,
  showUnreadOnly,
  showStarredOnly,
  onMarkAllRead,
  onArchiveAllRead,
  onRefresh,
  onUnreadFilterChange,
  onStarredFilterChange,
}: CategoryPageToolbarProps) {
  const activeFilterCount = [showUnreadOnly, showStarredOnly].filter(Boolean).length;

  return (
    <div className="flex items-center justify-between py-3 border-y mb-4">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAllRead}
          disabled={isBulkActionLoading || unreadCount === 0}
        >
          {isBulkActionLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4 mr-1" />
          )}
          Mark All Read
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onArchiveAllRead}
          disabled={isBulkActionLoading || readCount === 0}
        >
          {isBulkActionLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Archive className="h-4 w-4 mr-1" />
          )}
          Archive Read ({readCount})
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Filters dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={showUnreadOnly}
              onCheckedChange={onUnreadFilterChange}
            >
              <MailOpen className="h-4 w-4 mr-2" />
              Unread only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showStarredOnly}
              onCheckedChange={onStarredFilterChange}
            >
              <Star className="h-4 w-4 mr-2" />
              Starred only
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );
}

export default CategoryPageToolbar;
