# Phase 2 Prompt: Inbox Polish

> Copy everything below the line into a new Claude Code session.

---

## Task

You are implementing **Phase 2** of the IdeaBox core view redesign. Read `docs/VIEW_REDESIGN_PLAN.md` thoroughly before writing any code — it is your source of truth for design decisions, color systems, component APIs, and architectural principles.

**Goal:** Redesign the Inbox view with timeliness-driven email rows, hover action trays, InboxFeed breakup into composable pieces, Priority tab grouping by reply worthiness, unified Discoveries tab, and category sparklines.

## What Phase 1 Already Built (DO NOT REBUILD)

Phase 1 created shared infrastructure you should reuse:

- **`src/components/ui/tooltip.tsx`** — 3-tier tooltip (info/preview/rich) built on `@radix-ui/react-tooltip`. App root already wrapped in `<TooltipProvider>`.
- **`src/components/ui/card.tsx`** — `elevation` (flat/raised/elevated), `accent` (Tailwind color), `accentPosition` (left/top), `interactive` (hover lift + pointer) props.
- **`src/lib/utils/timeliness.ts`** — `getTimelinessAccent(nature)` returns `{ border, bg, text, dot }` Tailwind classes for 6 timeliness natures. `getTimelinessLabel(nature)` returns human label.
- **`src/lib/utils/animations.ts`** — `staggeredEntrance(index, baseDelay)` returns className + style. `useAnimatedNumber(value, duration)` hook with rAF + cleanup.
- **`src/components/shared/EmptyState.tsx`** — 4 variants (clean-desk, no-events, no-results, first-time) with Lucide icons.
- **`src/components/shared/StatCard.tsx`** — Animated number, optional tooltip, trend indicator, click handler.
- **`src/components/shared/CollapsibleSection.tsx`** — CSS grid-template-rows animation, `hasExpanded` ref for lazy rendering.
- **`src/app/globals.css`** — Keyframes: fade-slide-up, pulse-once, confetti-pop. Utility classes: animate-fade-slide-up, animate-pulse-once, animate-confetti-pop.

## Important References

- **Design plan:** `docs/VIEW_REDESIGN_PLAN.md` — read sections 1 (Principles), 2 (Visual Language), 5 (Inbox), 7 (Delight), 9 (Cleanup), and 11 (Taste Guide)
- **Coding standards:** `docs/CODING_STANDARDS.md` — follow all rules, especially the 400-line limit, emoji logging, and modular service layer
- **Decisions log:** `docs/DECISIONS.md` — check for any relevant prior decisions before making new ones
- **Current Inbox page:** `src/app/(auth)/inbox/page.tsx`
- **Current Inbox components:** `src/components/inbox/` — read every file you plan to modify before touching it
- **Inbox barrel exports:** `src/components/inbox/index.ts`
- **UI primitives:** `src/components/ui/` — especially tooltip.tsx, card.tsx
- **Shared components:** `src/components/shared/` — EmptyState, StatCard, CollapsibleSection
- **Utilities:** `src/lib/utils/timeliness.ts`, `src/lib/utils/animations.ts`
- **Hooks:** `src/hooks/` — especially `useEmails.ts`, `useCategoryStats.ts`, `useCategoryPreviews.ts`, `useHubPriorities.ts`

## Current Inbox File Sizes (for reference)

| File | Current Lines | Target Lines |
|------|--------------|--------------|
| `InboxFeed.tsx` | 682 | ~150 (orchestrator only) |
| `InboxEmailRow.tsx` | 476 | ~200 |
| `InboxEmailCard.tsx` | 530 | ~250 |
| `PriorityEmailList.tsx` | 434 | ~200 |
| `CategoryOverview.tsx` | 277 | ~200 |
| `CategorySummaryPanel.tsx` | 245 | ~180 |
| `CategoryIcon.tsx` | 394 | ~200 |
| `InboxSummaryBanner.tsx` | 328 | ~150 |

## Steps (execute in order)

### Step 1: Break up `InboxFeed.tsx` (682 lines → ~150 lines)

Read the current file first. Extract into composable pieces:

```
src/components/inbox/
  InboxFeed.tsx              ← orchestrator only (~150 lines)
  EmailList.tsx              ← renders the list/card items (~100 lines)
  InboxSearchBar.tsx         ← search input + keyboard hint (~80 lines)
  InboxEmptyState.tsx        ← contextual empty states (~60 lines)
  EmailHoverActions.tsx      ← the slide-in action tray (~80 lines)
  EmailRowIndicators.tsx     ← badge/icon decision logic (~60 lines)
```

`InboxFeed.tsx` becomes a thin orchestrator: data fetching (useEmails), search state, view toggle, and composition of the extracted components. All rendering logic moves out.

