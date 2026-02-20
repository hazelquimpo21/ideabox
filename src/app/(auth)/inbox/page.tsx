/**
 * Inbox Page — Email Intelligence Hub
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces / absorbs:
 *   - Discover page (/discover) → default view (categories)
 *   - Archive page (/archive)   → accessible via ?tab=archive
 *
 * Previously this file was a deprecated redirect page that sent users from
 * /inbox to /discover. Now /inbox IS the primary email interface.
 *
 * Currently a thin wrapper that renders the appropriate existing page component
 * based on the `tab` query parameter:
 *   - (default)      → DiscoverPage (Categories + analysis)
 *   - ?tab=archive   → ArchivePage
 *
 * Phase 2 will build out the full InboxTabs component with:
 *   - Categories tab (default) — category cards with counts
 *   - Priority tab — emails ranked by AI priority score
 *   - Archive tab — archived emails with search/restore/delete
 *
 * Route: /inbox
 * Redirects:
 *   /discover → /inbox   (configured in next.config.mjs)
 *   /archive  → /inbox?tab=archive (redirect page file)
 *
 * Query Parameters:
 *   - tab:      'archive' to show archive content (default: categories/discover)
 *   - modal:    Category name to open category modal (passed to DiscoverPage)
 *   - category: Legacy param — preserved for backwards compatibility
 *
 * @module app/(auth)/inbox/page
 * @since February 2026 (replaces old InboxRedirect page)
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { createLogger } from '@/lib/utils/logger';

// ─── Import existing page components used as tab content ─────────────────────
import DiscoverPage from '@/app/(auth)/discover/page';
import ArchivePage from '@/app/(auth)/archive/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inbox page — routes to the correct tab content based on query param.
 *
 * Phase 1: Renders existing page components based on `tab` param.
 *   - No tab / invalid tab → DiscoverPage (Categories)
 *   - ?tab=archive         → ArchivePage
 *
 * Phase 2: Will replace with InboxTabs component providing a unified tabbed UI
 *          with Categories, Priority, and Archive tabs.
 */
export default function InboxPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  logger.info('Rendering Inbox page', { tab: tab || 'categories (default)' });

  // ─── Route to the correct tab content ──────────────────────────────────────
  switch (tab) {
    case 'archive':
      // Show archived emails — replaces /archive route
      logger.debug('Rendering Archive tab content');
      return <ArchivePage />;

    default:
      // Default to Discover/Categories view — the primary inbox content
      // All query params (modal, category) are passed through automatically
      // via useSearchParams() inside DiscoverPage
      logger.debug('Rendering Categories tab content (DiscoverPage)');
      return <DiscoverPage />;
  }
}
