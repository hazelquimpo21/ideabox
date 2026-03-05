# Phase 3 Prompt: Calendar Redesign

> Copy everything below the line into a new Claude Code session.

---

## Task

You are implementing **Phase 3** of the IdeaBox core view redesign. Read `docs/VIEW_REDESIGN_PLAN.md` thoroughly before writing any code — it is your source of truth for design decisions, color systems, component APIs, and architectural principles.

**Goal:** Redesign the Calendar view with a vertical timeline list view, heat map calendar grid, smart stats banner, RSVP urgency badges, birthday delight animations, and inline event expansion (no modals).

## What Phase 1 & 2 Already Built (DO NOT REBUILD)

Phase 1 created shared infrastructure you should reuse:

- **`src/components/ui/tooltip.tsx`** — 3-tier tooltip (info/preview/rich) built on `@radix-ui/react-tooltip`. App root already wrapped in `<TooltipProvider>`.
- **`src/components/ui/card.tsx`** — `elevation` (flat/raised/elevated), `accent` (Tailwind color), `accentPosition` (left/top), `interactive` (hover lift + pointer) props.
- **`src/lib/utils/timeliness.ts`** — `getTimelinessAccent(nature)` returns `{ border, bg, text, dot }` Tailwind classes for 6 timeliness natures. `getTimelinessLabel(nature)` returns human label.
- **`src/lib/utils/animations.ts`** — `staggeredEntrance(index, baseDelay)` returns className + style. `useAnimatedNumber(value, duration)` hook with rAF + cleanup.
- **`src/components/shared/EmptyState.tsx`** — 4 variants (clean-desk, no-events, no-results, first-time) with Lucide icons.
- **`src/components/shared/StatCard.tsx`** — Animated number, optional tooltip, trend indicator, click handler.
- **`src/components/shared/CollapsibleSection.tsx`** — CSS grid-template-rows animation, `hasExpanded` ref for lazy rendering.
- **`src/app/globals.css`** — Keyframes: fade-slide-up, pulse-once, confetti-pop. Utility classes: animate-fade-slide-up, animate-pulse-once, animate-confetti-pop.

Phase 2 created inbox components — you won't need most of these, but they demonstrate the patterns:

- **`src/components/inbox/EmailHoverActions.tsx`** — Slide-in action tray pattern (CSS translate-x transition).
- **`src/components/inbox/EmailRowIndicators.tsx`** — Badge decision cascade pattern (max 2 indicators).
- **`src/components/inbox/CategorySparkline.tsx`** — Inline SVG sparkline pattern (7-point polyline, no library).

## Important References

- **Design plan:** `docs/VIEW_REDESIGN_PLAN.md` — read sections 1 (Principles), 2 (Visual Language esp. §2b Event Type Colors), 6 (Calendar), 7 (Delight), 9 (Cleanup), and 11 (Taste Guide)
- **Coding standards:** `docs/CODING_STANDARDS.md` — follow all rules, especially the 400-line limit, emoji logging, and modular service layer
- **Decisions log:** `docs/DECISIONS.md` — check for any relevant prior decisions before making new ones
- **Current Calendar page:** `src/app/(auth)/calendar/page.tsx` (~1,234 lines — this is the main file to refactor)
- **Current Calendar components:** `src/components/calendar/` — only `CalendarStats.tsx` (148 lines) and `index.ts`
- **Current Events components:** `src/components/events/` — `EventCard.tsx` (renders individual events)
- **Current Timeline components:** `src/components/timeline/` — `CalendarView.tsx` (month grid)
- **UI primitives:** `src/components/ui/` — especially tooltip.tsx, card.tsx
- **Shared components:** `src/components/shared/` — EmptyState, StatCard, CollapsibleSection
- **Utilities:** `src/lib/utils/timeliness.ts`, `src/lib/utils/animations.ts`
- **Hooks:** `src/hooks/useEvents.ts` (~996 lines, primary data source), `src/hooks/useExtractedDates.ts` (companion data source)
- **Event weighting:** `src/services/events/composite-weight.ts` — compositeWeight algorithm (6 signals)

