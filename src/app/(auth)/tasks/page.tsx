/**
 * Tasks Page — To-dos, Campaigns, and Templates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces / absorbs:
 *   - Actions page (/actions) → default "To-dos" tab
 *   - Campaigns page (/campaigns) → accessible via ?tab=campaigns
 *   - Templates page (/templates) → accessible via ?tab=templates
 *
 * Currently a thin wrapper that renders the appropriate existing page component
 * based on the `tab` query parameter:
 *   - (default)       → ActionsPage (To-dos)
 *   - ?tab=campaigns  → CampaignsPage
 *   - ?tab=templates  → TemplatesPage
 *
 * Phase 2/3 will build out the full TasksTabs component with proper tab UI.
 *
 * Route: /tasks
 * Redirects:
 *   /actions   → /tasks                (configured in next.config.mjs)
 *   /campaigns → /tasks?tab=campaigns  (redirect page file)
 *   /templates → /tasks?tab=templates  (redirect page file)
 *
 * @module app/(auth)/tasks/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { createLogger } from '@/lib/utils/logger';
import ActionsPage from '@/app/(auth)/actions/page';
import CampaignsPage from '@/app/(auth)/campaigns/page';
import TemplatesPage from '@/app/(auth)/templates/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TasksPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tasks page — routes to the correct tab content based on query param.
 *
 * Phase 1: Renders existing page components based on `tab` param.
 *   - No tab / invalid tab → ActionsPage (To-dos)
 *   - ?tab=campaigns       → CampaignsPage
 *   - ?tab=templates       → TemplatesPage
 *
 * Phase 3: Will replace with TasksTabs component providing a unified tabbed UI.
 */
export default function TasksPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  logger.info('Rendering Tasks page', { tab: tab || 'todos (default)' });

  // ─── Route to the correct tab content ──────────────────────────────────────
  switch (tab) {
    case 'campaigns':
      logger.debug('Rendering Campaigns tab');
      return <CampaignsPage />;

    case 'templates':
      logger.debug('Rendering Templates tab');
      return <TemplatesPage />;

    default:
      // Default to Actions/To-dos — the primary tasks view
      logger.debug('Rendering To-dos tab (default)');
      return <ActionsPage />;
  }
}
