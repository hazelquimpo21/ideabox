/**
 * InsightsCard Component
 *
 * Home page widget displaying synthesized insights from email content.
 * Shows top insights by confidence with type badges and save/dismiss actions.
 *
 * NEW (Feb 2026): Complements IdeaSparksCard — insights are about "what's
 * worth knowing" while idea sparks are about "what to do."
 *
 * @module components/home/InsightsCard
 * @since February 2026
 */

'use client';

import React, { memo, useCallback } from 'react';
import { useInsights } from '@/hooks/useInsights';
import type { InsightItem } from '@/hooks/useInsights';

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT TYPE STYLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Visual styling for each insight type.
 * Colors and labels help users quickly identify insight categories.
 */
const INSIGHT_TYPE_STYLES: Record<string, { label: string; color: string; bgColor: string }> = {
  tip:               { label: 'Tip',             color: 'text-blue-700',    bgColor: 'bg-blue-50' },
  framework:         { label: 'Framework',       color: 'text-purple-700',  bgColor: 'bg-purple-50' },
  observation:       { label: 'Observation',     color: 'text-amber-700',   bgColor: 'bg-amber-50' },
  counterintuitive:  { label: 'Surprising',      color: 'text-rose-700',    bgColor: 'bg-rose-50' },
  trend:             { label: 'Trend',           color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const InsightItemRow = memo(function InsightItemRow({
  item,
  onSave,
  onDismiss,
}: {
  item: InsightItem;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const style = INSIGHT_TYPE_STYLES[item.type] || INSIGHT_TYPE_STYLES.observation;

  return (
    <div className="group relative flex flex-col gap-1 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
      {/* Type badge + confidence */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bgColor} ${style.color}`}>
          {style.label}
        </span>
        {item.confidence >= 0.8 && (
          <span className="text-[10px] text-gray-400 font-medium">High confidence</span>
        )}
        {/* Topics */}
        {item.topics.slice(0, 2).map(topic => (
          <span key={topic} className="text-[10px] text-gray-400">
            {topic}
          </span>
        ))}
      </div>

      {/* Insight text */}
      <p className="text-sm text-gray-700 leading-snug pr-16">
        {item.insight}
      </p>

      {/* Source email */}
      {item.emailSender && (
        <p className="text-[11px] text-gray-400 truncate">
          from {item.emailSender}
          {item.emailSubject && ` — ${item.emailSubject}`}
        </p>
      )}

      {/* Save/Dismiss actions (visible on hover) */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={onSave}
          className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          title="Save this insight"
        >
          Save
        </button>
        <button
          onClick={onDismiss}
          className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InsightsCard — Home page widget showing top insights from emails.
 *
 * @example
 * ```tsx
 * <InsightsCard limit={5} />
 * ```
 */
export function InsightsCard({ limit = 5 }: { limit?: number }) {
  const { items, isLoading, saveInsight, dismissInsight } = useInsights({ limit });

  const handleSave = useCallback(async (item: InsightItem) => {
    try {
      await saveInsight(item);
    } catch {
      // Error logged in hook — toast could go here
    }
  }, [saveInsight]);

  // Don't render if no insights
  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <h3 className="text-sm font-semibold text-gray-900">Insights</h3>
          {items.length > 0 && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400">From your newsletters</span>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-gray-400">
            Loading insights...
          </div>
        ) : (
          items.slice(0, limit).map((item, index) => (
            <InsightItemRow
              key={`${item.emailId}-${index}`}
              item={item}
              onSave={() => handleSave(item)}
              onDismiss={() => dismissInsight(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(InsightsCard);
