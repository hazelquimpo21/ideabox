/**
 * Tasks Tabs Component
 *
 * Manages the four-tab interface for the Tasks page:
 *   1. Triage (default) — unified inbox of actions + ideas to process
 *   2. Board — kanban-first view of all project items
 *   3. Projects — project management with ideas/tasks/routines
 *   4. Library — campaigns + templates (sub-tabs)
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 * Legacy tab URLs are automatically redirected to their new equivalents.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)          → Triage tab → TriageContent component
 * - ?tab=board         → Board tab → BoardContent component
 * - ?tab=projects      → Projects tab → ProjectsContent component
 * - ?tab=library       → Library tab → LibraryContent component
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LEGACY REDIRECTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - ?tab=items      → ?tab=board
 * - ?tab=todos      → (default, triage)
 * - ?tab=ideas      → (default, triage)
 * - ?tab=campaigns  → ?tab=library
 * - ?tab=templates  → ?tab=library&sub=templates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN DECISION (March 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Restructured from 6 tabs to 4 (Hick's Law). Triage-first default because
 * "what needs my attention?" is the daily entry point. Board promotes kanban
 * as the default execution view. Library consolidates lower-frequency features.
 *
 * @module components/tasks/TasksTabs
 * @since February 2026 — Phase 3 Navigation Redesign
 * @updated March 2026 — Phase 1 Tasks Page Redesign (6→4 tabs, triage-first)
 * @see docs/TASKS_PAGE_REDESIGN.md for the master plan
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { Inbox, LayoutGrid, FolderKanban, FileText } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Content components ──────────────────────────────────────────────────────
import { ProjectsContent, TriageContent, BoardContent } from '@/components/projects';
import { LibraryContent } from '@/components/tasks/LibraryContent';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TasksTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab values for URL routing. */
const VALID_TABS = ['triage', 'board', 'projects', 'library'] as const;
type TasksTab = (typeof VALID_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: TasksTab = 'triage';

/**
 * Maps legacy tab values to their new equivalents.
 * Used for backward-compatible redirects from old bookmarks/links.
 */
const LEGACY_TAB_MAP: Record<string, string> = {
  items: 'board',
  todos: 'triage',
  ideas: 'triage',
  campaigns: 'library',
  templates: 'library',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TasksTabs — four-tab interface for the Tasks page.
 *
 * Reads the `?tab=` query param to determine the active tab.
 * When the user switches tabs, the URL is updated without a full navigation.
 * Legacy tab values are redirected to their new equivalents on mount.
 *
 * @module components/tasks/TasksTabs
 * @since March 2026
 */
export function TasksTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Legacy redirect on mount ───────────────────────────────────────────────
  const tabParam = searchParams.get('tab');

  React.useEffect(() => {
    if (tabParam && tabParam in LEGACY_TAB_MAP) {
      const resolved = LEGACY_TAB_MAP[tabParam];
      logger.info('Legacy tab redirected', { from: tabParam, to: resolved });

      const params = new URLSearchParams(searchParams.toString());

      // Special case: templates → library&sub=templates
      if (tabParam === 'templates') {
        params.set('tab', 'library');
        params.set('sub', 'templates');
      } else if (resolved === DEFAULT_TAB) {
        params.delete('tab');
      } else {
        params.set('tab', resolved);
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [tabParam, searchParams, pathname, router]);

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const activeTab: TasksTab = VALID_TABS.includes(tabParam as TasksTab)
    ? (tabParam as TasksTab)
    : DEFAULT_TAB;

  logger.debug('TasksTabs rendering', { activeTab, tabParam });

  /**
   * Handle tab change by updating the URL query parameter.
   * Preserves other query params (except sub, which is tab-specific).
   */
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as TasksTab;
      logger.info('Tasks tab changed', { from: activeTab, to: tab });

      const params = new URLSearchParams(searchParams.toString());

      // Clear sub-tab param when switching main tabs
      params.delete('sub');

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
          value="triage"
          variant="underline"
          icon={<Inbox className="h-4 w-4" />}
        >
          Triage
        </TabsTrigger>
        <TabsTrigger
          value="board"
          variant="underline"
          icon={<LayoutGrid className="h-4 w-4" />}
        >
          Board
        </TabsTrigger>
        <TabsTrigger
          value="projects"
          variant="underline"
          icon={<FolderKanban className="h-4 w-4" />}
        >
          Projects
        </TabsTrigger>
        <TabsTrigger
          value="library"
          variant="underline"
          icon={<FileText className="h-4 w-4" />}
        >
          Library
        </TabsTrigger>
      </TabsList>

      {/* ─── Tab Content: Triage (default) ──────────────────────────────────── */}
      <TabsContent value="triage">
        <TriageContent />
      </TabsContent>

      {/* ─── Tab Content: Board ─────────────────────────────────────────────── */}
      <TabsContent value="board">
        <BoardContent />
      </TabsContent>

      {/* ─── Tab Content: Projects ──────────────────────────────────────────── */}
      <TabsContent value="projects">
        <ProjectsContent />
      </TabsContent>

      {/* ─── Tab Content: Library (Campaigns + Templates) ───────────────────── */}
      <TabsContent value="library">
        <LibraryContent />
      </TabsContent>
    </Tabs>
  );
}

export default TasksTabs;
