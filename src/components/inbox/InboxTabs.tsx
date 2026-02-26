/**
 * InboxTabs Component
 *
 * Manages the tabbed interface for the Inbox page. This is the central
 * orchestrator that wires together all inbox views and the email detail modal.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TABS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   1. Inbox (default) — unified email feed with search + category filtering
 *   2. Priority         — emails ranked by AI priority score
 *   3. Archive          — archived emails with search/filter/bulk actions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter:
 *   - (default)       → Inbox feed
 *   - ?tab=priority   → Priority tab
 *   - ?tab=archive    → Archive tab
 *   - ?tab=categories → Legacy alias, maps to Inbox feed
 *
 * Tab switches use router.replace() (no scroll) for instant transitions.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL DETAIL MODAL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Email clicks from ALL tabs open an EmailDetailModal instead of navigating
 * to a full page. This eliminates the full-page unmount/remount cycle:
 *   - The list stays mounted behind the modal
 *   - Back-navigation is instant (just close the modal)
 *   - Modal provides star/archive/read actions with optimistic updates
 *   - "Open Full Page" button available for users who want the full view
 *
 * @module components/inbox/InboxTabs
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { Inbox, TrendingUp, Archive, LayoutGrid, Lightbulb } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory } from '@/types/discovery';
import { EMAIL_CATEGORIES_SET } from '@/types/discovery';

// ─── Content components (lazy-loaded via tab content) ───────────────────────
import { InboxFeed } from '@/components/inbox/InboxFeed';
import { ArchiveContent } from '@/components/archive';
import { PriorityEmailList } from '@/components/inbox/PriorityEmailList';
import { CategoryOverview } from '@/components/inbox/CategoryOverview';
import { EmailDetailModal } from '@/components/email/EmailDetailModal';
import { IdeasFeed } from '@/components/inbox/IdeasFeed';
import { InboxSummaryBanner } from '@/components/inbox/InboxSummaryBanner';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** All valid tab values — used for URL param validation */
const VALID_TABS = ['inbox', 'priority', 'categories', 'ideas', 'archive'] as const;
type InboxTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present */
const DEFAULT_TAB: InboxTab = 'inbox';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InboxTabs — tabbed interface for the Inbox page.
 *
 * Reads `?tab=` from the URL to determine the active tab.
 * Switches tabs via router.replace() (no full navigation).
 * All email clicks open a modal overlay.
 */
export function InboxTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const normalizedTab = tabParam;
  const activeTab: InboxTab = VALID_TABS.includes(normalizedTab as InboxTab)
    ? (normalizedTab as InboxTab)
    : DEFAULT_TAB;

  // ─── Category Filter from URL (set when navigating from CategoryOverview) ──
  const categoryParam = searchParams.get('category');
  const initialCategory: EmailCategory | null =
    categoryParam && EMAIL_CATEGORIES_SET.has(categoryParam)
      ? (categoryParam as EmailCategory)
      : null;

  // ─── Email Detail Modal State ──────────────────────────────────────────────
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(null);
  const [selectedEmailCategory, setSelectedEmailCategory] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // ─── Tab Change Handler ────────────────────────────────────────────────────
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as InboxTab;
      logger.info('Tab changed', { from: activeTab, to: tab });

      const params = new URLSearchParams(searchParams.toString());

      // Default tab doesn't need a query param
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

  // ─── Email Selection Handler (opens modal) ────────────────────────────────
  const handleEmailSelect = React.useCallback(
    (email: { id: string; category?: string | null }) => {
      logger.info('Email selected for modal', {
        emailId: email.id,
        category: email.category || 'personal_friends_family',
        fromTab: activeTab,
      });
      setSelectedEmailId(email.id);
      setSelectedEmailCategory(email.category || 'personal_friends_family');
      setIsModalOpen(true);
    },
    [activeTab]
  );

  // ─── Modal Close Handler ──────────────────────────────────────────────────
  const handleModalClose = React.useCallback(() => {
    logger.info('Email detail modal closing', { emailId: selectedEmailId });
    setIsModalOpen(false);
    // Delay state cleanup to allow close animation to finish
    setTimeout(() => {
      setSelectedEmailId(null);
      setSelectedEmailCategory(null);
    }, 200);
  }, [selectedEmailId]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* ── Tab Bar ────────────────────────────────────────────────────── */}
        <TabsList variant="underline" className="mb-6">
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
            value="categories"
            variant="underline"
            icon={<LayoutGrid className="h-4 w-4" />}
          >
            Categories
          </TabsTrigger>
          <TabsTrigger
            value="ideas"
            variant="underline"
            icon={<Lightbulb className="h-4 w-4" />}
          >
            Ideas
          </TabsTrigger>
          <TabsTrigger
            value="archive"
            variant="underline"
            icon={<Archive className="h-4 w-4" />}
          >
            Archive
          </TabsTrigger>
        </TabsList>

        {/* ── Tab Content ────────────────────────────────────────────────── */}
        <TabsContent value="inbox">
          <InboxSummaryBanner />
          <InboxFeed onEmailSelect={handleEmailSelect} initialCategory={initialCategory} />
        </TabsContent>

        <TabsContent value="priority">
          <PriorityEmailList onEmailSelect={handleEmailSelect} />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryOverview
            onCategorySelect={(category) => {
              // Switch to inbox tab with the category filter applied via URL param
              logger.info('Category selected from overview', { category });
              const params = new URLSearchParams(searchParams.toString());
              params.delete('tab');
              params.set('category', category);
              const queryString = params.toString();
              const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
              router.replace(newUrl, { scroll: false });
            }}
            onEmailSelect={handleEmailSelect}
          />
        </TabsContent>

        <TabsContent value="ideas">
          <IdeasFeed />
        </TabsContent>

        <TabsContent value="archive">
          <ArchiveContent onEmailSelect={handleEmailSelect} />
        </TabsContent>
      </Tabs>

      {/* ── Email Detail Modal (shared across all tabs) ──────────────── */}
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
