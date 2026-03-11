/**
 * RelatedItems — collapsible section showing cross-entity connections.
 *
 * Given an anchor entity (email, contact, or project), fetches and
 * displays related items using the useRelatedItems hook. Shows max
 * 8 items by default with a "Show all X items" toggle.
 *
 * Does not render at all if there are no related items (empty state
 * is invisible by design — no wasted space).
 *
 * @module components/shared/RelatedItems
 * @since March 2026 — Phase 2 Cross-Entity Navigation
 */

'use client';

import * as React from 'react';
import { useRelatedItems, type RelatedItem } from '@/hooks/useRelatedItems';
import { CollapsibleSection } from './CollapsibleSection';
import { RelatedItemRow } from './RelatedItemRow';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('RelatedItems');

/** Maximum items shown before "Show all" toggle */
const MAX_VISIBLE = 8;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RelatedItemsProps {
  emailId?: string;
  contactId?: string;
  /** Optional className for outer wrapper */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function RelatedItems({ emailId, contactId, className }: RelatedItemsProps) {
  const { items, isLoading } = useRelatedItems({ emailId, contactId });
  const [showAll, setShowAll] = React.useState(false);

  // Don't render anything if no items and not loading
  if (!isLoading && items.length === 0) {
    return null;
  }

  // Loading skeleton
  if (isLoading && items.length === 0) {
    return null; // Don't show skeleton — section appears when data arrives
  }

  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hasMore = items.length > MAX_VISIBLE;

  logger.debug('Rendering related items', {
    count: items.length,
    anchor: emailId?.substring(0, 8) || contactId?.substring(0, 8) || 'none',
  });

  return (
    <div className={className}>
      <CollapsibleSection title="Related Items" count={items.length}>
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <RelatedItemRow key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
        {hasMore && !showAll && (
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAll(true)}
          >
            Show all {items.length} items
          </button>
        )}
      </CollapsibleSection>
    </div>
  );
}
