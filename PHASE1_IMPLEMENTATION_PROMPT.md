# Phase 1 Implementation Prompt

> Copy-paste this into a new Claude Code session to kick off Phase 1.

---

## Prompt

You are implementing Phase 1 of a navigation redesign for the IdeaBox app (a Next.js email intelligence platform). Read `NAVIGATION_REDESIGN_PLAN.md` in the project root for full context.

**Phase 1 Goal:** Restructure the sidebar navigation from 11 items to 5, create new route pages as thin wrappers, set up redirects from all old routes, and update internal links. Nothing should break — old URLs redirect, new nav works.

### What to do:

#### 1. Update the Sidebar (`src/components/layout/Sidebar.tsx`)

Replace the `mainNavItems` array with exactly 5 items:
```
Home       → /home      (icon: Home from lucide-react)
Inbox      → /inbox     (icon: Mail)
Contacts   → /contacts  (icon: Users — already exists)
Calendar   → /calendar  (icon: Calendar)
Tasks      → /tasks     (icon: CheckSquare)
```
Settings stays at the bottom as-is.

Update sidebar sections:
- **Category quick-filters**: Change hrefs from `/discover/client_pipeline` → `/inbox/client_pipeline`, etc. for all 4 categories.
- **Upcoming Events**: Change the "View all events" link from `/events` to `/calendar`. Update any event click links from `/events?highlight=` to `/calendar?highlight=`.
- **Clients Quick Access**: Rename the section header to "Top Contacts". Links to `/contacts/[id]` are fine (path unchanged).

#### 2. Create new route pages (thin wrappers initially)

Create these pages that initially just render the existing page components:

- `app/(auth)/home/page.tsx` — Import and render the Hub page content (copy the component tree from `app/(auth)/hub/page.tsx`)
- `app/(auth)/inbox/page.tsx` — Import and render the Discover page content (copy from `app/(auth)/discover/page.tsx`). Also handle the `?tab=archive` query param to show Archive content instead.
- `app/(auth)/inbox/[category]/page.tsx` — Copy from `app/(auth)/discover/[category]/page.tsx` if it exists, or handle category routing the same way Discover does.
- `app/(auth)/inbox/[category]/[emailId]/page.tsx` — Same pattern for email detail.
- `app/(auth)/calendar/page.tsx` — Import and render the Events page content (copy from `app/(auth)/events/page.tsx`)
- `app/(auth)/tasks/page.tsx` — Import and render the Actions page content (copy from `app/(auth)/actions/page.tsx`). Also handle `?tab=campaigns` and `?tab=templates` query params.

These are THIN WRAPPERS for now — just get the routes working. Phase 2 will build out the real tabbed UIs.

#### 3. Set up redirects for all old routes

Use Next.js redirects in `next.config.js` (or `next.config.ts` / `next.config.mjs` — check which exists). Add permanent redirects:

```
/hub                    → /home
/discover               → /inbox
/discover/:category     → /inbox/:category
/discover/:cat/:emailId → /inbox/:cat/:emailId
/actions                → /tasks
/events                 → /calendar
/timeline               → /calendar
/clients                → /contacts?tab=clients
/campaigns              → /tasks?tab=campaigns
/campaigns/new          → /tasks/campaigns/new
/campaigns/:id          → /tasks/campaigns/:id
/templates              → /tasks?tab=templates
/archive                → /inbox?tab=archive
```

Note: If Next.js redirects can't handle query params well, create small redirect page files instead that use `redirect()` from `next/navigation`.

#### 4. Update Navbar (`src/components/layout/Navbar.tsx`)

Change the logo/brand link from `/discover` to `/inbox`.

#### 5. Find and update ALL hardcoded route references

Search the entire codebase for these patterns and update them:
- `"/hub"` or `'/hub'` → `"/home"` (but NOT in redirect files you just created)
- `"/discover"` → `"/inbox"` (careful with `/discover/` subroutes)
- `"/actions"` → `"/tasks"`
- `"/events"` → `"/calendar"`
- `"/timeline"` → `"/calendar"`
- `"/clients"` → `"/contacts?tab=clients"` (but `/clients/[id]` → `/contacts/[id]` if the route exists)
- `"/campaigns"` → `"/tasks?tab=campaigns"` (but campaign detail routes → `/tasks/campaigns/[id]`)
- `"/templates"` → `"/tasks?tab=templates"`
- `"/archive"` → `"/inbox?tab=archive"`

Check: `router.push()`, `router.replace()`, `href=`, `Link href=`, `redirect()` calls, and any string constants.

Do NOT update references inside the old page files themselves (they'll be deleted in Phase 4). Focus on shared components, hooks, and the new pages.

### Acceptance criteria:
- [ ] Sidebar shows exactly 5 nav items (Home, Inbox, Contacts, Calendar, Tasks) + Settings
- [ ] Clicking each nav item loads a page without error
- [ ] All old routes redirect to their new equivalents (test: /hub, /discover, /actions, /events, /timeline, /clients, /campaigns, /templates, /archive)
- [ ] Category quick-filters link to `/inbox/[category]`
- [ ] Upcoming Events section links to `/calendar`
- [ ] Sidebar "Top Contacts" section header is renamed
- [ ] Navbar logo links to `/inbox`
- [ ] Active nav highlighting works on all pages
- [ ] No broken links in the app
- [ ] The app compiles without errors

### Important constraints:
- Do NOT delete any old page files — they'll be removed in Phase 4
- Do NOT restructure page content yet (no tabs) — that's Phase 2
- Do NOT touch the database — that's Phase 3
- Keep the old page files working for now (redirects point to new routes, but old components are reused)
- Commit your work with clear messages and push to the working branch

### Helpful commands:
```bash
# Find all route references to update
grep -rn '"/hub"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/discover' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/actions"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/events"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/timeline"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/clients"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/campaigns' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/templates"' --include="*.tsx" --include="*.ts" src/ app/
grep -rn '"/archive"' --include="*.tsx" --include="*.ts" src/ app/

# Verify build
npm run build
```
