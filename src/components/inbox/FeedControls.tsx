/**
 * FeedControls Component
 *
 * Shared search bar + sort dropdown for browse feeds (Ideas, Insights, News, Links).
 * Keeps each feed component focused on rendering items while this handles controls.
 *
 * @module components/inbox/FeedControls
 * @since February 2026 — Phase 2
 */

'use client';

import * as React from 'react';
import { Search, X, SortAsc } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SortOption = 'newest' | 'confidence' | 'topic';

export interface FeedControlsProps {
  /** Current search query */
  searchQuery: string;
  /** Search query change handler */
  onSearchChange: (query: string) => void;
  /** Current sort option */
  sortBy: SortOption;
  /** Sort change handler */
  onSortChange: (sort: SortOption) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FeedControls — search bar + sort dropdown for feed pages.
 */
export function FeedControls({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  searchPlaceholder = 'Search...',
}: FeedControlsProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 h-8 text-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Sort dropdown */}
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[160px] h-8 text-sm">
          <SortAsc className="h-3.5 w-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="confidence">Highest Confidence</SelectItem>
          <SelectItem value="topic">By Topic</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Applies client-side search filtering to an array of items.
 * Searches across multiple text fields.
 */
export function filterBySearch<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string,
): T[] {
  if (!query.trim()) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter((item) => getSearchableText(item).toLowerCase().includes(lowerQuery));
}

/**
 * Applies client-side sorting to an array of items.
 */
export function sortItems<T>(
  items: T[],
  sortBy: SortOption,
  getConfidence: (item: T) => number,
  getDate: (item: T) => string,
  getTopicKey: (item: T) => string,
): T[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'confidence':
      sorted.sort((a, b) => getConfidence(b) - getConfidence(a));
      break;
    case 'topic':
      sorted.sort((a, b) => getTopicKey(a).localeCompare(getTopicKey(b)));
      break;
    case 'newest':
    default:
      sorted.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
      break;
  }
  return sorted;
}

/**
 * Paginates an array of items.
 * @returns Items for the current page and total page count.
 */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { pageItems: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
  };
}

export default FeedControls;
