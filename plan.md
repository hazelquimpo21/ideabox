# Inbox Redesign Plan: Conversation-Style Three-Panel Layout

## Design Vision

Transform the inbox from a **tabbed feed with modal detail** into a **persistent master-detail split panel** — the dominant pattern in modern inbox/messaging UIs (as seen in the Propwise, email client, and customer support references).

The goal: **feel like a focused communication tool, not a dashboard**. Less chrome, more content. Scan the list, click, read — all in one view with zero context-switching.

---

## What Changes (and What Stays)

### Layout: The Big Structural Shift

**Current:** Full-width email list → click → modal slides over → close modal to go back
**New:** Side-by-side split: email list (left, ~40%) | email detail (right, ~60%)

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar  │        Email List         │    Email Detail       │
│  (existing│  ┌─────────────────────┐  │  ┌─────────────────┐ │
│   nav)    │  │ 🔍 Search...        │  │  │ Arlene McCoy    │ │
│           │  ├─────────────────────┤  │  │ 721 Meadowview  │ │
│  Home     │  │ All  Unread  Starred│  │  │ Maintenance req │ │
│  Inbox    │  ├─────────────────────┤  │  ├─────────────────┤ │
│  Contacts │  │ Today               │  │  │                 │ │
│  Calendar │  │ ● Maintenance Req 1m│  │  │ Hi Bryan, I     │ │
│  Tasks    │  │   Arlene · 721 Mead │  │  │ hope you're...  │ │
│           │  │   Hi Bryan, I hope..│  │  │                 │ │
│           │  │                     │  │  │ [AI Analysis]   │ │
│           │  │   Monthly Report  5h│  │  │ [Actions]       │ │
│           │  │   Mark D · Pinehurst│  │  │                 │ │
│           │  │                     │  │  │                 │ │
│           │  │ Yesterday           │  │  │                 │ │
│           │  │   Lease Renewal   8h│  │  │                 │ │
│           │  └─────────────────────┘  │  └─────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Why this works:**
- Eliminates the modal open/close dance — selected email shows instantly in the right panel
- The list stays visible and interactive while reading — easy to jump between emails
- Matches mental model of every inbox tool users already know (Gmail, Outlook, Intercom, Crisp)
- The existing `EmailDetailModal` already loads email body + analysis in parallel — we reuse that logic

### On Mobile (< md breakpoint)
- Single column: show list only → tap email → slide to detail view (full screen)
- Back button returns to list
- Same as current modal UX but without the overlay

---

## Detailed Component Changes

### 1. InboxPage (`/src/app/(auth)/inbox/page.tsx`)

**Current:** Renders `PageHeader` + `InboxTabs`
**New:** Renders a full-height split-panel layout. Remove the PageHeader (the "Inbox" title and breadcrumbs waste vertical space — the sidebar already tells you where you are, just like the reference designs).

```tsx
// New structure:
<div className="flex h-[calc(100vh-3.5rem)]">
  <InboxListPanel />   {/* Left: list + search + filters */}
  <InboxDetailPanel />  {/* Right: selected email detail */}
</div>
```

### 2. New: `InboxListPanel` (replaces InboxTabs + InboxFeed orchestration)

The left panel containing search, filters, and the email list. This is the "master" in master-detail.

**Structure:**
```
┌─────────────────────────────┐
│ 🔍 Search conversations...  │  ← Search bar (always visible at top)
├─────────────────────────────┤
│ All  │ Unread │ Starred │ ▾ │  ← Simple filter tabs (horizontal)
├─────────────────────────────┤
│ Today                       │  ← Date group header
│ ┌─ ● Maintenance Request ─┐│  ← Email row (selected = highlighted bg)
│ │   Arlene McCoy · Tenant  ││
│ │   Hi Bryan, I hope...   1m│
│ └──────────────────────────┘│
│ ┌─   Monthly Report ──────┐│
│ │   Mark Davis · Owner     ││
│ │   Attached is the...   5h││
│ └──────────────────────────┘│
│ Yesterday                   │
│ ┌─   Lease Renewal  Solved┐│
│ │   Sarah Brown · Tenant   ││
│ │   My lease at Maple...  8h│
│ └──────────────────────────┘│
└─────────────────────────────┘
```

