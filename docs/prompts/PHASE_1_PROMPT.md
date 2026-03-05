# Phase 1 Prompt: Foundation + Home Redesign

> Copy everything below the line into a new Claude Code session.

---

## Task

You are implementing **Phase 1** of the IdeaBox core view redesign. Read `docs/VIEW_REDESIGN_PLAN.md` thoroughly before writing any code — it is your source of truth for design decisions, color systems, component APIs, and architectural principles.

**Goal:** Build shared UI infrastructure (tooltip, upgraded card, animation utilities, timeliness colors) and redesign the Home view into a focused "Trifecta" layout with collapsible below-fold sections.

## Important References

- **Design plan:** `docs/VIEW_REDESIGN_PLAN.md` — read sections 1 (Principles), 2 (Visual Language), 3 (Infrastructure), 4 (Home), 7 (Delight), 9 (Cleanup), and 11 (Taste Guide)
- **Coding standards:** `docs/CODING_STANDARDS.md` — follow all rules, especially the 400-line limit, emoji logging, and modular service layer
- **Decisions log:** `docs/DECISIONS.md` — check for any relevant prior decisions before making new ones
- **Current Home page:** `src/app/(auth)/home/page.tsx`
- **Current Home components:** `src/components/home/`
- **UI primitives:** `src/components/ui/`
- **Shared components:** `src/components/shared/`
- **Utilities:** `src/lib/utils/`
- **Hooks:** `src/hooks/` — especially `useHubPriorities.ts`, `useEvents.ts`, `useExtractedDates.ts`, `useReviewQueue.ts`

## Steps (execute in order)

### Step 1: Install Radix Tooltip
```bash
npm install @radix-ui/react-tooltip
```

### Step 2: Create `src/components/ui/tooltip.tsx`

Build on `@radix-ui/react-tooltip`. Support three tiers:
- **Info** (default): 300ms delay, small gray bg, 1-2 lines. For icon labels and badge explanations.
- **Preview**: 400ms delay, card-like white bg with shadow-lg, up to 5 lines. For email previews, score breakdowns.
- **Rich**: Stays open while cursor is inside, card with sections. For priority reasoning, detailed breakdowns.

Wrap the Radix primitives into a clean API:
```tsx
// Simple usage
<Tooltip content="Archive this email">
  <Button>...</Button>
</Tooltip>

// Preview usage
<Tooltip variant="preview" content={<PreviewContent />}>
  <Badge>Priority: 82</Badge>
</Tooltip>
```

Export `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent`. Wrap the app's root layout in `<TooltipProvider>`.

### Step 3: Upgrade `src/components/ui/card.tsx`

Read the current file first. Add variant props **without breaking existing usage** (all new props are optional with sensible defaults):

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'flat' | 'raised' | 'elevated';  // default: 'raised'
  accent?: string;           // Tailwind color, e.g. 'amber-500'
  accentPosition?: 'left' | 'top';  // default: 'left'
  interactive?: boolean;     // hover elevation bump + cursor-pointer
}
```

See §2d of the plan for exact styles per elevation level. Also:
- Change `CardTitle` default from `text-2xl` to `text-lg font-semibold`
- Change `CardHeader` padding from `p-6` to `p-4 pb-2`
- Change `CardContent` padding from `p-6 pt-0` to `p-4 pt-0`
- Change `CardFooter` padding from `p-6 pt-0` to `p-4 pt-0`

**Important:** The accent border is rendered via a conditional class like `border-l-[3px] border-l-${accent}` on the Card div. Use Tailwind's arbitrary value syntax if needed, but prefer mapping to known color classes via the timeliness utility.

### Step 4: Create `src/lib/utils/timeliness.ts`

Utility that maps timeliness nature strings to Tailwind classes:

```typescript
type TimelinessNature = 'ephemeral' | 'asap' | 'today' | 'upcoming' | 'reference' | 'evergreen';

