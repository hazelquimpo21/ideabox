# IdeaBox Navigation Redesign — Implementation Plan

> **Created:** 2026-02-20
> **Status:** Phase 2 COMPLETE — Phase 3 ready to begin
> **Goal:** Simplify navigation from 11 top-level items to 5, reorganize screens for clarity.

---

## Navigation: Before & After

### BEFORE (11 items)
```
Hub            /hub
Discover       /discover
Actions        /actions
Clients        /clients
Campaigns      /campaigns
Templates      /templates
Contacts       /contacts
Timeline       /timeline
Events         /events
Archive        /archive
Settings       /settings
```

### AFTER (5 items + Settings)
```
Home           /home
Inbox          /inbox
Contacts       /contacts
Calendar       /calendar
Tasks          /tasks
─────────────
Settings       /settings
```

### Sidebar Sections (below nav)
```
[Quick Filters]     → Category shortcuts into Inbox (update hrefs from /discover/* to /inbox/*)
[Upcoming]          → Next 2-3 calendar items (links to /calendar)
[Top Contacts]      → VIP/high-priority contacts (links to /contacts/[id])
```

---

## Screen Specifications

### 1. HOME (`/home`)

**Replaces:** Hub (`/hub`)
**Purpose:** Daily briefing — "here's your day at a glance."

#### Sections
| Section | Data Source | Description |
|---------|-----------|-------------|
| Daily Briefing Header | New | Greeting + "3 priorities, 2 events today, 5 pending tasks" |
| Priorities (top 3) | `useHubPriorities()` / `GET /api/hub/priorities` | AI-scored priority cards (reuse PriorityCard) |
| Today's Schedule | `useExtractedDates()` filtered to today/tomorrow | Compact timeline: time + title + type icon |
| Pending Tasks (top 5) | `useActions()` filtered pending, sorted urgency | Quick-complete checkboxes, "View all →" link to /tasks |
| Profile Nudge | `useUserContext()` | Existing ProfileCompletionNudge (if < 50%) |

#### User Stories
- US-H1: I open the app and see a natural language summary of my day
- US-H2: I see top 3 AI-scored priorities with suggested actions
- US-H3: I see today's events and deadlines in a compact timeline
- US-H4: I can check off a task directly from Home
- US-H5: I can click any item to navigate to its detail view

#### Components
- **Reuse:** `PriorityCard` (from Hub), `ProfileCompletionNudge` (from Hub)
- **New:** `DailyBriefingHeader`, `TodaySchedule`, `PendingTasksList`

---

### 2. INBOX (`/inbox`)

**Replaces:** Discover (`/discover`) + Archive (`/archive`)
**Purpose:** All your email, intelligently organized.

#### Tabs
| Tab | Description | Source |
|-----|-------------|--------|
| **Categories** (default) | 12 life-bucket category cards with counts | Discover's CategoryCardGrid |
| **Priority** | Emails ranked by AI priority score | New (uses priority_score on emails) |
| **Archive** | Archived emails with search/restore/delete | Archive page |

#### Routes
```
/inbox                              → Categories tab (default)
/inbox?tab=priority                 → Priority tab
/inbox?tab=archive                  → Archive tab
/inbox/[category]                   → Category detail (email list)
/inbox/[category]/[emailId]         → Single email view
```

#### User Stories
- US-I1: I see emails organized by life-bucket category
- US-I2: I can view emails ranked by AI importance in Priority tab
- US-I3: I can access archived emails in Archive tab
- US-I4: I can trigger email analysis from Inbox
- US-I5: I can bulk-archive a category
- US-I6: I can search and restore archived emails
- US-I7: Clicking a category card opens the email list

#### Components
- **Reuse:** `StartAnalysisCard`, `SyncProgressCard`, `CategoryCardGrid`, `CategoryModal`, `ClientInsights`, `QuickActions`, `FailureSummary`, `DiscoveryHero`, Archive search/filter/bulk/`ArchivedEmailItem`
- **New:** `InboxTabs` (tab container), `PriorityEmailList` (email list sorted by score)

