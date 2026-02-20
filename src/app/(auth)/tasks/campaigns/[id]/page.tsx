/**
 * Tasks > Campaign Detail Page
 *
 * Thin wrapper that renders the existing campaign detail page
 * at the `/tasks/campaigns/[id]` route. This is a separate page,
 * NOT part of the tabbed Tasks UI.
 *
 * Same pattern as `/inbox/[category]` — sub-routes are full pages.
 *
 * Route: /tasks/campaigns/[id]
 *
 * @module app/(auth)/tasks/campaigns/[id]/page
 * @since February 2026 — Phase 3 Navigation Redesign
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import CampaignDetailPage from '@/app/(auth)/campaigns/[id]/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('Tasks:CampaignDetail');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the campaign detail view at `/tasks/campaigns/[id]`.
 * Delegates entirely to the existing CampaignDetailPage component.
 */
export default function TasksCampaignDetailPage() {
  logger.info('Rendering campaign detail page under /tasks');
  return <CampaignDetailPage />;
}
