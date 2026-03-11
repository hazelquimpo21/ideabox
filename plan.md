# Inbox Redesign: Conversation-Style Three-Panel Layout

## Implementation Plan — 4 Phases

> **Design vision:** Transform the inbox from a tabbed feed with modal detail
> into a persistent master-detail split panel. Less chrome, more content.
> Scan the list, click, read — all in one view.

---

## Architecture Overview

```
Current:
  InboxPage → PageHeader + InboxTabs
    InboxTabs → 5 TabsContent (Inbox/Priority/Categories/Discoveries/Archive)
      InboxFeed → CategoryFilterBar + InboxFilterBar + EmailList + CategorySummaryPanel
        EmailList → InboxEmailRow | InboxEmailCard (list/card toggle)
    EmailDetailModal (Dialog overlay) → EmailDetail

New:
  InboxPage → InboxSplitLayout
    InboxSplitLayout → InboxListPanel + InboxDetailPanel
      InboxListPanel → InboxListHeader + InboxListFilters + DateGroupedEmailList
        DateGroupedEmailList → DateGroupHeader + InboxEmailRow (compact, selected state)
      InboxDetailPanel → InboxDetailToolbar + EmailDetail (existing) | InboxDetailEmpty
```

**Data flow (simplified):**
```
InboxSplitLayout (owns selectedEmailId + activeFilter state)
  ├── InboxListPanel (owns useEmails + search + filter logic)
  │     ├── calls onEmailSelect(id) → updates selectedEmailId in parent
  │     └── receives selectedEmailId → highlights the active row
  └── InboxDetailPanel (owns email body fetch + analysis hooks)
        ├── receives selectedEmailId → fetches full email + analysis
        └── calls onEmailUpdated(id, updates) → InboxListPanel refreshes
```

**URL contract:**
- `/inbox` — default, shows all emails, no email selected
- `/inbox?filter=unread` — filtered view
- `/inbox?filter=starred` — starred emails
- `/inbox?filter=priority` — must-reply / should-reply
- `/inbox?view=categories` — category overview (replaces list)
- `/inbox?view=discoveries` — discoveries feed (replaces list)
- `/inbox?view=archive` — archive (replaces list)
- `/inbox?email=<id>` — deep-link to specific email in detail panel

---

## Phase 1: Split Layout Shell
> Goal: Get the two-panel layout rendering with real data. Ugly is fine — structure first.

### Files to CREATE

#### 1. `src/components/inbox/InboxSplitLayout.tsx` (~120 lines)
**Purpose:** The top-level layout container. Owns `selectedEmailId` state and coordinates the two panels.

```
Responsibilities:
- Manages selectedEmailId state (lifted from old InboxTabs modal state)
- Reads ?email= query param for deep-linking on mount
- Updates URL when email is selected (shallow replace, no scroll)
- Passes selectedEmailId to both panels
- Passes onEmailSelect callback to InboxListPanel
- Passes onEmailUpdated callback from InboxDetailPanel back to list
- Handles responsive breakpoints:
    Desktop (≥1024px): side-by-side flex layout
    Tablet (768–1023px): side-by-side with narrower list (320px)
    Mobile (<768px): single column, list or detail via local mobileView state
```

**Imports:**
- `InboxListPanel` (new)
- `InboxDetailPanel` (new)
- `useSearchParams`, `useRouter` from next/navigation
- `createLogger` from lib/utils/logger

**State:**
- `selectedEmailId: string | null`
- `mobileView: 'list' | 'detail'` (mobile only)

**Logger calls:**
- `logger.info('Email selected', { emailId })` on selection
- `logger.info('Mobile view switched', { view })` on mobile toggle
- `logger.debug('Deep-link: opening email from URL', { emailId })` on mount

**Key design decisions:**
- selectedEmailId is NOT in a context — passed as props to avoid over-rendering.
  Only 2 direct children need it. Context would be premature abstraction.
- URL sync uses router.replace (not push) so back button doesn't create
  a history entry for every email click.

---

