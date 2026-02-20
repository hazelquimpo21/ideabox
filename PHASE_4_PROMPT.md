# Phase 4: Cleanup & Polish — Implementation Prompt

> **Context:** Phases 1–3 of the IdeaBox navigation redesign are complete.
> The app now has 5 top-level nav items (Home, Inbox, Contacts, Calendar, Tasks)
> with tabbed UIs, the Clients entity merged into Contacts, and all old routes
> redirected. Phase 4 removes deprecated code, extracts shared components, and
> polishes the UX.
>
> **See:** `NAVIGATION_REDESIGN_PLAN.md` for full context, phase history, and
> route/redirect reference.

---

## Important Constraints

1. **Order matters.** Follow the section order (4A → 4B → 4C → 4D → 4E → 4F).
   Extracting content components (4B) MUST happen before deleting old page files (4C),
   because tab components currently import those old pages directly.
2. **Do NOT delete any API routes that are called by components you're keeping.**
   For example, `/api/campaigns/` and `/api/templates/` are still used by the campaigns
   and templates features — only `/api/clients/` is being removed.
3. **Keep all Next.js redirects in `next.config.mjs`** for now. These ensure old
   bookmarks and external links still work. Note in a comment that they can be removed
   after a transition period.
4. **The `clients` table should be RENAMED, not dropped.** Use
   `ALTER TABLE clients RENAME TO clients_deprecated;` for safety.
5. **Run `npx tsc --noEmit` after each section** to verify no new type errors.
   Pre-existing errors in `CalendarView.tsx` are known and can be ignored.
6. **Preserve the existing code patterns:**
   - `createLogger()` for all new components
   - JSDoc with `═══` section headers and `───` subsection headers
   - Barrel exports via `index.ts` files
   - `'use client'` directive on all client components

---

## Section 4A: Database Cleanup

**Goal:** Remove the legacy `client_id` columns and archive the `clients` table.

### Prerequisites — Validate Before Proceeding
Before creating the migration, verify that the Phase 3 migration
(`029_merge_clients_into_contacts.sql`) has been applied and that `contact_id`
is populated on emails and actions:

```sql
-- Should return 0 rows (all emails with a client_id also have a contact_id)
SELECT count(*) FROM emails WHERE client_id IS NOT NULL AND contact_id IS NULL;
SELECT count(*) FROM actions WHERE client_id IS NOT NULL AND contact_id IS NULL;
```

If any rows lack `contact_id`, run the Step 3 populate queries from migration 029 again
before proceeding.

### Task 4A.1 — Create Migration `030_cleanup_client_id_columns.sql`

**File:** `supabase/migrations/030_cleanup_client_id_columns.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 030: Cleanup — Drop client_id columns, archive clients table
-- Phase 4 of the Navigation Redesign
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Drop client_id from emails ─────────────────────────────────────
ALTER TABLE emails DROP COLUMN IF EXISTS client_id;

-- ─── Step 2: Drop client_id from actions ─────────────────────────────────────
ALTER TABLE actions DROP COLUMN IF EXISTS client_id;

-- ─── Step 3: Archive the clients table ───────────────────────────────────────
-- Rename rather than drop so we can recover data if needed.
ALTER TABLE clients RENAME TO clients_deprecated;
```

### Task 4A.2 — Update Database Types

**File:** `src/types/database.ts`

1. Remove `client_id: string | null` from `emails.Row` and `emails.Insert`
2. Remove `client_id: string | null` from `actions.Row`, `actions.Insert`, and `actions.Update`
3. Remove (or comment out) the `clients` table type definition entirely
4. Add a comment: `// clients table archived as clients_deprecated in migration 030`

### Task 4A.3 — Update API Schemas

**File:** `src/lib/api/schemas.ts`

Remove any `client_id` references from email or action schemas, if present.

### Acceptance Criteria — 4A
- [ ] Migration file `030_cleanup_client_id_columns.sql` exists
- [ ] `client_id` removed from all TypeScript types for emails and actions
- [ ] `clients` table type removed from `database.ts`
- [ ] `npx tsc --noEmit` passes (no new errors)

---

## Section 4B: Extract Content Components

**Goal:** Move page body content out of old page files into standalone components,
so the tab containers (TasksTabs, InboxTabs) can import reusable content instead
of full Next.js page files.

**Why:** Currently TasksTabs imports `ActionsPage`, `CampaignsPage`, `TemplatesPage`
directly from `src/app/(auth)/actions/page.tsx` etc. These are page components that
render their own `PageHeader`, creating duplicate headers inside tabs. Extracting the
content portion lets us delete the old page files cleanly.

