# Plan: Tasks Page Redesign — Triage-First, Kanban-Driven

> **Created:** March 2, 2026
> **Status:** Not started — 3-phase implementation plan
> **Dependencies:** No new npm packages. No database migrations. Presentation layer only.

---

## Context

The Tasks page currently has 6 tabs defaulting to Projects. This was an engineer's
mental model — tabs organized by data source (projects, items, actions, ideas, campaigns,
templates) rather than by user intent ("what's new?", "what am I doing?", "how is work organized?").

The core problems:

1. **Wrong default.** Projects answers "how is my work organized?" but a user sitting
   down to work asks "what needs my attention right now?"
2. **Three separate inboxes.** Email-extracted actions (Inbox Tasks tab), AI ideas
   (Ideas tab), and the TriageTray (collapsed inside All Items) all require separate
   visits to see "everything new."
3. **No clear funnel.** There's no moment of "I've decided to do this" that moves an
   item from suggestion → committed work. The Promote dialog is 6+ interaction steps.
4. **Kanban is hidden.** `TaskKanbanBoard` exists and works well (`@dnd-kit`, 4 columns,
   drag overlay, priority stripes) but it's buried behind a toggle inside All Items.
5. **6 tabs is heavy.** Campaigns and Templates are periodic-use features eating
   cognitive space alongside daily-use tabs.

### UX Theory Backing

- **Hick's Law:** Decision time increases with choices. 6 tabs → 4 tabs reduces cognitive
  load on every visit.
- **Eisenhower separation:** "Deciding what to do" and "doing it" are different mental
  modes. They should be different tabs, not mixed.
- **Progressive commitment funnel:** SUGGESTIONS → TRIAGE → BOARD → DONE. Each stage
  has lower volume and higher commitment.
- **Fitts's Law:** Current promote flow is 6-7 steps. Quick Accept popover is 2 steps.
  Reducing motor cost for the most frequent operation.

### Performance Context

Current All Items tab loads everything on mount: ~143 KB across 6-7 queries (project
items + enrichment + projects + triage actions + triage action enrichment + ideas API).
The redesign splits this into focused tabs:

- **Triage tab:** ~42 KB (3 queries: pending actions + enrichment + ideas)
- **Board tab:** ~75 KB (3 queries: project items + enrichment + projects)

Each tab fetches only what it needs. No shared cache (SWR/React Query) is required for
this phase — that's an orthogonal improvement.

### What Already Works (Don't Rewrite)

- `TriageTray` — already merges actions + ideas, has auto-expand, has dismiss logic
- `TaskKanbanBoard` — `@dnd-kit`, 4 columns, drag-and-drop, priority stripes, email links
- `AllItemsContent` — StatsCards, FilterBar, list/kanban toggle, search, all filters
- `PromoteActionDialog` — full promote flow (kept as fallback, not removed)
- `useActions`, `useIdeas`, `useProjectItems`, `useProjects` — all hooks stay as-is

---

## Target State: 4 Tabs

```
Triage (default) → Board → Projects → Library
```

| Tab | URL param | Purpose | Frequency |
|-----|-----------|---------|-----------|
| **Triage** | (default) | "What came in?" — decide quickly | Daily, multiple times |
| **Board** | `?tab=board` | "What am I doing?" — kanban execution | Daily |
| **Projects** | `?tab=projects` | "How is work organized?" — planning | Weekly |
| **Library** | `?tab=library` | Campaigns + Templates | As needed |

### Legacy URL Redirects

| Old URL | New URL |
|---------|---------|
| `/tasks` (no param) | Triage (new default) |
| `/tasks?tab=items` | `/tasks?tab=board` |
| `/tasks?tab=todos` | `/tasks` (Triage, default) |
| `/tasks?tab=ideas` | `/tasks` (Triage, ideas sub-filter) |
| `/tasks?tab=campaigns` | `/tasks?tab=library` |
| `/tasks?tab=templates` | `/tasks?tab=library&sub=templates` |