#### 2. `src/components/inbox/InboxListPanel.tsx` (~250 lines)
**Purpose:** The left panel. Contains search, filter tabs, and the email list. This is the "master" in master-detail.

```
Responsibilities:
- Owns useEmails() hook (moved from InboxFeed)
- Owns search state (local useState)
- Owns activeFilter state: 'all' | 'unread' | 'starred' | 'priority'
- Owns activeView state: 'emails' | 'categories' | 'discoveries' | 'archive'
- Maps filter state to useEmails() params
- Renders InboxListHeader (search bar)
- Renders InboxListFilters (filter tabs + overflow)
- Renders either:
    - DateGroupedEmailList (when activeView === 'emails')
    - CategoryOverview (when activeView === 'categories')
    - DiscoveriesFeed (when activeView === 'discoveries')
    - ArchiveContent (when activeView === 'archive')
- Handles initial sync progress (from useInitialSyncProgress)
- Shows loading skeleton, error state, empty states
```

**Imports:**
- `useEmails`, `useInitialSyncProgress`, `useGmailAccounts` from hooks
- `InboxListHeader` (new)
- `InboxListFilters` (new)
- `DateGroupedEmailList` (new)
- `CategoryOverview` (existing, kept)
- `DiscoveriesFeed` (existing, kept)
- `ArchiveContent` (existing, kept)
- `InboxEmptyState` (existing, modified)
- `createLogger`, `createClient` from lib

**Props interface:**
```ts
interface InboxListPanelProps {
  selectedEmailId: string | null;
  onEmailSelect: (emailId: string, category?: string | null) => void;
  onEmailUpdated?: (emailId: string, updates: Partial<Email>) => void;
  className?: string;
}
```

**Logger calls:**
- `logger.info('Filter changed', { from, to })`
- `logger.info('View changed', { from, to })`
- `logger.info('Search query changed', { query })`
- `logger.debug('Emails loaded', { count, filter })`

---

#### 3. `src/components/inbox/InboxDetailPanel.tsx` (~200 lines)
**Purpose:** The right panel. Fetches and displays the selected email's full content.

```
Responsibilities:
- Receives selectedEmailId prop
- When selectedEmailId changes: fetch full email (body_html/body_text) from Supabase
- Fires useEmailAnalysis() and useExtractedDates() in parallel (same as EmailDetailModal)
- Marks email as read on open (same logic as EmailDetailModal)
- Renders InboxDetailToolbar (new) for actions
- Renders EmailDetail (existing) for email content
- Renders InboxDetailEmpty (new) when no email selected
- Handles loading skeleton, error state
- Provides star/archive/toggleRead/analyze handlers with optimistic updates
```

**Imports:**
- `EmailDetail` (existing, core renderer — unchanged)
- `InboxDetailToolbar` (new)
- `InboxDetailEmpty` (new)
- `useEmailAnalysis`, `useExtractedDates` from hooks
- `createClient` from lib/supabase
- `createLogger` from lib/utils/logger
- `Skeleton` from components/ui

**Props interface:**
```ts
interface InboxDetailPanelProps {
  selectedEmailId: string | null;
  onEmailUpdated?: (emailId: string, updates: Partial<Email>) => void;
  onClose?: () => void;          // Mobile: go back to list
  className?: string;
}
```

**Logger calls:**
- `logger.start('Fetching email for detail panel', { emailId })`
- `logger.success('Email loaded in detail panel', { emailId, subject })`
- `logger.info('Marking email as read', { emailId })`
- `logger.error('Failed to fetch email', { emailId, error })`
- `logger.info('Star toggled', { emailId, isStarred })`
- `logger.info('Email archived from detail panel', { emailId })`

**Key reuse:** 90% of the data-fetching logic is lifted directly from `EmailDetailModal.tsx`.
The difference: no Dialog wrapper, rendered inline.

---

#### 4. `src/components/inbox/InboxDetailEmpty.tsx` (~50 lines)
**Purpose:** Tasteful empty state for the detail panel when no email is selected.