### Task 4B.1 — Extract `ActionsContent`

**Source:** `src/app/(auth)/actions/page.tsx`
**Target:** `src/components/actions/ActionsContent.tsx`

1. Read the actions page and identify everything below the `PageHeader`
2. Move that content into a new `ActionsContent` component
3. The component should accept no props (it uses `useActions()` internally)
4. Create `src/components/actions/index.ts` barrel export
5. Update `src/components/tasks/TasksTabs.tsx`:
   ```tsx
   // BEFORE
   import ActionsPage from '@/app/(auth)/actions/page';
   // AFTER
   import { ActionsContent } from '@/components/actions';
   ```
6. Replace `<ActionsPage />` with `<ActionsContent />` in the To-dos tab

### Task 4B.2 — Extract `CampaignsContent`

**Source:** `src/app/(auth)/campaigns/page.tsx`
**Target:** `src/components/campaigns/CampaignsContent.tsx`

Same pattern as 4B.1. Update TasksTabs to use `CampaignsContent`.

**Important:** The campaigns page at `/campaigns/page.tsx` is the list view.
The `/campaigns/[id]/page.tsx` (detail) and `/campaigns/new/page.tsx` (create) are
separate — they are already wrapped at `/tasks/campaigns/[id]` and `/tasks/campaigns/new`.
Only extract the list page content.

### Task 4B.3 — Extract `TemplatesContent`

**Source:** `src/app/(auth)/templates/page.tsx`
**Target:** `src/components/templates/TemplatesContent.tsx`

Same pattern as 4B.1. Update TasksTabs to use `TemplatesContent`.

### Task 4B.4 — Extract `DiscoverContent`

**Source:** `src/app/(auth)/discover/page.tsx`
**Target:** `src/components/discover/DiscoverContent.tsx`

1. Read the discover page and identify everything below the `PageHeader`
2. Move that content into a new `DiscoverContent` component
3. The Discover page also has sub-components in `src/app/(auth)/discover/components/`
   (`StartAnalysisCard.tsx`, `SyncProgressCard.tsx`, `index.ts`). These should be
   moved to `src/components/discover/` if not already there, or kept as-is if they're
   only used by DiscoverContent.
4. Update `src/components/inbox/InboxTabs.tsx`:
   ```tsx
   // BEFORE
   import DiscoverPage from '@/app/(auth)/discover/page';
   // AFTER
   import { DiscoverContent } from '@/components/discover';
   ```

**Note:** The Discover page uses several components from `src/components/discover/`
already (CategoryCardGrid, ClientInsights, QuickActions, etc.). These stay where
they are — only the page's body gets extracted.

### Task 4B.5 — Extract `ArchiveContent`

**Source:** `src/app/(auth)/archive/page.tsx`
**Target:** `src/components/archive/ArchiveContent.tsx`

Same pattern. Update InboxTabs to use `ArchiveContent`.

### Task 4B.6 — Extract `PriorityCard` to Shared Component

**Source:** `src/app/(auth)/home/page.tsx` (lines ~135-285, inline PriorityCard)
**Also in:** `src/app/(auth)/hub/page.tsx` (original version)
**Target:** `src/components/shared/PriorityCard.tsx`

1. Read both the Home page and Hub page to find the PriorityCard implementations
2. Create a single canonical `PriorityCard` component at the target path
3. Include its supporting types (`TypeConfig`, `ActionConfig`, etc.)
4. Create `src/components/shared/index.ts` barrel export
5. Update the Home page to import from the shared component
6. Remove the inline PriorityCard definition from the Home page

### Task 4B.7 — Update Campaign Sub-route Wrappers

After extracting CampaignsContent, the thin wrappers at
`/tasks/campaigns/[id]/page.tsx` and `/tasks/campaigns/new/page.tsx` still import
from the OLD campaign page paths. Update them:

**File:** `src/app/(auth)/tasks/campaigns/[id]/page.tsx`
```tsx
// BEFORE
import CampaignDetailPage from '@/app/(auth)/campaigns/[id]/page';
// AFTER — import from the new location if the detail page was extracted,
//          OR keep the same import if only the list page was extracted.
```

**Decision:** If the campaign detail and new pages are standalone enough to keep,
leave their imports as-is and just move the files to a components directory. If they're
simple enough, they can stay as route files that we keep (not part of the old page
deletion).

