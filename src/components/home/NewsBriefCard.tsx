/**
 * NewsBriefCard Component
 *
 * Home page widget displaying extracted news items from email content.
 * Shows factual headlines with detail, topic tags, and save/dismiss actions.
 *
 * NEW (Feb 2026): The factual complement to InsightsCard — news is about
 * "what happened" while insights are about "what's worth knowing."
 *
 * @module components/home/NewsBriefCard
 * @since February 2026
 */

'use client';

import React, { memo, useCallback } from 'react';
import { useNews } from '@/hooks/useNews';
import type { NewsItemDisplay } from '@/hooks/useNews';

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const NewsItemRow = memo(function NewsItemRow({
  item,
  onSave,
  onDismiss,
}: {
  item: NewsItemDisplay;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-1 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
      {/* Headline */}
      <p className="text-sm font-medium text-gray-900 leading-snug pr-16">
        {item.headline}
      </p>

      {/* Detail */}
      <p className="text-xs text-gray-500 leading-relaxed">
        {item.detail}
      </p>

      {/* Topics + date + source */}
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        {item.topics.slice(0, 3).map(topic => (
          <span
            key={topic}
            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium"
          >
            {topic}
          </span>
        ))}
        {item.dateMentioned && (
          <span className="text-[10px] text-gray-400">
            {item.dateMentioned}
          </span>
        )}
        {item.confidence >= 0.8 && (
          <span className="text-[10px] text-emerald-500 font-medium">Verified</span>
        )}
      </div>

      {/* Source */}
      {item.emailSender && (
        <p className="text-[10px] text-gray-400 truncate mt-0.5">
          via {item.emailSender}
        </p>
      )}

      {/* Save/Dismiss actions (visible on hover) */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={onSave}
          className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          title="Save this news item"
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
// NEWS BRIEF CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NewsBriefCard — Home page widget showing top news items from emails.
 *
 * @example
 * ```tsx
 * <NewsBriefCard limit={5} />
 * ```
 */
export function NewsBriefCard({ limit = 5 }: { limit?: number }) {
  const { items, isLoading, saveNews, dismissNews } = useNews({ limit });

  const handleSave = useCallback(async (item: NewsItemDisplay) => {
    try {
      await saveNews(item);
    } catch {
      // Error logged in hook — toast could go here
    }
  }, [saveNews]);

  // Don't render if no news
  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h3 className="text-sm font-semibold text-gray-900">News Brief</h3>
          {items.length > 0 && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400">What happened</span>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-gray-400">
            Loading news...
          </div>
        ) : (
          items.slice(0, limit).map((item, index) => (
            <NewsItemRow
              key={`${item.emailId}-${index}`}
              item={item}
              onSave={() => handleSave(item)}
              onDismiss={() => dismissNews(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(NewsBriefCard);