---

### 3. CONTACTS (`/contacts`)

**Replaces:** Contacts (`/contacts`) + Clients (`/clients`)
**Purpose:** Everyone you interact with — people and businesses — unified.

#### Tabs
| Tab | Filter Logic | Source |
|-----|-------------|--------|
| **All** (default) | No filter | Contacts page |
| **Clients** | `is_client = true` | Clients page (merged) |
| **Personal** | `relationship_type IN (friend, family)` | New filter |
| **Subscriptions** | `sender_type = broadcast` | Existing Contacts tab |

#### Routes
```
/contacts                          → All tab
/contacts?tab=clients              → Clients tab
/contacts?tab=personal             → Personal tab
/contacts?tab=subscriptions        → Subscriptions tab
/contacts/[id]                     → Contact detail (enhanced)
```

#### Contact Detail Page (`/contacts/[id]`) — Enhanced
Shows contact info + client fields (if is_client) + tabs for:
- **Emails** — recent emails with this contact
- **Actions** — tasks related to this contact
- **Events** — events/dates involving this contact
- **Notes** — editable notes

#### Data Model Changes (see Database Migrations)
Contacts table gains: `is_client`, `client_status`, `client_priority`, `email_domains`, `keywords`

#### User Stories
- US-C1: I see all people and businesses in one place
- US-C2: I can filter to clients, personal contacts, or subscriptions
- US-C3: I can promote any contact to a client by adding business details
- US-C4: I can see a contact's full history (emails, actions, events)
- US-C5: I can mark anyone as VIP
- US-C6: I can add email domains for auto-matching emails to a client

#### Components
- **Reuse:** Contact list/cards, stats, search, sort, pagination, `SyncContactsButton`, `ClientDialog` fields
- **New:** `PromoteToClientDialog`, `ContactDetailEnhanced` (detail page with tabs), `ClientsTab`

---

### 4. CALENDAR (`/calendar`)

**Replaces:** Events (`/events`) + Timeline (`/timeline`)
**Purpose:** Everything with a date — events, deadlines, birthdays, payments — unified.

#### Views
| View | Source |
|------|--------|
| **Calendar** (grid) | Timeline's CalendarView |
| **List** (grouped) | Timeline + Events list views merged |

#### Filters
- **Type:** All, Events, Deadlines, Birthdays, Payments, Appointments, Follow-ups
- **Toggle:** Show acknowledged/past items

#### Routes
```
/calendar                          → Default view
/calendar?view=list                → List view
/calendar?view=calendar            → Calendar grid
/calendar?type=event               → Filtered to events
/calendar?highlight=[id]           → Scroll to item
```

#### User Stories
- US-K1: I see all dates and events in one unified view
- US-K2: I can switch between calendar and list views
- US-K3: I can filter by type (events, deadlines, birthdays, etc.)
- US-K4: I can snooze a deadline or dismiss an event
- US-K5: I can add any event to my external calendar
- US-K6: Overdue items are prominent at the top of list view

#### Components
- **Reuse:** `CalendarView` (from Timeline), `DateGroup`/`DateCard` (from Timeline), `EventGroup`/`EventCard` (from Events), `TypeFilter`, `StatsBanner`
- **New:** `CalendarPage` (unified container), `CalendarItemCard` (merged DateCard + EventCard)

---

### 5. TASKS (`/tasks`)

**Replaces:** Actions (`/actions`) + Campaigns (`/campaigns`) + Templates (`/templates`)
**Purpose:** Everything you need to do — to-dos, campaigns, templates.

#### Tabs
| Tab | Source |
|-----|--------|
| **To-dos** (default) | Actions page |
| **Campaigns** | Campaigns page |
| **Templates** | Templates page |