### Acceptance Criteria — 4B
- [ ] `ActionsContent`, `CampaignsContent`, `TemplatesContent` components exist
- [ ] `DiscoverContent`, `ArchiveContent` components exist
- [ ] `PriorityCard` exists as shared component
- [ ] `TasksTabs` imports `*Content` components instead of old page components
- [ ] `InboxTabs` imports `*Content` components instead of old page components
- [ ] Home page imports `PriorityCard` from shared instead of defining inline
- [ ] No duplicate `PageHeader` renders inside tab panels
- [ ] `npx tsc --noEmit` passes (no new errors)

---

## Section 4C: Delete Old Page Directories

**Goal:** Remove old route directories that are fully replaced by the new navigation.

**Prerequisite:** Section 4B must be complete — all imports from old pages must be
updated to use the new `*Content` components first.

### Task 4C.1 — Delete Old Page Directories

Delete these directories:

```bash
rm -rf src/app/(auth)/hub/
rm -rf src/app/(auth)/discover/
rm -rf src/app/(auth)/actions/
rm -rf src/app/(auth)/events/
rm -rf src/app/(auth)/timeline/
rm -rf src/app/(auth)/clients/
rm -rf src/app/(auth)/archive/
```

**CAUTION with campaigns and templates:**

The campaigns directory contains:
```
src/app/(auth)/campaigns/page.tsx        ← list (extracted to CampaignsContent)
src/app/(auth)/campaigns/[id]/page.tsx   ← detail (still referenced by /tasks/campaigns/[id])
src/app/(auth)/campaigns/new/page.tsx    ← create (still referenced by /tasks/campaigns/new)
```

**Strategy for campaigns:**
- If the campaign detail and new pages have been refactored (4B.7), delete the whole directory
- If they're still importing from the old path, you MUST either:
  - a) Move detail/new pages to a component path and update imports, OR
  - b) Keep the campaigns directory and only delete `campaigns/page.tsx`

Same consideration applies to templates — check if any sub-routes import from it.

```
src/app/(auth)/templates/page.tsx        ← list (extracted to TemplatesContent)
```
Templates has no sub-routes, so delete the whole directory.

### Task 4C.2 — Verify No Broken Imports

After deletion, run:
```bash
npx tsc --noEmit
```

Fix any broken imports that reference deleted files.

### Acceptance Criteria — 4C
- [ ] Directories for hub, discover, actions, events, timeline, clients, archive are deleted
- [ ] Campaigns directory handled (fully deleted or partially cleaned)
- [ ] Templates directory deleted
- [ ] `npx tsc --noEmit` passes (no new errors from deleted files)
- [ ] No runtime imports reference deleted files

---

## Section 4D: Delete Old Hooks & API Routes, Clean Hub Service

**Goal:** Remove legacy client code and the dual-source fallback in Hub scoring.

### Task 4D.1 — Delete `useClients` Hook

**File to delete:** `src/hooks/useClients.ts`

1. First verify no component still imports `useClients`:
   ```bash
   grep -r "useClients" src/ --include="*.ts" --include="*.tsx" -l
   ```
2. If only the hook file itself and possibly old deleted pages reference it, delete it
3. Remove any re-export from `src/hooks/index.ts` if one exists

### Task 4D.2 — Delete `/api/clients/` API Routes

**Files to delete:**
```
src/app/api/clients/route.ts
src/app/api/clients/[id]/route.ts
```

1. First verify no component still calls these endpoints:
   ```bash
   grep -r "/api/clients" src/ --include="*.ts" --include="*.tsx" -l
   ```
2. The `useClients` hook (deleted in 4D.1) was the only consumer. If confirmed, delete both files.

### Task 4D.3 — Remove Legacy Clients Fallback from Hub Priority Service

**File:** `src/services/hub/hub-priority-service.ts`

In the `fetchClientMap()` function:
1. Remove the "fallback: legacy clients table" section that queries the `clients` table
2. The function should ONLY query `contacts` where `is_client = true`
3. Remove the `resolvedClientId` fallback logic in email/action scoring — use only `contact_id`
4. If `EmailCandidate` or `ActionCandidate` interfaces have `client_id`, remove it
5. Update any comments referencing the dual-source strategy

**Before (conceptual):**
```typescript
// Primary: contacts table
const { data: contacts } = await supabase
  .from('contacts')
  .select('*')
  .eq('is_client', true);

// Fallback: legacy clients table
const { data: legacyClients } = await supabase
  .from('clients')
  .select('*');

// Scoring: check contact_id, then fall back to client_id
const resolvedClientId = email.contact_id || email.client_id;
```

