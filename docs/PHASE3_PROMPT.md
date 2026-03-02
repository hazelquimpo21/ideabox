# Phase 3 Implementation Prompt — Tasks Page Redesign: Performance + Polish

Implement **Phase 3** of the Tasks page redesign as documented in `docs/TASKS_PAGE_REDESIGN.md`. Sections 3.1 through 3.7 are your scope. This is the final phase.

Phases 1 and 2 are already complete:
- **Phase 1**: Tasks page restructured from 6→4 tabs (Triage, Board, Projects, Library). `useTriageItems` hook, `TriageContent`, `TriageActionCard`, `TriageIdeaCard`, `TriageEmptyState`, `BoardContent`, `LibraryContent`. Sidebar triage badge.
- **Phase 2**: `QuickAcceptPopover` (2-step promote replacing PromoteActionDialog as primary flow). Popover UI primitive. Project color stripes on kanban cards. Done column auto-collapse (7-day threshold). Quick-add "+" buttons on kanban column headers.

Read the Phase 1 and Phase 2 files to understand the current state before making changes.

---

## Scope: What to Build

### 1. Modify `src/hooks/useActions.ts` (~488 lines) — Optimize select + join

**Current state (lines 206-273):** Uses `select('*')` and a two-query pattern:
```typescript
// Query 1: fetch all columns
let query = supabase.from('actions').select('*').limit(limit);
// ... filters applied ...
const { data, error: queryError } = await query;

// Query 2: separate email enrichment
const emailIds = [...new Set(fetchedActions.filter((a) => a.email_id).map((a) => a.email_id!))];
if (emailIds.length > 0) {
  const { data: emails } = await supabase
    .from('emails')
    .select('id, subject, sender_name, sender_email')
    .in('id', emailIds);
  // ... enrichment loop ...
}
```

**Changes:**
- Define a `TRIAGE_LIST_FIELDS` constant with specific columns:
  ```typescript
  const TRIAGE_LIST_FIELDS = 'id, title, action_type, priority, urgency_score, deadline, email_id, status, created_at';
  ```
- Replace `select('*')` with a single Supabase join query:
  ```typescript
  let query = supabase
    .from('actions')
    .select(`${TRIAGE_LIST_FIELDS}, emails!email_id(subject, sender_name, sender_email)`)
    .limit(limit);
  ```
- Remove the entire second query block (emailIds collection + `.in('id', emailIds)` + enrichment loop)
- Update the data mapping to extract email fields from the joined `emails` object:
  ```typescript
  const fetchedActions: ActionWithEmail[] = (data || []).map((row) => ({
    ...row,
    email_subject: row.emails?.subject ?? null,
    email_sender: row.emails?.sender_name || row.emails?.sender_email || null,
  }));
  ```
- **Note:** The `emails` field from the join is an embedded object (Supabase PostgREST foreign key join). It may be `null` if no matching email exists.
- Keep all other methods (`toggleComplete`, `updateAction`, `createAction`, `deleteAction`) exactly as-is — they don't need the email join.
- The file has `// @ts-nocheck` at line 2 — leave it in place.

**Estimated savings:** ~6 KB less data transferred, eliminates 1 network round-trip.

---

### 2. Modify `src/hooks/useProjectItems.ts` (~360 lines) — Optimize select + join

**Current state (lines 144-193):** Same two-query pattern as useActions:
```typescript
let query = supabase.from('project_items').select('*').limit(limit);
// ... filters ...
// Then separate email enrichment with .in('id', emailIds)
```

**Changes:**
- Define a `BOARD_LIST_FIELDS` constant:
  ```typescript
  const BOARD_LIST_FIELDS = 'id, project_id, item_type, title, description, status, priority, due_date, source_email_id, source_action_id, tags, sort_order, completed_at, created_at, recurrence_pattern, recurrence_config, estimated_minutes';
  ```
- Replace `select('*')` with a single join query:
  ```typescript
  let query = supabase
    .from('project_items')
    .select(`${BOARD_LIST_FIELDS}, emails!source_email_id(id, subject, sender_name, sender_email, gist)`)
    .limit(limit);
  ```
- Remove the second query block (emailIds collection + enrichment loop, lines 171-193)
- Map the joined data to populate `ProjectItemWithEmail` fields:
  ```typescript
  const fetched: ProjectItemWithEmail[] = (data || []).map((row) => ({
    ...row,
    source_email_subject: row.emails?.subject ?? null,
    source_email_sender: row.emails?.sender_name || row.emails?.sender_email || null,
    source_email_gist: row.emails?.gist ?? null,
  }));
  ```
- Keep all other methods (`createItem`, `updateItem`, `deleteItem`, `toggleComplete`) exactly as-is.
- The file has `// @ts-nocheck` at line 2 — leave it in place.

---

### 3. Modify `src/hooks/useSidebarBadges.ts` (~129 lines) — Smarter triage count

**Current state (lines 87-91):** Counts ALL pending actions:
```typescript
// Query 3: Pending actions count (triage items)
supabase
  .from('actions')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending'),
```