#### Routes
```
/tasks                             → To-dos tab
/tasks?tab=campaigns               → Campaigns tab
/tasks?tab=templates               → Templates tab
/tasks/campaigns/new               → Create campaign
/tasks/campaigns/[id]              → Campaign detail
```

#### User Stories
- US-T1: I see all to-do items extracted from emails
- US-T2: I can filter tasks by status (pending, in progress, completed)
- US-T3: I can mark tasks complete with a checkbox
- US-T4: I can manage email campaigns under Campaigns tab
- US-T5: I can create and edit templates under Templates tab

#### Components
- **Reuse:** All Actions page components → To-dos tab, All Campaigns page components → Campaigns tab, All Templates page components → Templates tab
- **New:** `TasksTabs` (tab container)

---

## Redirects (All Old Routes)

```
/hub                    → /home
/discover               → /inbox
/discover/[cat]         → /inbox/[cat]
/discover/[cat]/[id]    → /inbox/[cat]/[id]
/actions                → /tasks
/events                 → /calendar?type=event
/events?highlight=X     → /calendar?type=event&highlight=X
/timeline               → /calendar?view=list
/clients                → /contacts?tab=clients
/clients/[id]           → /contacts/[id]
/campaigns              → /tasks?tab=campaigns
/campaigns/new          → /tasks/campaigns/new
/campaigns/[id]         → /tasks/campaigns/[id]
/templates              → /tasks?tab=templates
/archive                → /inbox?tab=archive
```

---

## Database Migrations

### Migration: Merge Clients into Contacts

#### Step 1: Add client columns to contacts
```sql
ALTER TABLE contacts ADD COLUMN is_client BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN client_status TEXT CHECK (client_status IN ('active', 'inactive', 'archived'));
ALTER TABLE contacts ADD COLUMN client_priority TEXT CHECK (client_priority IN ('vip', 'high', 'medium', 'low'));
ALTER TABLE contacts ADD COLUMN email_domains TEXT[];
ALTER TABLE contacts ADD COLUMN keywords TEXT[];

CREATE INDEX idx_contacts_is_client ON contacts(user_id, is_client) WHERE is_client = TRUE;
CREATE INDEX idx_contacts_client_status ON contacts(user_id, client_status) WHERE is_client = TRUE;
```

#### Step 2: Migrate client data into contacts
```sql
-- Update existing contacts that match a client by email
UPDATE contacts c
SET
  is_client = TRUE,
  client_status = cl.status,
  client_priority = cl.priority,
  email_domains = cl.email_domains,
  keywords = cl.keywords,
  company = COALESCE(c.company, cl.company),
  name = COALESCE(c.name, cl.name),
  notes = CASE
    WHEN c.notes IS NOT NULL AND cl.notes IS NOT NULL
    THEN c.notes || E'\n---\n' || cl.notes
    ELSE COALESCE(c.notes, cl.notes)
  END,
  relationship_type = 'client',
  is_vip = CASE WHEN cl.priority = 'vip' THEN TRUE ELSE c.is_vip END
FROM clients cl
WHERE c.user_id = cl.user_id AND c.email = cl.email;

-- Create contacts for clients with no matching contact
INSERT INTO contacts (
  user_id, email, name, company, is_client, client_status,
  client_priority, email_domains, keywords, notes,
  relationship_type, is_vip, import_source
)
SELECT
  cl.user_id, COALESCE(cl.email, 'client-' || cl.id || '@placeholder.local'),
  cl.name, cl.company, TRUE, cl.status,
  cl.priority, cl.email_domains, cl.keywords, cl.notes,
  'client', (cl.priority = 'vip'), 'manual'
FROM clients cl
WHERE NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.user_id = cl.user_id AND c.email = cl.email
);
```

