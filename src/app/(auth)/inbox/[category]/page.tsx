/**
 * Inbox Category Detail Page — Emails in a Single Category
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces /discover/[category] and renders the same category detail
 * content. Currently a thin wrapper around the existing CategoryDetailPage.
 *
 * Route: /inbox/[category]
 * Redirect: /discover/[category] → /inbox/[category] (via next.config.mjs)
 *
 * Dynamic Params:
 *   - category: Email category slug (e.g., 'client_pipeline', 'newsletters_general')
 *
 * @module app/(auth)/inbox/[category]/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import CategoryDetailPage from '@/app/(auth)/discover/[category]/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxCategoryPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox category detail page — thin wrapper around CategoryDetailPage.
 *
 * Phase 1: Renders the existing CategoryDetailPage component.
 *          The `category` param is automatically picked up via useParams()
 *          inside CategoryDetailPage, so no prop passing is needed.
 *
 * Phase 2: Will be integrated into the Inbox tabbed interface.
 */
export default function InboxCategoryPage() {
  logger.info('Rendering Inbox category detail page (thin wrapper)');
  return <CategoryDetailPage />;
}