---

## Phase 1: Triage Tab + Tab Restructure

> **Goal:** Replace 6 tabs with 4. Promote TriageTray to a full-width default tab.
> Merge Campaigns + Templates into Library.

### 1.1 — Restructure TasksTabs (6 → 4 tabs)

**File:** `src/components/tasks/TasksTabs.tsx`

**Changes:**
- Update `VALID_TABS` from `['projects', 'items', 'todos', 'ideas', 'campaigns', 'templates']`
  to `['triage', 'board', 'projects', 'library']`
- Change `DEFAULT_TAB` from `'projects'` to `'triage'`
- Add `LEGACY_TAB_MAP` for backward compatibility:
  ```typescript
  const LEGACY_TAB_MAP: Record<string, string> = {
    items: 'board',
    todos: 'triage',
    ideas: 'triage',
    campaigns: 'library',
    templates: 'library',
  };
  ```
- On mount, check if `tabParam` is in `LEGACY_TAB_MAP` and redirect
- Update all `TabsTrigger` entries:
  - `triage` (Inbox icon) — default
  - `board` (LayoutGrid icon)
  - `projects` (FolderKanban icon)
  - `library` (FileText icon)
- Update `TabsContent` to render:
  - `triage` → `<TriageContent />`
  - `board` → `<BoardContent />`
  - `projects` → `<ProjectsContent />`  (unchanged)
  - `library` → `<LibraryContent />`

**Logging:**
```typescript
logger.info('Tasks tab changed', { from: activeTab, to: tab });
// If legacy redirect:
logger.info('Legacy tab redirected', { from: tabParam, to: resolved });
```

### 1.2 — Create TriageContent Component

**New file:** `src/components/projects/TriageContent.tsx`

This is TriageTray promoted to a full-width, standalone tab view. Not a card
inside another component — the main content of the default Tasks tab.

**Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│  Stats banner: "12 items to triage · 8 tasks · 4 ideas"    │
├─────────────────────────────────────────────────────────────┤
│  Filter pills: [All] [Tasks (8)] [Ideas (4)]               │
│  Sort: [Urgency ▾]                                          │
├─────────────────────────────────────────────────────────────┤
│  ⚡ NEEDS ATTENTION                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📧 Reply to Acme about Q2 deliverable     ⏰ Today   │  │
│  │    respond · from: jane@acme.com                      │  │
│  │                        [Accept ✓] [Snooze ⏰] [✕]    │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 💡 Write a thread about podcast automation            │  │
│  │    content · from newsletter by @swyx · 0.85 conf     │  │
│  │                        [Accept ✓] [Snooze ⏰] [✕]    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  🎉 TRIAGE ZERO                                            │
│  (Empty state when all items are triaged — celebratory)     │
└─────────────────────────────────────────────────────────────┘
```

**Data sources:**
- `useActions({ status: 'pending', limit: 30, sortBy: 'urgency' })` — pending email-extracted actions
- `useIdeas({ limit: 20 })` — AI idea sparks

**Key behaviors:**
- Merge actions + ideas into one sorted list. Actions sort by `urgency_score` DESC,
  ideas by `confidence` DESC. Interleave: urgent actions first, then ideas, then
  lower-urgency actions.
- Filter pills: "All" (both), "Tasks" (actions only), "Ideas" (ideas only)
- **Accept** = calls `onPromoteAction` or `onAcceptIdea` (existing callbacks from TriageTray)
  - Phase 1: opens existing `PromoteActionDialog` for actions, calls `saveIdea` for ideas
  - Phase 2: replace with lightweight `QuickAcceptPopover`
- **Dismiss** = local state for actions (`dismissedActionIds` Set), calls `dismissIdea` for ideas
- **Snooze** = new: dismiss with a timer. Store `snoozedUntil` timestamp in local state.
  Snoozed items reappear when `Date.now() > snoozedUntil`. (No DB change needed.)
- Empty state: "You're all caught up" with a checkmark or confetti icon. Link to Board.

**Implementation notes:**
- Extract triage logic from `TriageTray` into shared utilities, don't duplicate
- TriageContent is the full-page version; TriageTray can remain as an embeddable
  mini version for future use (e.g., on Home page). Both should use the same
  `useTriageItems()` hook (see 1.3).
- Keep TriageTray.tsx as-is for now — TriageContent can import its sub-components
  (ActionSuggestion, IdeaSuggestion) directly
- **File limit: 400 lines max.** Split sub-components into separate files if needed:
  - `TriageContent.tsx` — main layout, stats banner, filter pills, list rendering
  - `TriageActionCard.tsx` — action suggestion card (can reuse from TriageTray)
  - `TriageIdeaCard.tsx` — idea suggestion card (can reuse from TriageTray)
  - `TriageEmptyState.tsx` — celebration empty state

**Logging:**
```typescript
const logger = createLogger('TriageContent');
logger.info('Triage loaded', { actionCount, ideaCount, totalSuggestions });
logger.info('Item accepted', { type: 'action' | 'idea', itemId });
logger.info('Item dismissed', { type, itemId });
logger.info('Item snoozed', { type, itemId, snoozedUntil });
logger.info('Triage zero reached'); // When user clears all items
```

### 1.3 — Create useTriageItems Hook

**New file:** `src/hooks/useTriageItems.ts`

Thin composition hook that merges `useActions` + `useIdeas` into a unified triage stream.
This prevents TriageContent from having to manage two hook lifecycles and merge logic inline.

```typescript
interface TriageItem {
  id: string;
  type: 'action' | 'idea';
  title: string;
  subtitle: string;          // action_type label or idea type
  urgency: number;           // normalized 0-10 (actions: urgency_score, ideas: confidence * 10)
  sourceEmailId?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  deadline?: string;         // ISO string, actions only
  confidence?: number;       // 0-1, ideas only
  raw: ActionWithEmail | IdeaItem;  // original object for Accept handler
}

