/**
 * CategoryOverview — category cards with avatar clusters and sparklines.
 * Implements §5g from VIEW_REDESIGN_PLAN.md.
 *
 * Each card shows: category icon, name, email count, unread delta,
 * overlapping avatar cluster (top 3 senders), 7-day sparkline,
 * and latest subject line preview.
 *
 * Grid: 1 col mobile, 2 on md, 3 on lg, 4 on xl.
 * Uses Card with interactive prop for hover lift.
 *
 * @module components/inbox/CategoryOverview
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { RefreshCw, Mail, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { useCategoryPreviews } from '@/hooks/useCategoryPreviews';
import { CategoryIcon } from './CategoryIcon';
import { SenderLogo } from './SenderLogo';
import { CategorySparkline } from './CategorySparkline';
import { CATEGORY_SHORT_LABELS } from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';

const logger = createLogger('CategoryOverview');

export interface CategoryOverviewProps {
  onCategorySelect?: (category: EmailCategory) => void;
  onEmailSelect?: (email: { id: string; category?: string | null }) => void;
}

export function CategoryOverview({ onCategorySelect, onEmailSelect }: CategoryOverviewProps) {
  const { previews, isLoading, error, refetch } = useCategoryPreviews();

  // Compute sparkline data per category from top emails
  const sparklines = React.useMemo(() => {
    const result: Record<string, number[]> = {};
    const now = new Date();
    for (const preview of previews) {
      const days = [0, 0, 0, 0, 0, 0, 0];
      for (const email of preview.topEmails) {
        const d = new Date(email.date);
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo >= 0 && daysAgo < 7) days[6 - daysAgo]++;
      }
      result[preview.category] = days;
    }
    return result;
  }, [previews]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive mb-4">{error.message}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {previews.length} active {previews.length === 1 ? 'category' : 'categories'}
          {' · '}{previews.reduce((sum, p) => sum + p.totalCount, 0)} total emails
        </p>
        <Button variant="ghost" size="sm" onClick={refetch} className="gap-1.5 text-xs text-muted-foreground h-7">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {previews.map((preview) => {
          const latestEmail = preview.topEmails[0];
          const sparkData = sparklines[preview.category];

          return (
            <Card
              key={preview.category}
              interactive
              className="p-4 group"
              onClick={() => {
                logger.info('Category card clicked', { category: preview.category });
                onCategorySelect?.(preview.category);
              }}
            >
              {/* Header: Icon + Name + Count */}
              <div className="flex items-center gap-3 mb-3">
                <CategoryIcon category={preview.category} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-medium text-sm truncate">{CATEGORY_SHORT_LABELS[preview.category]}</h3>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{preview.totalCount}</span>
                    {preview.unreadCount > 0 && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        +{preview.unreadCount} new
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar cluster + Sparkline */}
              <div className="flex items-center justify-between mb-3">
                {/* Overlapping avatar cluster — top 3 senders */}
                {preview.topSenders.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-2">
                      {preview.topSenders.slice(0, 3).map((sender, i) => (
                        <div
                          key={sender.email}
                          className="relative bg-background rounded-full p-px"
                          style={{ zIndex: 3 - i }}
                          title={`${sender.name} (${sender.count})`}
                        >
                          <SenderLogo senderEmail={sender.email} size={20} className="rounded-full" />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 truncate">
                      {preview.topSenders.length > 3
                        ? `+${preview.topSenders.length - 3} more`
                        : ''}
                    </span>
                  </div>
                )}

                {/* 7-day sparkline */}
                {sparkData && (
                  <CategorySparkline data={sparkData} width={48} height={16} className="text-muted-foreground/40" />
                )}
              </div>

              {/* Latest subject preview */}
              {latestEmail && (
                <p className="text-xs text-muted-foreground/70 truncate">
                  Latest: &ldquo;{latestEmail.subject || '(No subject)'}&rdquo;
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryOverview;
