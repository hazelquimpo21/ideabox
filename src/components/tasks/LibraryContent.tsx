/**
 * Library Content Component
 *
 * Simple wrapper with internal sub-tabs for Campaigns and Templates.
 * Consolidates two lower-frequency features into a single Library tab,
 * following the same internal sub-tab pattern as DiscoveriesFeed.
 *
 * Supports URL-synced sub-tabs via `?tab=library&sub=templates`.
 * Default sub-tab: Campaigns.
 *
 * @module components/tasks/LibraryContent
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Megaphone, FileText } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Content components ──────────────────────────────────────────────────────
import { CampaignsContent } from '@/components/campaigns';
import { TemplatesContent } from '@/components/templates';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('LibraryContent');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type LibrarySubTab = 'campaigns' | 'templates';

interface SubTabConfig {
  key: LibrarySubTab;
  label: string;
  icon: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUB_TABS: SubTabConfig[] = [
  { key: 'campaigns', label: 'Campaigns', icon: <Megaphone className="h-3.5 w-3.5" /> },
  { key: 'templates', label: 'Templates', icon: <FileText className="h-3.5 w-3.5" /> },
];

const VALID_SUB_TABS: LibrarySubTab[] = ['campaigns', 'templates'];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LibraryContent — internal sub-tab wrapper for Campaigns and Templates.
 *
 * Reads the `sub` query param from the URL to determine the active sub-tab.
 * Renders existing CampaignsContent or TemplatesContent unchanged.
 *
 * @module components/tasks/LibraryContent
 * @since March 2026
 */
export function LibraryContent() {
  const searchParams = useSearchParams();
  const subParam = searchParams.get('sub');

  // Determine active sub-tab from URL or default to campaigns
  const activeSubTab: LibrarySubTab = VALID_SUB_TABS.includes(subParam as LibrarySubTab)
    ? (subParam as LibrarySubTab)
    : 'campaigns';

  const [localSubTab, setLocalSubTab] = React.useState<LibrarySubTab>(activeSubTab);

  // Sync local state with URL param
  React.useEffect(() => {
    if (VALID_SUB_TABS.includes(subParam as LibrarySubTab)) {
      setLocalSubTab(subParam as LibrarySubTab);
    }
  }, [subParam]);

  const handleSubTabChange = React.useCallback((tab: LibrarySubTab) => {
    logger.info('Library sub-tab changed', { subTab: tab });
    setLocalSubTab(tab);
  }, []);

  return (
    <div className="space-y-4">
      {/* ─── Sub-tab navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleSubTabChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all duration-200',
              localSubTab === tab.key
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Active content ─────────────────────────────────────────────────── */}
      {localSubTab === 'campaigns' && <CampaignsContent />}
      {localSubTab === 'templates' && <TemplatesContent />}
    </div>
  );
}