**Filter tabs (simplified from 5 tabs):**
- **All** — all non-archived emails (default)
- **Unread** — unread only
- **Starred** — starred/favorited
- **Priority** — AI-ranked must-reply/should-reply emails
- Overflow menu (▾): Categories, Discoveries, Archive

**Why simplify tabs?** The reference designs all have 3-4 simple filters, not 5 feature-rich tabs. Categories and Discoveries are secondary views — they can live in a dropdown or be accessed via the overflow. The primary job of the inbox list is to show emails you need to deal with.

**Date grouping:** Group emails by relative date headers:
- "Today" / "Yesterday" / "This Week" / "Last Week" / "This Month" / "Older"
- Matches Propwise pattern and feels more human than a flat chronological list

**Email row redesign (within the list panel):**
- Slightly more compact than current since it's in a narrower panel
- Avatar (32px) | Sender name + metadata | Time (top-right)
- Subject line (bold if unread)
- Preview snippet (1 line, muted)
- Optional: category badge, status badge ("Solved"/"Must Reply")
- Selected state: subtle background highlight (like `bg-accent`)
- Unread: blue dot + bold sender + bold subject
- Remove the timeliness left-border accent (too noisy in a tight list)
- Remove hover action tray (actions live in the detail panel now)

### 3. New: `InboxDetailPanel` (replaces EmailDetailModal)

The right panel showing the full email when selected. This is the "detail" in master-detail.

**Structure:**
```
┌─────────────────────────────────────┐
│ Arlene McCoy                        │  ← Sender name + avatar
│ 🏠 721 Meadowview · Maintenance req │  ← Property/category + subject
│ 02/10/2023                          │  ← Date
├─────────────────────────────────────┤
│ ⭐ Archive  Reply  ···              │  ← Action toolbar
├─────────────────────────────────────┤
│                                     │
│ Hi Bryan, I hope you're doing well. │  ← Email body
│ I wanted to let you know that       │
│ there's a maintenance issue at      │
│ 721 Meadowview Residences...        │
│                                     │
│ ─── AI Analysis ───────────────     │  ← Collapsible analysis section
│ Category: Maintenance               │
│ Priority: High                      │
│ Actions: Schedule repair            │
│ Events: Available Mon 2 Oct 8AM     │
│                                     │
└─────────────────────────────────────┘
```

**Key behaviors:**
- When no email is selected: show a tasteful empty state ("Select an email to read")
- Loads email body + analysis in parallel (reuse existing `EmailDetailModal` data-fetching logic)
- Action toolbar: Star, Archive, Mark Read/Unread, Reply (future), Open Full Page
- Scrollable independently from the list
- Analysis section collapsed by default (expandable) — keeps focus on the email content
- Preserves all existing `EmailDetail` component rendering

### 4. Existing Component Modifications

| Component | Change |
|-----------|--------|
| `InboxTabs.tsx` | **Retire** — no longer the orchestrator. Logic moves to `InboxListPanel` |
| `InboxFeed.tsx` | **Retire** — absorbed into `InboxListPanel` |
| `EmailList.tsx` | **Modify** — remove card view, add date grouping, compact mode for split panel |
| `InboxEmailRow.tsx` | **Modify** — add `selected` state styling, remove hover tray, more compact layout, remove left border accent |
| `EmailDetailModal.tsx` | **Retire** — replaced by inline `InboxDetailPanel` |
| `EmailDetail.tsx` | **Keep** — core email rendering stays, just rendered in panel instead of modal |
| `CategoryFilterBar.tsx` | **Retire** — categories move to overflow dropdown |
| `CategorySummaryPanel.tsx` | **Retire** — no longer needed with detail panel taking the right side |
| `InboxFilterBar.tsx` | **Retire** — smart filters folded into the filter tab dropdown |
| `InboxSearchBar.tsx` | **Keep** — moves to top of list panel |
| `InboxEmptyState.tsx` | **Modify** — adapt for narrower panel width |
| `SenderLogo.tsx` | **Keep** — unchanged |
| `EmailRowIndicators.tsx` | **Simplify** — show category badge + status only |
| `InboxSummaryBanner.tsx` | **Retire** — detail panel replaces the need for summary banners |
| `PriorityEmailList.tsx` | **Retire** — priority becomes a filter tab, reuses same list rendering |
| `CategoryOverview.tsx` | **Keep** — accessible via overflow menu, renders in place of list when active |
| `DiscoveriesFeed.tsx` | **Keep** — accessible via overflow menu |

