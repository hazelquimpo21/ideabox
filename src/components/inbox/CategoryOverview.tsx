/**
 * CategoryOverview Component
 *
 * A full-page view showing one rich preview card per email category.
 * Each card displays: category icon, name, email count, unread count,
 * top 3 email subjects, top senders with logos, and average priority.
 *
 * Click a card to navigate to the Inbox tab filtered to that category.
 *
 * @module components/inbox/CategoryOverview
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { RefreshCw, Mail, ChevronRight, TrendingUp } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { useCategoryPreviews } from '@/hooks/useCategoryPreviews';
import { CategoryIcon } from './CategoryIcon';
import { SenderLogo } from './SenderLogo';
import {
  CATEGORY_DISPLAY,
  CATEGORY_SHORT_LABELS,
  CATEGORY_BADGE_COLORS,
} from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryOverview');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryOverviewProps {
  /** Callback when a category card is clicked — navigates to filtered inbox */
  onCategorySelect?: (category: EmailCategory) => void;
  /** Callback when an email preview is clicked — opens detail modal */
  onEmailSelect?: (email: { id: string; category?: string | null }) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Compact relative date formatting */
function formatSmartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CategoryOverview({ onCategorySelect, onEmailSelect }: CategoryOverviewProps) {
  const { previews, isLoading, error, refetch } = useCategoryPreviews();

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive mb-4">{error.message}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────────
  if (previews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Mail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No categories yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Categories will appear here once emails have been synced and analyzed.
        </p>
      </div>
    );
  }

  // ─── Main View ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {previews.length} active {previews.length === 1 ? 'category' : 'categories'}
            {' · '}
            {previews.reduce((sum, p) => sum + p.totalCount, 0)} total emails
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} className="gap-1.5 text-xs text-muted-foreground h-7">
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {previews.map((preview) => {
          const display = CATEGORY_DISPLAY[preview.category];
          const badgeColor = CATEGORY_BADGE_COLORS[preview.category];

          return (
            <Card
              key={preview.category}
              className={cn(
                'p-4 cursor-pointer transition-all duration-200',
                'hover:shadow-md hover:border-border group',
                preview.unreadCount > 0 && 'border-l-2 border-l-blue-500',
              )}
              onClick={() => {
                logger.info('Category card clicked', { category: preview.category });
                onCategorySelect?.(preview.category);
              }}
            >
              {/* ── Card Header: Icon + Category Name + Counts ──────────── */}
              <div className="flex items-start gap-3 mb-3">
                <CategoryIcon category={preview.category} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm truncate">
                      {CATEGORY_SHORT_LABELS[preview.category]}
                    </h3>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {display.description}
                  </p>
                </div>
              </div>

              {/* ── Stats Row ──────────────────────────────────────────── */}
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/30">
                <Badge className={cn('text-[10px] border-0 font-medium px-1.5 py-0', badgeColor)}>
                  {preview.totalCount} email{preview.totalCount !== 1 ? 's' : ''}
                </Badge>
                {preview.unreadCount > 0 && (
                  <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    {preview.unreadCount} unread
                  </span>
                )}
                {preview.avgPriority > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                    <TrendingUp className="h-2.5 w-2.5" />
                    avg {preview.avgPriority}
                  </span>
                )}
              </div>

              {/* ── Top Email Previews ─────────────────────────────────── */}
              <div className="space-y-2 mb-3">
                {preview.topEmails.map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    className="w-full flex items-start gap-2 text-left hover:bg-muted/40 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEmailSelect?.({ id: email.id, category: preview.category });
                    }}
                  >
                    <SenderLogo senderEmail={email.sender_email} size={16} className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-xs truncate',
                          !email.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground',
                        )}>
                          {email.sender_name || email.sender_email.split('@')[0]}
                        </span>
                        <span className="flex-1" />
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                          {formatSmartDate(email.date)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/70 truncate">
                        {email.subject || '(No subject)'}
                      </p>
                      {email.gist && (
                        <p className="text-[10px] text-muted-foreground/60 truncate">
                          {email.gist}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* ── Top Senders ────────────────────────────────────────── */}
              {preview.topSenders.length > 0 && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 font-medium">
                    Top senders
                  </p>
                  <div className="flex items-center gap-2">
                    {/* Stacked sender logos */}
                    <div className="flex -space-x-1.5">
                      {preview.topSenders.map((sender, i) => (
                        <div
                          key={sender.email}
                          className="relative bg-background rounded-full p-px"
                          style={{ zIndex: preview.topSenders.length - i }}
                          title={`${sender.name} (${sender.count})`}
                        >
                          <SenderLogo senderEmail={sender.email} size={18} className="rounded-full" />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground/70 truncate">
                      {preview.topSenders.map(s => s.name).join(', ')}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryOverview;
