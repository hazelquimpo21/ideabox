/**
 * Tasks Tabs Component
 *
 * Manages the six-tab interface for the Tasks page:
 *   1. Projects (default) — project management with ideas/tasks/routines
 *   2. All Items — flat list of all project items across projects
 *   3. Inbox Tasks — actions/tasks extracted from emails
 *   4. Ideas — AI-generated idea sparks (consolidated home for all ideas)
 *   5. Campaigns — campaign management
 *   6. Templates — template management
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)          → Projects tab → ProjectsContent component
 * - ?tab=items         → All Items tab → AllItemsContent component
 * - ?tab=todos         → To-dos tab → ActionsContent component
 * - ?tab=ideas         → Ideas tab → IdeasFeed component
 * - ?tab=campaigns     → Campaigns tab → CampaignsContent component
 * - ?tab=templates     → Templates tab → TemplatesContent component
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN DECISION (March 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ideas moved from Inbox to Tasks because ideas are "things you might do" —
 * they belong near tasks and projects, not buried in email tabs. The Inbox
 * retains a consolidated "Discoveries" tab for informational content
 * (insights, news, links) which are not directly actionable.
 *
 * @module components/tasks/TasksTabs
 * @since February 2026 — Phase 3 Navigation Redesign
 * @updated March 2026 — Ideas tab added, human-centered redesign
 * @see components/inbox/InboxTabs for the pattern reference
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { FolderKanban, ListChecks, CheckSquare, Lightbulb, Megaphone, FileText } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Content components ──────────────────────────────────────────────────────
import { ProjectsContent, AllItemsContent } from '@/components/projects';
import { ActionsContent } from '@/components/actions';
import { IdeasFeed } from '@/components/inbox/IdeasFeed';
import { CampaignsContent } from '@/components/campaigns';
import { TemplatesContent } from '@/components/templates';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TasksTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab values for URL routing. */
const VALID_TABS = ['projects', 'items', 'todos', 'ideas', 'campaigns', 'templates'] as const;
type TasksTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: TasksTab = 'projects';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TasksTabs — six-tab interface for the Tasks page.
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
          value="projects"
          variant="underline"
          icon={<FolderKanban className="h-4 w-4" />}
        >
          Projects
        </TabsTrigger>
        <TabsTrigger
          value="items"
          variant="underline"
          icon={<ListChecks className="h-4 w-4" />}
        >
          All Items
        </TabsTrigger>
        <TabsTrigger
          value="todos"
          variant="underline"
          icon={<CheckSquare className="h-4 w-4" />}
        >
          Inbox Tasks
        </TabsTrigger>
        <TabsTrigger
          value="ideas"
          variant="underline"
          icon={<Lightbulb className="h-4 w-4" />}
        >
          Ideas
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

      {/* ─── Tab Content: Projects ─────────────────────────────────────────── */}
      <TabsContent value="projects">
        <ProjectsContent />
      </TabsContent>

      {/* ─── Tab Content: All Items ────────────────────────────────────────── */}
      <TabsContent value="items">
        <AllItemsContent />
      </TabsContent>

      {/* ─── Tab Content: Inbox Tasks ──────────────────────────────────────── */}
      <TabsContent value="todos">
        <ActionsContent />
      </TabsContent>

      {/* ─── Tab Content: Ideas (consolidated home for AI-generated ideas) ── */}
      <TabsContent value="ideas">
        <IdeasFeed />
      </TabsContent>

      {/* ─── Tab Content: Campaigns ───────────────────────────────────────── */}
      <TabsContent value="campaigns">
        <CampaignsContent />
      </TabsContent>

      {/* ─── Tab Content: Templates ───────────────────────────────────────── */}
      <TabsContent value="templates">
        <TemplatesContent />
      </TabsContent>
    </Tabs>
  );
}

export default TasksTabs;
