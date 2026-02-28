/**
 * LinksFeed Component
 *
 * Full-page feed for browsing AI-analyzed links from email content.
 * Supports search, filter by priority/type, sort, and pagination.
 *
 * @module components/inbox/LinksFeed
 * @since February 2026 — Phase 2
 */

'use client';

import React, { memo, useState, useMemo, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Pagination,
} from '@/components/ui';
import {
  Link2,
  ExternalLink,
  Bookmark,
  X,
  FileText,
  Video,
  ShoppingBag,
  Wrench,
  Globe,
  Calendar,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLinks } from '@/hooks';
import type { LinkItem } from '@/hooks/useLinks';
import { FeedControls, filterBySearch, sortItems, paginateItems } from './FeedControls';
import type { SortOption } from './FeedControls';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('LinksFeed');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const LINKS_PER_PAGE = 20;

/** Priority filter options */
const PRIORITY_FILTERS = [
  { value: '', label: 'All' },
  { value: 'must_read', label: 'Must Read' },
  { value: 'worth_reading', label: 'Worth Reading' },
  { value: 'reference', label: 'Reference' },
];

/** Priority badge styling */
const PRIORITY_STYLES: Record<string, string> = {
  must_read: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  worth_reading: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reference: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  skip: 'bg-gray-50 text-gray-400',
};

/** Link type icons */
const LINK_TYPE_ICONS: Record<string, React.ElementType> = {
  article: FileText,
  registration: Calendar,
  document: FileText,
  video: Video,
  product: ShoppingBag,
  tool: Wrench,
  social: Globe,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: LinkRow
// ═══════════════════════════════════════════════════════════════════════════════

const LinkRow = memo(function LinkRow({
  link,
  onSave,
  onDismiss,
}: {
  link: LinkItem;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const TypeIcon = LINK_TYPE_ICONS[link.type] || Link2;
  const priorityClass = PRIORITY_STYLES[link.priority] || PRIORITY_STYLES.reference;

  // Format expiration
  const expirationText = useMemo(() => {
    if (!link.expires) return null;
    const days = Math.ceil((new Date(link.expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Tomorrow';
    if (days <= 7) return `${days}d left`;
    return null;
  }, [link.expires]);

  return (
    <div className="group bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />

        <div className="flex-1 min-w-0">
          {/* Priority + expiration badges */}
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 border-0', priorityClass)}>
              {link.priority.replace(/_/g, ' ')}
            </Badge>
            {expirationText && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {expirationText}
              </span>
            )}
          </div>

          {/* Link title */}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline flex items-center gap-1 mb-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {link.title || link.url}
            <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
          </a>

          {/* Description */}
          {link.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
              {link.description}
            </p>
          )}

          {/* Topics + source */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            {link.topics.slice(0, 3).map((t) => (
              <span key={t} className="px-1 py-0.5 rounded bg-muted/50 text-[10px]">{t}</span>
            ))}
            {(link.emailSubject || link.emailSender) && (
              <>
                <span>·</span>
                <span className="truncate">{link.emailSubject || link.emailSender}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onSave} title="Save">
            <Bookmark className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={onDismiss} title="Dismiss">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LinksFeed — Full-page links browse with search, filter, sort, pagination.
 */
export function LinksFeed() {
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const { items, stats, isLoading, refetch, saveLink, dismissLink } = useLinks({
    limit: 50,
    priority: priorityFilter || undefined,
  });

  // Reset page on filter changes
  useEffect(() => { setCurrentPage(1); }, [priorityFilter, searchQuery, sortBy]);

  // Client-side search, sort, pagination
  const filteredItems = useMemo(() => {
    const searched = filterBySearch(items, searchQuery, (i) =>
      `${i.title} ${i.description} ${i.topics.join(' ')} ${i.emailSubject || ''}`,
    );
    return sortItems(searched, sortBy, (i) => i.confidence, (i) => i.analyzedAt, (i) => i.topics[0] || '');
  }, [items, searchQuery, sortBy]);

  const { pageItems, totalPages } = paginateItems(filteredItems, currentPage, LINKS_PER_PAGE);

  const handleSave = useCallback(async (link: LinkItem) => {
    try {
      await saveLink(link);
      logger.success('Link saved');
    } catch {
      logger.error('Failed to save link');
    }
  }, [saveLink]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Links
          </h2>
          {stats && (
            <span className="text-xs text-muted-foreground">
              {stats.totalLinks} link{stats.totalLinks !== 1 ? 's' : ''}
              {stats.savedLinks > 0 && ` · ${stats.savedLinks} saved`}
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Priority filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {PRIORITY_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPriorityFilter(value)}
            className={cn(
              'text-xs px-3 py-1 rounded-full transition-colors',
              priorityFilter === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {label}
            {value && stats?.byPriority?.[value] ? (
              <span className="ml-1 opacity-70">({stats.byPriority[value]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Search + Sort Controls */}
      <FeedControls
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        searchPlaceholder="Search links..."
      />

      {/* Links list */}
      {isLoading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Loading links...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {priorityFilter || searchQuery
            ? 'No matching links found. Try a different filter or search.'
            : 'No analyzed links yet. They\'ll appear as emails with links are processed.'}
        </div>
      ) : (
        <div className="space-y-2">
          {pageItems.map((link, index) => (
            <LinkRow
              key={`${link.emailId}-${link.url}-${index}`}
              link={link}
              onSave={() => handleSave(link)}
              onDismiss={() => dismissLink(link)}
            />
          ))}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredItems.length}
              pageSize={LINKS_PER_PAGE}
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

export default memo(LinksFeed);