#### Step 3: Add contact_id to emails and actions (alongside client_id)
```sql
ALTER TABLE emails ADD COLUMN contact_id UUID REFERENCES contacts(id);
ALTER TABLE actions ADD COLUMN contact_id UUID REFERENCES contacts(id);

-- Populate from client_id mapping
UPDATE emails e SET contact_id = c.id
FROM contacts c JOIN clients cl ON c.user_id = cl.user_id AND c.email = cl.email
WHERE e.client_id = cl.id;

UPDATE actions a SET contact_id = c.id
FROM contacts c JOIN clients cl ON c.user_id = cl.user_id AND c.email = cl.email
WHERE a.client_id = cl.id;
```

#### Step 4 (Phase 4 only): Drop old columns and table
```sql
-- Only after full validation
ALTER TABLE emails DROP COLUMN client_id;
ALTER TABLE actions DROP COLUMN client_id;
ALTER TABLE clients RENAME TO clients_deprecated;
```

### Migration Risk Summary
| Change | Risk | Reversible |
|--------|------|------------|
| Add 5 columns to contacts | Low | Yes (drop columns) |
| Copy client data into contacts | Low | Yes (clients table unchanged) |
| Add contact_id to emails + actions | Low | Yes (drop columns) |
| Populate contact_id | Medium | Yes (client_id still intact) |
| Drop clients table (Phase 4) | High | No — do last, after validation |

---

## Implementation Phases

### Phase 1: Routing Shell & Sidebar ✅ COMPLETE
**Goal:** New nav works, old URLs redirect, nothing breaks.
**Risk:** Low — purely additive.
**Completed:** 2026-02-20 on branch `claude/redesign-sidebar-navigation-E0mab`

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.1 | Update Sidebar.tsx — 5 nav items (Home/Inbox/Contacts/Calendar/Tasks), category filters link to /inbox/[category], events link to /calendar, "Top Contacts" section rename, client links → /contacts/[id] | `src/components/layout/Sidebar.tsx` | ✅ |
| 1.2 | Create thin wrapper pages: `/home` (wraps Hub), `/inbox` (wraps Discover + Archive via ?tab), `/inbox/[category]` (wraps CategoryDetail), `/inbox/[category]/[emailId]` (wraps EmailDetail), `/calendar` (wraps Events), `/tasks` (wraps Actions + Campaigns + Templates via ?tab) | `app/(auth)/home/page.tsx`, `app/(auth)/inbox/page.tsx`, `app/(auth)/inbox/[category]/page.tsx`, `app/(auth)/inbox/[category]/[emailId]/page.tsx`, `app/(auth)/calendar/page.tsx`, `app/(auth)/tasks/page.tsx` | ✅ |
| 1.3 | Set up all redirects (16 redirect rules) in next.config.mjs | `next.config.mjs` | ✅ |
| 1.4 | Update Navbar logo link `/discover` → `/inbox` | `src/components/layout/Navbar.tsx` | ✅ |
| 1.5 | Update PageHeader breadcrumb home link `/discover` → `/inbox` | `src/components/layout/PageHeader.tsx` | ✅ |
| 1.6 | Update QuickActions routes: `/actions` → `/tasks`, `/events` → `/calendar` | `src/components/discover/QuickActions.tsx` | ✅ |
| 1.7 | Update ClientInsights route: `/clients/[id]` → `/contacts/[id]` | `src/components/discover/ClientInsights.tsx` | ✅ |
| 1.8 | Update onboarding redirects: `/discover` → `/inbox` (3 locations) | `src/app/onboarding/page.tsx`, `src/app/onboarding/context/page.tsx` | ✅ |
| 1.9 | Update landing page redirect: `/discover` → `/inbox` | `src/app/page.tsx` | ✅ |
| 1.10 | Update auth callback default: `/discover` → `/inbox` | `src/app/api/auth/callback/route.ts` | ✅ |
| 1.11 | Update add-send-scope default: `/discover` → `/inbox` | `src/app/api/auth/add-send-scope/route.ts` | ✅ |
| 1.12 | Update docstrings and comments across all modified files | Multiple files | ✅ |