**After:**
```typescript
// Contacts with is_client = true
const { data: contacts } = await supabase
  .from('contacts')
  .select('*')
  .eq('is_client', true);

// Scoring: use contact_id only
const clientContactId = email.contact_id;
```

### Task 4D.4 — Remove `client_id` from Hub Scoring Interfaces

**File:** `src/services/hub/hub-priority-service.ts`

If `EmailCandidate` or `ActionCandidate` interfaces still have `client_id` field,
remove it. All scoring should use `contact_id` exclusively.

### Acceptance Criteria — 4D
- [ ] `useClients.ts` deleted
- [ ] `/api/clients/` directory and routes deleted
- [ ] Hub priority service has NO reference to `clients` table
- [ ] Hub priority service uses `contact_id` exclusively (no `client_id` fallback)
- [ ] `npx tsc --noEmit` passes (no new errors)

---

## Section 4E: Route & Reference Sweep

**Goal:** Find and update all remaining references to old routes in the codebase.

### Task 4E.1 — Sweep for Old Route Strings

Run a comprehensive search for old route patterns:

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  -E "'/hub'|'/discover'|'/actions'|'/events'|'/timeline'|'/clients'|'/campaigns'|'/templates'|'/archive'" \
  src/
```

**Expected results and how to handle them:**

| Pattern | Likely Location | Action |
|---------|----------------|--------|
| `/hub` | Home page comments, hub service | Update comments to reference `/home` |
| `/discover` | Inbox components, comments | Update to `/inbox` |
| `/discover/[category]` | Inbox sub-routes | Already handled (wrappers at `/inbox/[category]`) |
| `/actions` | Task references, comments | Update to `/tasks` |
| `/events` | Calendar references | Update to `/calendar` |
| `/timeline` | Calendar references | Update to `/calendar` |
| `/clients` | Contacts references, sidebar comments | Update to `/contacts?tab=clients` |
| `/campaigns` | Task references | Update to `/tasks?tab=campaigns` |
| `/templates` | Task references | Update to `/tasks?tab=templates` |
| `/archive` | Inbox references | Update to `/inbox?tab=archive` |

**Exceptions — DO NOT change these:**
- `next.config.mjs` redirect rules (these intentionally reference old routes as `source`)
- Import paths like `from '@/app/(auth)/campaigns/[id]/page'` (if campaigns sub-pages still exist)
- API route paths like `/api/campaigns/` — these are NOT old routes, they're active API endpoints
- Database/migration references

### Task 4E.2 — Update Component Route References

Components that link to old routes (router.push, href, Link) should be updated:

```typescript
// BEFORE
router.push('/actions');
// AFTER
router.push('/tasks');