interface UseTriageItemsReturn {
  items: TriageItem[];
  stats: { total: number; actions: number; ideas: number };
  isLoading: boolean;
  dismissItem: (id: string, type: 'action' | 'idea') => void;
  snoozeItem: (id: string, type: 'action' | 'idea', minutes: number) => void;
  refetch: () => void;
}
```

**Sort logic:**
1. Overdue actions first (deadline < now)
2. Then by normalized urgency DESC
3. Actions with deadlines float above ideas at equal urgency
4. Snoozed items hidden until `snoozedUntil` passes

**Performance notes:**
- `useActions` fetches `select('*')` on actions. For Phase 1 this is fine (~30 KB for
  20 pending actions). Phase 3 optimizes with specific field selection.
- `useIdeas` hits `/api/ideas` which parses JSONB server-side. For 15 emails × 4 ideas
  = 60 ideas, this is ~12 KB. Acceptable.
- Snooze is local state only (no DB write). Clears on page refresh — acceptable for V1.
- No `useMemo` wrapping the merged array unless profiling shows re-render issues. The
  merge logic is O(n log n) for ~50 items — negligible.

**Logging:**
```typescript
const logger = createLogger('useTriageItems');
logger.info('Triage items loaded', { actions: actionCount, ideas: ideaCount, snoozed: snoozedCount });
```

### 1.4 — Create LibraryContent Component

**New file:** `src/components/tasks/LibraryContent.tsx`

Internal sub-tabs for Campaigns and Templates. Same pattern as `DiscoveriesFeed`
in the Inbox (internal tab bar, not URL-routed).

```
┌─────────────────────────────────────────────────────────┐
│  [Campaigns]  [Templates]          (internal sub-tabs)  │
├─────────────────────────────────────────────────────────┤
│  <CampaignsContent /> or <TemplatesContent />           │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- `sub` query param support: `?tab=library&sub=templates` selects Templates sub-tab
- Default sub-tab: Campaigns
- Just a wrapper — renders existing `CampaignsContent` or `TemplatesContent` unchanged