## Current Calendar Page State (for reference)

The current `calendar/page.tsx` is **1,234 lines** — a monolith that handles:
- View toggle (calendar grid / list)
- Type filters (All, Events, Deadlines, Birthdays, Payments, Appointments, Follow-ups)
- Merged data from `useEvents()` + `useExtractedDates()`
- List view: items grouped by time period
- Calendar grid: monthly grid via `CalendarView` component
- Stats banner: 5 stats via `CalendarStats`
- Highlight/scroll via `?highlight=` param
- Snooze presets + event state management (dismiss/maybe/saved)
- Inline `DATE_TYPE_CONFIG` for icons, colors, labels

**Target:** Break this into ~200-line page that composes extracted components.

## Event Type Color Map

Use these consistently across all calendar components (see §2b of plan):

| Event Type | Color | Dot/Accent |
|-----------|-------|-----------|
| `event` / `appointment` | `blue-500` | Blue circle |
| `deadline` / `expiration` | `amber-500` | Amber diamond |
| `birthday` / `anniversary` | `pink-500` | Pink circle |
| `payment_due` | `emerald-500` | Emerald diamond |
| `follow_up` | `purple-500` | Purple circle |
| `recurring` | `indigo-400` | Indigo circle |

Create a utility function or config object for this mapping. Reuse in all components.

## Steps (execute in order)

### Step 1: Create event type color utility

Create `src/lib/utils/event-colors.ts`:

```typescript
import type { LucideIcon } from 'lucide-react';

export type EventType = 'event' | 'appointment' | 'deadline' | 'expiration' |
  'birthday' | 'anniversary' | 'payment_due' | 'follow_up' | 'recurring';

export interface EventTypeConfig {
  color: string;      // e.g. 'blue-500'
  bg: string;         // e.g. 'bg-blue-50 dark:bg-blue-950/20'
  text: string;       // e.g. 'text-blue-500'
  dot: string;        // e.g. 'bg-blue-500'
  border: string;     // e.g. 'border-blue-500'
  shape: 'circle' | 'diamond';  // circle for events, diamond for deadlines/payments
  label: string;      // human-readable
}

export function getEventTypeConfig(type: string): EventTypeConfig;
```

Map event types → colors per §2b. Deadlines, expirations, and payment_due get diamond shapes. Everything else gets circles. Include a sensible fallback for unknown types (slate-400).

### Step 2: Create `src/components/calendar/RsvpBadge.tsx` (~60 lines)

RSVP countdown component per §6e:

```tsx
interface RsvpBadgeProps {
  rsvpDeadline: string | Date;
  rsvpUrl?: string;
}
```

- Compute hours remaining from `rsvpDeadline`
- \> 48h: muted text "RSVP by [date]"
- 24-48h: amber text "RSVP by tomorrow"
- < 24h: red text "RSVP today!" with `animate-pulse-once` class
- Past deadline: red strikethrough "RSVP closed [date]"
- If `rsvpUrl` provided, make the text clickable (opens in new tab)
- Tooltip (info tier) explains the RSVP status

### Step 3: Create `src/components/calendar/TimelineGroup.tsx` (~50 lines)

Date group header for the timeline:

```tsx
interface TimelineGroupProps {
  label: string;          // "TODAY", "TOMORROW", "THIS WEEK", etc.
  count: number;          // number of items in group
  isOverdue?: boolean;    // renders red background strip
}
```

