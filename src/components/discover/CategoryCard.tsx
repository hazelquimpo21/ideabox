/**
 * CategoryCard Component (Enhanced)
 *
 * Displays a summary card for a single email category on the Discovery Dashboard.
 * Now includes AI-powered intelligence: urgency indicators, briefings,
 * actionable items, and relationship health.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Category icon, label, and counts
 * - Urgency dots showing critical/high/medium urgency items
 * - AI briefing with natural language status summary
 * - "Needs Attention" section with top actionable items
 * - Relationship health indicator
 * - Top senders and sample subjects
 * - Category-specific enhancements (events, finance, etc.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * <CategoryCard
 *   summary={{
 *     category: 'client_pipeline',
 *     count: 37,
 *     unreadCount: 12,
 *     urgencyScores: [9, 8, 6, 4],
 *     briefing: "3 clients waiting for responses...",
 *     needsAttention: [...],
 *     healthSummary: { positive: 5, neutral: 10, negative: 2 },
 *   }}
 * />
 * ```
 *
 * @module components/discover/CategoryCard
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORY_DISPLAY } from '@/types/discovery';
import type { CategorySummary, NeedsAttentionItem } from '@/types/discovery';
import { UrgencyIndicator } from '@/components/categories/UrgencyIndicator';
import { RelationshipHealth } from '@/components/categories/RelationshipHealth';
import { cn } from '@/lib/utils/cn';
import { createLogger, logDiscover } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CategoryCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CategoryCardProps {
  /** Category summary data */
  summary: CategorySummary;
  /** Whether to show as compact (fewer details) */
  compact?: boolean;
  /** Whether to show enhanced intelligence sections (default: true) */
  enhanced?: boolean;
  /** Custom click handler (overrides default navigation) */
  onClick?: (category: CategorySummary) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a deadline date for display
 */
function formatDeadline(dateStr: string | undefined): string | null {
  if (!dateStr) return null;

  try {
    const date = parseISO(dateStr);
    if (isPast(date)) {
      return 'Overdue';
    }
    return formatDistanceToNow(date, { addSuffix: false });
  } catch (err) {
    logger.warn('Failed to parse deadline date', { dateStr, error: String(err) });
    return null;
  }
}

/**
 * Get deadline indicator styling based on urgency
 */
