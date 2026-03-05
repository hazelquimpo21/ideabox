/**
 * InboxEmptyState — contextual empty states for the inbox feed.
 * Implements §5 from VIEW_REDESIGN_PLAN.md.
 *
 * Four variants:
 * - sync: Initial sync is running (progress + skeleton)
 * - empty: Inbox is truly empty (no emails synced)
 * - category: Active category filter has no results
 * - search: Search returned no results
 *
 * @module components/inbox/InboxEmptyState
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Inbox, Search, Loader2 } from 'lucide-react';
import { Button, Skeleton, Badge } from '@/components/ui';

export interface InboxEmptyStateProps {
  variant: 'sync' | 'empty' | 'category' | 'search';
  /** For sync variant: progress percentage */
  syncProgress?: number;
  /** For sync variant: current step description */
  syncStep?: string;
  /** For sync variant: discovery counts */
  syncDiscoveries?: {
    actionItems: number;
    events: number;
    clientsDetected: string[];
  };
  /** For category variant: clear filter callback */
  onClearCategory?: () => void;
  /** For search variant: the search query */
  searchQuery?: string;
}

export function InboxEmptyState({
  variant,
  syncProgress = 0,
  syncStep,
  syncDiscoveries,
  onClearCategory,
  searchQuery,
}: InboxEmptyStateProps) {
  if (variant === 'sync') {
    const hasDiscoveries = syncDiscoveries && (
      syncDiscoveries.actionItems > 0 ||
      syncDiscoveries.events > 0 ||
      syncDiscoveries.clientsDetected.length > 0
    );

    return (
      <div>
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5 mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium">Analyzing your emails</h3>
              {syncStep && <p className="text-xs text-muted-foreground truncate">{syncStep}</p>}
            </div>
            {syncProgress > 0 && (
              <span className="text-sm font-medium tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                {Math.round(syncProgress)}%
              </span>
            )}
          </div>
          <div className="h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, syncProgress))}%` }}
            />
          </div>
          {hasDiscoveries && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Found so far:</span>
              {syncDiscoveries!.actionItems > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {syncDiscoveries!.actionItems} action item{syncDiscoveries!.actionItems !== 1 ? 's' : ''}
                </Badge>
              )}
              {syncDiscoveries!.events > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {syncDiscoveries!.events} event{syncDiscoveries!.events !== 1 ? 's' : ''}
                </Badge>
              )}
              {syncDiscoveries!.clientsDetected.map((client) => (
                <Badge key={client} variant="outline" className="text-xs">{client}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden opacity-50">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-b-0">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No emails yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Connect a Gmail account and sync your emails to get started.
        </p>
      </div>
    );
  }

  if (variant === 'category') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No emails in this category</p>
        {onClearCategory && (
          <Button variant="ghost" size="sm" onClick={onClearCategory} className="mt-2">
            Show all emails
          </Button>
        )}
      </div>
    );
  }

  // Search variant
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Search className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">
        No results for &ldquo;{searchQuery}&rdquo;
      </p>
    </div>
  );
}

export default InboxEmptyState;