- Sticky header: `sticky top-0 bg-background z-10`
- If `isOverdue`: `bg-red-50 dark:bg-red-950/30` background
- Date label left-aligned, count badge right-aligned
- Horizontal rule extending full width
- Typography: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`

### Step 4: Create `src/components/calendar/TimelineItem.tsx` (~180 lines)

Individual timeline entry with inline expansion per §6b:

```tsx
interface TimelineItemProps {
  item: CalendarItem;     // unified type from merged events + dates
  isExpanded: boolean;
  onToggle: () => void;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
}
```

**Collapsed state:**
- Vertical line: `border-l-2 border-muted` with absolute-positioned dot
- Dot shape from `getEventTypeConfig()` (circle or diamond), colored by event type
- Time on left (e.g. "10:00 AM", "All day", "5:00 PM")
- Title + subtitle (location, source email sender, etc.)
- Event type icon (from Lucide) on far right

**Expanded state (clicked):**
- Card expands inline below the item
- Shows: location, RSVP badge (if applicable), source info, event summary/key points
- Action buttons: "Add to Calendar", "Dismiss", "View Email" (link to source email)
- Smooth height animation (use CSS grid-template-rows trick or max-height transition)

**Birthday special treatment (§6d):**
- If event type is `birthday` or `anniversary`:
  - Cake icon (use Lucide `Cake` icon) next to the title
  - `animate-confetti-pop` on first render (use `hasMounted` ref guard)
  - Tooltip shows relationship type + age if `birthday_year_known`

**Tooltip per item:** Shows source (Google Calendar vs email-extracted) + original email link

### Step 5: Create `src/components/calendar/TimelineView.tsx` (~150 lines)

The vertical timeline list view per §6b:

```tsx
interface TimelineViewProps {
  items: CalendarItem[];
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
}
```

- Groups items by time period: Overdue, Today, Tomorrow, This Week, Next Week, Later
- Overdue group is always first with `isOverdue` flag
- Each group renders `TimelineGroup` header + `TimelineItem` list
- Manages expansion state (`expandedId` — only one item expanded at a time)
- Empty state: use `EmptyState` shared component with `no-events` variant
- Staggered entrance animation (use `staggeredEntrance()` utility, `hasMounted` ref guard)

**Data grouping:** Use `useMemo` to group items by time period. Compute relative to current date. This is the same grouping logic the current page does — extract it from the current `calendar/page.tsx`.

### Step 6: Create `src/components/calendar/CalendarDayCell.tsx` (~80 lines)

Individual day cell for the month grid per §6c:

```tsx
interface CalendarDayCellProps {
  date: Date;
  items: CalendarItem[];
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}
```

- **Heat map intensity** based on item count:
  - 0: `bg-transparent`
  - 1-2: `bg-blue-50 dark:bg-blue-950/20`
  - 3-4: `bg-blue-100 dark:bg-blue-950/40`
  - 5+: `bg-blue-200 dark:bg-blue-900/50`
- **Today ring:** `ring-2 ring-primary` (instead of background)
- **Type dots:** Up to 3 small colored dots below day number, colored by event type
- **Selected state:** subtle `bg-accent` background
- Out-of-month days: `opacity-30`
- **Tooltip (info tier):** Count breakdown "2 events, 1 deadline, 1 birthday"

### Step 7: Create `src/components/calendar/CalendarDayExpansion.tsx` (~120 lines)

Expanded day detail that shows below the grid row per §6c:

```tsx
interface CalendarDayExpansionProps {
  date: Date;
  items: CalendarItem[];
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onClose: () => void;
}
```

- Accordion-style row that expands below the week row containing the selected day
- Shows list of items for that day with time, title, type icon, and action buttons
- Close button (X) in top-right corner
- Smooth height animation (CSS grid-template-rows trick)
- If no items: "No events on [day name]"

### Step 8: Create `src/components/calendar/CalendarGrid.tsx` (~200 lines)

Month grid with heat map per §6c:

```tsx
interface CalendarGridProps {
  items: CalendarItem[];
  month: Date;             // which month to display
  onMonthChange: (month: Date) => void;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
}
```

- Standard 7-column grid (Sun-Sat) with week rows
- Month/year header with prev/next month navigation arrows
- Each day renders `CalendarDayCell`
- Selected day state: clicking a day opens `CalendarDayExpansion` below that week row
- Only one day expanded at a time
- Use `useMemo` to group items by date for efficient cell rendering
- Day-of-week headers: `text-xs font-medium text-muted-foreground`

**Note:** There may be an existing `CalendarView` component in `src/components/timeline/`. Read it first — you may be able to adapt it rather than starting from scratch. Preserve any existing functionality that works well.

### Step 9: Create `src/components/calendar/EventActions.tsx` (~80 lines)

Extracted action buttons for calendar items:

```tsx
interface EventActionsProps {
  item: CalendarItem;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
  onViewEmail?: (emailId: string) => void;
  compact?: boolean;
}
```

- "Add to Calendar" button (if not already saved)
- "Dismiss" button
- "Snooze" dropdown with presets (1 day, 3 days, 1 week, 2 weeks) — reuse the same presets from the current page
- "View Email" link (if item has a source email)
- `compact` mode: icon-only buttons with tooltips (for timeline items)
- Full mode: text + icon buttons (for expanded views)

### Step 10: Refactor `src/components/calendar/CalendarStats.tsx` (148 → ~100 lines)

Read the current file first. Refactor from 5 hand-rolled cards to 3 `StatCard` components per §6a:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <StatCard
    label="Today"
    value={todayCount}
    subtitle={todaySubtitle}     // "Next: Team standup in 2h" or "All clear"
    tooltip={<TodayItemsList />}
    icon={CalendarCheck}
  />
  <StatCard
    label="This Week"
    value={thisWeekCount}
    subtitle={busiestDaySubtitle}  // "Busiest: Wednesday (4)"
    tooltip={<WeekByDayList />}
    icon={CalendarDays}
  />
  <StatCard
    label="Overdue"
    value={overdueCount}
    subtitle={overdueSubtitle}     // "Oldest: [title] from 3 days ago" or "None"
    tooltip={<OverdueItemsList />}
    icon={AlertTriangle}
    accent={overdueCount > 0 ? 'red' : undefined}
  />
</div>
```

