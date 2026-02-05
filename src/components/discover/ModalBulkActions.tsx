/**
 * ModalBulkActions Component
 *
 * Bulk action toolbar for the CategoryModal.
 * Provides mark-all-read, archive-read, and refresh actions.
 *
 * @module components/discover/ModalBulkActions
 * @since Jan 2026 - Extracted from CategoryModal
 */

'use client';

import { Archive, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ModalBulkActionsProps {
  /** Number of unread emails */
  unreadCount: number;
  /** Number of read emails */
  readCount: number;
  /** Whether a bulk action is in progress */
  isLoading: boolean;
  /** Whether the refresh action is in progress */
  isRefreshing: boolean;
  /** Handler for marking all as read */
  onMarkAllRead: () => void;
  /** Handler for archiving all read emails */
  onArchiveAllRead: () => void;
  /** Handler for refreshing the list */
  onRefresh: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bulk action toolbar for CategoryModal.
 *
 * @example
 * ```tsx
 * <ModalBulkActions
 *   unreadCount={5}
 *   readCount={3}
 *   isLoading={isBulkActionLoading}
 *   isRefreshing={isLoading}
 *   onMarkAllRead={handleMarkAllRead}
 *   onArchiveAllRead={handleArchiveAllRead}
 *   onRefresh={fetchEmails}
 * />
 * ```
 */
export function ModalBulkActions({
  unreadCount,
  readCount,
  isLoading,
  isRefreshing,
  onMarkAllRead,
  onArchiveAllRead,
  onRefresh,
}: ModalBulkActionsProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b flex-shrink-0">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAllRead}
          disabled={isLoading || unreadCount === 0}
        >
          {isLoading ? (
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
          disabled={isLoading || readCount === 0}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Archive className="h-4 w-4 mr-1" />
          )}
          Archive Read
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}

export default ModalBulkActions;