### Step 2: Refactor `InboxEmailRow.tsx` (476 → ~200 lines)

Read the current file first. Redesign the email row layout:

**New layout per row:**
- **Left border** (3px): timeliness accent color via `getTimelinessAccent()`. Always visible.
- **Avatar** (32px circle): sender avatar/logo. Broadcast senders get a small newspaper overlay icon.
- **Sender line:** sender name (bold if unread) + company/domain in muted text.
- **Subject + snippet:** subject in medium weight, snippet truncated in muted text, single line.
- **Time:** relative ("2h", "yesterday", "Mar 1").
- **Indicators** (right side, max 2): use `EmailRowIndicators.tsx` from Step 1.
  - Star (if starred) — always visible.
  - One contextual icon: 💎 (golden nuggets), 📩 (must reply), or category badge fallback.
- **Hover tray:** import `EmailHoverActions.tsx` — slides in from right with Archive/Star/Snooze. 200ms transition.

**Unread treatment:** `font-medium` → `font-semibold` + blue dot before sender name. No background color change.

Delegate badge logic to `EmailRowIndicators.tsx`. Delegate hover actions to `EmailHoverActions.tsx`.

### Step 3: Create `EmailHoverActions.tsx`

Slide-in action tray component (~80 lines):

```tsx
interface EmailHoverActionsProps {
  emailId: string;
  isStarred: boolean;
  onArchive: (id: string) => void;
  onStar: (id: string) => void;
  onSnooze: (id: string) => void;
}
```

- 3 icon buttons: Archive (ArchiveIcon), Star (StarIcon), Snooze (ClockIcon)
- Positioned absolute right, slides in from right on parent hover
- `translate-x-full` → `translate-x-0` with `transition-transform duration-200`
- Star button toggles filled/outline state
- Tooltip on each button (use info tier)

### Step 4: Create `EmailRowIndicators.tsx`

Badge decision logic component (~60 lines):

```tsx
interface EmailRowIndicatorsProps {
  email: {
    is_starred?: boolean;
    reply_worthiness?: string;
    golden_nugget_count?: number;
    sender_type?: string;
    category?: string;
  };
}
```

Decision cascade (max 2 indicators):
1. Star (if starred) — always shown
2. One contextual icon (in priority order):
   - `reply_worthiness === 'must_reply'` → mail reply icon with "Reply needed" tooltip
   - `golden_nugget_count > 0` → diamond icon with count tooltip
   - `sender_type === 'broadcast'` → newspaper icon
   - fallback → category badge (use CategoryIcon)

### Step 5: Refactor `InboxEmailCard.tsx` (530 → ~250 lines)

Read the current file first. Upgrade the card view:

- Left border = timeliness accent (same as row view, use `getTimelinessAccent()`)
- Show `gist` field (from emails table) instead of raw snippet when available
- Golden nuggets listed if `golden_nugget_count > 0`
- Action buttons always visible (no hover needed in card view): Reply, Archive, Snooze
- Tooltip on sender name → contact card preview (name, company, relationship type, email count). Use "preview" tier tooltip.
- Extract indicator logic to use `EmailRowIndicators.tsx`
- Use Card component with `accent` prop for the timeliness border

### Step 6: Refactor `PriorityEmailList.tsx` (434 → ~200 lines)

Read the current file first. Group emails by `reply_worthiness` instead of flat score list:

```
── Must Reply (3) ──────────────
  [email rows with red-ish accent]

── Should Reply (7) ────────────
  [email rows with amber accent]

── Optional (12) ───────────────
  [email rows with neutral accent]
```

Each row shows a mini score breakdown on hover (tooltip, "preview" tier):
- Importance: visual bar + score (from `importance_score`)
- Action needed: visual bar + score (from `action_score`)
- Missability: visual bar + score (from `missability_score`)

Use the taxonomy v2 fields already on emails. Group with `useMemo`. Use `CollapsibleSection` for each group (defaultOpen for Must Reply, collapsed for Optional).

### Step 7: Add sparklines to `CategorySummaryPanel.tsx`

Read the current file first. For each category row, add:

- **Sparkline** (7-day email volume trend): tiny inline SVG, ~40px wide. Generated from email `date` field grouped by day.
  - No library needed — just 7 points connected by an SVG `<path>` or `<polyline>`.
  - Normalize values to 0-16px height range.
  - Color: `text-muted-foreground` (subtle, not distracting).
- **"New today" badge:** small count badge if there are unread emails from today.
- **Tooltip** on the row → top sender in that category + most recent subject line. Use "preview" tier.

**Data:** Compute sparkline data client-side from the emails already fetched by `useEmails()`. Group by `category` + `date` (last 7 days), count per day. Wrap in `useMemo`.

