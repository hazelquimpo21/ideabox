/**
 * Inbox Page — Email Intelligence Hub
 *
 * The main entry point for the inbox. Renders a page header with
 * breadcrumbs and delegates all content to the InboxTabs component.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TABS (managed by InboxTabs)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   1. Inbox (default) — unified email feed with "at a glance" metadata
 *   2. Priority         — emails ranked by AI priority score
 *   3. Archive          — archived emails with search/filter/bulk actions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Route: /inbox
 *   Query params: ?tab=inbox|priority|archive (default: inbox)
 *   Sub-routes (separate pages):
 *     /inbox/[category]            — category detail page
 *     /inbox/[category]/[emailId]  — single email detail page
 *
 *   Redirects:
 *     /discover → /inbox           (next.config.mjs)
 *     /archive  → /inbox?tab=archive
 *
 * @module app/(auth)/inbox/page
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import { PageHeader } from '@/components/layout';
import { InboxTabs } from '@/components/inbox';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function InboxPage() {
  return (
    <div>
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Inbox"
        description="Your email intelligence hub."
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Inbox' },
        ]}
      />

      {/* ── Tabbed Content ───────────────────────────────────────────────── */}
      <InboxTabs />
    </div>
  );
}
