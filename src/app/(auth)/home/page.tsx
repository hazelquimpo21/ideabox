/**
 * Home Page — Daily Briefing & Top Priorities
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces the old Hub page at /hub.
 * Currently a thin wrapper that renders the existing HubPage component.
 * Phase 2 will build out the full DailyBriefingHeader, TodaySchedule,
 * and PendingTasksList components.
 *
 * Route: /home
 * Redirect: /hub → /home (configured in next.config.mjs)
 *
 * @module app/(auth)/home/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import HubPage from '@/app/(auth)/hub/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('HomePage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Home page — thin wrapper around the existing HubPage.
 *
 * Phase 1: Renders HubPage as-is to maintain feature parity.
 * Phase 2: Will replace with new DailyBriefingHeader, TodaySchedule,
 *          PendingTasksList, and ProfileCompletionNudge sections.
 */
export default function HomePage() {
  logger.info('Rendering Home page (thin wrapper around HubPage)');
  return <HubPage />;
}