**File size:** ~60 lines. Simple wrapper.

**Logging:**
```typescript
const logger = createLogger('LibraryContent');
logger.info('Library sub-tab changed', { subTab });
```

### 1.5 — Create BoardContent Component

**New file:** `src/components/projects/BoardContent.tsx`

This is the existing `AllItemsContent` minus the TriageTray, with the kanban view
as the default instead of the list view.

**Changes from AllItemsContent:**
- Remove `TriageTray` import and rendering — triage is its own tab now
- Change `viewMode` default from `'list'` to `'kanban'`
- Keep all existing FilterBar functionality (sort, status filter, source filter,
  overdue toggle, show completed, search)
- Keep StatsCards
- Keep list/kanban toggle (users who prefer list view can switch)

**Do NOT delete AllItemsContent** — keep it for now. `BoardContent` can start as a
copy that removes the triage section and changes the default. In Phase 3, we can
deprecate `AllItemsContent` if it's truly unused.

**Logging:**
```typescript
const logger = createLogger('BoardContent');
logger.info('Board loaded', { viewMode, itemCount: items.length });
logger.info('View mode changed', { from, to });
logger.info('Filter changed', { filter, value });
```

### 1.6 — Update Sidebar Badge

**File:** `src/hooks/useSidebarBadges.ts`

Add a third count query for triage items, displayed as a badge on the Tasks nav item.

**New query (parallel with existing 2):**
```typescript
// Query 3: Pending actions count (triage items)
const triageQuery = supabase
  .from('actions')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending');
```

Cost: +200 bytes, +1 count query running in parallel. Negligible.

**File:** `src/components/layout/Sidebar.tsx`
- Add amber badge next to Tasks nav item showing triage count
- Same pattern as existing must-reply badge on Inbox

**Logging:**
```typescript
logger.debug('Sidebar badges refreshed', { mustReply, deadlines, triageCount });
```

### 1.7 — Update Documentation

**Files to update:**
- `README.md` — Tasks tabs description: 6→4
- `docs/ARCHITECTURE.md` — Tasks tab list
- `docs/IMPLEMENTATION_STATUS.md` — New session entry
- `docs/DECISIONS.md` — New decision #27: Tasks page triage-first redesign

---

## Phase 2: Quick Accept + Board Refinements

> **Goal:** Reduce Accept friction from 6 steps to 2. Polish the Board with
> project color coding and Done auto-collapse.

### 2.1 — QuickAcceptPopover Component

**New file:** `src/components/projects/QuickAcceptPopover.tsx`

Lightweight alternative to `PromoteActionDialog`. Appears as a popover (not a modal)
anchored to the Accept button. Two fields only:

```
┌────────────────────────────────┐
│  Add to:  [Project dropdown ▾] │
│  Priority: ● Low ● Med ● High │
│          [Add to Board →]      │
└────────────────────────────────┘
```

**Behavior:**
- Project dropdown defaults to most-recently-used project (store in localStorage)
- Priority defaults to action's existing priority or 'medium'
- Title pre-filled from action title / idea text (not editable in popover — user
  can edit later on the Board)
- "Add to Board" creates a `project_item` via `createItem()` from `useProjectItems`:
  - `item_type`: 'task' for actions, 'idea' for ideas
  - `status`: 'pending' (lands in "To Do" column on Board)
  - `source_action_id`: set for actions
  - `source_email_id`: from action.email_id or idea.emailId
  - `title`, `priority`: from popover fields
- On success: item disappears from Triage, green flash confirmation
- Popover auto-closes on success

**Why popover, not dialog:**
- Popover doesn't obscure the triage list — user maintains context
- Faster to dismiss (click outside vs. explicit close)
- Feels lighter — matches the "quick decision" mental model of triage

**File size:** ~150 lines (Popover + form + submission logic).