```
Renders:
- Centered vertically in the panel
- Mail icon (from lucide) in muted color
- "Select an email to read" heading
- "Choose a conversation from the list to view its contents" subtext
- Subtle, doesn't compete with the list panel
```

**Imports:** `Mail` from lucide-react, `cn` from lib/utils

---

### Files to MODIFY

#### 5. `src/app/(auth)/inbox/page.tsx` (rewrite, ~20 lines)
**Current:** Renders `PageHeader` + `InboxTabs`
**New:** Renders `InboxSplitLayout` only. Remove PageHeader entirely — the sidebar nav already contextualizes "Inbox". The reference designs have no page header.

```tsx
// New content:
export default function InboxPage() {
  return <InboxSplitLayout />;
}
```

#### 6. `src/components/inbox/index.ts` (add new exports)
Add exports for all new components. Keep existing exports for now (cleanup in Phase 4).

---

### Connections & Wiring

```
InboxPage
  └── InboxSplitLayout (selectedEmailId state)
        ├── InboxListPanel
        │     ├── uses useEmails() hook (data source)
        │     ├── renders existing email rows via InboxEmailRow
        │     ├── calls props.onEmailSelect(id) when row clicked
        │     └── receives props.selectedEmailId to highlight active row
        └── InboxDetailPanel
              ├── fetches email body via Supabase when selectedEmailId changes
              ├── fires useEmailAnalysis(selectedEmailId) in parallel
              ├── fires useExtractedDates({ emailId }) in parallel
              ├── renders existing EmailDetail component with all its props
              ├── calls props.onEmailUpdated(id, updates) on star/archive/read
              └── renders InboxDetailEmpty when selectedEmailId is null
```

---

## Phase 2: List Panel Polish
> Goal: Make the email list feel like the reference designs — clean, grouped, compact.

### Files to CREATE

#### 7. `src/components/inbox/InboxListHeader.tsx` (~60 lines)
**Purpose:** Top section of the list panel — search bar + email count.

```
Renders:
- InboxSearchBar (existing) at the top
- Optional: email count badge ("42 emails · 5 unread")
- Compact, no wasted space
```

**Imports:** `InboxSearchBar` (existing)

**Props:**
```ts
interface InboxListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
  emailCount?: number;
  unreadCount?: number;
}
```

---

#### 8. `src/components/inbox/InboxListFilters.tsx` (~130 lines)
**Purpose:** Horizontal filter tabs + overflow dropdown for secondary views.

```
Renders:
- Horizontal pill-style tabs: All | Unread | Starred | Priority
- Overflow button (ChevronDown or MoreHorizontal icon) that opens a dropdown:
    - Categories (switches to CategoryOverview)
    - Discoveries (switches to DiscoveriesFeed)
    - Archive (switches to ArchiveContent)
- Active filter has bg-primary/10 text-primary styling
- Tabs use button elements (not links) — filter is local state, not routing
```

**Imports:**
- `cn` from lib/utils
- `ChevronDown` from lucide-react
- `DropdownMenu`, `DropdownMenuItem` from components/ui
- `createLogger` from lib/utils/logger

**Props:**
```ts
type InboxFilter = 'all' | 'unread' | 'starred' | 'priority';
type InboxView = 'emails' | 'categories' | 'discoveries' | 'archive';

interface InboxListFiltersProps {
  activeFilter: InboxFilter;
  activeView: InboxView;
  onFilterChange: (filter: InboxFilter) => void;
  onViewChange: (view: InboxView) => void;
  counts?: {
    all?: number;
    unread?: number;
    starred?: number;
    priority?: number;
  };
}
```

**Logger calls:**
- `logger.info('Filter tab clicked', { filter })`
- `logger.info('View switched from overflow', { view })`

---

#### 9. `src/components/inbox/DateGroupedEmailList.tsx` (~180 lines)
**Purpose:** Renders emails grouped by relative date headers (Today, Yesterday, etc.).

