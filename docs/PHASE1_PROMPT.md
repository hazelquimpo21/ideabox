# Phase 1 Implementation Prompt — Tasks Page Triage-First Redesign

> Copy-paste this entire prompt to a new Claude Code session to implement Phase 1.

---

## Your Task

Implement **Phase 1** of the Tasks page redesign as documented in `docs/TASKS_PAGE_REDESIGN.md`. This restructures the Tasks page from 6 tabs to 4, promotes the TriageTray into a full-width default tab, adds a kanban-first Board tab, and merges Campaigns + Templates into a Library tab.

**Read `docs/TASKS_PAGE_REDESIGN.md` first** — it's the master plan. Sections 1.1 through 1.7 are your scope. Do NOT implement Phase 2 or Phase 3.

---

## Scope: What to Build

### 1. `src/hooks/useTriageItems.ts` (NEW — ~120 lines)

Composition hook that merges `useActions` + `useIdeas` into a unified triage stream.

**What it does:**
- Calls `useActions({ status: 'pending', limit: 30, sortBy: 'urgency' })`
- Calls `useIdeas({ limit: 20 })`
- Merges both into a single `TriageItem[]` array with a normalized interface
- Sorts by: overdue actions first → normalized urgency DESC → actions with deadlines float above ideas at equal urgency
- Provides `dismissItem()` and `snoozeItem()` (snooze is local state only — stores `snoozedUntil` timestamp, items reappear when time passes)
- Returns `{ items, stats: { total, actions, ideas }, isLoading, dismissItem, snoozeItem, refetch }`

