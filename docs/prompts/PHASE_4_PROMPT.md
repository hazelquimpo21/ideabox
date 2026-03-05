# Phase 4 Prompt: Delight & Polish

> Copy everything below the line into a new Claude Code session.

---

## Task

You are implementing **Phase 4** of the IdeaBox core view redesign. Read `docs/VIEW_REDESIGN_PLAN.md` thoroughly before writing any code — it is your source of truth for design decisions, color systems, component APIs, and architectural principles.

**Goal:** Add keyboard navigation, entrance animations across all list views, state change transitions, streak gamification, shortcut hint badges, and perform a final dead code audit + performance check. This is the polishing phase that makes the redesign feel complete.

## What Phases 1–3 Already Built (DO NOT REBUILD)

Phase 1 created shared infrastructure you should reuse:

- **`src/components/ui/tooltip.tsx`** — 3-tier tooltip (info/preview/rich) built on `@radix-ui/react-tooltip`. App root already wrapped in `<TooltipProvider>`.
- **`src/components/ui/card.tsx`** — `elevation` (flat/raised/elevated), `accent` (Tailwind color), `accentPosition` (left/top), `interactive` (hover lift + pointer) props.
- **`src/lib/utils/timeliness.ts`** — `getTimelinessAccent(nature)` returns `{ border, bg, text, dot }` Tailwind classes for 6 timeliness natures. `getTimelinessLabel(nature)` returns human label.
- **`src/lib/utils/animations.ts`** — `staggeredEntrance(index, baseDelay)` returns className + style. `useAnimatedNumber(value, duration)` hook with rAF + cleanup.
- **`src/components/shared/EmptyState.tsx`** — 4 variants (clean-desk, no-events, no-results, first-time) with Lucide icons.
- **`src/components/shared/StatCard.tsx`** — Animated number, optional tooltip, trend indicator, click handler.
- **`src/components/shared/CollapsibleSection.tsx`** — CSS grid-template-rows animation, `hasExpanded` ref for lazy rendering.
- **`src/app/globals.css`** — Keyframes: fade-slide-up, pulse-once, confetti-pop. Utility classes: animate-fade-slide-up, animate-pulse-once, animate-confetti-pop.

Phase 2 created inbox components:

- **`src/components/inbox/EmailHoverActions.tsx`** — Slide-in action tray pattern (CSS translate-x transition).
- **`src/components/inbox/EmailRowIndicators.tsx`** — Badge decision cascade pattern (max 2 indicators).
- **`src/components/inbox/InboxSearchBar.tsx`** — Already has `⌘K` / `Ctrl+K` keyboard shortcut for focus.
- **`src/components/inbox/EmailList.tsx`** — Email list rendering (145 lines).
- **`src/components/inbox/PriorityEmailList.tsx`** — Groups by reply_worthiness (280 lines).

Phase 3 created calendar components:

- **`src/lib/utils/event-colors.ts`** — Event type → color/shape/icon mapping. `getEventTypeConfig(type)`, `SNOOZE_PRESETS`, `TYPE_FILTER_OPTIONS`.
- **`src/components/calendar/types.ts`** — `CalendarItem` unified type, `mergeToCalendarItems()`, `groupByTimePeriod()`.
- **`src/components/calendar/TimelineView.tsx`** — Already has staggered entrance animations with `hasMounted` ref guard.
- **`src/components/calendar/TimelineItem.tsx`** — Has birthday `confetti-pop` animation with mount guard. Wrapped in React.memo.
- **`src/components/calendar/CalendarGrid.tsx`** — Month grid with heat map and day expansion.
- **`src/components/calendar/EventActions.tsx`** — Action buttons with compact/full modes.
- **`src/components/calendar/CalendarStats.tsx`** — 3 StatCards with smart subtitles.

## Important References