```
Responsibilities:
- Receives flat email[] array (already sorted by date desc from useEmails)
- Groups into buckets: Today, Yesterday, This Week, Last Week, This Month, Older
- Renders DateGroupHeader for each bucket
- Renders InboxEmailRow for each email (compact mode)
- Passes selectedEmailId down to highlight the active row
- Handles "Load more" button at bottom
- Handles search result count display
```

**Imports:**
- `InboxEmailRow` (existing, will be modified)
- `DateGroupHeader` (new)
- `Button` from components/ui
- `createLogger`

**Props:**
```ts
interface DateGroupedEmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onEmailClick: (email: Email) => void;
  onToggleStar: (email: Email) => void;
  onUpdateEmail?: (emailId: string, updates: Partial<Email>) => void;
  accountMap?: Record<string, string>;
  hasMore?: boolean;
  onLoadMore?: () => void;
  searchQuery?: string;
}
```

**Date grouping helper (pure function, testable):**
```ts
function groupEmailsByDate(emails: Email[]): { label: string; emails: Email[] }[] {
  // Groups: Today, Yesterday, This Week, Last Week, This Month, Older
  // Returns only non-empty groups in chronological order
}
```

**Logger calls:**
- `logger.debug('Grouped emails by date', { groups: groups.map(g => ({ label: g.label, count: g.emails.length })) })`

---

#### 10. `src/components/inbox/DateGroupHeader.tsx` (~30 lines)
**Purpose:** Section divider showing a date group label.

```
Renders:
- "Today" / "Yesterday" / "This Week" / etc.
- Styled: text-xs font-semibold text-muted-foreground uppercase tracking-wider
- Has top padding (except first group) for visual separation
- Optional email count badge
```

**Props:**
```ts
interface DateGroupHeaderProps {
  label: string;
  count?: number;
  isFirst?: boolean;
}
```

---

### Files to MODIFY

#### 11. `src/components/inbox/InboxEmailRow.tsx` (modify, ~250 lines)
**Changes:**
- Add `isSelected` prop → applies `bg-accent border-l-2 border-primary` when true
- Add `compact` mode as default in split layout (tighter padding: `px-3 py-2.5`)
- Remove `EmailHoverActions` import and hover tray rendering (actions now in detail panel)
- Remove timeliness left-border accent (3px border-l) — cleaner without it
- Keep: avatar, sender name, company proxy, subject, snippet, time, unread dot, star button
- Keep: EmailHoverCard on subject (nice progressive disclosure)
- Add: category badge inline (small pill after sender name) when showCategory=true

**Updated props interface:**
```ts
interface InboxEmailRowProps {
  email: Email;
  onClick: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  onUpdate?: (emailId: string, updates: Partial<Email>) => void;
  showCategory?: boolean;
  compact?: boolean;
  isSelected?: boolean;        // NEW — highlight when selected in split view
  accountMap?: Record<string, string>;
}
```

#### 12. `src/components/inbox/InboxEmptyState.tsx` (minor modify)
- Ensure it works well at narrower widths (the list panel is ~420px instead of full width)
- No structural changes needed, just test visual fit

---

### Connections & Wiring (Phase 2 additions)

```
InboxListPanel
  ├── InboxListHeader
  │     └── InboxSearchBar (existing)
  ├── InboxListFilters
  │     └── manages activeFilter + activeView state
  └── (conditional on activeView)
        ├── 'emails' → DateGroupedEmailList
        │                ├── DateGroupHeader (per date group)
        │                └── InboxEmailRow (compact, isSelected)
        ├── 'categories' → CategoryOverview (existing)
        ├── 'discoveries' → DiscoveriesFeed (existing)
        └── 'archive' → ArchiveContent (existing)
```

---

## Phase 3: Detail Panel Polish
> Goal: Make the detail panel feel premium. Actions, keyboard nav, smooth transitions.

### Files to CREATE

#### 13. `src/components/inbox/InboxDetailToolbar.tsx` (~120 lines)
**Purpose:** Action bar at the top of the detail panel.