**Problem:** After Phase 2, accepted actions get promoted to `project_items` (with `source_action_id` set), but they remain `status: 'pending'` in the `actions` table. This inflates the badge count.

**Changes:**
- Replace the simple count with an RPC call or a filter that excludes promoted actions.
- **Approach A (recommended — no migration):** Use a Supabase `.not()` filter with a subquery. However, Supabase PostgREST doesn't directly support `NOT EXISTS` subqueries. Instead, use a two-step approach:
  1. First fetch promoted action IDs: `supabase.from('project_items').select('source_action_id').not('source_action_id', 'is', null)`
  2. Then count pending actions excluding those IDs: `.not('id', 'in', `(${promotedIds.join(',')})`)`

  **However**, if the list is large, this could be unwieldy. A simpler approach:

- **Approach B (simpler):** Fetch both counts in parallel — pending actions count and promoted-action-IDs count — then subtract:
  ```typescript
  // Query 3a: All pending actions
  supabase
    .from('actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending'),

  // Query 3b: Promoted actions (have a project_item with matching source_action_id)
  supabase
    .from('project_items')
    .select('source_action_id', { count: 'exact', head: true })
    .not('source_action_id', 'is', null),
  ```
  Then: `triageCount = pendingCount - promotedCount` (clamped to 0).

- Update `Promise.all` to include the 4th query and adjust the result destructuring.
- Log the refined count.

**Key:** Don't change the `SidebarBadges` interface — `triageCount` stays as `number`.

---

### 4. Modify `src/hooks/useTriageItems.ts` (~297 lines) — Snooze persistence via localStorage

**Current state (lines 201-202):** Snooze is local state only, resets on page refresh:
```typescript
const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
const [snoozedUntil, setSnoozedUntil] = React.useState<Map<string, number>>(new Map());
```

**Changes:**
- Define a localStorage key constant:
  ```typescript
  const SNOOZE_STORAGE_KEY = 'ideabox_triage_snoozed';
  ```
- On mount, read snoozed items from localStorage and hydrate `snoozedUntil` state:
  ```typescript
  const [snoozedUntil, setSnoozedUntil] = React.useState<Map<string, number>>(() => {
    if (typeof window === 'undefined') return new Map();
    try {
      const stored = localStorage.getItem(SNOOZE_STORAGE_KEY);
      if (!stored) return new Map();
      const entries: [string, number][] = JSON.parse(stored);
      // Filter out expired snoozes
      const now = Date.now();
      return new Map(entries.filter(([, until]) => until > now));
    } catch {
      return new Map();
    }
  });
  ```
- When `snoozeItem` is called, also persist to localStorage:
  ```typescript
  const snoozeItem = React.useCallback(
    (id: string, type: 'action' | 'idea', minutes: number) => {
      const until = Date.now() + minutes * 60 * 1000;
      logger.info('Item snoozed', { type, itemId: id, snoozedUntil: new Date(until).toISOString() });
      setSnoozedUntil((prev) => {
        const next = new Map(prev).set(id, until);
        try {
          localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify([...next.entries()]));
        } catch { /* localStorage full — ignore */ }
        return next;
      });
    },
    []
  );
  ```
- Clean up expired snoozes on mount (already handled in the state initializer filter above).
- **Do NOT modify the hook's public interface.** `snoozeItem` signature stays the same.

---

### 5. Deprecate `src/components/projects/AllItemsContent.tsx` (~449 lines)

**Current state:** Not imported by `TasksTabs.tsx` (Phase 1 already replaced it with `BoardContent` + `TriageContent`), but still exported from `src/components/projects/index.ts` and referenced in docs.

**Changes:**
- Add a deprecation comment at the top of `AllItemsContent.tsx` (after the existing JSDoc):
  ```typescript
  /**
   * @deprecated March 2026 — Replaced by BoardContent + TriageContent in Phase 1.
   * Kept for rollback safety. Will be deleted after April 2026.
   * @see BoardContent for the kanban-first board view
   * @see TriageContent for the triage inbox view
   */
  ```
- Remove the `AllItemsContent` export from `src/components/projects/index.ts`
- **Do NOT delete the file itself** — keep for rollback safety per the design doc.

---

### 6. Modify `src/components/home/IdeaSparksCard.tsx` (~315 lines) — Update link

**Current state (line 216):**
```tsx
<Link href="/tasks?tab=ideas">
```

The `?tab=ideas` is a legacy redirect that goes to Triage (via `LEGACY_TAB_MAP`). This works but is indirect.

**Changes:**
- Update the link to go directly to the triage tab:
  ```tsx
  <Link href="/tasks">
  ```
  (Triage is the default tab — no `?tab=` param needed.)

---

### 7. Documentation — Final pass across 5 files

Update all docs to reflect the complete 3-phase redesign:

#### `docs/IMPLEMENTATION_STATUS.md`
- Add a new session entry for Phase 3 summarizing: query optimization (useActions + useProjectItems field selection + Supabase joins), smarter triage badge (excludes promoted actions), snooze persistence (localStorage), AllItemsContent deprecation, IdeaSparksCard link fix.