**Logging:**
```typescript
const logger = createLogger('QuickAcceptPopover');
logger.info('Quick accept', { type, itemId, projectId, priority });
logger.info('Quick accept succeeded', { newItemId });
logger.error('Quick accept failed', { error });
```

### 2.2 — Wire QuickAcceptPopover into TriageContent

**File:** `src/components/projects/TriageContent.tsx`

Replace the PromoteActionDialog call path with QuickAcceptPopover:
- Accept button on each triage card renders a Popover trigger
- Popover content is `<QuickAcceptPopover item={triageItem} onSuccess={handleAccepted} />`
- `handleAccepted` removes the item from triage list + refetches Board if open

Keep `PromoteActionDialog` importable — it's still useful for the "full edit" flow
from ActionsContent or other surfaces. Don't delete it.

### 2.3 — Board: Project Color Stripes on Cards

**File:** `src/components/projects/TaskKanbanBoard.tsx`

Cards already have a priority stripe at the top. Add a project color indicator:

- Left border of each card uses the project's `color` hex value
- Need to pass `projects` array into `TaskKanbanBoard` (or a `projectColorMap`)
- If item has no project, no left border (or muted gray)

**Data flow:**
- `BoardContent` already has `useProjects()`. Pass `projects` as prop to `TaskKanbanBoard`.
- `KanbanCardContent` reads `item.project_id`, looks up color in map.

**Minimal change:** Add 1 prop, ~10 lines of code.

### 2.4 — Board: Done Column Auto-Collapse

**File:** `src/components/projects/TaskKanbanBoard.tsx`

Items in the Done column completed more than 7 days ago collapse into a
"Show N older" link. This prevents the Done column from growing unbounded.

**Implementation:**
- Split Done column items: `recentDone` (completed within 7d) and `olderDone`
- Show `recentDone` by default
- "Show N older" button at bottom expands to show all
- Local state toggle — no query change

### 2.5 — Board: Quick-Add at Column Top

**File:** `src/components/projects/TaskKanbanBoard.tsx`

Small "+" button at top of each column. Clicking it creates a new item with that
column's status pre-set:

- Opens `CreateItemDialog` (existing component) with `status` pre-filled
- E.g., clicking "+" on "To Do" column creates an item with `status: 'pending'`

**Minimal change:** Add button to column header, ~15 lines.

---

## Phase 3: Performance + Polish

> **Goal:** Optimize queries, add missing UX touches, clean up dead code.

### 3.1 — Optimize useActions: select('*') → Specific Fields

**File:** `src/hooks/useActions.ts`

Replace `select('*')` with specific fields for list contexts:

```typescript
const TRIAGE_LIST_FIELDS = 'id, title, action_type, priority, urgency_score, deadline, email_id, status, created_at';
```

Estimated savings: ~200 bytes/row × 30 rows = ~6 KB.

Also: replace client-side email enrichment batching with a Supabase join:

```typescript
// BEFORE: Two queries
const { data: actions } = await supabase.from('actions').select('*');
const emailIds = [...new Set(actions.map(a => a.email_id).filter(Boolean))];
const { data: emails } = await supabase.from('emails').select('id, subject, sender_name, sender_email').in('id', emailIds);

// AFTER: Single query with join
const { data: actions } = await supabase
  .from('actions')
  .select(`${TRIAGE_LIST_FIELDS}, emails!email_id(subject, sender_name, sender_email)`)
  .eq('status', 'pending');
```

Eliminates second network round-trip.

### 3.2 — Optimize useProjectItems: select('*') → Specific Fields

**File:** `src/hooks/useProjectItems.ts`

Same pattern as 3.1:

```typescript
const BOARD_LIST_FIELDS = 'id, project_id, item_type, title, description, status, priority, due_date, source_email_id, source_action_id, tags, sort_order, completed_at, created_at';
```

And replace email enrichment with join:

```typescript
const { data: items } = await supabase
  .from('project_items')
  .select(`${BOARD_LIST_FIELDS}, emails!source_email_id(id, subject, sender_name, sender_email, gist)`)
  .eq('user_id', userId);
```