```
Renders (left-to-right):
- Back button (mobile only, ← icon)
- Sender name + avatar (compact)
- Spacer
- Star button (filled/outlined based on state)
- Mark read/unread button
- Archive button
- "Open Full Page" button (ExternalLink icon) — links to /inbox/[category]/[emailId]
- More menu (···) — future: reply, forward, snooze

All buttons: ghost variant, icon-only with tooltips
Star uses optimistic update animation (existing isStarAnimating pattern)
```

**Imports:**
- `Star`, `Archive`, `Mail`, `MailOpen`, `ExternalLink`, `ArrowLeft`, `MoreHorizontal` from lucide-react
- `Button`, `Tooltip` from components/ui
- `SenderLogo` from inbox/SenderLogo
- `cn` from lib/utils
- `createLogger`

**Props:**
```ts
interface InboxDetailToolbarProps {
  email: Email;
  onStar: () => void;
  onArchive: () => void;
  onToggleRead: () => void;
  onClose?: () => void;       // Mobile: back to list
  fullPageUrl?: string | null;
}
```

**Logger calls:**
- `logger.info('Detail toolbar action', { action, emailId })`

---

### Files to MODIFY

#### 14. `src/components/inbox/InboxDetailPanel.tsx` (enhance from Phase 1)
**Additions:**
- Render `InboxDetailToolbar` above `EmailDetail`
- Build `fullPageUrl` from email category + id (same logic as EmailDetailModal)
- Wire toolbar actions (star/archive/read) to handlers

#### 15. `src/components/inbox/InboxSplitLayout.tsx` (enhance from Phase 1)
**Additions:**
- Wire keyboard shortcuts (moved from InboxTabs):
  - `j` / `k`: next/prev email in list
  - `e`: archive current email
  - `s`: star/unstar current email
  - `Enter` or `o`: select focused email (when using j/k nav)
  - `Escape`: deselect email (clear detail panel) / on mobile: back to list
- Use `useKeyboardShortcuts` hook (existing)
- Track `focusedIndex` for keyboard navigation (separate from selectedEmailId)
- Manage email list reference for j/k navigation

**Logger calls:**
- `logger.debug('Keyboard nav', { direction, index })`
- `logger.debug('Keyboard action', { action, emailId })`

---

### Connections (Phase 3 additions)

```
InboxSplitLayout
  ├── useKeyboardShortcuts (j/k/e/s/Enter/Escape)
  ├── InboxListPanel
  │     └── DateGroupedEmailList
  │           └── InboxEmailRow (receives focusedIndex for visual focus ring)
  └── InboxDetailPanel
        ├── InboxDetailToolbar (actions: star, archive, read, open full page)
        └── EmailDetail (existing — content rendering)
```

---

## Phase 4: Cleanup, Documentation & Polish
> Goal: Remove retired components, update exports, add docs, verify everything works.

### Files to DELETE (retired components)

| File | Reason |
|------|--------|
| `src/components/inbox/InboxTabs.tsx` | Replaced by InboxSplitLayout + InboxListPanel |
| `src/components/inbox/InboxFeed.tsx` | Logic absorbed into InboxListPanel |
| `src/components/inbox/CategoryFilterBar.tsx` | Categories now in overflow dropdown |
| `src/components/inbox/CategorySummaryPanel.tsx` | Right panel is now the detail panel |
| `src/components/inbox/InboxFilterBar.tsx` | Smart filters folded into InboxListFilters |
| `src/components/inbox/InboxSummaryBanner.tsx` | No longer needed with persistent detail |
| `src/components/inbox/PriorityEmailList.tsx` | Priority is now a filter tab, same list renderer |
| `src/components/inbox/InboxEmailCard.tsx` | Card view removed (list only in split layout) |
| `src/components/inbox/FeedControls.tsx` | View toggle removed |
| `src/components/inbox/EmailHoverActions.tsx` | Actions moved to detail toolbar |

### Files to MODIFY

