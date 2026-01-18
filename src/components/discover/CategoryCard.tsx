/**
 * CategoryCard Component
 *
 * Displays a summary card for a single email category on the Discovery Dashboard.
 * Shows count, top senders, sample subjects, and category-specific insights.
 *
 * @module components/discover/CategoryCard
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_DISPLAY } from '@/types/discovery';
import type { CategorySummary } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface CategoryCardProps {
  /** Category summary data */
  summary: CategorySummary;
  /** Whether to show as compact (fewer details) */
  compact?: boolean;
  /** Custom click handler (overrides default navigation) */
  onClick?: (category: CategorySummary) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays a category summary card.
 *
 * @example
 * ```tsx
 * <CategoryCard
 *   summary={{
 *     category: 'action_required',
 *     count: 12,
 *     unreadCount: 8,
 *     topSenders: [...],
 *     sampleSubjects: [...],
 *     insight: '3 are urgent',
 *     urgentCount: 3,
 *   }}
 * />
 * ```
 */
export function CategoryCard({
  summary,
  compact = false,
  onClick,
}: CategoryCardProps) {
  const router = useRouter();
  const display = CATEGORY_DISPLAY[summary.category];

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleClick = () => {
    if (onClick) {
      onClick(summary);
    } else {
      // Navigate to inbox filtered by this category
      router.push(`/inbox?category=${summary.category}`);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (summary.count === 0) {
    return (
      <Card
        className={`
          relative overflow-hidden opacity-60 cursor-default
          ${display.bgColor}
        `}
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
          <p className="text-xs text-muted-foreground">{summary.insight}</p>
        </CardContent>
      </Card>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card
      className={`
        relative overflow-hidden cursor-pointer
        transition-all duration-200
        hover:shadow-md hover:scale-[1.02]
        ${display.bgColor}
      `}
      onClick={handleClick}
    >
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{display.icon}</span>
            <h3 className="font-semibold text-sm">{display.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Unread badge */}
            {summary.unreadCount > 0 && (
              <Badge variant="default" className="text-xs">
                {summary.unreadCount} new
              </Badge>
            )}
            {/* Total count */}
            <Badge variant="secondary" className={`text-xs ${display.color}`}>
              {summary.count}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Insight */}
        <p className={`text-sm font-medium ${display.color}`}>
          {summary.insight}
        </p>

        {/* Urgent indicator for action_required */}
        {summary.urgentCount && summary.urgentCount > 0 && (
          <div className="flex items-center gap-1 text-red-600">
            <span className="text-xs">⚡</span>
            <span className="text-xs font-medium">
              {summary.urgentCount} urgent
            </span>
          </div>
        )}

        {/* Upcoming event for events */}
        {summary.upcomingEvent && (
          <div className="text-xs bg-white/50 rounded px-2 py-1">
            <span className="text-muted-foreground">Next: </span>
            <span className="font-medium">{summary.upcomingEvent.title}</span>
          </div>
        )}

        {/* Top Senders (unless compact) */}
        {!compact && summary.topSenders.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Top senders:</p>
            <div className="flex flex-wrap gap-1">
              {summary.topSenders.slice(0, 3).map((sender, i) => (
                <Badge
                  key={i}
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

        {/* Sample Subjects (unless compact) */}
        {!compact && summary.sampleSubjects.length > 0 && (
          <div className="space-y-1 mt-2">
            {summary.sampleSubjects.slice(0, 2).map((subject, i) => (
              <p
                key={i}
                className="text-xs text-muted-foreground truncate"
                title={subject}
              >
                &ldquo;{subject}&rdquo;
              </p>
            ))}
          </div>
        )}
      </CardContent>

      {/* Click indicator */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        Click to view →
      </div>
    </Card>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CategoryCard;
