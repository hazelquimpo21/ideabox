/**
 * Tasks Page — To-dos, Campaigns, and Templates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 3 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full-featured Tasks page with three tabs:
 *
 *   1. To-dos (default) — action items from ActionsPage
 *   2. Campaigns — campaign management from CampaignsPage
 *   3. Templates — template management from TemplatesPage
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter:
 *   - (default)       → To-dos tab
 *   - ?tab=campaigns  → Campaigns tab
 *   - ?tab=templates  → Templates tab
 *
 * Sub-routes `/tasks/campaigns/new` and `/tasks/campaigns/[id]` are
 * separate pages (thin wrappers) and NOT part of this tabbed UI.
 *
 * Route: /tasks
 * Redirects:
 *   /actions   → /tasks                (configured in next.config.mjs)
 *   /campaigns → /tasks?tab=campaigns  (redirect page file)
 *   /templates → /tasks?tab=templates  (redirect page file)
 *
 * Query Parameters:
 *   - tab: 'todos' | 'campaigns' | 'templates' (default: todos)
 *
 * @module app/(auth)/tasks/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { PageHeader } from '@/components/layout';
import { TasksTabs } from '@/components/tasks';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TasksPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tasks page — tabbed interface for task management.
 *
 * Phase 3: Full TasksTabs component with To-dos, Campaigns, and Templates tabs.
 * Replaces the Phase 1 thin wrapper that conditionally rendered page components
 * based on the `tab` query param.
 */
export default function TasksPage() {
  logger.info('Rendering Tasks page (Phase 3 — tabbed UI)');

  return (
    <div>
      {/* ─── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Tasks"
        description="Manage your to-dos, campaigns, and templates."
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Tasks' },
        ]}
      />

      {/* ─── Tabbed Content ───────────────────────────────────────────────── */}
      <TasksTabs />
    </div>
  );
}