### Step 8: Create Supabase RPC `get_category_sparklines`

Create the SQL function for efficient server-side sparkline data (optional optimization — the client-side approach from Step 7 works first, this is for when the dataset is large):

```sql
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

Create the migration file at `scripts/migration-046-category-sparklines.sql`. Add a hook or API route to call it. But **start with client-side computation** in Step 7 — only wire the RPC if you have time.

### Step 9: Consolidate Discoveries tab

Read `DiscoveriesFeed.tsx` (121 lines) first — it already orchestrates sub-tabs. Now create a unified item component:

**Create `src/components/inbox/DiscoveryItem.tsx` (~150 lines):**

```tsx
interface DiscoveryItemProps {
  type: 'insight' | 'news' | 'link';
  title: string;
  content: string;
  confidence?: number;
  sourceEmail?: { sender: string; subject: string; id: string };
  onSave: () => void;
  onDismiss: () => void;
}
```

Each discovery item shows:
- Type icon (Brain for insights, Newspaper for news, Link for links) — use Lucide
- Content text
- Confidence badge: only if `< 0.7` → "Low confidence" in muted text
- Source attribution: "From [sender] · [email subject]" as subtitle, clickable
- Save/dismiss action buttons
- Tooltip on source → email preview (use "preview" tier)

**Update `DiscoveriesFeed.tsx`** to use `DiscoveryItem` for rendering instead of delegating to separate feed components.

**Delete these files** (after confirming no other imports outside DiscoveriesFeed):
- `src/components/inbox/IdeasFeed.tsx` (385 lines)
- `src/components/inbox/InsightsFeed.tsx` (255 lines)
- `src/components/inbox/NewsFeed.tsx` (240 lines)
- `src/components/inbox/LinksFeed.tsx` (301 lines)

**Important:** `IdeasFeed.tsx` may still be imported from the Tasks page or elsewhere. Search the entire codebase before deleting. If it's used elsewhere, keep it but still create `DiscoveryItem.tsx` for the Discoveries tab.

### Step 10: Enhance `CategoryOverview.tsx` (277 → ~200 lines)

Read the current file first. Upgrade category cards:

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

- Overlapping avatar cluster: top 3 senders by email count. Use `SenderLogo` component, overlapped with negative margin (`-ml-2`).
- 7-day sparkline (reuse the same sparkline component/logic from Step 7).
- Latest subject line preview (truncated, muted text).
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
- Use Card with `interactive` prop for hover lift.

### Step 11: Add keyboard shortcut hint to search bar

In `InboxSearchBar.tsx` (created in Step 1), add:
- A `⌘K` / `Ctrl+K` shortcut hint badge (small gray pill) inside the search input on the right side.
- Only visible on desktop: wrap in a container with `hidden @media(hover:hover):inline-flex` or use the `hover:hover` media query.
- The actual keyboard shortcut handler can be a simple `useEffect` that focuses the search input on ⌘K/Ctrl+K.

### Step 12: Update `InboxSummaryBanner.tsx` (328 → ~150 lines)

Read the current file first. Refactor to use `StatCard` from shared components instead of hand-rolled stat displays. This should dramatically cut line count.

### Step 13: Reduce `CategoryIcon.tsx` (394 → ~200 lines)

Read the current file first. It likely has redundant mapping logic or verbose switch statements. Simplify:
- Convert to a config object `CATEGORY_ICONS: Record<string, { icon: LucideIcon; color: string }>` instead of a switch/if-else chain.
- Single render function that reads from the config.

### Step 14: Update barrel exports

Update `src/components/inbox/index.ts`:
- Add new exports: `EmailList`, `InboxSearchBar`, `InboxEmptyState`, `EmailHoverActions`, `EmailRowIndicators`, `DiscoveryItem`
- Remove deleted exports: `IdeasFeed`, `InsightsFeed`, `NewsFeed`, `LinksFeed` (only if those files were deleted in Step 9)
- Keep `FeedControls` if still used

### Step 15: Verify

1. Run `npx tsc --noEmit` — fix any TypeScript errors
2. Run `npm run build` — ensure the build passes
3. Check that no file exceeds 400 lines
4. Verify all new files have proper file-level JSDoc comments
5. Verify timeliness borders appear on email rows and cards
6. Verify hover action tray slides in correctly
7. Verify Priority tab groups by reply_worthiness

## Performance Requirements

Follow these rules in every component you write:

1. **Memoize expensive computations.** Any filtering, sorting, or grouping of arrays (emails, sparkline data, priority groups) must be wrapped in `useMemo` with proper dependency arrays. Example: the reply_worthiness grouping in PriorityEmailList, sparkline data computation.

2. **Memoize callbacks passed to children.** Use `useCallback` for functions passed as props, especially onClick/onAction handlers in EmailHoverActions and DiscoveryItem.

3. **No animations on re-render.** Entrance animations (`staggeredEntrance`, `fade-slide-up`) must only play on initial mount. Use a `useRef(false)` flag — set it to true after first render, skip animation classes on subsequent renders.

4. **React.memo on list items.** `InboxEmailRow`, `InboxEmailCard`, and `DiscoveryItem` should be wrapped in `React.memo` since they render in lists and receive stable props. The current `InboxEmailRow` already uses `React.memo` — preserve this.

5. **Avoid layout thrash.** Don't read DOM measurements during render. Hover actions use CSS transforms, not JS-computed positions.

6. **SVG sparklines are pure.** The sparkline rendering should be a pure function or memoized component — it receives 7 numbers and returns an SVG. No side effects.

7. **Image/avatar loading.** Sender avatars use `loading="lazy"` and explicit width/height to prevent layout shift.

## Logging Requirements

Every new component and utility must log appropriately using the project's logger:

```typescript
import { createLogger } from '@/lib/utils/logger';
const logger = createLogger('ComponentName');
```

**What to log:**
- **Extracted components** (EmailList, InboxSearchBar, EmailHoverActions, EmailRowIndicators, InboxEmptyState): No logging — these are UI primitives.
- **InboxFeed.tsx** (refactored): Keep existing logging for data load, search, and view changes. Log when switching between list/card view.
- **PriorityEmailList.tsx**: Log group counts on data load (`logger.debug('Priority groups', { must: N, should: N, optional: N })`).
- **DiscoveryItem.tsx**: Log save/dismiss actions (`logger.info('Discovery item saved', { type, id })`).
- **CategorySummaryPanel.tsx**: No new logging — sparklines are pure computation.
- **Sparkline utility**: No logging — pure function.

## Comment Standards

**Where to comment:**
- File-level: Brief JSDoc at the top of each new file explaining purpose and which plan section it implements.
- Complex logic: Explain WHY, not WHAT. E.g., the reply_worthiness grouping rationale, the badge decision cascade priority, the sparkline normalization math.
- Non-obvious decisions: If you choose approach A over approach B, leave a comment explaining why.
- Hook dependencies: If a `useMemo`/`useCallback` dependency array is non-obvious, explain what triggers recalculation.

**Where NOT to comment:**
- Obvious Tailwind classes
- Standard React patterns (useState, useEffect with obvious deps)
- Import statements
- Props that are self-explanatory from their types

**Format:**
```typescript
/**
 * EmailHoverActions — slide-in action tray for email rows on hover.
 * Implements §5b "Email Row Redesign" from VIEW_REDESIGN_PLAN.md.
 *
 * Positioned absolute-right inside the row. Uses CSS transform for
 * the slide animation (no JS measurement needed).
 */