Use `useMemo` for:
- `todaySubtitle`: compute next upcoming item's time offset
- `busiestDaySubtitle`: find day with most items this week
- `overdueSubtitle`: find oldest overdue item

### Step 11: Refactor `src/app/(auth)/calendar/page.tsx` (1,234 → ~200 lines)

Read the current file thoroughly. Then restructure as a thin orchestrator:

```tsx
<div className="space-y-6">
  <PageHeader title="Calendar" />

  {/* Smart Stats */}
  <CalendarStats items={mergedItems} />

  {/* View Toggle + Type Filters */}
  <div className="flex items-center gap-3">
    <ViewToggle view={view} onChange={setView} />
    <TypeFilterBar activeType={typeFilter} onChange={setTypeFilter} types={DATE_TYPE_CONFIG} />
  </div>

  {/* View Content */}
  {view === 'list' ? (
    <TimelineView
      items={filteredItems}
      onDismiss={handleDismiss}
      onSaveToCalendar={handleSave}
      onSnooze={handleSnooze}
    />
  ) : (
    <CalendarGrid
      items={filteredItems}
      month={currentMonth}
      onMonthChange={setCurrentMonth}
      onDismiss={handleDismiss}
      onSaveToCalendar={handleSave}
    />
  )}
</div>
```

**Extract from the current page:**
- `DATE_TYPE_CONFIG` → move to `event-colors.ts` utility or a separate config file
- Type filter bar → extract to a small component or inline in the page
- View toggle → extract to a small component or inline
- All item rendering → delegated to `TimelineView` and `CalendarGrid`
- Event state handlers (dismiss, save, snooze) → keep in the page as `useCallback` handlers
- Data merging logic → keep in page, wrap in `useMemo`
- URL query param handling (`?view=`, `?type=`, `?highlight=`) → keep in page

**Preserve:**
- `?highlight=` scroll-to-item behavior
- `?view=` and `?type=` URL state
- Snooze preset logic
- Data merging from `useEvents()` + `useExtractedDates()`