**Type signature (from the plan):**
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
  raw: ActionWithEmail | IdeaItem;  // original object for handlers
}
```

**Reference hooks to understand:**
- `src/hooks/useActions.ts` — returns `ActionWithEmail[]` with `urgency_score`, `deadline`, `email_subject`, `email_sender`
- `src/hooks/useIdeas.ts` — returns `IdeaItem[]` with `confidence`, `type`, `emailId`, `emailSubject`, `emailSender`

---

### 2. `src/components/projects/TriageContent.tsx` (NEW — ~200 lines)

Full-width triage tab — this is the new **default tab** of the Tasks page. Not a collapsible card like TriageTray; it's a standalone page section.

**Structure:**
- Stats banner: "12 items to triage · 8 tasks · 4 ideas"
- Filter pills: [All] [Tasks (N)] [Ideas (N)] — local state filter on `type`
- Sort toggle: Urgency (default)
- Item list: renders TriageActionCard or TriageIdeaCard per item
- Accept button: opens existing `PromoteActionDialog` for actions, calls `saveIdea` for ideas (Phase 2 replaces this with QuickAcceptPopover)
- Dismiss button: calls `dismissItem` from `useTriageItems`
- Snooze button: calls `snoozeItem` from `useTriageItems`
- Empty state: celebratory "You're all caught up" with checkmark icon and link to Board tab

**Data source:** `useTriageItems()` hook from step 1.

**Reuse from TriageTray:** The existing `src/components/projects/TriageTray.tsx` has `ActionSuggestion` and `IdeaSuggestion` sub-components with styled cards, deadline formatting, action type labels, and email links. You can extract and reuse these patterns. The `formatDeadline` helper and `ACTION_TYPE_LABELS` map are directly reusable.

**Important:** TriageContent is the full-page version. Keep `TriageTray.tsx` as-is — don't modify or delete it. It may be reused elsewhere.

---

### 3. `src/components/projects/TriageActionCard.tsx` (NEW — ~80 lines)

Action suggestion card extracted for reuse. Based on the `ActionSuggestion` component in `TriageTray.tsx` (lines 100-185). Add the Snooze button between Accept and Dismiss.

---

### 4. `src/components/projects/TriageIdeaCard.tsx` (NEW — ~70 lines)

Idea suggestion card extracted for reuse. Based on the `IdeaSuggestion` component in `TriageTray.tsx` (lines 197-271). Add the Snooze button between Accept/Save and Dismiss.

---

### 5. `src/components/projects/TriageEmptyState.tsx` (NEW — ~40 lines)

Celebration empty state shown when all items are triaged. Checkmark or party icon, "You're all caught up" message, and a link/button to navigate to the Board tab (`?tab=board`).

---

### 6. `src/components/projects/BoardContent.tsx` (NEW — ~300 lines)

Fork of `src/components/projects/AllItemsContent.tsx` with these changes:
- **Remove** the `TriageTray` import and rendering (triage is its own tab now)
- **Change** default `viewMode` from `'list'` to `'kanban'`
- Keep everything else: StatsCards, FilterBar, search, list/kanban toggle, CreateItemDialog, PromoteActionDialog

**Do NOT delete `AllItemsContent.tsx`** — keep it as-is. BoardContent is a separate file.

**Reference:** Read `src/components/projects/AllItemsContent.tsx` (450 lines) to understand the full structure.

---

### 7. `src/components/tasks/LibraryContent.tsx` (NEW — ~60 lines)

Simple wrapper with internal sub-tabs for Campaigns and Templates. Same pattern as `src/components/inbox/DiscoveriesFeed.tsx` (uses local state for sub-tab, renders existing content components).

**Structure:**
- Internal tab bar: [Campaigns] [Templates]
- Reads `sub` query param from URL: `?tab=library&sub=templates` → Templates sub-tab
- Default sub-tab: Campaigns
- Renders existing `CampaignsContent` or `TemplatesContent` unchanged

**Imports:**
```typescript
import { CampaignsContent } from '@/components/campaigns';
import { TemplatesContent } from '@/components/templates';
```

---

### 8. Modify `src/components/tasks/TasksTabs.tsx`

Restructure from 6 tabs to 4.

**Changes:**
- `VALID_TABS`: `['triage', 'board', 'projects', 'library']`
- `DEFAULT_TAB`: `'triage'`
- Add `LEGACY_TAB_MAP` for backward-compatible redirects:
  ```typescript
  const LEGACY_TAB_MAP: Record<string, string> = {
    items: 'board',
    todos: 'triage',
    ideas: 'triage',
    campaigns: 'library',
    templates: 'library',
  };
  ```
- On mount, if `tabParam` is in `LEGACY_TAB_MAP`, redirect to the new tab value using `router.replace()`
- Update `TabsTrigger` entries:
  - `triage` with Inbox icon (from lucide-react) — "Triage"
  - `board` with LayoutGrid icon — "Board"
  - `projects` with FolderKanban icon — "Projects"
  - `library` with FileText icon — "Library"
- Update `TabsContent` entries to render the new components
- Update imports accordingly

---

### 9. Modify `src/hooks/useSidebarBadges.ts`

Add a 3rd parallel count query for triage badge:

```typescript
// Query 3: Pending actions count (triage items)
supabase
  .from('actions')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending')
