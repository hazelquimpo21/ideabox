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

import React, { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { Pagination } from '@/components/ui';
import { useNews } from '@/hooks/useNews';
import type { NewsItemDisplay } from '@/hooks/useNews';
import { FeedControls, filterBySearch, sortItems, paginateItems } from './FeedControls';
import type { SortOption } from './FeedControls';

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
const NEWS_PER_PAGE = 20;

export function NewsFeed() {
  const [topicFilter, setTopicFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const { items, stats, isLoading, refetch, saveNews, dismissNews } = useNews({
    limit: 50,
    topic: topicFilter || undefined,
  });

  // Reset page on filter changes
  useEffect(() => { setCurrentPage(1); }, [topicFilter, searchQuery, sortBy]);

  // Client-side search, sort, pagination
  const filteredItems = useMemo(() => {
    const searched = filterBySearch(items, searchQuery, (i) => `${i.headline} ${i.detail} ${i.topics.join(' ')}`);
    return sortItems(searched, sortBy, (i) => i.confidence, (i) => i.analyzedAt, (i) => i.topics[0] || '');
  }, [items, searchQuery, sortBy]);

  const { pageItems, totalPages } = paginateItems(filteredItems, currentPage, NEWS_PER_PAGE);

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

      {/* Search + Sort Controls (Phase 2) */}
      <FeedControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        searchPlaceholder="Search news..."
      />

      {/* News list */}
      {isLoading ? (
        <div className="text-center py-8 text-sm text-gray-400">Loading news...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          {topicFilter || searchQuery
            ? 'No matching news found. Try a different filter or search.'
            : 'No news items extracted yet. Check back after processing more emails.'}
        </div>
      ) : (
        <div className="space-y-2">
          {pageItems.map((item, index) => (
            <NewsRow
              key={`${item.emailId}-${index}`}
              item={item}
              onSave={() => handleSave(item)}
              onDismiss={() => dismissNews(item)}
            />
          ))}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredItems.length}
              pageSize={NEWS_PER_PAGE}
              onPageChange={setCurrentPage}
              showInfo
              className="mt-6"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default memo(NewsFeed);