#### `docs/DECISIONS.md`
- Add Decision #29: Query optimization — select specific fields + Supabase joins (rationale: eliminate second round-trip, reduce payload ~6KB per hook)
- Add to the Quick Reference Table
- Add to the Change Log

#### `docs/ARCHITECTURE.md` (~300 lines)
- Verify the Tasks page description mentions the 4-tab structure (Triage, Board, Projects, Library)
- Add a note about the Supabase join pattern used in hooks

#### `docs/PROJECT_OVERVIEW.md` (~182 lines)
- Verify the Tasks page section reflects the current 4-tab structure
- Note: Triage is the default entry point

#### `README.md` (~147 lines)
- Verify any Tasks page mention is up-to-date with the 4-tab structure

---

## Implementation Order

Build in this order (each step should compile before moving on):

1. `useActions.ts` — field selection + Supabase join (3.1)
2. `useProjectItems.ts` — field selection + Supabase join (3.2)
3. `useSidebarBadges.ts` — smarter triage count (3.3)
4. `useTriageItems.ts` — snooze persistence (3.4)
5. AllItemsContent deprecation (3.5)
6. IdeaSparksCard link fix (3.6)
7. Documentation pass (3.7)

---

## Key Files to Read Before Starting

| File | Why |
|------|-----|
| `docs/TASKS_PAGE_REDESIGN.md` | Master plan — Phase 3 sections 3.1-3.7 |
| `src/hooks/useActions.ts` | 488 lines — current `select('*')` + two-query enrichment pattern (lines 206-273) |
| `src/hooks/useProjectItems.ts` | 360 lines — same two-query pattern (lines 144-193) |
| `src/hooks/useSidebarBadges.ts` | 129 lines — current simple pending count (lines 87-91) |
| `src/hooks/useTriageItems.ts` | 297 lines — current in-memory-only snooze state (lines 201-202, 269-276) |
| `src/types/database.ts` | `ActionWithEmail`, `ProjectItemWithEmail` types — need to know which email fields exist |
| `src/components/projects/AllItemsContent.tsx` | 449 lines — file to deprecate (add comment, remove from barrel export) |
| `src/components/home/IdeaSparksCard.tsx` | 315 lines — "View all" link to update (line 216) |
| `src/components/projects/index.ts` | Barrel export to remove AllItemsContent from |
| `src/components/tasks/TasksTabs.tsx` | Verify AllItemsContent is NOT imported here (it isn't — already confirmed) |

---

## Coding Standards (Non-Negotiable)

1. **400-line file limit.** None of the modified files should grow significantly. The main change is *replacing* code (two queries → one join), not adding.
2. **Logger on every modified hook.** Use existing `createLogger` instances. Log: query optimization wins (e.g., "Single-query fetch with join").
3. **JSDoc on every export.** Include `@module` and `@since` tags. Add `@updated March 2026 — Phase 3` where appropriate.
4. **TypeScript strict — no `any`.** Both hook files have `// @ts-nocheck` — leave that in place (it's for Supabase type generation issues). But don't introduce new `any` types in your code.
5. **No new npm packages.** Everything needed is already installed.
6. **No dead code.** When you replace the two-query pattern, fully remove the old email enrichment block. Don't leave commented-out code.
7. **Follow existing patterns:** The hooks already use `createClient()`, `createLogger()`, `React.useCallback`, optimistic updates. Match their style.
8. **Performance:** The `localStorage` read for snooze persistence should be in a `useState` initializer, not a `useEffect`. This prevents a flash of snoozed items appearing then disappearing.
9. **Don't break the public API.** Return types of all hooks must stay identical. Callers should not need any changes.

---

## What NOT to Do

- Do NOT add database migrations (no `snoozed_until` column — use localStorage per 3.4 Option A)
- Do NOT delete `AllItemsContent.tsx` — only deprecate it (add comment + remove barrel export)
- Do NOT modify `useIdeas.ts` (ideas are fetched via API, not Supabase direct — different pattern)
- Do NOT modify `TriageContent.tsx`, `TaskKanbanBoard.tsx`, `BoardContent.tsx`, or any other Phase 1/2 components
- Do NOT modify the `actions` or `project_items` table schemas
- Do NOT change the return types of any hooks
- Do NOT add new npm packages
- Do NOT implement anything from outside Phase 3 scope

---

## Verification Checklist

After implementation, verify:
- [ ] `useActions` fetches with a single query (no second email query)
- [ ] `useProjectItems` fetches with a single query (no second email query)
- [ ] Sidebar triage badge excludes already-promoted actions
- [ ] Snoozed items survive page refresh (check localStorage)
- [ ] Expired snoozes are cleaned up on mount
- [ ] `AllItemsContent` has deprecation comment and is removed from barrel export
- [ ] IdeaSparksCard "View all" links to `/tasks` (not `/tasks?tab=ideas`)
- [ ] All 5 doc files updated
- [ ] No new TypeScript errors introduced
- [ ] All hooks return the same types as before
