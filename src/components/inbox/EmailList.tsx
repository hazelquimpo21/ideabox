/**
 * EmailList — renders emails in either list (row) or card mode.
 * Extracted from InboxFeed to keep the orchestrator thin.
 *
 * Handles view-mode switching and section rendering (priority vs recent).
 * Delegates individual email rendering to InboxEmailRow / InboxEmailCard.
 *
 * @module components/inbox/EmailList
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { staggeredEntrance } from '@/lib/utils/animations';
import { InboxEmailRow } from './InboxEmailRow';
import { InboxEmailCard } from './InboxEmailCard';
import type { Email } from '@/types/database';

export interface EmailListProps {
  priorityEmails: Email[];
  recentEmails: Email[];
  viewMode: 'list' | 'cards';
  activeCategory: string | null;
  onEmailClick: (email: Email) => void;
  onToggleStar: (email: Email) => void;
  onUpdateEmail?: (emailId: string, updates: Partial<Email>) => void;
  accountMap?: Record<string, string>;
  thumbnails?: Map<string, string>;
  hasMore?: boolean;
  onLoadMore?: () => void;
  searchQuery?: string;
  filteredCount?: number;
}

export function EmailList({
  priorityEmails,
  recentEmails,
  viewMode,
  activeCategory,
  onEmailClick,
  onToggleStar,
  onUpdateEmail,
  accountMap,
  thumbnails,
  hasMore,
  onLoadMore,
  searchQuery,
  filteredCount,
}: EmailListProps) {
  const showCategory = !activeCategory;

  // Stagger animation guard — only animate on initial mount, not on data refetch
  const hasMounted = React.useRef(false);
  React.useEffect(() => { hasMounted.current = true; }, []);

  const renderSection = (emails: Email[], startIndex = 0) => {
    if (viewMode === 'cards') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {emails.map((email, i) => {
            const idx = startIndex + i;
            // Cap stagger at item 6 — items 7+ appear instantly
            const entrance = !hasMounted.current && idx < 7
              ? staggeredEntrance(idx)
              : { className: '', style: {} as React.CSSProperties };
            return (
              <div key={email.id} className={entrance.className} style={entrance.style}>
                <InboxEmailCard
                  email={email}
                  onClick={onEmailClick}
                  onToggleStar={onToggleStar}
                  showCategory={showCategory}
                  accountMap={accountMap}
                  thumbnailUrl={thumbnails?.get(email.id) || null}
                />
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {emails.map((email, i) => {
          const idx = startIndex + i;
          const entrance = !hasMounted.current && idx < 7
            ? staggeredEntrance(idx)
            : { className: '', style: {} as React.CSSProperties };
          return (
            <div key={email.id} className={entrance.className} style={entrance.style}>
              <InboxEmailRow
                email={email}
                onClick={onEmailClick}
                onToggleStar={onToggleStar}
                onUpdate={onUpdateEmail}
                showCategory={showCategory}
                accountMap={accountMap}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Search results indicator */}
      {searchQuery && (filteredCount ?? 0) > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 mb-1">
          <span className="text-xs text-muted-foreground">
            {filteredCount} result{filteredCount !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
          </span>
        </div>
      )}

      {/* Priority section */}
      {priorityEmails.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 px-4 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Priority
            </span>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {priorityEmails.length}
            </span>
          </div>
          {renderSection(priorityEmails, 0)}
        </div>
      )}

      {/* Recent section */}
      {recentEmails.length > 0 && (
        <div>
          {priorityEmails.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {activeCategory ? 'Emails' : 'Recent'}
              </span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                {recentEmails.length}
              </span>
            </div>
          )}
          {renderSection(recentEmails, priorityEmails.length)}

          {hasMore && onLoadMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={onLoadMore} className="gap-2">
                Load more emails
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default EmailList;
