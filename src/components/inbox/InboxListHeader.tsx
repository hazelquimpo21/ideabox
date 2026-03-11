/**
 * InboxListHeader — top section of the list panel.
 *
 * Contains the search bar and an optional email count indicator.
 * Sits at the top of InboxListPanel in the split-panel layout.
 *
 * @module components/inbox/InboxListHeader
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import { InboxSearchBar } from './InboxSearchBar';
import { cn } from '@/lib/utils/cn';

export interface InboxListHeaderProps {
  /** Current search query */
  searchQuery: string;
  /** Callback when search input changes */
  onSearchChange: (query: string) => void;
  /** Callback to clear the search */
  onSearchClear: () => void;
  /** Total email count for the current filter */
  emailCount?: number;
  /** Unread email count */
  unreadCount?: number;
  /** Additional CSS classes */
  className?: string;
}

export function InboxListHeader({
  searchQuery,
  onSearchChange,
  onSearchClear,
  emailCount,
  unreadCount,
  className,
}: InboxListHeaderProps) {
  return (
    <div className={cn('px-3 pt-3 pb-2 space-y-2', className)}>
      <InboxSearchBar
        value={searchQuery}
        onChange={onSearchChange}
        onClear={onSearchClear}
      />

      {/* Email count indicator */}
      {emailCount !== undefined && emailCount > 0 && (
        <p className="text-[11px] text-muted-foreground/60 px-1">
          {emailCount} email{emailCount !== 1 ? 's' : ''}
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="text-blue-500 dark:text-blue-400 font-medium">
              {' '}&middot; {unreadCount} unread
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export default InboxListHeader;