export function getTimelinessAccent(nature: TimelinessNature): {
  border: string;   // "border-l-amber-500"
  bg: string;       // "bg-amber-50 dark:bg-amber-950/20"
  text: string;     // "text-amber-600 dark:text-amber-400"
  dot: string;      // "bg-amber-500"
}
```

See §2a of the plan for the exact color mapping. Include a `getTimelinessLabel()` function too.

### Step 5: Create `src/lib/utils/animations.ts`

Small utility file. No external dependencies.

```typescript
// Staggered list entrance classes - returns Tailwind classes with inline style for delay
export function staggeredEntrance(index: number, baseDelay?: number): { className: string; style: React.CSSProperties }

// Hook for animating numbers (stat counters)
export function useAnimatedNumber(value: number, duration?: number): number
```

The `useAnimatedNumber` hook uses `requestAnimationFrame` to smoothly interpolate. Clean up the animation frame on unmount.

### Step 6: Add keyframes to `src/app/globals.css`

Add these after the existing accordion keyframes:

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

Also add the utility classes in the Tailwind layer:
```css
@layer utilities {
  .animate-fade-slide-up {
    animation: fade-slide-up 0.3s ease-out forwards;
  }
  .animate-pulse-once {
    animation: pulse-once 0.4s ease-in-out;
  }
  .animate-confetti-pop {
    animation: confetti-pop 0.35s ease-out forwards;
  }
}
```

### Step 7: Create `src/components/shared/EmptyState.tsx`

Reusable empty state with variants. See §3d of the plan. Use Lucide icons for illustrations. Keep it under 100 lines.

### Step 8: Create `src/components/shared/StatCard.tsx`

Compact stat display using the upgraded Card component. See §3e of the plan. Uses `useAnimatedNumber` for the value. Tooltip on hover shows trend context. Keep it under 120 lines.

### Step 9: Create `src/components/shared/CollapsibleSection.tsx`

Wrapper for below-fold content. Collapsed by default (unless specified). Shows: header text, badge count, chevron indicator. Smooth height animation on expand/collapse (use CSS `grid-template-rows: 0fr` → `1fr` trick for smooth height). Keep it under 80 lines.

### Step 10: Refactor `DailyBriefingHeader.tsx`

Read the current implementation first. Simplify:
- Keep the time-aware greeting logic
- Remove the 3 inline stat badges (the Trifecta cards replace them)
- Add a single summary sentence: "N things need you today." where N = count of must_reply emails + overdue tasks + today's events
- If N = 0, say "Your desk is clear."
- Date in smaller muted text below the greeting

### Step 11: Create `src/components/home/NowCard.tsx`

The single most important item from `useHubPriorities()`. Uses `items[0]` from the hook.

- Card with `elevation="elevated"` and timeliness-based `accent`
- Shows: item title/subject, source context (sender for emails, project for tasks), relative time
- 1-2 action buttons: "Reply" for emails, "Complete" for tasks, etc.
- Tooltip on the card → shows priority reasoning (from the hub item's scoring data)
- Empty state: "Nothing urgent. Your desk is clear." with check icon
- Keyboard hint: small `N` badge in corner (desktop only)
- ~150 lines max

### Step 12: Create `src/components/home/TodayCard.tsx`

Refactor from the current `TodaySchedule.tsx`. Read it first.

- Card with `elevation="raised"`
- Vertical mini-timeline: time on left, title on right, colored dot by event type
- Max 5 items, "+N more" link → navigates to `/calendar`
- Tooltip per item → location, source, RSVP status
- Click item → `/calendar?highlight=id`
- Empty state: "No events today."
- ~180 lines max

### Step 13: Create `src/components/home/ThisWeekCard.tsx`

New component showing aggregate stats for the week.

- Card with `elevation="raised"`
- 3 `StatCard`-style numbers: events count, deadlines count, tasks due count
- "Busiest day" callout: compute from events data, show day name
- Tooltip per stat → top 3 items in that bucket
- Click a stat → `/calendar?filter=type`
- Empty state: "Light week ahead."
- ~150 lines max

### Step 14: Refactor `src/app/(auth)/home/page.tsx`

Read the current file thoroughly. Then restructure to the Trifecta layout:

```tsx
<div className="space-y-6">
  {/* Greeting */}
  <DailyBriefingHeader ... />

  {/* Trifecta — always visible, 3-column grid */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <NowCard />
    <TodayCard />
    <ThisWeekCard />
  </div>

  {/* Below the fold — collapsible sections */}
  <CollapsibleSection title="Pending Tasks" count={taskCount}>
    <PendingTasksList ... />
  </CollapsibleSection>

  <CollapsibleSection title="Idea Sparks" count={ideaCount}>
    <IdeaSparksCard ... />
  </CollapsibleSection>

  <CollapsibleSection title="Daily Review" count={reviewCount}>
    <DailyReviewCard ... />
  </CollapsibleSection>

  <CollapsibleSection title="Active Projects" count={projectCount}>
    <ActiveProjectsWidget ... />
  </CollapsibleSection>
</div>
```

Remove from the page:
- `EmailSummaryCard` import and usage
- `InsightsCard` import and usage
- `NewsBriefCard` import and usage
- `SavedLinksCard` import and usage
- `StyleInspirationCard` import and usage
- `SummaryItemCapture` import and usage (evaluate if it's referenced elsewhere first)
- The "Explore More" navigation grid at the bottom
- `ProfileCompletionNudge` (move to sidebar or settings page if it exists elsewhere; if not, just remove from Home)
- The old "Top Priorities" PriorityCard section (replaced by NowCard)

### Step 15: Delete removed Home components

After confirming they're not imported anywhere else in the codebase (search first!):
- `src/components/home/EmailSummaryCard.tsx`
- `src/components/home/InsightsCard.tsx`
- `src/components/home/NewsBriefCard.tsx`
- `src/components/home/SavedLinksCard.tsx`
- `src/components/home/StyleInspirationCard.tsx`
- `src/components/home/SummaryItemCapture.tsx` (only if not used elsewhere)

Update `src/components/home/index.ts` to remove deleted exports and add new ones.

### Step 16: Update remaining Home components

Go through `PendingTasksList.tsx`, `IdeaSparksCard.tsx`, `DailyReviewCard.tsx`, `ActiveProjectsWidget.tsx` and:
- Replace any ad-hoc Card className hacks with Card props (elevation, interactive, accent)
- Ensure they work correctly inside `CollapsibleSection`
- Fix these specific issues found in code review:

**ActiveProjectsWidget.tsx (160 lines) — HIGH PRIORITY:**
- `getItemCounts()` (lines ~50-55) is called inside a `.map()` loop, filtering the entire `items` array once per project. This is O(n*m). Wrap the computation in `useMemo()` to pre-compute all project counts in a single pass.
- Hardcoded fallback color `'#6b7280'` on lines ~117, 142-144. Extract to a constant like `DEFAULT_PROJECT_COLOR`.

**IdeaSparksCard.tsx (337 lines) — HIGH PRIORITY:**
- `IDEA_TYPE_CONFIG` (lines ~92-178) contains 11 massive inline className strings for type coloring. Extract a utility function or slim config that generates these from a base color name.
- Line ~237: "View all" links to `/tasks` but should link to the ideas/discoveries area (e.g., `/inbox?tab=discoveries`).
- Line ~273: Key uses `${idea.emailId}-${index}` — fragile. Use a stable unique ID if available.

**DailyReviewCard.tsx (309 lines) — LOW PRIORITY:**
- Line ~253 uses `React.createElement()` directly in JSX for action icons. Extract to a small `ActionIcon` helper for readability.
- Category badge fallback (line ~242-248) uses raw string. Minor — use `cn()` consistently.

**PendingTasksList.tsx (227 lines) — LOW PRIORITY:**
- Line ~205: uses template literal for conditional className instead of `cn()`. Minor but inconsistent.

### Step 17: Verify

1. Run `npx tsc --noEmit` — fix any TypeScript errors
2. Run `npm run build` — ensure the build passes
3. Check that no file exceeds 400 lines
4. Verify all new files have proper logging where appropriate (use `createLogger` from `@/lib/utils/logger`)

## Performance Requirements

Follow these rules in every component you write:

1. **Memoize expensive computations.** Any filtering, sorting, or grouping of arrays (events, tasks, priorities) must be wrapped in `useMemo` with proper dependency arrays. Example: the "busiest day" calculation in ThisWeekCard.

2. **Memoize callbacks passed to children.** Use `useCallback` for functions passed as props, especially onClick/onAction handlers.

3. **No animations on re-render.** Entrance animations (`staggeredEntrance`, `fade-slide-up`) must only play on initial mount. Use a `useRef(false)` flag — set it to true after first render, and skip animation classes on subsequent renders.

4. **Lazy sections.** The collapsible sections below the fold should not render their children until expanded for the first time. Use a `hasExpanded` ref to track this — once expanded, keep children mounted (don't unmount on collapse, that would lose state).

5. **Avoid layout thrash.** Don't read DOM measurements (getBoundingClientRect, offsetHeight) during render. If you need measurements, use `useLayoutEffect`.

6. **useAnimatedNumber cleanup.** The requestAnimationFrame loop must cancel via `cancelAnimationFrame` in the cleanup function. Don't leak animation frames.

7. **Image/avatar loading.** If displaying sender avatars, use `loading="lazy"` and provide explicit width/height to prevent layout shift.

## Logging Requirements

Every new component and utility must log appropriately using the project's logger (`@/lib/utils/logger`):

```typescript
import { createLogger } from '@/lib/utils/logger';
const logger = createLogger('NowCard');
```

**What to log:**
- **Utilities** (`timeliness.ts`, `animations.ts`): No logging needed — these are pure functions.
- **Shared components** (`StatCard`, `EmptyState`, `CollapsibleSection`): No logging — these are UI primitives.
- **Home components** (`NowCard`, `TodayCard`, `ThisWeekCard`): Log when data loads, when the user takes an action (click, complete, skip), and when empty state displays. Use `logger.info()` for user actions, `logger.debug()` for data state.
- **Tooltip component**: No logging — too noisy.

Example for NowCard:
```typescript
// On mount with data
logger.debug('Rendering top priority item', {
  itemType: topItem.type,
  itemId: topItem.id,
  score: topItem.priority_score
});

// On user action
logger.info('User acted on Now item', {
  action: 'reply',
  itemId: topItem.id
});

// On empty state
logger.debug('No priority items — showing clean desk state');
```

## Comment Standards

**Where to comment:**
- File-level: Brief JSDoc at the top of each new file explaining purpose and which plan section it implements.
- Complex logic: Explain WHY, not WHAT. E.g., the busiest-day calculation, the timeliness color mapping rationale, the animation mount-guard logic.
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
 * NowCard — displays the single highest-priority item across all types.
 * Implements §4b "The Trifecta Layout" from VIEW_REDESIGN_PLAN.md.
 *
 * Uses elevated card style with timeliness-driven accent border.
 * Falls back to a "clean desk" empty state when no urgent items exist.
 */
```

## Final Checklist

Before committing:
- [ ] `@radix-ui/react-tooltip` installed
- [ ] `TooltipProvider` wrapping the app root layout
- [ ] Card component upgraded with elevation/accent/interactive props
- [ ] Card padding tightened (p-4 not p-6)
- [ ] Timeliness color utility created and tested with all 6 natures
- [ ] Animation keyframes in globals.css
- [ ] useAnimatedNumber cleans up animation frames
- [ ] Staggered entrance only plays on mount (not re-render)
- [ ] CollapsibleSection lazy-renders children
- [ ] Home page shows Trifecta above fold, collapsible sections below
- [ ] 6 Home components deleted (after confirming no other imports)
- [ ] home/index.ts barrel export updated
- [ ] No file exceeds 400 lines
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Build passes (`npm run build`)
- [ ] Every new file has a file-level JSDoc comment
- [ ] Components that render data use `useMemo` for expensive computations

Commit with message: `feat(home): phase 1 — shared infrastructure + trifecta home redesign`