### 3.3 — Triage Badge: Smarter Count

**File:** `src/hooks/useSidebarBadges.ts`

Phase 1 counts all pending actions. Phase 3 refines:
- Count only pending actions that haven't been promoted (no corresponding project_item
  with matching `source_action_id`)
- This prevents already-accepted actions from inflating the badge

```sql
-- Pending actions not yet promoted to project items
SELECT COUNT(*) FROM actions a
WHERE a.status = 'pending'
  AND a.user_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM project_items pi
    WHERE pi.source_action_id = a.id
  );
```

Note: This is more expensive than a simple count. If performance is an issue,
add a `promoted_at` column to actions instead (simpler query). Measure first.

### 3.4 — Snooze Persistence (Optional)

If users want snooze to survive page refreshes:

**Option A (lightweight):** Store snoozed item IDs + timestamps in `localStorage`.
`useTriageItems` reads from localStorage on mount, filters out snoozed items.

**Option B (durable):** Add `snoozed_until TIMESTAMPTZ` column to `actions` table.
Filter in Supabase query: `.or('snoozed_until.is.null, snoozed_until.lt.now()')`.
Requires migration — only do this if users report losing snoozes.

Recommendation: Start with Option A. Graduate to Option B only if needed.

### 3.5 — Deprecate AllItemsContent

Once BoardContent is stable and TriageContent handles triage, AllItemsContent is
redundant. It's Board + Triage combined.

**Don't delete immediately.** Instead:
1. Remove AllItemsContent from TasksTabs imports
2. Add a deprecation comment at the top of the file
3. Leave for 2-4 weeks in case rollback is needed
4. Delete once confident

### 3.6 — Update IdeaSparksCard Link

**File:** `src/components/home/IdeaSparksCard.tsx`

The "View all" link currently goes to `/tasks?tab=ideas`. After Phase 1, ideas
are part of Triage. Update to `/tasks` (default tab = triage) or
`/tasks?filter=ideas` if we add a filter parameter.

### 3.7 — Documentation