#### 16. `src/components/inbox/index.ts` (rewrite barrel exports)
```ts
// Core split layout
export { InboxSplitLayout } from './InboxSplitLayout';
export { InboxListPanel } from './InboxListPanel';
export { InboxDetailPanel } from './InboxDetailPanel';

// List panel components
export { InboxListHeader } from './InboxListHeader';
export { InboxListFilters } from './InboxListFilters';
export { DateGroupedEmailList } from './DateGroupedEmailList';
export { DateGroupHeader } from './DateGroupHeader';
export { InboxEmailRow } from './InboxEmailRow';
export { InboxSearchBar } from './InboxSearchBar';
export { InboxEmptyState } from './InboxEmptyState';

// Detail panel components
export { InboxDetailToolbar } from './InboxDetailToolbar';
export { InboxDetailEmpty } from './InboxDetailEmpty';

// Secondary views (rendered inside list panel via overflow menu)
export { CategoryOverview } from './CategoryOverview';
export { DiscoveriesFeed } from './DiscoveriesFeed';

// Shared utilities
export { CategoryIcon } from './CategoryIcon';
export { SenderLogo } from './SenderLogo';
export { EmailRowIndicators } from './EmailRowIndicators';
export { CategorySparkline } from './CategorySparkline';
export { DiscoveryItem } from './DiscoveryItem';

// Legacy feed exports (kept for /inbox/[category] pages)
export { IdeasFeed } from './IdeasFeed';
export { InsightsFeed } from './InsightsFeed';
export { NewsFeed } from './NewsFeed';
export { LinksFeed } from './LinksFeed';
```

#### 17. `src/components/inbox/EmailList.tsx` (retire or repurpose)
This file currently handles the priority/recent split + card/list toggle. With the new architecture:
- Card view is gone
- Priority section is gone (priority is now a filter, not a section)
- Date grouping is handled by `DateGroupedEmailList`

**Decision:** Delete `EmailList.tsx`. Its role is fully replaced by `DateGroupedEmailList`.

#### 18. `src/components/email/EmailDetail.tsx` (minor modification)
- Remove the `onClose` prop usage from the header (close button) — detail panel is inline, not a modal
- Or: make close button conditional (`onClose && <X button>`)
- Keep everything else unchanged

#### 19. `src/app/(auth)/inbox/[category]/page.tsx` (verify still works)
- This deep-link page should still function since it doesn't depend on InboxTabs
- Verify it renders correctly after the parent page changes

#### 20. `src/app/(auth)/inbox/[category]/[emailId]/page.tsx` (verify still works)
- Same — this is a standalone full-page email detail, unaffected by the redesign
- Verify back-navigation returns to the correct inbox state

### Documentation Updates

#### 21. Update `docs/DECISIONS.md`
Add decision entry:
```
## D37: Inbox Redesign — Split Panel Layout (March 2026)
- Changed from tabbed feed + modal detail to persistent master-detail split
- Motivation: Modern inbox UX pattern, eliminates modal context-switching
- Filter tabs simplified from 5 to 4 (All/Unread/Starred/Priority) + overflow
- Categories, Discoveries, Archive accessible via overflow dropdown
- Mobile: single column with list/detail view toggle
```

#### 22. Update `docs/IMPLEMENTATION_STATUS.md`
Add section documenting the redesign completion and new component architecture.

### Tests to ADD/UPDATE

#### 23. `src/components/inbox/__tests__/InboxSplitLayout.test.tsx`
- Renders list + detail panels
- selectedEmailId updates on email click
- Mobile responsive: shows list by default, detail on selection
- Deep-link: reads ?email= param on mount

#### 24. `src/components/inbox/__tests__/DateGroupedEmailList.test.tsx`
- Groups emails correctly by date (Today, Yesterday, etc.)
- Renders DateGroupHeaders
- Highlights selected email row
- Handles empty state
- Handles load more

#### 25. `src/components/inbox/__tests__/InboxListFilters.test.tsx`
- Renders all filter tabs
- Active filter styling
- Overflow dropdown opens and navigates to secondary views
- Filter counts display correctly

---

## Component File Summary

