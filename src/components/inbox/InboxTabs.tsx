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
 * EMAIL DETAIL MODAL (Performance Audit P0-A)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Email clicks from Priority and Archive tabs now open an EmailDetailModal
 * instead of navigating to a full page. This eliminates the full-page
 * unmount/remount cycle and makes back-navigation instant.
 *
 * The Categories tab continues to use its own CategoryModal for email triage
 * and delegates to the EmailDetailModal via the onEmailClick callback.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)       → Categories tab → DiscoverContent component
 * - ?tab=priority   → Priority tab → PriorityEmailList component
 * - ?tab=archive    → Archive tab → ArchiveContent component
 *
 * @module components/inbox/InboxTabs
 * @since February 2026 — Phase 2 Navigation Redesign
 * @see INBOX_PERFORMANCE_AUDIT.md — P0-A
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { LayoutGrid, TrendingUp, Archive } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Content components ─────────────────────────────────────────────────────
import { DiscoverContent } from '@/components/discover';
import { ArchiveContent } from '@/components/archive';
import { PriorityEmailList } from '@/components/inbox/PriorityEmailList';
import { EmailDetailModal } from '@/components/email/EmailDetailModal';

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
 *
 * Email clicks from Priority/Archive tabs open a modal instead of navigating
 * to a full page, eliminating the full-page re-render cycle.
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

  // ─── Email Detail Modal State ──────────────────────────────────────────────
  // Managed at the InboxTabs level so all tabs can open the same modal
  // and the underlying tab content stays mounted.
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(null);
  const [selectedEmailCategory, setSelectedEmailCategory] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  logger.debug('InboxTabs rendering', { activeTab, tabParam, isModalOpen });

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

  /**
   * Open email detail modal — called from Priority and Archive tabs.
   * Sets the selected email ID and category, then opens the modal.
   * The inbox stays mounted underneath.
   */
  const handleEmailSelect = React.useCallback(
    (email: { id: string; category?: string | null }) => {
      logger.info('Email selected for modal', {
        emailId: email.id,
        category: email.category,
        fromTab: activeTab,
      });
      setSelectedEmailId(email.id);
      setSelectedEmailCategory(email.category || 'uncategorized');
      setIsModalOpen(true);
    },
    [activeTab]
  );

  /**
   * Close email detail modal. Clears the selected email state
   * after a brief delay (for close animation).
   */
  const handleModalClose = React.useCallback(() => {
    logger.info('Email detail modal closing', { emailId: selectedEmailId });
    setIsModalOpen(false);
    // Delay clearing to allow the close animation to play
    setTimeout(() => {
      setSelectedEmailId(null);
      setSelectedEmailCategory(null);
    }, 200);
  }, [selectedEmailId]);

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* ─── Tab Headers ────────────────────────────────────────────────── */}
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

        {/* ─── Tab Content: Categories ─────────────────────────────────── */}
        <TabsContent value="categories">
          <DiscoverContent onEmailSelect={handleEmailSelect} />
        </TabsContent>

        {/* ─── Tab Content: Priority ───────────────────────────────────── */}
        <TabsContent value="priority">
          <PriorityEmailList onEmailSelect={handleEmailSelect} />
        </TabsContent>

        {/* ─── Tab Content: Archive ────────────────────────────────────── */}
        <TabsContent value="archive">
          <ArchiveContent onEmailSelect={handleEmailSelect} />
        </TabsContent>
      </Tabs>

      {/* ─── Email Detail Modal ────────────────────────────────────────── */}
      {/* Rendered outside the Tabs so it overlays the entire inbox */}
      <EmailDetailModal
        emailId={selectedEmailId}
        category={selectedEmailCategory}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        fromTab={activeTab}
      />
    </>
  );
}

export default InboxTabs;