**Phase 1 Verification:**
- ✅ Sidebar shows 5 items (Home, Inbox, Contacts, Calendar, Tasks) + Settings
- ✅ All new routes have page files that render existing components
- ✅ 16 redirect rules in next.config.mjs cover all old routes
- ✅ Category quick-filters link to /inbox/[category]
- ✅ Upcoming Events section links to /calendar
- ✅ "Top Contacts" section renamed from "Clients"
- ✅ Navbar logo links to /inbox
- ✅ No TypeScript errors introduced (all existing TS errors are pre-existing)
- ✅ Old page files preserved for Phase 4 deletion

**Files modified (14):**
```
next.config.mjs                                   — Redirects + config
src/app/(auth)/inbox/page.tsx                     — Replaced old redirect with Inbox page
src/app/api/auth/add-send-scope/route.ts          — Default return path
src/app/api/auth/callback/route.ts                — Default redirect path
src/app/onboarding/context/page.tsx               — Redirect after wizard
src/app/onboarding/page.tsx                       — Redirect after sync
src/app/page.tsx                                  — Redirect for authenticated users
src/components/discover/ClientInsights.tsx         — Client link → contacts
src/components/discover/QuickActions.tsx           — Actions → tasks, events → calendar
src/components/layout/Navbar.tsx                  — Logo link
src/components/layout/PageHeader.tsx              — Breadcrumb home link
src/components/layout/Sidebar.tsx                 — Nav items, sections, links
src/components/onboarding/UserContextWizard.tsx   — Docstring examples
src/hooks/useInitialSyncProgress.ts               — Docstring example
```

**Files created (6):**
```
src/app/(auth)/home/page.tsx                      — Thin wrapper around HubPage
src/app/(auth)/inbox/[category]/page.tsx          — Thin wrapper around CategoryDetailPage
src/app/(auth)/inbox/[category]/[emailId]/page.tsx — Thin wrapper around EmailDetailPage
src/app/(auth)/calendar/page.tsx                  — Thin wrapper around EventsPage
src/app/(auth)/tasks/page.tsx                     — Tab router for Actions/Campaigns/Templates
```

**Important for Phase 2 developer:**
- All new pages are thin wrappers — they import and render existing page components
- The old page files at `/hub`, `/discover`, `/actions`, `/events`, `/timeline`, `/clients`, `/campaigns`, `/templates`, `/archive` still exist and must NOT be deleted until Phase 4
- The `/inbox/page.tsx` uses `?tab=archive` to switch between Discover and Archive views
- The `/tasks/page.tsx` uses `?tab=campaigns` and `?tab=templates` to switch between Actions, Campaigns, and Templates
- Phase 2 should replace these thin wrappers with real tabbed UI components

---

### Phase 2: Page Builds — Home, Inbox, Calendar ✅ COMPLETE
**Goal:** Real content for Home, Inbox, and Calendar.
**Risk:** Medium — restructuring UI, reusing components.
**Completed:** 2026-02-20 on branch `claude/phase-2-navigation-redesign-pJreh`

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.1 | Build DailyBriefingHeader — time-of-day greeting with summary stats (priorities, events, tasks) | `src/components/home/DailyBriefingHeader.tsx` | ✅ |
| 2.2 | Build TodaySchedule — compact timeline of today/tomorrow events with links to `/calendar?highlight=[id]` | `src/components/home/TodaySchedule.tsx` | ✅ |
| 2.3 | Build PendingTasksList — top 5 pending tasks with quick-complete checkboxes and "View all →" link | `src/components/home/PendingTasksList.tsx` | ✅ |
| 2.4 | Build Home page — assemble all sections: DailyBriefingHeader, Top 3 PriorityCards (reused from Hub), TodaySchedule (merged events + dates), PendingTasksList, ProfileCompletionNudge, Explore More nav | `src/app/(auth)/home/page.tsx` | ✅ |
| 2.5 | Build PriorityEmailList — emails ranked by AI priority score from Supabase | `src/components/inbox/PriorityEmailList.tsx` | ✅ |
| 2.6 | Build InboxTabs — three-tab container with URL-persisted tab state via `?tab=` | `src/components/inbox/InboxTabs.tsx` | ✅ |
| 2.7 | Build Inbox page — PageHeader + InboxTabs (Categories→DiscoverPage, Priority→PriorityEmailList, Archive→ArchivePage) | `src/app/(auth)/inbox/page.tsx` | ✅ |
| 2.8 | Build CalendarStats — merged stats banner from events + extracted dates | `src/components/calendar/CalendarStats.tsx` | ✅ |
| 2.9 | Build Calendar page — unified view with list/calendar toggle, type filters, merged groups, highlight support, show past/done toggles | `src/app/(auth)/calendar/page.tsx` | ✅ |
| 2.10 | Verify sidebar active state highlighting on all routes | `src/components/layout/Sidebar.tsx` | ✅ (no changes needed) |

