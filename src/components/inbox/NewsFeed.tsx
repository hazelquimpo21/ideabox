/**
 * NewsFeed Component
 *
 * Full-page feed of extracted news items from email content.
 * Supports topic filtering, date badges, and save/dismiss actions.
 *
 * NEW (Feb 2026): Factual news extraction from newsletters and
 * industry updates. Shows "what happened" — launches, announcements,
 * regulatory changes, acquisitions.
 *
 * @module components/inbox/NewsFeed
 * @since February 2026
 */

'use client';

import React, { memo, useState, useCallback } from 'react';
import { useNews } from '@/hooks/useNews';
import type { NewsItemDisplay } from '@/hooks/useNews';

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS ITEM ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const NewsRow = memo(function NewsRow({
  item,
  onSave,
  onDismiss,
}: {
  item: NewsItemDisplay;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="group bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Headline */}
          <p className="text-sm font-medium text-gray-900 leading-snug mb-1.5">
            {item.headline}
          </p>

          {/* Detail */}
          <p className="text-xs text-gray-500 leading-relaxed mb-2">
            {item.detail}
          </p>

          {/* Topics + date + confidence */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {item.topics.map(topic => (
              <span
                key={topic}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
              >
                {topic}
              </span>
            ))}
            {item.dateMentioned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                {item.dateMentioned}
              </span>
            )}
            {item.confidence >= 0.8 && (
              <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                Verified
              </span>
            )}
          </div>

          {/* Source */}
          <p className="text-[11px] text-gray-400 truncate">
            {item.emailSender && `via ${item.emailSender}`}
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
// NEWS FEED COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NewsFeed — Full-page news list with topic filtering.
 *
 * @example
 * ```tsx
 * <NewsFeed />
 * ```
 */
export function NewsFeed() {
  const [topicFilter, setTopicFilter] = useState('');
  const { items, stats, isLoading, refetch, saveNews, dismissNews } = useNews({
    limit: 20,
    topic: topicFilter || undefined,
  });

  const handleSave = useCallback(async (item: NewsItemDisplay) => {
    try {
      await saveNews(item);
    } catch {
      // Error logged in hook
    }
  }, [saveNews]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">News Brief</h2>
          {stats && (
            <span className="text-xs text-gray-400">
              {stats.totalNews} item{stats.totalNews !== 1 ? 's' : ''}
              {stats.savedNews > 0 && ` · ${stats.savedNews} saved`}
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

      {/* Topic filter pills — built from top topics */}
      {stats?.topTopics && stats.topTopics.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setTopicFilter('')}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              !topicFilter
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {stats.topTopics.slice(0, 8).map(({ topic, count }) => (
            <button
              key={topic}
              onClick={() => setTopicFilter(topicFilter === topic ? '' : topic)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                topicFilter === topic
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {topic}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* News list */}
      {isLoading ? (
        <div className="text-center py-8 text-sm text-gray-400">Loading news...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          {topicFilter
            ? `No news about "${topicFilter}" found. Try a different topic.`
            : 'No news items extracted yet. Check back after processing more emails.'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <NewsRow
              key={`${item.emailId}-${index}`}
              item={item}
              onSave={() => handleSave(item)}
              onDismiss={() => dismissNews(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(NewsFeed);