### Step 12: Define the `CalendarItem` unified type

Create the unified type that both data sources merge into. Put it in `src/components/calendar/types.ts` or at the top of the relevant component:

```typescript
export interface CalendarItem {
  id: string;
  title: string;
  date: Date;
  time?: string;           // "10:00 AM", "All day"
  endTime?: string;
  eventType: string;       // maps to getEventTypeConfig()
  location?: string;
  locationType?: string;   // 'virtual' | 'in_person' | 'hybrid'
  source: 'google_calendar' | 'email_extracted';
  sourceEmailId?: string;
  sourceEmailSender?: string;
  summary?: string;
  keyPoints?: string[];
  rsvpRequired?: boolean;
  rsvpDeadline?: string;
  rsvpUrl?: string;
  isOverdue: boolean;
  state?: 'dismissed' | 'maybe' | 'saved_to_calendar';
  // Birthday-specific
  isBirthday?: boolean;
  birthdayPersonName?: string;
  birthdayRelationship?: string;
  birthdayYearKnown?: boolean;
  birthdayAge?: number;
  // Weighting
  compositeWeight?: number;
  commitmentLevel?: string;
}
```

Write a `mergeToCalendarItems()` function that converts both `EventData` (from useEvents) and `ExtractedDate` (from useExtractedDates) into `CalendarItem[]`.

### Step 13: Update barrel exports

Update `src/components/calendar/index.ts`:

```typescript
export { CalendarStats } from './CalendarStats';
export { TimelineView } from './TimelineView';
export { TimelineItem } from './TimelineItem';
export { TimelineGroup } from './TimelineGroup';
export { CalendarGrid } from './CalendarGrid';
export { CalendarDayCell } from './CalendarDayCell';
export { CalendarDayExpansion } from './CalendarDayExpansion';
export { EventActions } from './EventActions';
export { RsvpBadge } from './RsvpBadge';

export type { CalendarItem } from './types';
export type { CalendarStatsProps } from './CalendarStats';
```

### Step 14: Verify

1. Run `npx tsc --noEmit` — fix any TypeScript errors
2. Run `npm run build` — ensure the build passes
3. Check that no file exceeds 400 lines
4. Verify the calendar page is under ~250 lines
5. Verify all new files have proper file-level JSDoc comments
6. Verify timeline view shows vertical timeline with dots and date groups
7. Verify calendar grid shows heat map intensity and type dots
8. Verify clicking items/days expands inline (no modals)
9. Verify birthday items get confetti-pop animation
10. Verify RSVP badges show correct urgency level
11. Verify overdue items have red background strip
12. Verify event type colors are consistent across all views

## Performance Requirements

Follow these rules in every component you write:

1. **Memoize expensive computations.** Grouping items by date/period, computing heat map intensities, finding busiest day, merging data sources — all must be wrapped in `useMemo` with proper dependency arrays.

2. **Memoize callbacks passed to children.** Use `useCallback` for functions passed as props, especially dismiss/save/snooze handlers and day cell click handlers.

3. **No animations on re-render.** The birthday `confetti-pop` animation and staggered timeline entrance must only play on initial mount. Use a `useRef(false)` flag — set it to true after first render, skip animation classes on subsequent renders.

4. **React.memo on list items.** `TimelineItem` and `CalendarDayCell` should be wrapped in `React.memo` since they render in lists and receive stable props.

5. **Lazy expansion.** Expanded content (both `TimelineItem` expansion and `CalendarDayExpansion`) should not mount their DOM until first expanded. Use a `hasExpanded` ref pattern (same as CollapsibleSection).

6. **Avoid layout thrash.** Calendar grid dimensions are predictable — don't measure DOM. Timeline dots use absolute positioning with CSS, not JS-computed offsets.

7. **Date computation caching.** The `mergeToCalendarItems()` function runs on every render cycle when data changes. Ensure it's wrapped in `useMemo` with proper deps on the raw event/date arrays.