```

## Final Checklist

Before committing:
- [ ] `InboxFeed.tsx` is under 200 lines (orchestrator only)
- [ ] 5 new extracted components exist (EmailList, InboxSearchBar, InboxEmptyState, EmailHoverActions, EmailRowIndicators)
- [ ] Email rows have timeliness left border via `getTimelinessAccent()`
- [ ] Hover action tray slides in from right on email row hover
- [ ] Badge decision logic uses the cascade: must_reply → nuggets → broadcast → category
- [ ] Max 2 visual indicators per email row
- [ ] `InboxEmailCard.tsx` shows gist and uses timeliness accent
- [ ] `PriorityEmailList.tsx` groups by reply_worthiness with CollapsibleSection
- [ ] Score breakdown tooltip on priority items (importance, action, missability bars)
- [ ] Category sparklines render in `CategorySummaryPanel.tsx`
- [ ] `DiscoveryItem.tsx` created with unified display for insights/news/links
- [ ] 4 separate feed files deleted (or kept if still imported elsewhere)
- [ ] `CategoryOverview.tsx` has avatar clusters and sparklines
- [ ] Keyboard shortcut hint (⌘K) visible in search bar on desktop
- [ ] `InboxSummaryBanner.tsx` uses StatCard (under 200 lines)
- [ ] `CategoryIcon.tsx` simplified (under 250 lines)
- [ ] `inbox/index.ts` barrel export updated
- [ ] No file exceeds 400 lines
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Build passes (`npm run build`)
- [ ] Every new file has a file-level JSDoc comment
- [ ] React.memo on list item components
- [ ] `useMemo` for sparkline computation, priority grouping, and any filtering/sorting
- [ ] Entrance animations only play on mount (hasMounted ref guard)

Commit with message: `feat(inbox): phase 2 — timeliness rows, hover actions, feed breakup, unified discoveries`
