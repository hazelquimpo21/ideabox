/**
 * Inbox Email Detail Page — Single Email View
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces /discover/[category]/[emailId] and renders the same email
 * detail content. Currently a thin wrapper around the existing EmailDetailPage.
 *
 * Route: /inbox/[category]/[emailId]
 * Redirect: /discover/[cat]/[emailId] → /inbox/[cat]/[emailId] (via next.config.mjs)
 *
 * Dynamic Params:
 *   - category: Email category slug (e.g., 'client_pipeline')
 *   - emailId:  Unique email identifier (UUID)
 *
 * @module app/(auth)/inbox/[category]/[emailId]/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import EmailDetailPage from '@/app/(auth)/discover/[category]/[emailId]/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxEmailDetailPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox email detail page — thin wrapper around EmailDetailPage.
 *
 * Phase 1: Renders the existing EmailDetailPage component.
 *          The `category` and `emailId` params are automatically picked up
 *          via useParams() inside EmailDetailPage.
 *
 * Phase 2: Will be integrated into the Inbox navigation flow.
 */
export default function InboxEmailDetailPage() {
  logger.info('Rendering Inbox email detail page (thin wrapper)');
  return <EmailDetailPage />;
}