### 5. New Components to Create

| Component | Purpose |
|-----------|---------|
| `InboxListPanel.tsx` | Left panel orchestrator: search + filters + email list |
| `InboxDetailPanel.tsx` | Right panel: selected email detail + actions |
| `InboxSplitLayout.tsx` | The flex container managing the two panels + responsive behavior |
| `DateGroupHeader.tsx` | "Today" / "Yesterday" / etc. section dividers |
| `InboxListFilters.tsx` | The simple filter tab bar (All, Unread, Starred, Priority, overflow) |
| `InboxDetailToolbar.tsx` | Action bar in detail panel (star, archive, read, open full page) |
| `InboxDetailEmpty.tsx` | Empty state for when no email is selected |

### 6. Data Flow Changes

**Current flow:**
```
InboxTabs → manages tabs + modal state
  └─ InboxFeed → useEmails() + search + category + smart filters
       └─ EmailList → renders rows/cards
  └─ EmailDetailModal → fetches body + analysis on open
```

**New flow:**
```
InboxSplitLayout → manages selectedEmailId state
  ├─ InboxListPanel → useEmails() + search + filters
  │    └─ EmailList → renders compact rows with date grouping
  └─ InboxDetailPanel → fetches body + analysis for selectedEmailId
       └─ EmailDetail (existing) → renders email content
```

The state is simpler: no modal open/close, just `selectedEmailId`. URL updates to `?email=<id>` for deep-linking.

### 7. Filter Logic Mapping

| Current Tab | New Location | Notes |
|------------|-------------|-------|
| Inbox (default) | "All" filter | Same email feed |
| Priority | "Priority" filter tab | Filters to must_reply + should_reply |
| Categories | Overflow menu → Categories | Shows CategoryOverview grid |
| Discoveries | Overflow menu → Discoveries | Shows DiscoveriesFeed |
| Archive | Overflow menu → Archive | Shows ArchiveContent |

Smart filters (must-reply, high-signal, nuggets, events) move into the "Priority" filter or a "Filter" dropdown button.

---

## Implementation Phases

### Phase 1: Split Layout Shell
- Create `InboxSplitLayout`, `InboxListPanel`, `InboxDetailPanel`
- Wire up `selectedEmailId` state + URL param
- Render existing `EmailDetail` in the right panel
- Keep existing email list in left panel (just narrower)
- Mobile: hide detail panel, show list only, tap opens detail full-screen

### Phase 2: List Panel Polish
- Implement `InboxListFilters` (All, Unread, Starred, Priority, overflow)
- Add `DateGroupHeader` date grouping
- Compact `InboxEmailRow` for split-panel width
- Remove card view toggle (list only in this layout)
- Add selected-row highlight state
- Remove hover action tray from rows

### Phase 3: Detail Panel Polish
- Create `InboxDetailToolbar` with star/archive/read actions
- Create `InboxDetailEmpty` state
- Ensure analysis section is collapsible
- Add keyboard nav: j/k to move through list, Enter to select

### Phase 4: Cleanup
- Remove retired components (InboxTabs, InboxFeed, EmailDetailModal, CategoryFilterBar, etc.)
- Update routing (remove tab query params, use ?email= for selection)
- Update tests
- Verify mobile responsive behavior

---

## Design Tokens / Visual Notes

- **List panel width:** `w-[420px]` on desktop (fixed), full width on mobile
- **Detail panel:** `flex-1` (takes remaining space)
- **Divider:** `border-r border-border/60` between panels
- **Selected row:** `bg-accent/50` with left border accent `border-l-2 border-primary`
- **Date group headers:** `text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 bg-muted/30`
- **Email row padding:** `px-4 py-3` (current) → `px-3 py-2.5` (tighter for list panel)
- **Typography:** Keep existing scale, just ensure truncation works at narrower widths
- **Transitions:** Smooth panel resize on mobile, row selection highlight is instant (no delay)
- **Scrolling:** Both panels scroll independently (`overflow-y-auto` on each)

---

## What We're NOT Changing

- Sidebar navigation (stays as-is)
- Email data model / hooks / API layer
- AI analysis pipeline
- Email category system
- Keyboard shortcuts (j/k/e/s) — just re-wired to new components
- Deep-link routing (/inbox/[category]/[emailId] pages still work)
- Dark mode support
- Optimistic updates for star/archive
