/**
 * Tasks Tabs Component
 *
 * Manages the three-tab interface for the Tasks page:
 *   1. To-dos (default) — actions/tasks from ActionsPage
 *   2. Campaigns — campaign management from CampaignsPage
 *   3. Templates — template management from TemplatesPage
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)          → To-dos tab → ActionsPage component
 * - ?tab=campaigns     → Campaigns tab → CampaignsPage component
 * - ?tab=templates     → Templates tab → TemplatesPage component
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <TasksTabs />
 * ```
 *
 * @module components/tasks/TasksTabs
 * @since February 2026 — Phase 3 Navigation Redesign
 * @see components/inbox/InboxTabs for the pattern reference
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { CheckSquare, Megaphone, FileText } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Lazy-loaded tab content to avoid loading all pages upfront ─────────────
import ActionsPage from '@/app/(auth)/actions/page';
import CampaignsPage from '@/app/(auth)/campaigns/page';
import TemplatesPage from '@/app/(auth)/templates/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TasksTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab values for URL routing. */
const VALID_TABS = ['todos', 'campaigns', 'templates'] as const;
type TasksTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: TasksTab = 'todos';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TasksTabs — three-tab interface for the Tasks page.
 *
 * Reads the `?tab=` query param to determine the active tab.
 * When the user switches tabs, the URL is updated without a full navigation.
 * Each tab renders its content lazily to avoid unnecessary data fetching.
 */
export function TasksTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const activeTab: TasksTab = VALID_TABS.includes(tabParam as TasksTab)
    ? (tabParam as TasksTab)
    : DEFAULT_TAB;

  logger.debug('TasksTabs rendering', { activeTab, tabParam });

  /**
   * Handle tab change by updating the URL query parameter.
   * Preserves other query params.
   */
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as TasksTab;
      logger.info('Tasks tab changed', { from: activeTab, to: tab });

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
          value="todos"
          variant="underline"
          icon={<CheckSquare className="h-4 w-4" />}
        >
          To-dos
        </TabsTrigger>
        <TabsTrigger
          value="campaigns"
          variant="underline"
          icon={<Megaphone className="h-4 w-4" />}
        >
          Campaigns
        </TabsTrigger>
        <TabsTrigger
          value="templates"
          variant="underline"
          icon={<FileText className="h-4 w-4" />}
        >
          Templates
        </TabsTrigger>
      </TabsList>

      {/* ─── Tab Content: To-dos ──────────────────────────────────────────── */}
      <TabsContent value="todos">
        <ActionsPage />
      </TabsContent>

      {/* ─── Tab Content: Campaigns ───────────────────────────────────────── */}
      <TabsContent value="campaigns">
        <CampaignsPage />
      </TabsContent>

      {/* ─── Tab Content: Templates ───────────────────────────────────────── */}
      <TabsContent value="templates">
        <TemplatesPage />
      </TabsContent>
    </Tabs>
  );
}

export default TasksTabs;