function getDeadlineStyle(dateStr: string | undefined, urgency: number): {
  icon: string;
  className: string;
} {
  if (!dateStr) {
    return { icon: '💬', className: 'text-muted-foreground' };
  }

  try {
    const date = parseISO(dateStr);
    if (isPast(date)) {
      return { icon: '⚠️', className: 'text-red-600 dark:text-red-400 font-medium' };
    }
    if (urgency >= 8) {
      return { icon: '🔴', className: 'text-red-600 dark:text-red-400' };
    }
    if (urgency >= 5) {
      return { icon: '⏰', className: 'text-amber-600 dark:text-amber-400' };
    }
    return { icon: '📅', className: 'text-muted-foreground' };
  } catch {
    return { icon: '💬', className: 'text-muted-foreground' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays a category summary card with AI intelligence.
 */
export function CategoryCard({
  summary,
  compact = false,
  enhanced = true,
  onClick,
}: CategoryCardProps) {
  const router = useRouter();

  // ───────────────────────────────────────────────────────────────────────────
  // Get display configuration with defensive fallback
  // ───────────────────────────────────────────────────────────────────────────
  // SAFETY (Jan 2026): If a category doesn't have display config (e.g., during
  // migration or if AI returns unexpected category), use a fallback to prevent
  // crashes. This logs a warning for debugging and troubleshooting.
  // ───────────────────────────────────────────────────────────────────────────
  const rawDisplay = CATEGORY_DISPLAY[summary.category];

  // Fallback display config for unknown/unexpected categories
  const fallbackDisplay = {
    label: summary.category?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown',
    icon: '📧',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    description: 'Email category',
  };

  // Use fallback if display is undefined
  const display = rawDisplay || fallbackDisplay;

  // Log warning for unknown categories (helpful for debugging migrations)
  React.useEffect(() => {
    if (!rawDisplay) {
      logger.warn('Unknown category encountered - using fallback display', {
        category: summary.category,
        availableCategories: Object.keys(CATEGORY_DISPLAY),
        fallbackLabel: fallbackDisplay.label,
      });
    }
  }, [summary.category, rawDisplay]);

  // ───────────────────────────────────────────────────────────────────────────
  // Debug Logging
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    logger.debug('Rendering category card', {
      category: summary.category,
      count: summary.count,
      unreadCount: summary.unreadCount,
      hasUrgencyScores: !!summary.urgencyScores?.length,
      hasNeedsAttention: !!summary.needsAttention?.length,
      hasBriefing: !!summary.briefing,
      hasHealthSummary: !!summary.healthSummary,
      usingFallbackDisplay: !rawDisplay,
    });
  }, [summary, rawDisplay]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleClick = () => {
    logDiscover.cardClick({ category: summary.category, count: summary.count });
    if (onClick) {
      onClick(summary);
    } else {
      // Default: navigate to category detail page
      // UPDATED (Feb 2026): /discover → /inbox per Navigation Redesign
      router.push(`/inbox/${summary.category}`);
    }
  };

  const handleNeedsAttentionClick = (item: NeedsAttentionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    logDiscover.navigateToEmail({
      category: summary.category,
      emailId: item.emailId,
      actionType: item.actionType,
    });
    // UPDATED (Feb 2026): /discover → /inbox per Navigation Redesign
    router.push(`/inbox/${summary.category}/${item.emailId}`);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (summary.count === 0) {
    return (
      <Card
        className={cn(
          'relative overflow-hidden opacity-60 cursor-default',
          display.bgColor
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{display.icon}</span>
              <h3 className="font-semibold text-sm">{display.label}</h3>
            </div>
            <Badge variant="secondary" className="text-xs">
              0
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            {summary.insight || 'No emails in this category'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer',
        'transition-all duration-200',
        'hover:shadow-md hover:scale-[1.02]',
        display.bgColor
      )}
      onClick={handleClick}
    >
      {/* ─────────────────────────────────────────────────────────────────────
          HEADER: Category icon, name, counts, urgency dots
      ───────────────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {/* Category icon and label */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">{display.icon}</span>
            <h3 className="font-semibold text-sm">{display.label}</h3>
          </div>

          {/* Counts and urgency */}
          <div className="flex items-center gap-2">
            {/* Unread badge */}
            {summary.unreadCount > 0 && (
              <Badge variant="default" className="text-xs">
                {summary.unreadCount} new
              </Badge>
            )}
            {/* Total count */}
            <Badge variant="secondary" className={cn('text-xs', display.color)}>
              {summary.count}
            </Badge>
          </div>
        </div>

        {/* Urgency indicator row (enhanced mode) */}
        {enhanced && summary.urgencyScores && summary.urgencyScores.length > 0 && (
          <div className="flex items-center justify-end mt-1">
            <UrgencyIndicator
              scores={summary.urgencyScores}
              maxDots={4}
              showLabel
              compact
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* ─────────────────────────────────────────────────────────────────────
            AI BRIEFING: Natural language summary (enhanced mode)
        ───────────────────────────────────────────────────────────────────── */}
        {enhanced && summary.briefing ? (
          <div className="rounded-md bg-white/50 dark:bg-black/10 p-2 border border-white/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
              AI Briefing
            </p>
            <p className={cn('text-sm', display.color)}>
              {summary.briefing}
            </p>
          </div>
        ) : (
          /* Fallback to basic insight */
          <p className={cn('text-sm font-medium', display.color)}>
            {summary.insight}
          </p>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            NEEDS ATTENTION: Top actionable items (enhanced mode)
        ───────────────────────────────────────────────────────────────────── */}
        {enhanced && summary.needsAttention && summary.needsAttention.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Needs Attention
            </p>
            <div className="space-y-1">
              {summary.needsAttention.slice(0, 3).map((item, index) => {
                const deadlineText = formatDeadline(item.deadline);
                const deadlineStyle = getDeadlineStyle(item.deadline, item.urgency);

                return (
                  <button
                    key={`attention-${index}-${item.emailId}`}
                    onClick={(e) => handleNeedsAttentionClick(item, e)}
                    className={cn(
                      'w-full flex items-center gap-2 p-1.5 rounded text-left',
                      'hover:bg-white/50 dark:hover:bg-black/10 transition-colors',
                      'text-xs'
                    )}
                  >
                    {/* Deadline/urgency indicator */}
                    <span className={cn('w-12 shrink-0', deadlineStyle.className)}>
                      {deadlineStyle.icon} {deadlineText || '—'}
                    </span>

                    {/* Action title */}
                    <span className="flex-1 truncate font-medium">
                      {item.title}
                    </span>

                    {/* Sender */}
                    <span className="text-muted-foreground truncate max-w-[80px]">
                      {item.senderName}
                      {item.company && `, ${item.company}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            HEALTH SUMMARY: Relationship signals (enhanced mode)
        ───────────────────────────────────────────────────────────────────── */}
        {enhanced && summary.healthSummary && (
          <div className="pt-1 border-t border-white/20">
            <RelationshipHealth
              positive={summary.healthSummary.positive}
              neutral={summary.healthSummary.neutral}
              negative={summary.healthSummary.negative}
              variant="compact"
            />
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            LEGACY SECTIONS: Urgent count, upcoming event
        ───────────────────────────────────────────────────────────────────── */}

        {/* Urgent indicator for action_required (legacy mode only) */}
        {!enhanced && summary.urgentCount && summary.urgentCount > 0 && (
          <div className="flex items-center gap-1 text-red-600">
            <span className="text-xs">⚡</span>
            <span className="text-xs font-medium">
              {summary.urgentCount} urgent
            </span>
          </div>
        )}

        {/* Upcoming event for events category */}
        {summary.upcomingEvent && (
          <div className="text-xs bg-white/50 rounded px-2 py-1">
            <span className="text-muted-foreground">Next: </span>
            <span className="font-medium">{summary.upcomingEvent.title}</span>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            TOP SENDERS (unless compact)
        ───────────────────────────────────────────────────────────────────── */}
        {!compact && summary.topSenders.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Top senders:</p>
            <div className="flex flex-wrap gap-1">
              {summary.topSenders.slice(0, 3).map((sender, i) => (
                <Badge
                  key={`sender-${i}-${sender.email}`}
                  variant="outline"
                  className="text-xs bg-white/50"
                >
                  {sender.name}
                  {sender.count > 1 && (
                    <span className="ml-1 text-muted-foreground">
                      ({sender.count})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            SAMPLE SUBJECTS (unless compact, non-enhanced mode)
        ───────────────────────────────────────────────────────────────────── */}
        {!compact && !enhanced && summary.sampleSubjects.length > 0 && (
          <div className="space-y-1 mt-2">
            {summary.sampleSubjects.slice(0, 2).map((subject, i) => (
              <p
                key={`subject-${i}`}
                className="text-xs text-muted-foreground truncate"
                title={subject}
              >
                &ldquo;{subject}&rdquo;
              </p>
            ))}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            FOOTER: View All button (enhanced mode)
        ───────────────────────────────────────────────────────────────────── */}
        {enhanced && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn('text-xs gap-1', display.color)}
              onClick={handleClick}
            >
              View All {summary.count}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>

      {/* Click indicator (non-enhanced mode) */}
      {!enhanced && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view →
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default CategoryCard;