**Phase 2 Verification:**
- ✅ Home shows Daily Briefing Header with greeting + summary stats
- ✅ Home shows top 3 AI-scored PriorityCards (reused from Hub)
- ✅ Home shows Today's Schedule (merged events + extracted dates)
- ✅ Home shows Pending Tasks with quick-complete checkboxes
- ✅ Home shows ProfileCompletionNudge when profile < 50%
- ✅ Inbox has 3 working tabs: Categories (default), Priority, Archive
- ✅ Inbox Categories tab renders full DiscoverPage with sync/analysis
- ✅ Inbox Priority tab shows emails sorted by AI priority score
- ✅ Inbox Archive tab renders full ArchivePage with search/filter/bulk
- ✅ Tab state persists in URL query params (`?tab=`, `?view=`, `?type=`)
- ✅ Calendar has working view toggle (Calendar Grid / List)
- ✅ Calendar List view shows merged events + extracted dates, grouped by time period
- ✅ Calendar Calendar view renders the grid from CalendarView component
- ✅ Calendar type filters work (All, Events, Deadlines, Birthdays, etc.)
- ✅ `?highlight=` param works to scroll to and highlight a specific item
- ✅ Active sidebar highlighting works on all pages and sub-pages
- ✅ All new components have `createLogger()` logging
- ✅ All new components have JSDoc comments
- ✅ Zero new TypeScript errors introduced
- ✅ No old page files deleted (Phase 4)
- ✅ `/inbox/[category]` and `/inbox/[category]/[emailId]` thin wrappers unchanged

**Files created (10):**
```
src/components/home/DailyBriefingHeader.tsx    — Greeting + summary stats
src/components/home/TodaySchedule.tsx          — Compact timeline of today's events/deadlines
src/components/home/PendingTasksList.tsx        — Top 5 tasks with quick-complete
src/components/home/index.ts                   — Barrel exports
src/components/inbox/InboxTabs.tsx             — Three-tab container with URL sync
src/components/inbox/PriorityEmailList.tsx     — Emails ranked by AI priority score
src/components/inbox/index.ts                  — Barrel exports
src/components/calendar/CalendarStats.tsx      — Merged stats banner
src/components/calendar/index.ts               — Barrel exports
```

**Files modified (3):**
```
src/app/(auth)/home/page.tsx                   — Replaced HubPage wrapper with full Home page
src/app/(auth)/inbox/page.tsx                  — Replaced switch-based wrapper with InboxTabs
src/app/(auth)/calendar/page.tsx               — Replaced EventsPage wrapper with unified Calendar
```

**Important for Phase 3 developer:**
- The Home page replicates PriorityCard inline rather than importing from Hub (Hub exports nothing; Phase 4 will clean this up)
- The InboxTabs component imports DiscoverPage and ArchivePage directly as tab content — these still render their own PageHeaders (slight duplication, cleaned up in Phase 4)
- The Calendar page merges events from `useEvents()` and dates from `useExtractedDates()` — both are shown in the list view, but only dates appear in the CalendarView grid (CalendarView only accepts ExtractedDate[])
- The `/tasks/page.tsx` still uses the Phase 1 thin wrapper pattern — Phase 3 will replace it with TasksTabs
- The Contacts page has NOT been touched yet — Phase 3 will add tabs and the client merge