- **Design plan:** `docs/VIEW_REDESIGN_PLAN.md` — read sections 7 (Delight & Micro-Interactions), 10 (Phased Implementation → Phase 4), 11 (Taste Guide)
- **Coding standards:** `docs/CODING_STANDARDS.md` — follow all rules, especially the 400-line limit, emoji logging, and modular service layer
- **Decisions log:** `docs/DECISIONS.md` — check for any relevant prior decisions before making new ones
- **Current home page:** `src/app/(auth)/home/page.tsx` — orchestrator for home view
- **DailyBriefingHeader:** `src/components/home/DailyBriefingHeader.tsx` (~93 lines) — streak display target
- **NowCard:** `src/components/home/NowCard.tsx` — top priority card, target for `N` key shortcut
- **Inbox page:** `src/app/(auth)/inbox/page.tsx` — for keyboard shortcut integration
- **Hooks:** `src/hooks/useEvents.ts`, `src/hooks/useActions.ts`, `src/hooks/useEmails.ts` — for streak data queries
- **Utilities:** `src/lib/utils/animations.ts` — existing animation infrastructure

## Steps (execute in order)

### Step 1: Create `src/hooks/useKeyboardShortcuts.ts` (~150 lines)

Global keyboard shortcut manager:

```typescript
interface ShortcutConfig {
  key: string;              // e.g. 'k', 'n', 'j', '?'
  modifiers?: ('meta' | 'ctrl' | 'shift' | 'alt')[];
  handler: () => void;
  description: string;      // for help modal
  view?: string;            // 'home' | 'inbox' | 'calendar' | 'global'
  enabled?: boolean;        // disable conditionally
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void;
export function getShortcutDefinitions(): ShortcutConfig[];
```

**Requirements:**
- Register a single `keydown` listener on `document` (not per-component)
- Ignore shortcuts when focus is inside `<input>`, `<textarea>`, `<select>`, or `[contenteditable]`
- Support modifier keys (metaKey, ctrlKey)
- Clean up listener on unmount
- `getShortcutDefinitions()` returns the full list of available shortcuts (for the help modal)

### Step 2: Create `src/components/shared/ShortcutHint.tsx` (~40 lines)

Small keyboard shortcut badge component:

```tsx
interface ShortcutHintProps {
  keys: string[];           // ['⌘', 'K'] or ['N'] or ['J']
  className?: string;
}
```

- Render as inline `<kbd>` elements
- Styled: `px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border/50 text-muted-foreground`
- Only visible on desktop: wrap in a container with `hidden md:inline-flex` (or use `@media (hover: hover)`)
- Use this consistently wherever shortcut hints appear

### Step 3: Create `src/components/shared/ShortcutsModal.tsx` (~120 lines)

Help modal triggered by `?` key:

```tsx
interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}
```

- Shows shortcuts grouped by view:
  - **HOME**: `N` — Act on top priority
  - **INBOX**: `⌘K` — Focus search, `J` — Next email, `K` — Previous email, `E` — Archive, `S` — Star/unstar
  - **CALENDAR**: `J` — Next item, `K` — Previous item
  - **GLOBAL**: `?` — Show shortcuts
- Use Radix Dialog or simple overlay with `Escape` to close
- Each shortcut row: `<ShortcutHint>` + description text
- Title: "Keyboard Shortcuts"
- Dismiss: `Escape` key, click outside, or close button

### Step 4: Integrate keyboard shortcuts into pages

