/**
 * Inbox component exports.
 *
 * @module components/inbox
 * @since February 2026 — Inbox UI Redesign v2
 * @updated March 2026 — Split Panel Redesign v3
 */

// ─── Core split layout (v3) ─────────────────────────────────────────────────
export { InboxSplitLayout } from './InboxSplitLayout';
export { InboxListPanel } from './InboxListPanel';
export { InboxDetailPanel } from './InboxDetailPanel';

// ─── List panel components (v3) ─────────────────────────────────────────────
export { InboxListHeader } from './InboxListHeader';
export { InboxListFilters } from './InboxListFilters';
export { DateGroupedEmailList } from './DateGroupedEmailList';
export { DateGroupHeader } from './DateGroupHeader';
export { InboxEmailRow } from './InboxEmailRow';
export { InboxSearchBar } from './InboxSearchBar';
export { InboxEmptyState } from './InboxEmptyState';

// ─── Detail panel components (v3) ───────────────────────────────────────────
export { InboxDetailToolbar } from './InboxDetailToolbar';
export { InboxDetailEmpty } from './InboxDetailEmpty';

// ─── Secondary views (rendered inside list panel via overflow menu) ──────────
export { CategoryOverview } from './CategoryOverview';
export { DiscoveriesFeed } from './DiscoveriesFeed';

// ─── Shared utilities ───────────────────────────────────────────────────────
export { CategoryIcon } from './CategoryIcon';
export { SenderLogo } from './SenderLogo';
export { EmailRowIndicators } from './EmailRowIndicators';
export { CategorySparkline } from './CategorySparkline';
export { DiscoveryItem } from './DiscoveryItem';

// ─── Legacy components (kept for /inbox/[category] pages + backward compat) ─
export { InboxTabs } from './InboxTabs';
export { InboxFeed } from './InboxFeed';
export { InboxEmailCard } from './InboxEmailCard';
export { CategoryFilterBar } from './CategoryFilterBar';
export { CategorySummaryPanel } from './CategorySummaryPanel';
export { InboxFilterBar } from './InboxFilterBar';
export { InboxSummaryBanner } from './InboxSummaryBanner';
export { PriorityEmailList } from './PriorityEmailList';
export { EmailList } from './EmailList';
export { EmailHoverActions } from './EmailHoverActions';
export { FeedControls } from './FeedControls';

// ─── Feed sub-components ────────────────────────────────────────────────────
export { IdeasFeed } from './IdeasFeed';
export { InsightsFeed } from './InsightsFeed';
export { NewsFeed } from './NewsFeed';
export { LinksFeed } from './LinksFeed';