### New files (10):
| # | File | Phase | Lines (est) |
|---|------|-------|-------------|
| 1 | `InboxSplitLayout.tsx` | 1 | ~120 |
| 2 | `InboxListPanel.tsx` | 1 | ~250 |
| 3 | `InboxDetailPanel.tsx` | 1 | ~200 |
| 4 | `InboxDetailEmpty.tsx` | 1 | ~50 |
| 5 | `InboxListHeader.tsx` | 2 | ~60 |
| 6 | `InboxListFilters.tsx` | 2 | ~130 |
| 7 | `DateGroupedEmailList.tsx` | 2 | ~180 |
| 8 | `DateGroupHeader.tsx` | 2 | ~30 |
| 9 | `InboxDetailToolbar.tsx` | 3 | ~120 |
| 10 | Tests (3 files) | 4 | ~300 |

### Modified files (6):
| File | Phase | Change |
|------|-------|--------|
| `inbox/page.tsx` | 1 | Rewrite to render InboxSplitLayout |
| `inbox/index.ts` | 1+4 | Update barrel exports |
| `InboxEmailRow.tsx` | 2 | Add isSelected, compact, remove hover tray |
| `InboxEmptyState.tsx` | 2 | Narrow width compatibility |
| `EmailDetail.tsx` | 4 | Conditional close button |
| `InboxDetailPanel.tsx` | 3 | Add toolbar wiring |

### Deleted files (10):
| File | Phase |
|------|-------|
| `InboxTabs.tsx` | 4 |
| `InboxFeed.tsx` | 4 |
| `CategoryFilterBar.tsx` | 4 |
| `CategorySummaryPanel.tsx` | 4 |
| `InboxFilterBar.tsx` | 4 |
| `InboxSummaryBanner.tsx` | 4 |
| `PriorityEmailList.tsx` | 4 |
| `InboxEmailCard.tsx` | 4 |
| `FeedControls.tsx` | 4 |
| `EmailHoverActions.tsx` | 4 |
| `EmailList.tsx` | 4 |

### Kept unchanged (12):
`EmailDetail.tsx` (core), `CategoryOverview.tsx`, `DiscoveriesFeed.tsx`, `InsightsFeed.tsx`, `NewsFeed.tsx`, `LinksFeed.tsx`, `IdeasFeed.tsx`, `SenderLogo.tsx`, `CategoryIcon.tsx`, `CategorySparkline.tsx`, `DiscoveryItem.tsx`, `EmailRowIndicators.tsx`

---

## Design Tokens

```css
/* Split layout */
--inbox-list-width: 420px;          /* Desktop list panel width */
--inbox-list-width-tablet: 320px;   /* Tablet list panel width */

/* Email row (compact) */
--row-padding: 12px 12px;           /* px-3 py-3 */
--row-avatar-size: 36px;            /* Slightly larger than current 32px for visual weight */
--row-selected-bg: var(--accent);
--row-selected-border: var(--primary);
--row-hover-bg: var(--muted) / 0.5;

/* Date group header */
--group-header-font: 11px / 600 / uppercase / tracking-wider;
--group-header-color: var(--muted-foreground);
--group-header-padding: 8px 12px;
--group-header-bg: var(--muted) / 0.3;

/* Detail panel */
--detail-toolbar-height: 52px;
--detail-toolbar-border: var(--border) / 0.6;

/* Transitions */
--row-select-transition: background 150ms ease;
--mobile-slide-transition: transform 200ms ease;
```

---

## Coding Standards Checklist

- [ ] Every new file ≤ 400 lines (enforced by eslint max-lines)
- [ ] Every component has JSDoc header with @module and @since
- [ ] Every file uses `createLogger('ComponentName')` for structured logging
- [ ] Logger calls at: component mount, user actions, data fetches, errors
- [ ] TypeScript strict mode — all props interfaces exported
- [ ] All handlers use useCallback with stable deps
- [ ] All list items use React.memo
- [ ] Tailwind classes use cn() utility for conditional merging
- [ ] Dark mode: all custom colors use CSS variables or dark: prefix
- [ ] Accessibility: aria-labels on interactive elements, keyboard support
- [ ] No magic numbers — constants extracted and named
- [ ] URL state synced via router.replace (not push) for non-destructive nav