Update all docs to reflect the final 4-tab structure:
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/DECISIONS.md` — Decision #27
- `docs/PROJECT_OVERVIEW.md`

---

## Implementation Order

### Phase 1 (~3-4 work sessions)
```
1.3  useTriageItems hook                        (new hook, ~120 lines)
1.2  TriageContent + sub-components             (new components, ~350 lines total)
1.5  BoardContent                               (fork of AllItemsContent, ~300 lines)
1.4  LibraryContent                             (new wrapper, ~60 lines)
1.1  TasksTabs restructure (6→4)                (modify, ~80 lines changed)
1.6  Sidebar triage badge                       (modify, ~20 lines)
1.7  Documentation updates                      (modify, 5 files)
```

### Phase 2 (~2-3 work sessions)
```
2.1  QuickAcceptPopover                         (new component, ~150 lines)
2.2  Wire popover into TriageContent            (modify, ~20 lines)
2.3  Board project color stripes                (modify, ~15 lines)
2.4  Board Done column auto-collapse            (modify, ~30 lines)
2.5  Board quick-add at column top              (modify, ~15 lines)
```

### Phase 3 (~2 work sessions)
```
3.1  Optimize useActions (fields + join)        (modify, ~30 lines)
3.2  Optimize useProjectItems (fields + join)   (modify, ~30 lines)
3.3  Smarter triage badge count                 (modify, ~10 lines)
3.4  Snooze persistence (localStorage)          (modify, ~40 lines)
3.5  Deprecate AllItemsContent                  (cleanup)
3.6  Update IdeaSparksCard link                 (modify, ~5 lines)
3.7  Final documentation pass                   (modify, 5 files)
```

---

## New Files Summary

| File | Phase | Lines (est.) | Purpose |
|------|-------|-------------|---------|
| `src/hooks/useTriageItems.ts` | 1 | ~120 | Composition hook merging actions + ideas |
| `src/components/projects/TriageContent.tsx` | 1 | ~200 | Full-width triage tab content |
| `src/components/projects/TriageActionCard.tsx` | 1 | ~80 | Action suggestion card (extracted from TriageTray) |
| `src/components/projects/TriageIdeaCard.tsx` | 1 | ~70 | Idea suggestion card (extracted from TriageTray) |
| `src/components/projects/TriageEmptyState.tsx` | 1 | ~40 | Celebration empty state |
| `src/components/projects/BoardContent.tsx` | 1 | ~300 | Kanban-first board tab (fork of AllItemsContent) |
| `src/components/tasks/LibraryContent.tsx` | 1 | ~60 | Sub-tab wrapper for Campaigns + Templates |
| `src/components/projects/QuickAcceptPopover.tsx` | 2 | ~150 | Lightweight 2-step promote popover |

## Modified Files Summary

| File | Phase | What Changes |
|------|-------|-------------|
| `src/components/tasks/TasksTabs.tsx` | 1 | 6→4 tabs, new default, legacy redirect map |
| `src/hooks/useSidebarBadges.ts` | 1 | Add triage count query |
| `src/components/layout/Sidebar.tsx` | 1 | Add triage badge to Tasks nav |
| `src/components/projects/TriageContent.tsx` | 2 | Wire QuickAcceptPopover |
| `src/components/projects/TaskKanbanBoard.tsx` | 2 | Project colors, Done collapse, quick-add |
| `src/hooks/useActions.ts` | 3 | Specific fields + Supabase join |
| `src/hooks/useProjectItems.ts` | 3 | Specific fields + Supabase join |
| `src/hooks/useSidebarBadges.ts` | 3 | Smarter promoted-action exclusion |
| `src/components/home/IdeaSparksCard.tsx` | 3 | Update "View all" link |

---

## Coding Standards Reminders

These are non-negotiable for every file touched:

1. **400-line file limit.** If a component exceeds 400 lines, extract sub-components.
   TriageContent is the most likely candidate — split cards and empty state into
   separate files proactively.

2. **Logger on every component and hook.** Use `createLogger('ComponentName')` at
   the top of every new file. Log: mount/load with counts, user actions (accept,
   dismiss, snooze, filter change), errors with context.

3. **Emoji logging prefixes.** Follow the established system in `CODING_STANDARDS.md`.
   Use `logger.start()`, `logger.success()`, `logger.error()`, `logger.info()`.

4. **TypeScript strict.** All new types must be explicit. No `any`. Use the existing
   type patterns: `ActionWithEmail`, `ProjectItemWithEmail`, `IdeaItem`.

5. **JSDoc on exports.** Every exported function and component gets a JSDoc block
   explaining what it does, its props, and which module it belongs to.

6. **No dead code.** If you fork AllItemsContent into BoardContent, actively remove
   the TriageTray section rather than commenting it out. If a prop is unused, delete it.

7. **Modular architecture.** Follow the existing pattern:
   ```
   Component/Page → Hook → API Route → Service → Database
   ```
   New hooks go in `src/hooks/`. New components in their appropriate directory.
   Don't put business logic in components — delegate to hooks.

8. **Keep existing patterns.** Don't introduce new UI patterns when existing ones work:
   - URL-synced tabs via `?tab=` (established in InboxTabs, TasksTabs)
   - Filter pills with active ring styling (established in AllItemsContent)
   - Badge with count on sidebar nav (established in useSidebarBadges)
   - Card-based suggestion items (established in TriageTray)

9. **Test the legacy redirects.** After Phase 1, manually verify that all old URLs
   in `LEGACY_TAB_MAP` resolve to the correct new tab. This is critical — users may
   have bookmarks.

10. **Performance awareness.** Don't add `useEffect` hooks that fire on every render.
    Use `useCallback` for event handlers passed as props. Use `useMemo` for expensive
    computations (but don't premature-optimize — the merge in `useTriageItems` is
    fine without memoization for ~50 items).