// BEFORE
<Link href="/clients">
// AFTER
<Link href="/contacts?tab=clients">
```

**Key files to check:**
- `src/components/discover/QuickActions.tsx` (may still reference old routes in some places)
- `src/components/discover/ClientInsights.tsx` (client links)
- `src/components/home/PendingTasksList.tsx` (view all tasks link)
- `src/components/home/TodaySchedule.tsx` (event links)
- Any component with `useRouter()` or `<Link>`

### Task 4E.3 — Update Docstrings and Comments

Update JSDoc and inline comments that reference old routes. These don't affect
functionality but keep documentation accurate.

### Acceptance Criteria — 4E
- [ ] No component code (links, router.push) uses old route strings
- [ ] Comments and docstrings updated to reference new routes
- [ ] `next.config.mjs` redirects preserved (with comment about transition period)
- [ ] API route paths (`/api/campaigns/`, `/api/templates/`, etc.) left intact

---

## Section 4F: Polish & UX

**Goal:** Final UX verification and cleanup.

### Task 4F.1 — Verify Sidebar Active State

**File:** `src/components/layout/Sidebar.tsx`

Test that these routes correctly highlight the parent nav item:
- `/home` → Home highlighted
- `/inbox`, `/inbox/newsletters`, `/inbox/newsletters/123` → Inbox highlighted
- `/contacts`, `/contacts/abc-123`, `/contacts?tab=clients` → Contacts highlighted
- `/calendar`, `/calendar?view=list` → Calendar highlighted
- `/tasks`, `/tasks?tab=campaigns`, `/tasks/campaigns/new`, `/tasks/campaigns/123` → Tasks highlighted

### Task 4F.2 — Remove Duplicate PageHeaders in Tabs

After 4B, verify that no tab panel renders a duplicate PageHeader. The parent pages
(Inbox, Tasks, Contacts) each have their own PageHeader — the content inside tabs
should NOT have another one.

### Task 4F.3 — Tab Keyboard Accessibility

Verify that all tab components (InboxTabs, ContactsTabs, TasksTabs) support:
- Arrow keys to navigate between tabs
- Enter/Space to select a tab
- This should work automatically if using Radix UI Tabs (`@radix-ui/react-tabs`)
  or shadcn/ui Tabs component

### Task 4F.4 — Remove `@ts-nocheck` from Modified Files (Best Effort)

Focus on files we modified in Phases 1–3:
- `src/hooks/useContacts.ts` — try to fix type issues and remove `@ts-nocheck`
- `src/app/(auth)/contacts/[id]/page.tsx` — same

Don't attempt to fix all 43 files with `@ts-nocheck` — just the ones we touched.

### Acceptance Criteria — 4F
- [ ] Sidebar highlighting works on all routes and sub-routes
- [ ] No duplicate PageHeaders inside tab panels
- [ ] Tabs are keyboard accessible
- [ ] `@ts-nocheck` removed from files we modified (where feasible)

---

## Files Summary

### Files to CREATE
```
supabase/migrations/030_cleanup_client_id_columns.sql
src/components/actions/ActionsContent.tsx
src/components/actions/index.ts
src/components/campaigns/CampaignsContent.tsx
src/components/campaigns/index.ts
src/components/templates/TemplatesContent.tsx
src/components/templates/index.ts
src/components/discover/DiscoverContent.tsx
src/components/archive/ArchiveContent.tsx
src/components/archive/index.ts
src/components/shared/PriorityCard.tsx
src/components/shared/index.ts
```

### Files to MODIFY
```
src/types/database.ts                         — Remove client_id, clients type
src/lib/api/schemas.ts                        — Remove client_id from schemas
src/components/tasks/TasksTabs.tsx             — Import *Content components
src/components/inbox/InboxTabs.tsx             — Import *Content components
src/app/(auth)/home/page.tsx                   — Import shared PriorityCard
src/services/hub/hub-priority-service.ts       — Remove legacy fallback
src/components/contacts/index.ts               — Update barrel exports if needed
src/components/discover/index.ts               — Add DiscoverContent export
```

### Files to DELETE
```
src/app/(auth)/hub/                            — Replaced by /home
src/app/(auth)/discover/                       — Replaced by /inbox (after extraction)
src/app/(auth)/actions/                        — Replaced by /tasks (after extraction)
src/app/(auth)/events/                         — Replaced by /calendar
src/app/(auth)/timeline/                       — Replaced by /calendar
src/app/(auth)/clients/                        — Replaced by /contacts?tab=clients
src/app/(auth)/campaigns/page.tsx              — Replaced by /tasks?tab=campaigns (keep [id] and new if needed)
src/app/(auth)/templates/                      — Replaced by /tasks?tab=templates
src/app/(auth)/archive/                        — Replaced by /inbox?tab=archive
src/hooks/useClients.ts                        — Replaced by useContacts with isClient filter
src/app/api/clients/route.ts                   — Replaced by /api/contacts with isClient filter
src/app/api/clients/[id]/route.ts              — Same
```

### Files to KEEP (DO NOT delete)
```
src/app/api/campaigns/                         — Active API (used by campaigns feature)
src/app/api/templates/                         — Active API (used by templates feature)
src/app/api/actions/                           — Active API (used by actions/todos feature)
src/app/api/events/                            — Active API (used by calendar feature)
src/app/(auth)/campaigns/[id]/page.tsx         — Keep if sub-route wrappers still import it
src/app/(auth)/campaigns/new/page.tsx          — Keep if sub-route wrappers still import it
next.config.mjs                                — Keep redirects intact
```

---

## Done When

- [ ] No `clients` table in active schema (renamed to `clients_deprecated`)
- [ ] No `client_id` columns on emails or actions
- [ ] No `useClients` hook or `/api/clients/` routes
- [ ] Hub service reads exclusively from contacts (no legacy fallback)
- [ ] Old page directories deleted (hub, discover, actions, events, timeline, clients, archive, templates)
- [ ] Tab components use extracted `*Content` components (no page imports, no duplicate headers)
- [ ] `PriorityCard` is a shared component (no duplication)
- [ ] No component code references old routes (`/hub`, `/discover`, `/actions`, etc.)
- [ ] Sidebar highlighting works on all routes
- [ ] `npx tsc --noEmit` passes with no new errors
- [ ] All changes committed and pushed
