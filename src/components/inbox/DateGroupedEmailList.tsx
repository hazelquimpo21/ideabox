/**
 * DateGroupedEmailList — renders emails grouped by relative date.
 *
 * Groups: Today, Yesterday, This Week, Last Week, This Month, Older
 * Each group gets a DateGroupHeader followed by compact InboxEmailRow items.
 *
 * The grouping logic is a pure function (groupEmailsByDate) that can be
 * unit-tested independently.
 *
 * Performance:
 *   - groupEmailsByDate is memoized with useMemo
 *   - InboxEmailRow is already React.memo'd
 *   - Handlers use useCallback with stable deps
 *
 * @module components/inbox/DateGroupedEmailList
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { InboxEmailRow } from './InboxEmailRow';
import { DateGroupHeader } from './DateGroupHeader';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DateGroupedEmailList');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DateGroupedEmailListProps {
  /** Emails to display (should be sorted by date desc) */
  emails: Email[];
  /** Currently selected email ID (for highlight) */
  selectedEmailId: string | null;
  /** Callback when an email row is clicked */
  onEmailClick: (email: Email) => void;
  /** Callback to toggle star */
  onToggleStar: (email: Email) => void;
  /** Callback for optimistic updates (archive, etc.) */
  onUpdateEmail?: (emailId: string, updates: Partial<Email>) => void;
  /** Multi-account map */
  accountMap?: Record<string, string>;
  /** Whether more emails can be loaded */
  hasMore?: boolean;
  /** Callback to load more emails */
  onLoadMore?: () => void;
  /** Current search query (for results indicator) */
  searchQuery?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE GROUPING (pure function — testable)
// ═══════════════════════════════════════════════════════════════════════════════

interface DateGroup {
  label: string;
  emails: Email[];
}

/**
 * Groups emails by relative date into human-readable buckets.
 * Expects emails sorted by date descending.
 * Returns only non-empty groups in chronological order (newest first).
 */
export function groupEmailsByDate(emails: Email[]): DateGroup[] {
  if (emails.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

  // Start of this week (Monday)
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(todayStart.getTime() - mondayOffset * 86_400_000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86_400_000);

  // Start of this month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const today: Email[] = [];
  const yesterday: Email[] = [];
  const thisWeek: Email[] = [];
  const lastWeek: Email[] = [];
  const thisMonth: Email[] = [];
  const older: Email[] = [];

  for (const email of emails) {
    const emailDate = new Date(email.date);

    if (emailDate >= todayStart) {
      today.push(email);
    } else if (emailDate >= yesterdayStart) {
      yesterday.push(email);
    } else if (emailDate >= thisWeekStart) {
      thisWeek.push(email);
    } else if (emailDate >= lastWeekStart) {
      lastWeek.push(email);
    } else if (emailDate >= thisMonthStart) {
      thisMonth.push(email);
    } else {
      older.push(email);
    }
  }

  // Return only non-empty groups, preserving display order (newest first)
  const allGroups: DateGroup[] = [
    { label: 'Today', emails: today },
    { label: 'Yesterday', emails: yesterday },
    { label: 'This Week', emails: thisWeek },
    { label: 'Last Week', emails: lastWeek },
    { label: 'This Month', emails: thisMonth },
    { label: 'Older', emails: older },
  ];

  const result = allGroups.filter((g) => g.emails.length > 0);

  logger.debug('Grouped emails by date', {
    groups: result.map((g) => ({ label: g.label, count: g.emails.length })),
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DateGroupedEmailList({
  emails,
  selectedEmailId,
  onEmailClick,
  onToggleStar,
  onUpdateEmail,
  accountMap,
  hasMore,
  onLoadMore,
  searchQuery,
}: DateGroupedEmailListProps) {
  // Memoize grouping to avoid re-computing on every render
  const groups = React.useMemo(() => groupEmailsByDate(emails), [emails]);

  // Stable click handler — wraps onEmailClick to pass the full email object
  const handleEmailClick = React.useCallback(
    (email: Email) => onEmailClick(email),
    [onEmailClick],
  );

  if (emails.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Search results count */}
      {searchQuery && emails.length > 0 && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {emails.length} result{emails.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
          </span>
        </div>
      )}

      {/* Date-grouped email rows */}
      {groups.map((group, groupIndex) => (
        <div key={group.label}>
          <DateGroupHeader
            label={group.label}
            count={group.emails.length}
            isFirst={groupIndex === 0}
          />
          {group.emails.map((email) => (
            <InboxEmailRow
              key={email.id}
              email={email}
              onClick={handleEmailClick}
              onToggleStar={onToggleStar}
              onUpdate={onUpdateEmail}
              isSelected={email.id === selectedEmailId}
              compact
              accountMap={accountMap}
            />
          ))}
        </div>
      ))}

      {/* Load more */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            Load more emails
          </Button>
        </div>
      )}
    </div>
  );
}

export default DateGroupedEmailList;
