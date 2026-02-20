/**
 * Inbox Page — Email Intelligence Hub
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 2 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full-featured Inbox page with three tabs:
 *
 *   1. Categories (default) — email categorization dashboard (DiscoverPage)
 *   2. Priority — emails ranked by AI priority score
 *   3. Archive — archived emails with search/filter/bulk actions
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter:
 *   - (default)       → Categories tab
 *   - ?tab=priority   → Priority tab
 *   - ?tab=archive    → Archive tab
 *
 * Sub-routes `/inbox/[category]` and `/inbox/[category]/[emailId]` are
 * separate pages (thin wrappers) and NOT part of this tabbed UI.
 *
 * Route: /inbox
 * Redirects:
 *   /discover → /inbox   (configured in next.config.mjs)
 *   /archive  → /inbox?tab=archive (redirect page file)
 *
 * Query Parameters:
 *   - tab:      'categories' | 'priority' | 'archive' (default: categories)
 *   - modal:    Category name to open category modal (passed to DiscoverPage)
 *   - category: Legacy param — preserved for backwards compatibility
 *
 * @module app/(auth)/inbox/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { PageHeader } from '@/components/layout';
import { InboxTabs } from '@/components/inbox';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox page — tabbed interface for email management.
 *
 * Phase 2: Full InboxTabs component with Categories, Priority, and Archive tabs.
 * Replaces the Phase 1 thin wrapper that conditionally rendered
 * DiscoverPage/ArchivePage based on the `tab` query param.
 */
export default function InboxPage() {
  logger.info('Rendering Inbox page (Phase 2 — tabbed UI)');

  return (
    <div>
      {/* ─── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Inbox"
        description="Your email intelligence hub."
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Inbox' },
        ]}
      />

      {/* ─── Tabbed Content ───────────────────────────────────────────────── */}
      <InboxTabs />
    </div>
  );
}
