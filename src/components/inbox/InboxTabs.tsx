/**
 * Inbox Tabs Component
 *
 * Manages the three-tab interface for the Inbox page:
 *   1. Categories (default) — email categorization dashboard (DiscoverPage)
 *   2. Priority — emails ranked by AI priority score
 *   3. Archive — archived emails with search/filter/bulk actions
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)       → Categories tab → DiscoverPage component
 * - ?tab=priority   → Priority tab → PriorityEmailList component
 * - ?tab=archive    → Archive tab → ArchivePage component
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <InboxTabs />
 * ```
 *
 * @module components/inbox/InboxTabs
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { LayoutGrid, TrendingUp, Archive } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Extracted content components (Phase 4) ─────────────────────────────────
import { DiscoverContent } from '@/components/discover';
import { ArchiveContent } from '@/components/archive';
import { PriorityEmailList } from '@/components/inbox/PriorityEmailList';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab values for URL routing. */
const VALID_TABS = ['categories', 'priority', 'archive'] as const;
type InboxTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: InboxTab = 'categories';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InboxTabs — three-tab interface for the Inbox page.
 *
 * Reads the `?tab=` query param to determine the active tab.
 * When the user switches tabs, the URL is updated without a full navigation.
 * Each tab renders its content lazily to avoid unnecessary data fetching.
 */
export function InboxTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const activeTab: InboxTab = VALID_TABS.includes(tabParam as InboxTab)
    ? (tabParam as InboxTab)
    : DEFAULT_TAB;

  logger.debug('InboxTabs rendering', { activeTab, tabParam });

  /**
   * Handle tab change by updating the URL query parameter.
   * Preserves other query params (like modal, category).
   */
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as InboxTab;
      logger.info('Tab changed', { from: activeTab, to: tab });

      const params = new URLSearchParams(searchParams.toString());

      if (tab === DEFAULT_TAB) {
        // Remove tab param for default tab (clean URL)
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [activeTab, searchParams, pathname, router]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      {/* ─── Tab Headers ────────────────────────────────────────────────────── */}
      <TabsList variant="underline" className="mb-6">
        <TabsTrigger
          value="categories"
          variant="underline"
          icon={<LayoutGrid className="h-4 w-4" />}
        >
          Categories
        </TabsTrigger>
        <TabsTrigger
          value="priority"
          variant="underline"
          icon={<TrendingUp className="h-4 w-4" />}
        >
          Priority
        </TabsTrigger>
        <TabsTrigger
          value="archive"
          variant="underline"
          icon={<Archive className="h-4 w-4" />}
        >
          Archive
        </TabsTrigger>
      </TabsList>

      {/* ─── Tab Content: Categories ─────────────────────────────────────── */}
      <TabsContent value="categories">
        <DiscoverContent />
      </TabsContent>

      {/* ─── Tab Content: Priority ───────────────────────────────────────── */}
      <TabsContent value="priority">
        <PriorityEmailList />
      </TabsContent>

      {/* ─── Tab Content: Archive ────────────────────────────────────────── */}
      <TabsContent value="archive">
        <ArchiveContent />
      </TabsContent>
    </Tabs>
  );
}

export default InboxTabs;