---

### Phase 3: Contacts Merge & Tasks Restructure
**Goal:** Merge Clients into Contacts, build Tasks tabs.
**Risk:** High (database migration) + Medium (Tasks UI).

| # | Task | Detail | File(s) |
|---|------|--------|---------|
| 3.1 | Database migration — Add client columns to contacts | Add `is_client`, `client_status`, `client_priority`, `email_domains`, `keywords` columns + indexes | `supabase/migrations/XXX_merge_clients_contacts.sql` |
| 3.2 | Database migration — Migrate client data into contacts | Update existing contacts matching clients, insert new contacts for unmatched clients | Same migration file |
| 3.3 | Database migration — Add contact_id to emails/actions | Add `contact_id` FK column, populate from client_id mapping | Same migration file |
| 3.4 | Update Contacts API — Add client filtering and operations | Add `is_client` filter param, "promote to client" endpoint, client field update support | `src/app/api/contacts/route.ts`, new `src/app/api/contacts/promote/route.ts` |
| 3.5 | Update useContacts hook — Add client-related filters and operations | Add `isClient` filter option, `promoteToClient()` function, update Contact interface with client fields | `src/hooks/useContacts.ts` |
| 3.6 | Build ContactsTabs component — All/Clients/Personal/Subscriptions | Tab container with URL-persisted state via `?tab=`, reuses existing contact list components | `src/components/contacts/ContactsTabs.tsx` |
| 3.7 | Build PromoteToClientDialog — Promote a contact to client status | Dialog form with client fields: status, priority, email domains, keywords | `src/components/contacts/PromoteToClientDialog.tsx` |
| 3.8 | Update Contacts page — Replace current page with tabbed layout | PageHeader + ContactsTabs, add promote-to-client action on cards | `src/app/(auth)/contacts/page.tsx` |
| 3.9 | Enhance Contact detail page — Add client section and relationship tabs | Show client fields when `is_client`, add Emails/Actions/Events/Notes tabs, promote action | `src/app/(auth)/contacts/[id]/page.tsx` |
| 3.10 | Update client references in Hub scoring | Update `hub-priority-service.ts` to use contacts with `is_client` instead of clients table | `src/services/hub/hub-priority-service.ts` |
| 3.11 | Build TasksTabs component — To-dos/Campaigns/Templates | Tab container with URL-persisted state via `?tab=`, renders existing page components | `src/components/tasks/TasksTabs.tsx` |
| 3.12 | Build Tasks page — Replace thin wrapper with TasksTabs | PageHeader + TasksTabs, preserve campaign sub-routes | `src/app/(auth)/tasks/page.tsx` |
| 3.13 | Create campaign sub-route wrappers | Thin wrappers at `/tasks/campaigns/new` and `/tasks/campaigns/[id]` | `src/app/(auth)/tasks/campaigns/new/page.tsx`, `src/app/(auth)/tasks/campaigns/[id]/page.tsx` |

**Done when:**
- Client data appears in Contacts under "Clients" tab
- Promote-to-client works from contact card and detail page
- Contact detail shows full relationship history with Emails/Actions/Events/Notes tabs
- Tasks has 3 working tabs (To-dos, Campaigns, Templates)
- Campaign routes work at `/tasks/campaigns/new` and `/tasks/campaigns/[id]`
- Hub priority scoring uses contacts instead of clients table

---

### Phase 4: Cleanup & Polish
**Goal:** Remove deprecated code, final polish.
**Risk:** Low — removing old code after validation.

