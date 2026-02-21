/**
 * Inbox Tabs Component
 *
 * Manages the tabbed interface for the Inbox page:
 *   1. Inbox (default) — unified email feed with category filtering (Gmail/Spark style)
 *   2. Priority — emails ranked by AI priority score
 *   3. Archive — archived emails with search/filter/bulk actions
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL DETAIL MODAL (Performance Audit P0-A)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Email clicks from all tabs open an EmailDetailModal instead of navigating
 * to a full page. This eliminates the full-page unmount/remount cycle and
 * makes back-navigation instant.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)       → Inbox feed → InboxFeed component (unified email list)
 * - ?tab=priority   → Priority tab → PriorityEmailList component
 * - ?tab=archive    → Archive tab → ArchiveContent component
 *
 * @module components/inbox/InboxTabs
 * @since February 2026 — Inbox UI Redesign
 * @see INBOX_PERFORMANCE_AUDIT.md — P0-A
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { Inbox, TrendingUp, Archive } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Content components ─────────────────────────────────────────────────────
import { InboxFeed } from '@/components/inbox/InboxFeed';
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
const VALID_TABS = ['inbox', 'priority', 'archive'] as const;
type InboxTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: InboxTab = 'inbox';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InboxTabs — tabbed interface for the Inbox page.
 *
 * Reads the `?tab=` query param to determine the active tab.
 * When the user switches tabs, the URL is updated without a full navigation.
 * Each tab renders its content lazily to avoid unnecessary data fetching.
 *
 * Email clicks from all tabs open a modal instead of navigating
 * to a full page, eliminating the full-page re-render cycle.
 */
export function InboxTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  // Support legacy 'categories' tab param → map to 'inbox'
  const normalizedTab = tabParam === 'categories' ? 'inbox' : tabParam;
  const activeTab: InboxTab = VALID_TABS.includes(normalizedTab as InboxTab)
    ? (normalizedTab as InboxTab)
    : DEFAULT_TAB;

  // ─── Email Detail Modal State ──────────────────────────────────────────────
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(null);
  const [selectedEmailCategory, setSelectedEmailCategory] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  logger.debug('InboxTabs rendering', { activeTab, tabParam, isModalOpen });

  /**
   * Handle tab change by updating the URL query parameter.
   */
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as InboxTab;
      logger.info('Tab changed', { from: activeTab, to: tab });

      const params = new URLSearchParams(searchParams.toString());

      if (tab === DEFAULT_TAB) {
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
   * Open email detail modal — called from all tabs.
   */
  const handleEmailSelect = React.useCallback(
    (email: { id: string; category?: string | null }) => {
      logger.info('Email selected for modal', {
        emailId: email.id,
        category: email.category || 'uncategorized',
        fromTab: activeTab,
      });
      setSelectedEmailId(email.id);
      setSelectedEmailCategory(email.category || 'uncategorized');
      setIsModalOpen(true);
    },
    [activeTab]
  );

  /**
   * Close email detail modal.
   */
  const handleModalClose = React.useCallback(() => {
    logger.info('Email detail modal closing', { emailId: selectedEmailId });
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedEmailId(null);
      setSelectedEmailCategory(null);
    }, 200);
  }, [selectedEmailId]);

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* ─── Tab Headers ────────────────────────────────────────────────── */}
        <TabsList variant="underline" className="mb-5">
          <TabsTrigger
            value="inbox"
            variant="underline"
            icon={<Inbox className="h-4 w-4" />}
          >
            Inbox
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

        {/* ─── Tab Content: Inbox Feed ───────────────────────────────────── */}
        <TabsContent value="inbox">
          <InboxFeed onEmailSelect={handleEmailSelect} />
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
