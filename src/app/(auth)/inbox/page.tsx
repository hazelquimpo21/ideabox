/**
 * Inbox Page — Split-Panel Email Intelligence Hub
 *
 * Renders the InboxSplitLayout — a persistent master-detail layout
 * with email list on the left and email detail on the right.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Desktop:  [List Panel ~420px] | [Detail Panel flex-1]
 *   Mobile:   Single column — list or detail, toggled by selection
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Route: /inbox
 *   Query params:
 *     ?email=<id>      — deep-link to specific email
 *     ?filter=unread   — pre-select filter tab
 *     ?view=categories — show category overview
 *
 *   Sub-routes (separate pages, unchanged):
 *     /inbox/[category]            — category detail page
 *     /inbox/[category]/[emailId]  — single email detail page
 *
 * @module app/(auth)/inbox/page
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import { InboxSplitLayout } from '@/components/inbox/InboxSplitLayout';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function InboxPage() {
  return <InboxSplitLayout />;
}