| # | Task | Detail |
|---|------|--------|
| 4.1 | Delete old page files | hub, discover, actions, events, timeline, clients, campaigns, templates, archive dirs |
| 4.2 | Remove old hooks & API routes | useClients(), /api/clients/* (or keep as proxy) |
| 4.3 | Database cleanup | Drop client_id columns, archive clients table |
| 4.4 | Update onboarding flow | Fix any references to old routes |
| 4.5 | Sweep for remaining old references | grep all old route strings, update |
| 4.6 | Polish | Active states, mobile sidebar, tab persistence, keyboard shortcuts |

**Done when:**
- No old page files remain
- No references to old routes in codebase
- Mobile nav works, tabs persist, no console errors

---

## Key Files Reference

### Files to Modify
| File | Phase |
|------|-------|
| `src/components/layout/Sidebar.tsx` | 1 |
| `src/components/layout/Navbar.tsx` | 1 |
| `app/(auth)/contacts/page.tsx` | 3 |
| `app/(auth)/contacts/[id]/page.tsx` | 3 |
| `app/api/contacts/route.ts` | 3 |

### Files to Create
| File | Phase | Status |
|------|-------|--------|
| `app/(auth)/home/page.tsx` | 1 → 2 | ✅ Phase 1 wrapper → Phase 2 full page |
| `app/(auth)/inbox/page.tsx` | 1 → 2 | ✅ Phase 1 wrapper → Phase 2 InboxTabs |
| `app/(auth)/inbox/[category]/page.tsx` | 1 | ✅ Thin wrapper (preserved) |
| `app/(auth)/inbox/[category]/[emailId]/page.tsx` | 1 | ✅ Thin wrapper (preserved) |
| `app/(auth)/calendar/page.tsx` | 1 → 2 | ✅ Phase 1 wrapper → Phase 2 unified CalendarPage |
| `app/(auth)/tasks/page.tsx` | 1 → 3 | ✅ Phase 1 tab router (Phase 3 will build TasksTabs) |
| `components/home/DailyBriefingHeader.tsx` | 2 | ✅ Created |
| `components/home/TodaySchedule.tsx` | 2 | ✅ Created |
| `components/home/PendingTasksList.tsx` | 2 | ✅ Created |
| `components/inbox/InboxTabs.tsx` | 2 | ✅ Created |
| `components/inbox/PriorityEmailList.tsx` | 2 | ✅ Created |
| `components/calendar/CalendarStats.tsx` | 2 | ✅ Created |
| `components/contacts/ContactsTabs.tsx` | 3 | Pending |
| `components/contacts/PromoteToClientDialog.tsx` | 3 | Pending |
| `components/tasks/TasksTabs.tsx` | 3 | Pending |
| `app/(auth)/tasks/campaigns/new/page.tsx` | 3 | Pending |
| `app/(auth)/tasks/campaigns/[id]/page.tsx` | 3 | Pending |
| `app/api/contacts/promote/route.ts` | 3 | Pending |
| `supabase/migrations/XXX_merge_clients_contacts.sql` | 3 | Pending |

### Files to Delete (Phase 4)
```
app/(auth)/hub/
app/(auth)/discover/
app/(auth)/actions/
app/(auth)/events/
app/(auth)/timeline/
app/(auth)/clients/
app/(auth)/campaigns/
app/(auth)/templates/
app/(auth)/archive/
```

---

## Notes

1. **Phase 1 shipped independently** — additive only, nothing broke. ✅
2. **Phase 2 shipped independently** — all three pages (Home, Inbox, Calendar) built in one pass. ✅
3. **Phase 3 DB migration must be tested against a copy of production data** before running live.
4. **Phase 4 deletions only after Phase 3 is validated** in production for a few days.
5. **The `/sent` page stays as-is** — not part of this redesign.
6. **`client_id` columns kept during Phase 3**, removed only in Phase 4 after validation.
7. **Phase 2 left some duplication intentionally** — DiscoverPage and ArchivePage render their own PageHeaders inside InboxTabs (Phase 4 cleanup). PriorityCard is duplicated in the Home page because Hub doesn't export it (Phase 4 extraction to shared component).
