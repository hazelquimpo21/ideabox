/**
 * EmailCard Component for Category Cards View
 *
 * Displays a single email as a compact card with AI-generated summary.
 * Designed for the Kanban-style category view where emails are grouped
 * by category in vertical "piles".
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Shows AI-generated summary prominently (the main value proposition)
 * - Compact sender and subject display
 * - Quick action badge showing what AI recommends
 * - Unread indicator
 * - Click to view full email details
 * - Star toggle
 *
 * @module components/categories/EmailCard
 */

'use client';

import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Star, Mail, MailOpen, Clock, Reply, Calendar, BookmarkCheck, Archive } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { Email, QuickActionDb } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailCardProps {
  /** Email data to display */
  email: Email;
  /** Click handler for viewing email details */
  onClick?: (email: Email) => void;
  /** Star toggle handler */
  onToggleStar?: (email: Email) => void;
  /** Whether the card is currently selected */
  isSelected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick action display configuration.
 * Maps quick_action values to icons and colors for visual indication.
 */
const QUICK_ACTION_CONFIG: Record<QuickActionDb, {
  icon: React.ElementType;
  label: string;
  className: string;
}> = {
  respond: {
    icon: Reply,
    label: 'Reply',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  review: {
    icon: BookmarkCheck,
    label: 'Review',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  calendar: {
    icon: Calendar,
    label: 'Calendar',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  follow_up: {
    icon: Clock,
    label: 'Follow up',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  save: {
    icon: BookmarkCheck,
    label: 'Save',
    className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  },
  archive: {
    icon: Archive,
    label: 'Archive',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
  unsubscribe: {
    icon: Archive,
    label: 'Unsubscribe',
    className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  },
  none: {
    icon: Mail,
    label: 'Done',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays an email as a compact card with AI summary.
 *
 * @example
 * ```tsx
 * <EmailCard
 *   email={email}
 *   onClick={(e) => setSelectedEmail(e)}
 *   onToggleStar={(e) => handleStar(e)}
 * />
 * ```
 */
export function EmailCard({
  email,
  onClick,
  onToggleStar,
  isSelected = false,
}: EmailCardProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // Derived State
  // ───────────────────────────────────────────────────────────────────────────

  const quickAction = email.quick_action as QuickActionDb | null;
  const actionConfig = quickAction ? QUICK_ACTION_CONFIG[quickAction] : null;
  const ActionIcon = actionConfig?.icon;

  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const timeAgo = email.date
    ? formatDistanceToNow(new Date(email.date), { addSuffix: true })
    : '';

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(email);
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(email);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card
      onClick={handleClick}
      className={cn(
        'p-3 cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:scale-[1.01]',
        'border-l-4',
        !email.is_read && 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
        email.is_read && 'border-l-transparent',
        isSelected && 'ring-2 ring-primary shadow-md',
      )}
    >
      {/* Header: Sender + Time + Star */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Unread indicator */}
          {!email.is_read ? (
            <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          ) : (
            <MailOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}

          {/* Sender name */}
          <span className={cn(
            'text-sm truncate',
            !email.is_read && 'font-semibold',
          )}>
            {senderName}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Time */}
          <span className="text-xs text-muted-foreground">{timeAgo}</span>

          {/* Star */}
          <button
            onClick={handleStarClick}
            className="p-1 hover:bg-muted rounded-sm transition-colors"
            aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                email.is_starred
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground hover:text-yellow-400'
              )}
            />
          </button>
        </div>
      </div>

      {/* Subject */}
      <h4 className={cn(
        'text-sm mb-2 line-clamp-1',
        !email.is_read && 'font-medium',
      )}>
        {email.subject || '(No subject)'}
      </h4>

      {/* AI Summary - The main feature! */}
      {email.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2 italic">
          &ldquo;{email.summary}&rdquo;
        </p>
      )}

      {/* Footer: Quick Action Badge */}
      {actionConfig && quickAction !== 'none' && quickAction !== 'archive' && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          <Badge
            variant="secondary"
            className={cn('text-xs gap-1', actionConfig.className)}
          >
            {ActionIcon && <ActionIcon className="h-3 w-3" />}
            {actionConfig.label}
          </Badge>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default EmailCard;
