/**
 * Tasks > New Campaign Page
 *
 * Thin wrapper that renders the existing campaign creation page
 * at the `/tasks/campaigns/new` route. This is a separate page,
 * NOT part of the tabbed Tasks UI.
 *
 * Same pattern as `/inbox/[category]` — sub-routes are full pages.
 *
 * Route: /tasks/campaigns/new
 *
 * @module app/(auth)/tasks/campaigns/new/page
 * @since February 2026 — Phase 3 Navigation Redesign
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import CampaignNewPage from '@/app/(auth)/campaigns/new/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('Tasks:NewCampaign');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the campaign builder (wizard) at `/tasks/campaigns/new`.
 * Delegates entirely to the existing CampaignNewPage component.
 */
export default function TasksCampaignNewPage() {
  logger.info('Rendering new campaign page under /tasks');
  return <CampaignNewPage />;
}
