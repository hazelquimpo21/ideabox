# IdeaBox — Core View Redesign Plan

> **Created:** March 2026
> **Scope:** Home, Inbox, Calendar/Events — desktop-first, mobile-aware
> **Philosophy:** Calm, oriented, actionable. A smart desk, not a dashboard factory.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color & Visual Language](#2-color--visual-language)
3. [New Shared Infrastructure](#3-new-shared-infrastructure)
4. [Home View Redesign](#4-home-view-redesign)
5. [Inbox View Redesign](#5-inbox-view-redesign)
6. [Calendar View Redesign](#6-calendar-view-redesign)
7. [Delight & Micro-Interactions](#7-delight--micro-interactions)
8. [Database & Algorithm Changes](#8-database--algorithm-changes)
9. [Cleanup & Removal](#9-cleanup--removal)
10. [Phased Implementation](#10-phased-implementation)
11. [Taste Guide for Future Developers](#11-taste-guide-for-future-developers)

---

## 1. Design Principles

These are non-negotiable. Every component, every animation, every color choice must pass these tests.

### 1a. "Glance, then depth"
The user should understand the state of their life in under 3 seconds. Details are always one interaction away — hover, click, expand — but the surface is calm and scannable.

**In practice:**
- Top-level views show 3-5 focal points, never 10+.
- Numbers and badges are meaningful (not "you have 847 emails").
- Progressive disclosure everywhere: collapsed by default, expandable on demand.

### 1b. "Warmth signals urgency"
Color temperature communicates time pressure. Warm colors (amber, red, orange) = needs attention soon. Cool colors (blue, slate, gray) = reference, evergreen, or done. This replaces explicit "URGENT" labels and priority badge stacking.

**In practice:**
- The `timeliness` field drives accent color, not `priority_score`.
- A birthday (pink, warm) and a 2FA code (amber, ephemeral) both feel warm. A newsletter archive link (slate, cool) feels calm.
- Never use red for non-urgent decorative elements. Red means "overdue" or "error."

### 1c. "One thing at a time"
Each view has a single primary question it answers:
- **Home:** "What should I do right now?"
- **Inbox:** "What came in and what matters?"
- **Calendar:** "What's coming up?"

If a component doesn't help answer the view's primary question, it belongs in a different view or in a collapsible section below the fold.

### 1d. "Earned complexity"
Features appear as users need them. Empty states are thoughtful, not apologetic. Tooltips teach. Sections with no data are hidden, not shown with "Nothing here yet" placeholders. A new user's Home should look clean, not skeleton-loaded.

### 1e. "No orphan UI"
Every piece of information connects to an action or a source. A priority score without a "why" tooltip is useless. An event without a "view email" link is dead-end. A stat without context is noise.

---

## 2. Color & Visual Language

### 2a. Timeliness-Driven Accent System

This is the most important visual change. We retire the current approach of coloring by priority score and instead color by **timeliness nature** (already stored on emails as `timeliness` JSONB).

| Timeliness | Accent Color (Light) | Accent Color (Dark) | Meaning |
|-----------|---------------------|---------------------|---------|
| `ephemeral` | `amber-500` | `amber-400` | Relevant for minutes (2FA, OTP). Hot. |
| `asap` | `red-500` | `red-400` | Needs action now. Urgent heat. |
| `today` | `orange-400` | `orange-300` | Relevant today, cooling tomorrow. |
| `upcoming` | `blue-500` | `blue-400` | Points to a future moment. Calm anticipation. |
| `reference` | `slate-400` | `slate-500` | File it, retrieve later. Neutral. |
| `evergreen` | `emerald-400` | `emerald-500` | No time pressure. Cool, settled. |

**Implementation:** Create a utility `getTimelinessColor(nature: string)` that returns Tailwind classes. Use this everywhere an email or event is displayed.

### 2b. Event Type Colors (Calendar)

Consistent across all views where dates/events appear:

| Event Type | Color | CSS Variable |
|-----------|-------|-------------|
| `event` / `appointment` | `blue-500` | `--event-type-event` |
| `deadline` / `expiration` | `amber-500` | `--event-type-deadline` |
| `birthday` / `anniversary` | `pink-500` | `--event-type-personal` |
| `payment_due` | `emerald-500` | `--event-type-financial` |
| `follow_up` | `purple-500` | `--event-type-followup` |
| `recurring` | `indigo-400` | `--event-type-recurring` |

### 2c. Signal Indicators (Replacing Badge Stacking)

Currently, inbox rows can accumulate too many badges (category + priority + timeliness + sender type + signal strength). We simplify to **max 2 visual indicators per row**:

1. **Left border color** = timeliness accent (always present, subtle)
2. **One badge** = the most relevant metadata for this email:
   - If `reply_worthiness === 'must_reply'` → "Reply needed" badge
   - Else if `golden_nugget_count > 0` → diamond icon
   - Else if `sender_type === 'broadcast'` → newsletter icon
   - Else → category badge (the default)

The priority score, full timeliness label, sender type, signal strength are all **available on hover/tooltip** but not visible in the default row.

### 2d. Card Redesign

The current `Card` component (`src/components/ui/card.tsx`) is vanilla shadcn — a single visual weight with no built-in variants, no accent support, and no hover behavior. Every consumer hacks in `className="cursor-pointer hover:shadow-md transition-shadow"` individually. This is the root of visual inconsistency across views.

**Upgrade the Card component itself** to support elevation and accent as first-class props:

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'flat' | 'raised' | 'elevated';  // default: 'raised'
  accent?: string;           // timeliness color class, e.g. 'amber-500'
  accentPosition?: 'left' | 'top';  // default: 'left'
  interactive?: boolean;     // adds hover elevation bump + cursor
}
```

**Three elevation levels:**

| Level | Use | Base Style | Hover (when interactive) |
|-------|-----|------------|--------------------------|
| **Flat** | Background sections, completed items, muted context | `bg-muted/50 border-0 shadow-none` | `hover:bg-muted/80 hover:shadow-sm` |
| **Raised** | Default cards, list items, most content | `bg-card border shadow-sm` | `hover:shadow` (subtle bump) |
| **Elevated** | Active/focused items, the "Now" card, modals | `bg-card border shadow-md ring-1 ring-primary/10` | No change (already prominent) |

**Accent border:** When `accent` is set, renders a 3px colored left border (or top border). This replaces ad-hoc `border-l-4 border-amber-500` scattered across components. The accent color comes from the timeliness system (§2a).

**Interactive behavior:** When `interactive` is true, the card:
- Gets `cursor-pointer`
- Gains `transition-shadow duration-200`
- Bumps one elevation level on hover (Flat → Raised feel, Raised → shadow bump)
- Gets `focus-visible:ring-2 ring-primary` for keyboard navigation

**Migration:** Update all existing Card usages to use props instead of className hacks. This is a gradual process — the component remains backward-compatible (className still works).

**CardTitle adjustment:** Currently `text-2xl` which is too large for most card contexts. Change default to `text-lg font-semibold`. Page-level titles should use their own heading elements, not CardTitle.

**CardHeader padding:** Currently `p-6` which creates excessive whitespace on compact cards. Change to `p-4 pb-2` for tighter defaults. Consumers can override via className.

**CardContent padding:** Currently `p-6 pt-0`. Change to `p-4 pt-0` to match tighter header.

---

## 3. New Shared Infrastructure

These components and utilities must be built **before** any view work begins. They're the foundation.

### 3a. Tooltip Component (`src/components/ui/tooltip.tsx`)

**Does not currently exist.** Build on Radix UI Tooltip primitive (already a project dependency via other Radix components).

Three visual tiers:

| Tier | Trigger | Style | Use Case |
|------|---------|-------|----------|
| **Info** | Hover (300ms delay) | Small, gray background, 1-2 lines text | Badge explanations, icon labels |
| **Preview** | Hover (400ms delay) | Card-like, white bg, shadow-lg, up to 5 lines | Email subject previews, score breakdowns |
| **Rich** | Hover (stays open while inside) | Card with sections, optional actions | Priority reasoning, score details with breakdown |

**API shape:**
```tsx
<Tooltip content="Simple text" />
<Tooltip variant="preview">
  <TooltipTrigger>...</TooltipTrigger>
  <TooltipContent>
    <p className="font-medium">Email subject here</p>
    <p className="text-muted-foreground text-sm">From sender · 2h ago</p>
  </TooltipContent>
</Tooltip>
```

### 3b. Animation Utilities (`src/lib/utils/animations.ts`)

A small set of reusable CSS class generators and Tailwind utilities. Not a library — just helpers.

```typescript
// Staggered entrance for lists
export function staggeredEntrance(index: number, baseDelay = 50): string
// Returns: `animate-in fade-in slide-in-from-bottom-2` with calculated delay

// Pulse for attention
export function attentionPulse(): string
// Returns: `animate-pulse-once` (a custom keyframe, single pulse, not infinite)

// Smooth number transitions (for stat counters)
// This is a React hook, not just CSS
export function useAnimatedNumber(value: number, duration = 300): number
```

**Add to `globals.css`:**
```css
@keyframes fade-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-once {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes confetti-pop {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
```

### 3c. Timeliness Color Utility (`src/lib/utils/timeliness.ts`)

```typescript
export function getTimelinessAccent(nature: TimelinessNature): {
  border: string;   // e.g., "border-l-amber-500"
  bg: string;       // e.g., "bg-amber-50 dark:bg-amber-950/20"
  text: string;     // e.g., "text-amber-600 dark:text-amber-400"
  dot: string;      // e.g., "bg-amber-500"
}

export function getTimelinessLabel(nature: TimelinessNature): string
// "ephemeral" → "Time-sensitive", "asap" → "Needs action", etc.
```

### 3d. Empty State Component (`src/components/shared/EmptyState.tsx`)

Reusable across all views. Contextual messages, optional illustration, optional action button.

```tsx
<EmptyState
  variant="clean-desk"    // | "no-events" | "no-results" | "first-time"
  title="Nothing urgent"
  subtitle="Your desk is clear. Nice work."
  action={{ label: "Browse inbox", href: "/inbox" }}  // optional
/>
```

Variants determine the illustration/icon. Keep illustrations simple — Lucide icons composed together or simple SVG line art, not heavy illustrations.

### 3e. StatCard Component (`src/components/shared/StatCard.tsx`)

Replaces ad-hoc stat displays across Home and Calendar:

```tsx
<StatCard
  label="Today"
  value={3}
  subtitle="Next in 2 hours"       // optional
  trend={{ direction: 'up', label: '2 more than yesterday' }} // optional, for tooltips
  accent="blue"                     // optional color accent
/>
```

Features:
- Animated number transition on value change (via `useAnimatedNumber`)
- Tooltip on hover shows trend context
- Compact and full-width variants

### 3f. Keyboard Shortcut Hints

A small utility to show shortcut badges on interactive elements:

```tsx
<ShortcutHint keys={['⌘', 'K']} /> // renders as small gray badges
```

Displayed inline next to search bars, action buttons. Only visible on desktop (hidden on touch devices via media query).

---

## 4. Home View Redesign

**Primary question:** "What should I do right now?"

### 4a. Current State → Target State

**Remove from above-the-fold:**
- Email Summary Card (move to Inbox tab)
- Style Inspiration Card (move to Discoveries)
- Saved Links Card (move to Discoveries)
- News Brief Card (move to Inbox > Discoveries)
- Insights Card (move to Inbox > Discoveries)
- Profile completion nudge (move to sidebar or settings)
- "Explore More" navigation grid (redundant with sidebar)

**Keep, refined:**
- Daily Briefing Header → simplified
- Today Schedule → becomes part of the Trifecta
- Pending Tasks → becomes part of the Trifecta
- Idea Sparks → below the fold, collapsible
- Daily Review → below the fold, collapsible
- Active Projects → below the fold, collapsible

### 4b. The Trifecta Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Good morning, Hazel. 3 things need you today.                  │
│  Thursday, March 5, 2026                                        │
├───────────────────┬───────────────────┬─────────────────────────┤
│                   │                   │                         │
│   🔴 NOW          │   📅 TODAY        │   📊 THIS WEEK         │
│                   │                   │                         │
│   Reply to        │   10:00 AM        │   4 events              │
│   Sarah Chen      │   Team standup    │   2 deadlines           │
│   re: Q2 proposal │                   │   7 tasks pending       │
│                   │   2:30 PM         │   ───────────           │
│   [Reply] [Skip]  │   Client call     │   Busiest: Wednesday    │
│                   │   ···             │                         │
│                   │   1 deadline      │                         │
│                   │   due by 5 PM     │                         │
│                   │                   │                         │
├───────────────────┴───────────────────┴─────────────────────────┤
│                                                                 │
│  ▸ Pending Tasks (5)                                           │
│  ▸ Idea Sparks (3 new)                                         │
│  ▸ Daily Review (12 emails to scan)                            │
│  ▸ Active Projects (2)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Now Card:**
- Pulls from `useHubPriorities()` — the single #1 item across all types.
- Shows: item title, source context (sender name for emails, project name for tasks), 1-2 action buttons.
- Timeliness accent as left border color.
- Tooltip on the card → shows the AI reasoning for why this is #1.
- If no urgent items → shows "Clean desk" empty state (elevated card style with check icon).
- **Keyboard shortcut:** `N` to act on the Now item (reply, complete, etc.).

**Today Card:**
- Merges `useEvents()` + `useExtractedDates()` where date = today.
- Vertical timeline: time on left, title on right, color-coded dots by event type.
- Max 5 items shown, "+N more" link if overflow.
- Tooltip per item → shows location, source, RSVP status.
- Tap/click an item → navigates to Calendar with that item highlighted (`?highlight=id`).

**This Week Card:**
- Stat cluster: counts by type (events, deadlines, tasks due).
- Each count is a `StatCard`-style number with label.
- "Busiest day" callout — the day this week with the most items. Helps the user plan.
- Tooltip per stat → lists the top 3 items in that bucket.
- Click a stat → navigates to Calendar filtered to that type.

### 4c. Below-the-Fold Sections

All collapsible. Collapsed sections show: header + badge count. Expanded shows content.

**Pending Tasks:**
- Top 5 by urgency_score descending.
- Checkbox to complete with optimistic UI + subtle check animation.
- Small progress ring next to section header: tasks completed today / total tasks.
- Tooltip per task → shows source email subject, deadline, estimated time.

**Idea Sparks:**
- Horizontal scroll / carousel (arrow keys on desktop, swipe on mobile).
- Each card: idea text + relevance tag + save/dismiss buttons.
- Faint lightbulb watermark on cards (decorative, very low opacity).
- Only show ideas with `confidence >= 0.7`.
- Tooltip → "From: [sender name] — [email subject]"

**Daily Review:**
- Compact list of scan-worthy emails (from `useReviewQueue()`).
- Quick "Mark reviewed" action per item.
- Completion celebration when all reviewed: brief check animation + "All caught up" message.

**Active Projects:**
- Horizontal card strip (scrollable if > 3).
- Each card: project name, color dot, item count, progress bar (completed/total items).
- Click → navigates to `/tasks?project=id`.

### 4d. Component Architecture

```
src/components/home/
  DailyBriefingHeader.tsx    ← refactor: simpler, pulls user_context for name
  NowCard.tsx                ← NEW: single top-priority item
  TodayCard.tsx              ← refactor from TodaySchedule.tsx: timeline format
  ThisWeekCard.tsx            ← NEW: stat cluster with tooltips
  PendingTasksList.tsx       ← refactor: add progress ring, tooltips
  IdeaSparksCarousel.tsx     ← refactor from IdeaSparksCard.tsx: carousel layout
  DailyReviewCard.tsx        ← minor refactor: completion celebration
  ActiveProjectsStrip.tsx    ← refactor from ActiveProjectsWidget.tsx: horizontal strip
  CollapsibleSection.tsx     ← NEW shared wrapper for below-fold sections
  index.ts
```

**Files to remove:**
- `EmailSummaryCard.tsx` → content moves to Inbox
- `InsightsCard.tsx` → content lives in Inbox > Discoveries
- `NewsBriefCard.tsx` → content lives in Inbox > Discoveries
- `SavedLinksCard.tsx` → content lives in Inbox > Discoveries
- `StyleInspirationCard.tsx` → content moves to Inbox > Discoveries
- `SummaryItemCapture.tsx` → evaluate if still needed; likely moves to Inbox

---

## 5. Inbox View Redesign

**Primary question:** "What came in and what matters?"

### 5a. Current State → Target State

The 5-tab structure stays. The tabs work. What changes:

1. **Email row visual language** — timeliness-driven, simplified badges
2. **Hover interactions** — quick-action tray, preview tooltips
3. **Category sidebar** — sparklines and smarter stats
4. **Search** — keyboard shortcut hint, better empty state
5. **InboxFeed.tsx** — broken up from 682 lines into composable pieces

### 5b. Email Row Redesign (InboxEmailRow.tsx)

**Current:** ~476 lines with many inline badge decisions.
**Target:** ~200 lines, delegating to extracted sub-components.

```
┌─────────────────────────────────────────────────────────────────┐
│ ▌ 🟢 SC  Sarah Chen          Re: Q2 Budget Review    2h  ⭐ 💎 │
│ ▌      Acme Corp    Quick summary text appears here...    Reply │
└─────────────────────────────────────────────────────────────────┘
  │                                                           │
  │← timeliness                          hover reveals tray →│
     left border
```

**Layout per row:**
- **Left border** (3px): timeliness accent color. Always visible. Subtle but scannable.
- **Avatar** (32px circle): sender avatar/logo. Broadcast senders get a small newspaper overlay icon in bottom-right corner.
- **Sender line:** sender name (bold if unread) + company/domain in muted text.
- **Subject + snippet:** subject in medium weight, snippet truncated in muted text, single line.
- **Time:** relative ("2h", "yesterday", "Mar 1").
- **Indicators** (right side, max 2):
  - Star (if starred) — always visible.
  - One contextual icon: 💎 (golden nuggets), 📩 (must reply), or category badge as fallback.
- **Hover tray:** slides in from right on hover — Archive, Star, Snooze buttons. 200ms slide transition.

**Unread treatment:** font-weight bump (`font-medium` → `font-semibold`) + blue dot before sender name. No background color change — keeps the timeliness border as the dominant visual signal.

### 5c. Email Card Redesign (InboxEmailCard.tsx)

**Current:** ~530 lines.
**Target:** ~250 lines. Card view for when the user wants more context per email.

```
┌───────────────────────────────────────────┐
│ ▌ Sarah Chen · Acme Corp           2h ⭐  │
│ ▌                                         │
│ ▌ Re: Q2 Budget Review                   │
│ ▌ "The revised numbers look good. Can     │
│ ▌  we schedule a call to finalize..."     │
│ ▌                                         │
│ ▌ 💎 2 golden nuggets  ·  📩 Reply needed │
│ ▌                                         │
│ ▌ [Reply]  [Archive]  [Snooze ▾]         │
└───────────────────────────────────────────┘
```

- Left border = timeliness color (same as row view).
- Card shows: gist (from `emails.gist` field) instead of raw snippet when available.
- Golden nuggets listed if present (from `golden_nugget_count`).
- Action buttons always visible (no hover needed in card view).
- Tooltip on sender name → contact card preview (name, company, relationship type, email count).

### 5d. InboxFeed.tsx Breakup

The current 682-line `InboxFeed.tsx` splits into:

```
src/components/inbox/
  InboxFeed.tsx              ← orchestrator only (~150 lines)
  EmailList.tsx              ← renders the list/card items (~100 lines)
  InboxSearchBar.tsx         ← search input + keyboard hint (~80 lines)
  InboxEmptyState.tsx        ← contextual empty states (~60 lines)
  EmailHoverActions.tsx      ← the slide-in action tray (~80 lines)
  EmailRowIndicators.tsx     ← badge/icon decision logic (~60 lines)
```

### 5e. Category Sidebar Enhancements

**Add to each category row:**
- **Sparkline** (7-day email volume trend): tiny inline SVG, 40px wide. Generated from email `date` field grouped by day. No library needed — just 7 points connected by a path.
- **"New today" badge:** small count next to the total count.
- **Tooltip** → top sender in that category + most recent subject line.

### 5f. Priority Tab Enhancement

Group emails by `reply_worthiness` instead of flat score list:

```
── Must Reply (3) ──────────────
  [email rows with red-ish accent]

── Should Reply (7) ────────────
  [email rows with amber accent]

── Optional (12) ───────────────
  [email rows with neutral accent]
```

Each row shows a mini score breakdown on hover (tooltip):
- Importance: ████░░ 0.72
- Action needed: █████░ 0.85
- Missability: ██░░░░ 0.35

Uses the taxonomy v2 fields: `importance_score`, `action_score`, `missability_score`.

### 5g. Categories Tab Enhancement

Category cards become richer:

```
┌────────────────────────┐
│ 🏢 Work          12 ⬆3 │
│                        │
│  👤👤👤  top senders    │
│  ▁▂▃▅▇█▅  7-day trend │
│                        │
│  Latest: "Q2 planning" │
└────────────────────────┘
```

- Overlapping avatar cluster (top 3 senders by email count in that category).
- 7-day sparkline (same as sidebar).
- Latest subject line preview.
- Grid: 4 columns on desktop (xl+), 3 on lg, 2 on md, 1 on mobile.

### 5h. Discoveries Tab

Consolidate the four separate feed components into a unified feed with type indicators:

```
src/components/inbox/
  DiscoveriesFeed.tsx       ← orchestrator with filter pills (~120 lines)
  DiscoveryItem.tsx         ← unified item component (~150 lines)
```

Each discovery item shows:
- Type icon (lightbulb for ideas, brain for insights, newspaper for news, link for links).
- Content text.
- Confidence badge: only shown if < 0.7 ("Low confidence" in muted text).
- Source attribution: "From [sender] · [email subject]" as subtitle.
- Save/dismiss actions.
- Tooltip on source → email preview.

**Remove separate feed files:** `IdeasFeed.tsx`, `InsightsFeed.tsx`, `NewsFeed.tsx`, `LinksFeed.tsx` — replaced by the unified `DiscoveryItem.tsx`.

---

## 6. Calendar View Redesign

**Primary question:** "What's coming up?"

### 6a. Stats Banner → 3 Smart Stats

Replace the current 5-stat grid with 3 `StatCard` components:

| Stat | Value | Subtitle (dynamic) | Tooltip |
|------|-------|--------------------|---------|
| **Today** | count | "Next: [title] in 2h" or "All clear" | Lists today's items |
| **This Week** | count | "Busiest: Wednesday (4)" | Lists this week by day |
| **Overdue** | count (red if >0) | "Oldest: [title] from 3 days ago" | Lists overdue items |

### 6b. List View → Timeline Style

Replace flat card list with a vertical timeline:

```
  TODAY ─────────────────────────────────
  │
  ● 10:00 AM   Team standup              🔵 event
  │             Virtual · Google Meet link
  │
  ● 2:30 PM    Client review call        🔵 event
  │             Acme Corp · Office
  │
  ◆ 5:00 PM    Submit Q2 report          🟡 deadline
  │             From: boss@company.com
  │
  TOMORROW ──────────────────────────────
  │
  ● All day     Mom's birthday            🩷 birthday
  │              🎂
  │
  ◆ 11:59 PM   Insurance payment due     🟢 payment
  │             Auto-pay enabled
  │
  THIS WEEK ─────────────────────────────
  ...
```

**Implementation details:**
- Vertical line: `border-l-2 border-muted` with absolute-positioned dots.
- Dots: circles for events, diamonds for deadlines/payments. Color by event type (see §2b).
- Date group headers are sticky (`sticky top-0 bg-background z-10`).
- Each item is clickable → expands inline to show full detail + actions (no modal for list view).
- Overdue section pinned to very top with `bg-red-50 dark:bg-red-950/30` background strip.
- **Tooltip per item** → shows source (Google Calendar vs. email-extracted) + original email link if applicable.

**Event detail expansion (inline):**
```
  ● 2:30 PM    Client review call                    🔵
  │             ┌──────────────────────────────────┐
  │             │ Location: 123 Main St, Suite 400 │
  │             │ RSVP by: Tomorrow (⚠️ 18h left) │
  │             │ Source: Email from Sarah Chen     │
  │             │                                  │
  │             │ [Add to Calendar] [Dismiss] [📧] │
  │             └──────────────────────────────────┘
```

### 6c. Calendar Grid View → Heat Map

Enhance the month grid:

- **Heat map intensity:** days with more items get progressively darker backgrounds:
  - 0 items: `bg-transparent`
  - 1-2 items: `bg-blue-50 dark:bg-blue-950/20`
  - 3-4 items: `bg-blue-100 dark:bg-blue-950/40`
  - 5+ items: `bg-blue-200 dark:bg-blue-900/50`
- **Type dots:** up to 3 small colored dots below the day number. Colors per event type.
- **Today ring:** `ring-2 ring-primary` instead of background highlight.
- **Click a day** → expands the row below to show that day's events inline. Like an accordion row in the grid. Avoids modal.
- **Tooltip per day** → count breakdown: "2 events, 1 deadline, 1 birthday"

### 6d. Birthday Delight

When today has a birthday:
- Event card gets a small cake icon (🎂) and subtle `confetti-pop` animation on first render.
- Tooltip → "[Name]'s birthday! Relationship: [family/friend/colleague]"
- If the contact has `birthday_year_known`, show age in tooltip.

### 6e. RSVP Urgency

Events with RSVP deadlines show countdown:
- \> 48h away: muted text "RSVP by [date]"
- 24-48h: amber text "RSVP by tomorrow"
- < 24h: red text "RSVP today!" with subtle pulse animation
- Past RSVP deadline: red strikethrough "RSVP closed [date]"

### 6f. Component Architecture

```
src/components/calendar/
  CalendarStats.tsx          ← refactor: 3 StatCards instead of 5
  TimelineView.tsx           ← NEW: the vertical timeline list
  TimelineItem.tsx           ← NEW: individual timeline entry + expansion
  TimelineGroup.tsx          ← NEW: date group header (Today, Tomorrow, etc.)
  CalendarGrid.tsx           ← NEW: month grid with heat map
  CalendarDayCell.tsx        ← NEW: individual day cell with dots + expansion
  CalendarDayExpansion.tsx   ← NEW: expanded day detail row
  EventActions.tsx           ← EXTRACT from current inline code
  RsvpBadge.tsx              ← NEW: RSVP countdown logic
  index.ts
```

**Remove:** The current calendar page likely has all-in-one rendering. The EventCard component from the page itself gets refactored into TimelineItem.

---

## 7. Delight & Micro-Interactions

### 7a. Entrance Animations

**List items:** Staggered `fade-slide-up` animation. Each item delays by `index * 50ms`, capped at 300ms (items 7+ appear instantly). Applied via the `staggeredEntrance()` utility.

**Cards (Trifecta, Stats):** `fade-slide-up` with 100ms delay between cards. Slightly more movement (12px instead of 8px) for a "settling in" feel.

**Rule:** Animations only play on **initial mount**, not on re-renders or data updates. Use a `useRef` flag to track if the component has mounted before.

### 7b. State Change Transitions

**Task completion:** Checkbox check → row fades to `opacity-50` over 200ms → slides up and out over 300ms (after 500ms pause so the user sees the check). Progress ring animates smoothly.

**Star toggle:** Star icon does a small rotation (0° → 72° → 0°) over 200ms. Gives a sparkle feel without being over the top.

**Archive:** Row slides right and fades out over 300ms. Subtle "whoosh" feeling.

### 7c. Empty States

Every section needs a thoughtful empty state. These are not errors — they're accomplishments or starting points.

| Section | Empty State Message | Tone |
|---------|-------------------|------|
| Now Card | "Nothing urgent. Your desk is clear." | Calm, congratulatory |
| Today Card | "No events today. A blank canvas." | Peaceful |
| This Week Card | "Light week ahead." | Relieving |
| Pending Tasks | "All caught up. Take a breath." | Accomplished |
| Idea Sparks | "Ideas will appear as we read your emails." | Patient |
| Daily Review | "All reviewed. Nice work." | Proud |
| Inbox (filtered) | "No emails in [category]." | Neutral |
| Calendar (no events) | "Nothing on the horizon." | Calm |
| Overdue | (section hidden entirely) | — |

### 7d. Streak / Progress Indicators

**Where:** Next to the greeting in `DailyBriefingHeader`.

**Logic:** Count consecutive days where the user has completed all "must_reply" emails + overdue tasks. Computed client-side from `emails.reviewed_at` and `actions.completed_at` timestamps.

| Streak | Display |
|--------|---------|
| 0-2 days | Nothing shown |
| 3-6 days | 🔥 small flame icon + "3-day streak" tooltip |
| 7-13 days | 🔥🔥 + "1 week streak!" tooltip |
| 14+ days | 🔥🔥🔥 + "[N]-day streak!" tooltip |

**Important:** This is computed on the client from existing data. No database changes needed. Don't over-invest here — it's a small delight, not a feature.

### 7e. Keyboard Shortcuts

| Shortcut | Action | View |
|----------|--------|------|
| `⌘K` / `Ctrl+K` | Focus search | Inbox |
| `N` | Act on Now item | Home |
| `J` / `K` | Navigate list up/down | Inbox, Calendar |
| `E` | Archive selected | Inbox |
| `S` | Star/unstar selected | Inbox |
| `?` | Show all shortcuts | All |

Show shortcut hints as small gray badges next to relevant UI elements. Only visible on desktop (detect via `@media (hover: hover)`).

**Implementation:** A simple `useKeyboardShortcuts` hook that registers/unregisters listeners. Not a framework — just a utility.

---

## 8. Database & Algorithm Changes

### 8a. No New Tables Needed

The redesign is entirely a presentation-layer change. All data we need already exists.

### 8b. No New Database Columns Needed

All fields referenced in this plan already exist:
- `emails.timeliness` (JSONB) → drives the timeliness color system
- `emails.golden_nugget_count` → drives the diamond indicator
- `emails.surface_priority` → drives the Now card
- `emails.importance_score`, `action_score`, `missability_score` → drives Priority tab breakdown
- `emails.reply_worthiness` → drives Priority tab grouping
- `emails.gist` → drives card view content
- `extracted_dates.date_type` → drives calendar event type colors
- `contacts.sender_type`, `broadcast_subtype` → drives sender type indicators
- `contacts.birthday`, `birthday_year_known` → drives birthday delight

### 8c. Algorithm Adjustments

**Sparkline data query:** New API endpoint or hook enhancement needed.

```sql
-- 7-day email volume by category
SELECT
  category,
  date_trunc('day', date) as day,
  count(*) as count
FROM emails
WHERE user_id = $1
  AND date >= now() - interval '7 days'
GROUP BY category, day
ORDER BY day
```

This can be a new RPC function or computed client-side from existing email data (depending on data volume). **Recommendation:** Add a Supabase RPC function `get_category_sparklines(user_id uuid)` that returns this aggregation. It's a read query with no schema changes.

**Busiest day calculation:** Pure client-side computation from `useEvents()` + `useExtractedDates()` data. Group by day-of-week, find max. No database change needed.

**Streak calculation:** Pure client-side. Query `actions` where `status = 'completed'` and `completed_at` is within consecutive days. Query `emails` where `reply_worthiness = 'must_reply'` and `reviewed_at` is set. Count consecutive days backward from today. No database change needed.

### 8d. New API Endpoints / RPC Functions

| Endpoint | Purpose | Type |
|----------|---------|------|
| `get_category_sparklines` | 7-day email volume per category | Supabase RPC |
| Enhancement to `useHubPriorities` | Return single top item for Now card (already returns ranked list — just use `[0]`) | No change needed |

**Total new database work: 1 RPC function.** Everything else is presentation.

---

## 9. Cleanup & Removal

### 9a. Components to Delete

| File | Reason | Replacement |
|------|--------|-------------|
| `src/components/home/EmailSummaryCard.tsx` | Content belongs in Inbox | `InboxSummaryBanner.tsx` (already exists) |
| `src/components/home/InsightsCard.tsx` | Duplicates Inbox > Discoveries | `DiscoveryItem.tsx` |
| `src/components/home/NewsBriefCard.tsx` | Duplicates Inbox > Discoveries | `DiscoveryItem.tsx` |
| `src/components/home/SavedLinksCard.tsx` | Duplicates Inbox > Discoveries | `DiscoveryItem.tsx` |
| `src/components/home/StyleInspirationCard.tsx` | Duplicates Inbox > Discoveries | `DiscoveryItem.tsx` |
| `src/components/home/SummaryItemCapture.tsx` | Depends on removed cards | Evaluate: remove or move |
| `src/components/inbox/IdeasFeed.tsx` | Replaced by unified DiscoveryItem | `DiscoveryItem.tsx` |
| `src/components/inbox/InsightsFeed.tsx` | Replaced by unified DiscoveryItem | `DiscoveryItem.tsx` |
| `src/components/inbox/NewsFeed.tsx` | Replaced by unified DiscoveryItem | `DiscoveryItem.tsx` |
| `src/components/inbox/LinksFeed.tsx` | Replaced by unified DiscoveryItem | `DiscoveryItem.tsx` |

### 9b. Code to Refactor (Reduce Line Count)

| File | Current Lines | Target Lines | Strategy |
|------|--------------|--------------|----------|
| `InboxFeed.tsx` | 682 | ~150 | Extract EmailList, SearchBar, EmptyState, HoverActions, RowIndicators |
| `InboxEmailCard.tsx` | 530 | ~250 | Extract action buttons, indicator logic |
| `InboxEmailRow.tsx` | 476 | ~200 | Extract hover tray, indicator logic, use shared utilities |
| `CategoryIcon.tsx` | 394 | ~200 | Simplify — likely has redundant mapping logic |
| `PriorityEmailList.tsx` | 434 | ~200 | Extract group headers, score visualization |
| `IdeaSparksCard.tsx` | 336 | ~180 | Carousel extraction, remove inline styles |
| `InboxSummaryBanner.tsx` | 328 | ~150 | Use StatCard component |
| `DailyReviewCard.tsx` | 308 | ~180 | Extract review item component |

### 9c. Dead Code Audit

Before starting any phase, run a dead code check:
1. Search for components that are imported nowhere.
2. Search for hooks that are called nowhere.
3. Search for API routes with no client callers.
4. Remove anything found.

### 9d. CSS Cleanup

- Remove unused category color variables if categories are consolidated.
- Remove any inline style objects — convert to Tailwind classes.
- Consolidate animation keyframes into `globals.css` (don't scatter across components).

---

## 10. Phased Implementation

### Phase 1: Foundation + Home (1 session) — ✅ COMPLETE

**Goal:** Build shared infrastructure, redesign Home to the Trifecta layout.

**Completed March 2026.** 28 files changed, 1565 insertions, 2172 deletions. All 16 steps done:
- Radix tooltip (3-tier), Card elevation/accent/interactive, timeliness utility, animation utilities
- EmptyState, StatCard, CollapsibleSection shared components
- NowCard, TodayCard, ThisWeekCard (Trifecta layout)
- Home page restructured: Trifecta above fold, 4 CollapsibleSections below
- 6 components deleted (EmailSummaryCard, InsightsCard, NewsBriefCard, SavedLinksCard, StyleInspirationCard, SummaryItemCapture)
- ActiveProjectsWidget O(n) optimization, IdeaSparksCard config slimmed, DailyReviewCard ActionIcon extraction
- TypeScript clean, all files under 400 lines

### Phase 2: Inbox Polish (1 session) — ✅ COMPLETE

**Goal:** Timeliness-driven rows, hover actions, InboxFeed breakup.

**Completed March 2026.** 15 Phase 2 inbox components created/refactored:
- InboxFeed broken from 682→264 lines (orchestrator only) with 7 extracted components: EmailList, InboxSearchBar, InboxEmptyState, EmailHoverActions, EmailRowIndicators, CategorySparkline, DiscoveryItem
- Email rows have timeliness left border via `getTimelinessAccent()`
- Hover action tray slides in from right (Archive/Star/Snooze)
- Badge cascade: star + one contextual indicator (must_reply → nuggets → broadcast → category), max 2 per row
- InboxEmailCard shows gist + timeliness accent, action buttons wired with useCallback
- PriorityEmailList groups by reply_worthiness (must/should/optional) with CollapsibleSection + score breakdown tooltips
- Category sparklines (7-day inline SVG) in CategorySummaryPanel
- CategoryOverview enhanced with avatar clusters + sparklines
- DiscoveryItem unified component for insights/news/links (legacy feeds kept for backward compat)
- ⌘K keyboard shortcut hint in search bar (desktop only)
- InboxSummaryBanner refactored to use StatCard (168 lines)
- CategoryIcon simplified to config-object pattern (394 lines, SVG icons irreducible)
- React.memo on InboxEmailRow, InboxEmailCard, DiscoveryItem, PriorityRow
- useMemo for sparklines, priority grouping, filtering; useCallback on all handlers
- All files under 400 lines, file-level JSDoc on every file

### Phase 3: Calendar Redesign (1 session) — ✅ COMPLETE

**Goal:** Timeline list view, heat map grid, birthday delight.

**Completed March 2026.** 14 files changed, 1729 insertions, 1179 deletions. 10 new components + 3 refactored:
- `event-colors.ts` utility: unified event type → color/shape mapping (circle for events, diamond for deadlines/payments) with Lucide icons per §2b
- `types.ts`: `CalendarItem` unified type + `mergeToCalendarItems()` merging EventData + ExtractedDate + `groupByTimePeriod()` for timeline groups
- `RsvpBadge`: 4-tier urgency countdown (>48h muted, 24-48h amber, <24h red pulsing, past strikethrough) with info tooltip
- `TimelineGroup`: sticky date group headers with overdue red background strip (`bg-red-50 dark:bg-red-950/30`)
- `TimelineItem`: vertical timeline with colored dots (circle/diamond by type), inline expansion, birthday confetti-pop on mount, RSVP badge, lazy expansion via hasExpanded ref. Wrapped in React.memo
- `TimelineView`: groups items by 6 time periods (Overdue → Later), staggered entrance animation with hasMounted guard, empty state, expansion management (one at a time)
- `CalendarDayCell`: heat map intensity (4 levels by item count), up to 3 type dots, today ring (`ring-2 ring-primary`), tooltip with count breakdown. Wrapped in React.memo
- `CalendarDayExpansion`: accordion row below grid week with item list, type dots, compact EventActions
- `CalendarGrid`: month navigation, 7-column grid with week rows, day expansion below selected week, date-fns for calendar math, itemsByDate indexed with useMemo, color legend
- `EventActions`: extracted action buttons with compact (icon-only + tooltips) and full (text + icon) modes, snooze dropdown with presets
- `CalendarStats` refactored: 5 hand-rolled stat cards → 3 `StatCard` components with smart subtitles (today: next-up item, week: busiest day, overdue: oldest item)
- Calendar page refactored: 1,234 → 297 lines thin orchestrator. Merged data via `mergeToCalendarItems()`, type filter pills, view toggle, URL params preserved (?view=, ?type=, ?highlight=)
- Barrel exports updated with all 9 new component exports + CalendarItem type
- All files under 400 lines, file-level JSDoc on every file
- useMemo for data grouping, heat map computation, stat calculations; useCallback on all handlers
- Also fixed pre-existing duplicate export in `priority-reassessment.ts`

### Phase 4: Delight & Polish (1 session) ✅ COMPLETE

**Goal:** Animations, keyboard shortcuts, streak indicator, final cleanup.

**Steps:**
1. ✅ Implement `useKeyboardShortcuts` hook — single document listener, form-element guard, modifier support
2. ✅ Add keyboard shortcuts (⌘K, N, J/K, E, S, ?) — wired into Home, Inbox, Calendar pages
3. ✅ Add shortcut hint badges (ShortcutHint component) — NowCard `N`, EmailHoverActions `E`/`S`
4. ✅ Implement streak calculation + display in greeting — weekend-aware, 3-tier emoji display
5. ✅ Add entrance animations to EmailList + PriorityEmailList — `hasMounted` ref guard, cap at item 6
6. ✅ Add state change transitions — slide-out-right (archive), star-spin (star), slide-out-down (dismiss)
7. ✅ Dead code audit — no console.log, no unused imports in changed files
8. ✅ Performance: single keydown listener, stagger only on mount, exit animations before DOM removal
9. ✅ ShortcutsModal accessible via `?` key globally (GlobalShortcuts in root layout)

**New files:** `useKeyboardShortcuts.ts` (125 lines), `ShortcutHint.tsx` (33), `ShortcutsModal.tsx` (107), `GlobalShortcuts.tsx` (38), `streak.ts` (112)
**Modified:** 13 files — all under 400 lines

**Verification:** Keyboard navigation works. Animations are smooth and don't replay on re-render. Streak shows after 3 days. No dead code remains.

---

## 11. Taste Guide for Future Developers

This section is for any developer (human or AI) picking up this codebase. These are the aesthetic and UX principles that define IdeaBox's feel.

### What "good" looks like here

**Spacing:** Generous but not wasteful. Cards have `p-4` or `p-5` internal padding. Sections have `gap-6` between them. Items in a list have `gap-3`. The page breathes.

**Typography:** Two visual weights at most on any row. Sender name is `font-semibold`, everything else is `font-normal` or `text-muted-foreground`. Never use `font-bold` except for page titles. Subject lines are `text-sm`, never `text-xs` (too small to scan).

**Color restraint:** Most of the interface is grayscale. Color appears at the edges — left borders, small dots, accent badges. If you squint at the page, you should see a calm gray canvas with purposeful color accents. If it looks like a rainbow, you've gone too far.

**Motion:** Small, fast, purposeful. 200ms is the default duration. 300ms is the max for any transition. Nothing bounces. Nothing overshoots. Things fade and slide — that's it. If an animation makes you notice it, it's too much.

**Icons:** Lucide icons only. Size 16 (`w-4 h-4`) for inline/badge use, 20 (`w-5 h-5`) for section headers. Never larger unless it's an empty state illustration.

**Tooltips:** Show information the user didn't know they wanted. A priority score badge's tooltip doesn't say "Priority: 82" — it says "High priority because: deadline tomorrow, VIP client, 3-day-old thread." The tooltip adds context, not repetition.

**Empty states:** Never say "No data." Always frame emptiness positively or informatively. "Nothing urgent" is better than "No priority items." "Ideas will appear as we analyze your emails" is better than "No ideas yet."

**Hover states:** Every interactive element responds to hover within 1 frame. Cards lift slightly (shadow change). Rows highlight with `bg-muted/50`. Buttons have clear `:hover` styles. If the user can click it, it must look clickable before they click.

### What "bad" looks like here

- **Badge stacking:** 4+ badges on a single row. If you need that many signals, something is wrong with the hierarchy.
- **Nested loading states:** A skeleton inside a skeleton. Load the whole section or show nothing.
- **Console.log in committed code.** Use the logger. Always.
- **Inline styles.** Use Tailwind classes. No exceptions.
- **`any` types.** Use `unknown` and narrow, or define a proper type.
- **Components over 400 lines.** Extract. Always.
- **Animations on every render.** Use a `hasMounted` ref to only animate on first appearance.
- **Modals when inline expansion works.** Modals break context. Expand inline when possible.
- **Gray text on gray background.** Muted text must have enough contrast. Check with squinted eyes.

### When in doubt

1. Does this help the user answer the view's primary question faster? If not, hide it or move it.
2. Would I notice this animation if I wasn't looking for it? If yes, tone it down.
3. Can I remove this element and the page still makes sense? If yes, remove it.
4. Is this tooltip teaching the user something new? If not, remove it.
5. Is this component under 400 lines? If not, split it.

---

## File Reference

**New files to create:**
```
src/components/ui/tooltip.tsx
src/lib/utils/timeliness.ts
src/lib/utils/animations.ts
src/components/shared/EmptyState.tsx
src/components/shared/StatCard.tsx
src/components/shared/CollapsibleSection.tsx
src/components/shared/ShortcutHint.tsx
src/components/home/NowCard.tsx
src/components/home/TodayCard.tsx
src/components/home/ThisWeekCard.tsx
src/components/home/IdeaSparksCarousel.tsx
src/components/home/ActiveProjectsStrip.tsx
src/components/inbox/EmailList.tsx
src/components/inbox/InboxSearchBar.tsx
src/components/inbox/InboxEmptyState.tsx
src/components/inbox/EmailHoverActions.tsx
src/components/inbox/EmailRowIndicators.tsx
src/components/inbox/DiscoveryItem.tsx
src/components/calendar/TimelineView.tsx
src/components/calendar/TimelineItem.tsx
src/components/calendar/TimelineGroup.tsx
src/components/calendar/CalendarGrid.tsx
src/components/calendar/CalendarDayCell.tsx
src/components/calendar/CalendarDayExpansion.tsx
src/components/calendar/RsvpBadge.tsx
src/components/calendar/EventActions.tsx
src/hooks/useKeyboardShortcuts.ts
src/hooks/useAnimatedNumber.ts
```

**Files to delete:**
```
src/components/home/EmailSummaryCard.tsx
src/components/home/InsightsCard.tsx
src/components/home/NewsBriefCard.tsx
src/components/home/SavedLinksCard.tsx
src/components/home/StyleInspirationCard.tsx
src/components/home/SummaryItemCapture.tsx  (evaluate first)
src/components/inbox/IdeasFeed.tsx
src/components/inbox/InsightsFeed.tsx
src/components/inbox/NewsFeed.tsx
src/components/inbox/LinksFeed.tsx
```

**Database additions:**
```sql
-- Single new RPC function for sparkline data
CREATE OR REPLACE FUNCTION get_category_sparklines(p_user_id uuid)
RETURNS TABLE(category text, day date, count bigint) AS $$
  SELECT
    category,
    date_trunc('day', date)::date as day,
    count(*)
  FROM emails
  WHERE user_id = p_user_id
    AND date >= now() - interval '7 days'
  GROUP BY category, date_trunc('day', date)
  ORDER BY category, day;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

That's it. One function. No schema migrations.