```

Add to the existing `Promise.all()`. Add `triageCount` to the return type and state.

---

### 10. Modify `src/components/layout/Sidebar.tsx`

Add amber badge to the Tasks nav item showing `triageCount` (same pattern as Inbox's red `mustReplyCount` badge and Calendar's amber `todayDeadlineCount` badge).

In the `mainNavItems.map()` block (~line 680), add:
```typescript
else if (item.label === 'Tasks' && triageCount > 0) {
  actionBadge = { count: triageCount, color: 'amber' };
}
```

---

### 11. Update barrel exports

**`src/components/projects/index.ts`** — add exports for:
- `BoardContent`
- `TriageContent`
- `TriageActionCard`
- `TriageIdeaCard`
- `TriageEmptyState`

---

### 12. Update documentation

- `README.md` — Tasks tabs description: mention 4 tabs (Triage, Board, Projects, Library)
- `docs/ARCHITECTURE.md` — Tasks tab routing table
- `docs/IMPLEMENTATION_STATUS.md` — New session entry for this work
- `docs/DECISIONS.md` — Add Decision #27: Tasks page triage-first redesign

---

## Implementation Order

Build in this order (each step should compile before moving to the next):

1. `useTriageItems` hook (no UI dependency)
2. `TriageActionCard`, `TriageIdeaCard`, `TriageEmptyState` (small leaf components)
3. `TriageContent` (uses the hook + card components)
4. `BoardContent` (fork of AllItemsContent)
5. `LibraryContent` (simple wrapper)
6. `TasksTabs` restructure (wire everything together)
7. `useSidebarBadges` + `Sidebar` (badge addition)
8. Barrel exports
9. Documentation updates

---

## Coding Standards (Non-Negotiable)

1. **400-line file limit.** Split into sub-components if a file approaches 400 lines. TriageContent is the most likely candidate — that's why the card components are separate files.

2. **Logger on every new file.** Use `createLogger('ComponentName')` at the top. Log: mount/load with data counts, user actions (accept, dismiss, snooze, filter change, tab change), and errors with context. Example:
   ```typescript
   import { createLogger } from '@/lib/utils/logger';
   const logger = createLogger('TriageContent');
   logger.info('Triage loaded', { actionCount, ideaCount });
   ```

3. **JSDoc on every export.** Every exported function, component, type, and interface gets a JSDoc block explaining what it does and which module it belongs to. Include `@module` and `@since March 2026` tags.

4. **TypeScript strict — no `any`.** Use the existing type patterns: `ActionWithEmail`, `ProjectItemWithEmail`, `IdeaItem`.

5. **No dead code.** If you fork AllItemsContent into BoardContent, actively remove the TriageTray section. Don't comment it out.

6. **Modular architecture.** Hooks in `src/hooks/`. Components in their directory. Business logic stays in hooks, not components.

7. **Follow existing patterns:**
   - URL-synced tabs via `?tab=` query param (see current `TasksTabs.tsx`)
   - Filter pills with active ring styling (see `AllItemsContent.tsx` FilterBar)
   - Badge with count on sidebar nav (see `useSidebarBadges.ts` + `Sidebar.tsx`)
   - Card-based suggestion items (see `TriageTray.tsx`)
   - Internal sub-tabs (see `DiscoveriesFeed.tsx` for the pattern)
   - Use `'use client'` at top of every component/hook file

8. **Comment style.** Use the established section separator style:
   ```typescript
   // ═══════════════════════════════════════════════════════════════════════════════
   // SECTION NAME
   // ═══════════════════════════════════════════════════════════════════════════════
   ```

9. **Performance awareness.** Don't add `useEffect` hooks that fire on every render. Use `useCallback` for event handlers passed as props. Don't premature-optimize `useMemo` for small arrays (~50 items).

10. **Test legacy redirects.** After implementing, verify mentally that all old URLs in `LEGACY_TAB_MAP` resolve to the correct new tab.

---

## Key Files to Read Before Starting

Read these files to understand the patterns you'll follow:

| File | Why |
|------|-----|
| `docs/TASKS_PAGE_REDESIGN.md` | Master plan — Phase 1 sections 1.1-1.7 |
| `src/components/tasks/TasksTabs.tsx` | The file you'll modify — current 6-tab structure |
| `src/components/projects/TriageTray.tsx` | Card patterns, formatting helpers, hook usage |
| `src/components/projects/AllItemsContent.tsx` | BoardContent is a fork of this |
| `src/hooks/useActions.ts` | Actions hook API — you'll compose this in useTriageItems |
| `src/hooks/useIdeas.ts` | Ideas hook API — you'll compose this in useTriageItems |
| `src/hooks/useSidebarBadges.ts` | Badge pattern you'll extend |
| `src/components/layout/Sidebar.tsx` | Where badge wiring goes |
| `src/components/inbox/DiscoveriesFeed.tsx` | Sub-tab pattern for LibraryContent |
| `src/components/projects/index.ts` | Barrel exports to update |

---

## What NOT to Do

- Do NOT implement Phase 2 (QuickAcceptPopover, project color stripes, Done auto-collapse)
- Do NOT implement Phase 3 (query optimization, snooze persistence to DB)
- Do NOT delete `AllItemsContent.tsx` or `TriageTray.tsx` — keep them as-is
- Do NOT modify `useActions.ts` or `useIdeas.ts` — consume them as-is
- Do NOT add new npm packages — everything needed is already installed
- Do NOT add database migrations — this is presentation layer only
- Do NOT refactor existing components beyond what's specified
