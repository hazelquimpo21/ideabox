/**
 * Discoveries Feed Component
 *
 * Consolidated view for AI-extracted informational content from emails:
 * insights, news, and links. These are things worth knowing — not directly
 * actionable items (those live in Tasks).
 *
 * Uses internal sub-tabs to toggle between feed types while keeping the
 * Inbox tab bar clean (one tab instead of three).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN DECISION (March 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replaced separate Insights/News/Links tabs in InboxTabs with this single
 * component. Ideas were moved to Tasks (they're actionable). What remains
 * here is informational content — things worth reading, not things to do.
 *
 * @module components/inbox/DiscoveriesFeed
 * @since March 2026
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Brain, Newspaper, Link2 } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ─── Feed components (all zero-prop, fully self-contained) ──────────────────
import { InsightsFeed } from '@/components/inbox/InsightsFeed';
import { NewsFeed } from '@/components/inbox/NewsFeed';
import { LinksFeed } from '@/components/inbox/LinksFeed';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DiscoveriesFeed');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type DiscoveryType = 'insights' | 'news' | 'links';

interface SubTabConfig {
  key: DiscoveryType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUB_TABS: SubTabConfig[] = [
  {
    key: 'insights',
    label: 'Insights',
    icon: <Brain className="h-3.5 w-3.5" />,
    description: 'Tips and frameworks from newsletters',
  },
  {
    key: 'news',
    label: 'News',
    icon: <Newspaper className="h-3.5 w-3.5" />,
    description: 'Factual news from your emails',
  },
  {
    key: 'links',
    label: 'Links',
    icon: <Link2 className="h-3.5 w-3.5" />,
    description: 'AI-analyzed links worth reading',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DiscoveriesFeed() {
  const [activeType, setActiveType] = React.useState<DiscoveryType>('insights');

  const handleTypeChange = (type: DiscoveryType) => {
    logger.info('Discoveries sub-tab changed', { from: activeType, to: type });
    setActiveType(type);
  };

  return (
    <div className="space-y-4">
      {/* ─── Sub-tab navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTypeChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all duration-200',
              activeType === tab.key
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title={tab.description}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Active feed content ────────────────────────────────────────────── */}
      {activeType === 'insights' && <InsightsFeed />}
      {activeType === 'news' && <NewsFeed />}
      {activeType === 'links' && <LinksFeed />}
    </div>
  );
}

export default DiscoveriesFeed;