8. **Image/avatar loading.** If displaying any avatars (e.g., birthday person), use `loading="lazy"` and explicit width/height.

## Logging Requirements

Every new component and utility must log appropriately using the project's logger:

```typescript
import { createLogger } from '@/lib/utils/logger';
const logger = createLogger('ComponentName');
```

**What to log:**
- **Utilities** (`event-colors.ts`): No logging — pure functions.
- **UI primitives** (`RsvpBadge`, `TimelineGroup`, `CalendarDayCell`, `CalendarDayExpansion`): No logging — these are UI primitives.
- **TimelineView.tsx**: Log group counts on data load (`logger.debug('Timeline groups', { overdue: N, today: N, ... })`). Log when expansion toggles (`logger.info('Timeline item expanded', { itemId })`).
- **CalendarGrid.tsx**: Log month navigation (`logger.info('Month changed', { month })`). Log day expansion (`logger.info('Day expanded', { date })`).
- **TimelineItem.tsx**: No logging — delegate to parent.
- **EventActions.tsx**: Log user actions (`logger.info('Calendar action', { action: 'dismiss'|'save'|'snooze', itemId })`).
- **CalendarStats.tsx**: Log stat values on data load (`logger.debug('Calendar stats', { today, thisWeek, overdue })`).
- **Calendar page**: Keep existing logging for data load and view changes. Log type filter changes.

## Comment Standards

**Where to comment:**
- File-level: Brief JSDoc at the top of each new file explaining purpose and which plan section it implements.
- Complex logic: Explain WHY, not WHAT. E.g., the time period grouping logic, the heat map intensity thresholds, the RSVP deadline computation, the birthday animation guard.
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
 * TimelineView — vertical timeline list for calendar items.
 * Implements §6b "List View → Timeline Style" from VIEW_REDESIGN_PLAN.md.
 *
 * Groups items by time period (Overdue, Today, Tomorrow, etc.) with sticky
 * headers. Overdue section always first with red background strip.
 * Only one item can be expanded at a time (inline, no modal).
 */
```

## Final Checklist

Before committing:
- [ ] `event-colors.ts` utility created with consistent type → color mapping
- [ ] `CalendarItem` unified type defined
- [ ] `mergeToCalendarItems()` function merges both data sources
- [ ] `RsvpBadge` shows 4 urgency levels (>48h, 24-48h, <24h, past)
- [ ] `TimelineGroup` has sticky headers with overdue red background
- [ ] `TimelineItem` has vertical line, colored dots (circle/diamond), inline expansion
- [ ] `TimelineView` groups by time period, staggered entrance, empty state
- [ ] `CalendarDayCell` has heat map intensity, type dots (max 3), today ring
- [ ] `CalendarDayExpansion` accordion row in grid
- [ ] `CalendarGrid` month navigation, 7-col grid, day expansion
- [ ] `EventActions` extracted with compact/full modes
- [ ] `CalendarStats` refactored to 3 `StatCard`s with dynamic subtitles
- [ ] Calendar page is ~200 lines (thin orchestrator)
- [ ] Birthday items get `confetti-pop` animation on mount only
- [ ] Overdue items have `bg-red-50 dark:bg-red-950/30` strip
- [ ] Event type colors consistent across timeline, grid, and stats
- [ ] `?highlight=`, `?view=`, `?type=` URL params still work
- [ ] `calendar/index.ts` barrel export updated
- [ ] No file exceeds 400 lines
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Build passes (`npm run build`)
- [ ] Every new file has a file-level JSDoc comment
- [ ] React.memo on `TimelineItem` and `CalendarDayCell`
- [ ] `useMemo` for data grouping, heat map computation, stat calculations
- [ ] Entrance animations only play on mount (`hasMounted` ref guard)

Commit with message: `feat(calendar): phase 3 — timeline view, heat map grid, RSVP badges, birthday delight`