**Home page** (`src/app/(auth)/home/page.tsx`):
- `N` key: scroll to NowCard and trigger its primary action (or navigate to the now item's detail)
- Register via `useKeyboardShortcuts` at page level

**Inbox page** (`src/app/(auth)/inbox/page.tsx`):
- `J` / `K`: Navigate up/down in the email list (track `selectedIndex` state, scroll into view)
- `E`: Archive the currently selected email
- `S`: Star/unstar the currently selected email
- `⌘K` already works (implemented in Phase 2's InboxSearchBar) — do NOT re-implement

**Calendar page** (`src/app/(auth)/calendar/page.tsx`):
- `J` / `K`: Navigate up/down in the timeline list (track `selectedIndex` state, scroll into view)

**Global** (root layout or a shared provider):
- `?`: Toggle shortcuts modal
- Place `<ShortcutsModal>` in a layout component or the root layout

### Step 5: Add shortcut hint badges to existing UI

Update existing components to show keyboard hints where appropriate:
- **NowCard** (`src/components/home/NowCard.tsx`): Show `N` hint on the action button
- **InboxSearchBar** (`src/components/inbox/InboxSearchBar.tsx`): Already has ⌘K hint — verify it uses the new `<ShortcutHint>` component for consistency
- **EmailHoverActions** (`src/components/inbox/EmailHoverActions.tsx`): Add `E` hint on Archive button, `S` hint on Star button (show on hover only)

### Step 6: Create `src/lib/utils/streak.ts` (~80 lines)

Streak calculation utility:

```typescript
export interface StreakResult {
  currentStreak: number;     // consecutive days
  display: string | null;    // null if streak < 3
  emoji: string;             // '🔥', '🔥🔥', '🔥🔥🔥'
}

export function calculateStreak(
  reviewedDates: string[],    // YYYY-MM-DD dates where user reviewed emails
  taskCompletedDates: string[] // YYYY-MM-DD dates where user completed tasks
): StreakResult;
```

**Logic:**
- Count consecutive days backward from today where the user reviewed at least one email OR completed at least one task
- Skip weekends (only count Mon-Fri for streaks) — weekends don't break the streak but don't count
- Display rules:
  - 0–2 days: `display: null` (don't show)
  - 3–6 days: `emoji: '🔥'`, `display: "3-day streak"`
  - 7–13 days: `emoji: '🔥🔥'`, `display: "1-week streak!"`
  - 14+ days: `emoji: '🔥🔥🔥'`, `display: "[N]-day streak!"`

### Step 7: Display streak in DailyBriefingHeader

Update `src/components/home/DailyBriefingHeader.tsx`:
- Call streak utility with data from hooks (email review dates, task completion dates)
- Display streak next to the greeting, right-aligned
- Only show when `display` is not null (3+ day streak)
- Use a tooltip to show streak details
- Animate the fire emoji with a subtle scale on mount

### Step 8: Add entrance animations to inbox list views

Update **`src/components/inbox/EmailList.tsx`**:
- Apply `staggeredEntrance(index)` to each email row
- Use `hasMounted` ref guard — only animate on initial mount, not on data refetch
- Cap stagger at item 6 (items 7+ appear instantly with no delay)

Update **`src/components/inbox/PriorityEmailList.tsx`**:
- Apply `staggeredEntrance` to each priority group section
- Use `hasMounted` ref guard

**Note:** Calendar TimelineView already has staggered entrance from Phase 3 — do not duplicate.

### Step 9: Add state change transition CSS (~50 lines)

Add new keyframes to `src/app/globals.css`:

```css
@keyframes slide-out-right {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(100%); }
}

@keyframes slide-out-down {
  from { opacity: 1; transform: translateY(0); max-height: 100px; }
  to { opacity: 0; transform: translateY(8px); max-height: 0; }
}

@keyframes star-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(72deg); }
}
```

Add utility classes:
```css
.animate-slide-out-right {
  animation: slide-out-right 0.3s ease-in forwards;
}
.animate-slide-out-down {
  animation: slide-out-down 0.2s ease-in forwards;
}
.animate-star-spin {
  animation: star-spin 0.2s ease-out;
}
```

### Step 10: Wire state change animations into components

**Inbox email rows** (archive action):
- When user archives an email, add `animate-slide-out-right` class
- After animation completes (300ms), remove from list
- Use `onAnimationEnd` callback or `setTimeout` to trigger removal

**Inbox email rows** (star toggle):
- When user stars/unstars, add `animate-star-spin` to the star icon
- Remove class after animation (200ms)

**Calendar timeline items** (dismiss):
- When user dismisses an item, add `animate-slide-out-down` class
- After animation (200ms), remove from list

**Implementation pattern:**
```typescript
const [exitingId, setExitingId] = useState<string | null>(null);

const handleArchive = useCallback((id: string) => {
  setExitingId(id);
  setTimeout(() => {
    actualArchive(id);
    setExitingId(null);
  }, 300);
}, [actualArchive]);
```

### Step 11: Dead code audit

Search the codebase for:
1. Unused imports — run `npx tsc --noUnusedLocals --noUnusedParameters 2>&1 | grep calendar\|inbox\|home\|shared`
2. `console.log()` in production code — replace with `createLogger`
3. Orphaned components not imported anywhere
4. Old TODO/FIXME comments that are now resolved
5. Legacy files marked with `@deprecated` — check if safe to delete (e.g., `AllItemsContent`)
6. Remove unused type imports or dead code paths

**Do NOT delete:**
- Legacy feed files (IdeasFeed, InsightsFeed, NewsFeed, LinksFeed) — kept for backward compat per Phase 2 decision
- Any file that has active imports

### Step 12: Update documentation

Update `docs/VIEW_REDESIGN_PLAN.md`:
- Mark Phase 4 as ✅ COMPLETE with summary of what was done

Update `docs/DECISIONS.md`:
- Add Decision #36 for Phase 4

Update `docs/IMPLEMENTATION_STATUS.md`:
- Add View Redesign Phase 4 entry in UI Components section
- Add View Redesign Phase 4 entry in Session History table

### Step 13: Verify

1. Run `npx tsc --noEmit` — fix any TypeScript errors
2. Run `npm run build` (or `node_modules/.bin/next build`) — note: pre-existing ESLint errors in files outside your scope may cause build failure; ensure YOUR files have zero errors
3. Check that no file exceeds 400 lines
4. Verify all new files have proper file-level JSDoc comments
5. Verify `?` key opens shortcuts modal from any page
6. Verify `J`/`K` navigation works in inbox and calendar
7. Verify `N` key acts on top priority from home
8. Verify `E`/`S` shortcuts work in inbox
9. Verify streak shows after 3+ days
10. Verify entrance animations only play on mount
11. Verify archive/star/dismiss animations are smooth
12. Verify no `console.log()` in production code

## Performance Requirements

Follow these rules in every component you write or modify:

1. **Single event listener.** `useKeyboardShortcuts` must register ONE `keydown` listener on `document`, not per-shortcut listeners.
2. **No animations on re-render.** Staggered entrance must only play on initial mount. Use `useRef(false)` flag.
3. **Exit animations before removal.** State change animations must complete before the item is removed from DOM — use `setTimeout` matching animation duration.
4. **Streak computation caching.** `calculateStreak()` must be wrapped in `useMemo` in the component that calls it.
5. **Shortcut handler stability.** Handlers passed to `useKeyboardShortcuts` should be wrapped in `useCallback` to prevent re-registering listeners on every render.

## Logging Requirements

Every new component and utility must log appropriately:

- **`useKeyboardShortcuts`**: Log shortcut activations (`logger.info('Shortcut activated', { key, view })`)
- **`ShortcutsModal`**: No logging (UI primitive)
- **`ShortcutHint`**: No logging (UI primitive)
- **`streak.ts`**: No logging (pure function)
- **DailyBriefingHeader**: Log streak display (`logger.debug('Streak shown', { days, emoji })`)
- **Inbox/Calendar pages**: Log J/K navigation (`logger.debug('Keyboard nav', { direction, index })`)

## Comment Standards

- File-level JSDoc on every new file
- Complex logic: explain WHY (e.g., why skip weekends in streak calculation)
- Hook dependency arrays: explain non-obvious dependencies
- Do NOT comment obvious patterns

## Final Checklist

Before committing:
- [ ] `useKeyboardShortcuts` hook created with single document listener
- [ ] `ShortcutHint` component created for consistent kbd styling
- [ ] `ShortcutsModal` created and accessible via `?` key
- [ ] Home page: `N` key shortcut wired to NowCard
- [ ] Inbox page: `J`/`K` navigation, `E` archive, `S` star shortcuts
- [ ] Calendar page: `J`/`K` navigation in timeline
- [ ] Shortcut hints visible on NowCard action button
- [ ] `streak.ts` utility created with weekend-aware logic
- [ ] Streak displayed in DailyBriefingHeader (3+ days only)
- [ ] Entrance animations added to inbox EmailList and PriorityEmailList
- [ ] State change CSS keyframes added (slide-out-right, slide-out-down, star-spin)
- [ ] Archive animation in inbox rows
- [ ] Star animation in inbox rows
- [ ] Dismiss animation in calendar timeline
- [ ] Dead code audit completed — no unused imports in changed files
- [ ] No `console.log()` in production code
- [ ] All new files have file-level JSDoc
- [ ] All files under 400 lines
- [ ] TypeScript compiles clean
- [ ] Documentation updated (VIEW_REDESIGN_PLAN, DECISIONS, IMPLEMENTATION_STATUS)

Commit with message: `feat(delight): phase 4 — keyboard shortcuts, streak gamification, entrance animations, state transitions`
