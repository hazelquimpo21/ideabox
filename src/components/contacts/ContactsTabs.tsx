/**
 * Contacts Tabs Component
 *
 * Manages the four-tab interface for the Contacts page:
 *   1. All (default) — all contacts with existing filters
 *   2. Clients — contacts marked as clients (is_client = TRUE)
 *   3. Personal — contacts with relationship_type friend/family or direct senders
 *   4. Subscriptions — broadcast sender type contacts
 *
 * Tab state is persisted in the URL via the `?tab=` query parameter.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TAB ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - (default)            → All tab
 * - ?tab=clients         → Clients tab
 * - ?tab=personal        → Personal tab
 * - ?tab=subscriptions   → Subscriptions tab
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <ContactsTabs />
 * ```
 *
 * @module components/contacts/ContactsTabs
 * @since February 2026 — Phase 3 Navigation Redesign
 */

'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { Users, Building2, UserCircle, Newspaper } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ContactsTabs');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab values for URL routing. */
export const CONTACTS_TABS = ['all', 'clients', 'personal', 'subscriptions'] as const;
export type ContactsTab = (typeof CONTACTS_TABS)[number];

/** Default tab when no query param is present. */
const DEFAULT_TAB: ContactsTab = 'all';

/**
 * Props for ContactsTabs.
 */
export interface ContactsTabsProps {
  /** Callback when the active tab changes. Receives the new tab value. */
  onTabChange?: (tab: ContactsTab) => void;
  /** Optional stats for badge display */
  stats?: {
    total?: number;
    clients?: number;
    personal?: number;
    subscriptions?: number;
  };
  /** Child content rendered below the tabs (the main contacts list) */
  children?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ContactsTabs — four-tab interface for filtering contacts.
 *
 * Reads the `?tab=` query param to determine the active tab.
 * When the user switches tabs, the URL is updated without a full navigation.
 *
 * @param props - Component props
 */
export function ContactsTabs({ onTabChange, stats, children }: ContactsTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ─── Determine Active Tab from URL ─────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const activeTab: ContactsTab = CONTACTS_TABS.includes(tabParam as ContactsTab)
    ? (tabParam as ContactsTab)
    : DEFAULT_TAB;

  logger.debug('ContactsTabs rendering', { activeTab, tabParam });

  /**
   * Handle tab change by updating the URL query parameter.
   * Preserves other query params (like page, search).
   */
  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as ContactsTab;
      logger.info('Contacts tab changed', { from: activeTab, to: tab });

      const params = new URLSearchParams(searchParams.toString());

      if (tab === DEFAULT_TAB) {
        // Remove tab param for default tab (clean URL)
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }

      // Reset page when changing tabs
      params.delete('page');

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });

      // Notify parent of tab change
      onTabChange?.(tab);
    },
    [activeTab, searchParams, pathname, router, onTabChange]
  );

  return (
    <div>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* ─── Tab Headers ────────────────────────────────────────────────────── */}
        <TabsList variant="underline" className="mb-6">
          <TabsTrigger
            value="all"
            variant="underline"
            icon={<Users className="h-4 w-4" />}
          >
            All
            {stats?.total !== undefined && (
              <span className="ml-1 text-xs text-muted-foreground">({stats.total})</span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="clients"
            variant="underline"
            icon={<Building2 className="h-4 w-4" />}
          >
            Clients
            {stats?.clients !== undefined && stats.clients > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({stats.clients})</span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="personal"
            variant="underline"
            icon={<UserCircle className="h-4 w-4" />}
          >
            Personal
            {stats?.personal !== undefined && stats.personal > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({stats.personal})</span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="subscriptions"
            variant="underline"
            icon={<Newspaper className="h-4 w-4" />}
          >
            Subscriptions
            {stats?.subscriptions !== undefined && stats.subscriptions > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({stats.subscriptions})</span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ─── Content Area (rendered by parent) ─────────────────────────────── */}
      {children}
    </div>
  );
}

/**
 * Returns the active contacts tab from the URL search params.
 * Utility function for use by the parent page component.
 *
 * @param searchParams - URL search params
 * @returns The active contacts tab
 */
export function getActiveContactsTab(searchParams: URLSearchParams): ContactsTab {
  const tabParam = searchParams.get('tab');
  return CONTACTS_TABS.includes(tabParam as ContactsTab)
    ? (tabParam as ContactsTab)
    : DEFAULT_TAB;
}

export default ContactsTabs;
