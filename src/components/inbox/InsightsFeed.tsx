/**
 * InsightsFeed Component
 *
 * Full-page feed of synthesized insights from email content.
 * Supports type filtering, topic tags, and save/dismiss actions.
 *
 * NEW (Feb 2026): Companion to IdeaSparksCard feed — insights from
 * newsletters and substantive email content.
 *
 * @module components/inbox/InsightsFeed
 * @since February 2026
 */

'use client';

import React, { memo, useState, useCallback } from 'react';
import { useInsights } from '@/hooks/useInsights';
import type { InsightItem } from '@/hooks/useInsights';

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT TYPE FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Available insight types for filtering.
 */
const INSIGHT_TYPES = [
  { value: '', label: 'All' },
  { value: 'tip', label: 'Tips' },
  { value: 'framework', label: 'Frameworks' },
  { value: 'observation', label: 'Observations' },
  { value: 'counterintuitive', label: 'Surprising' },
  { value: 'trend', label: 'Trends' },
] as const;

/**
 * Type badge colors.
 */
const TYPE_COLORS: Record<string, string> = {
  tip:               'bg-blue-50 text-blue-700',
  framework:         'bg-purple-50 text-purple-700',
  observation:       'bg-amber-50 text-amber-700',
  counterintuitive:  'bg-rose-50 text-rose-700',
  trend:             'bg-emerald-50 text-emerald-700',
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const InsightRow = memo(function InsightRow({
  item,
  onSave,
  onDismiss,
}: {
  item: InsightItem;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const badgeColor = TYPE_COLORS[item.type] || TYPE_COLORS.observation;

  return (
    <div className="group bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${badgeColor}`}>
              {item.type}
            </span>
            {item.confidence >= 0.8 && (
              <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                High confidence
              </span>
            )}
          </div>

          {/* Insight text */}
          <p className="text-sm text-gray-800 leading-relaxed mb-2">
            {item.insight}
          </p>

          {/* Topics */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {item.topics.map(topic => (
              <span
                key={topic}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
              >
                {topic}
              </span>
            ))}
          </div>

          {/* Source */}
          <p className="text-[11px] text-gray-400 truncate">
            {item.emailSender && `from ${item.emailSender}`}
            {item.emailSubject && ` — ${item.emailSubject}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onSave}
            className="text-xs px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            Save
          </button>
          <button
            onClick={onDismiss}
            className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS FEED COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InsightsFeed — Full-page insights list with type filtering.
 *
 * @example
 * ```tsx
 * <InsightsFeed />
 * ```
 */
export function InsightsFeed() {
  const [typeFilter, setTypeFilter] = useState('');
  const { items, stats, isLoading, refetch, saveInsight, dismissInsight } = useInsights({
    limit: 20,
    type: typeFilter || undefined,
  });

  const handleSave = useCallback(async (item: InsightItem) => {
    try {
      await saveInsight(item);
    } catch {
      // Error logged in hook
    }
  }, [saveInsight]);

  return (
    <div className="space-y-4">
      {/* Header + Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Insights</h2>
          {stats && (
            <span className="text-xs text-gray-400">
              {stats.totalInsights} insight{stats.totalInsights !== 1 ? 's' : ''}
              {stats.savedInsights > 0 && ` · ${stats.savedInsights} saved`}
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {INSIGHT_TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              typeFilter === value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            {stats?.byType?.[value] && (
              <span className="ml-1 opacity-70">({stats.byType[value]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Insights list */}
      {isLoading ? (
        <div className="text-center py-8 text-sm text-gray-400">Loading insights...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          {typeFilter
            ? 'No insights of this type found. Try a different filter.'
            : 'No insights extracted yet. Check back after processing more emails.'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <InsightRow
              key={`${item.emailId}-${index}`}
              item={item}
              onSave={() => handleSave(item)}
              onDismiss={() => dismissInsight(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(InsightsFeed);
