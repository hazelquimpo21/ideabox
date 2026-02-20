# IdeaBox Navigation Redesign — Implementation Plan

> **Created:** 2026-02-20
> **Status:** Planning
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

### Phase 1: Routing Shell & Sidebar
**Goal:** New nav works, old URLs redirect, nothing breaks.
**Risk:** Low — purely additive.

| # | Task | File(s) |
|---|------|---------|
| 1.1 | Update Sidebar.tsx — 5 nav items, updated sidebar sections | `src/components/layout/Sidebar.tsx` |
| 1.2 | Create thin wrapper pages: `/home`, `/inbox`, `/calendar`, `/tasks` | `app/(auth)/home/page.tsx`, `app/(auth)/inbox/page.tsx`, `app/(auth)/calendar/page.tsx`, `app/(auth)/tasks/page.tsx` |
| 1.3 | Set up all redirects (old routes → new routes) | `next.config.js` or redirect page files |
| 1.4 | Update Navbar logo link `/discover` → `/inbox` | `src/components/layout/Navbar.tsx` |
| 1.5 | Search & update all hardcoded route references | All files with href/router.push to old routes |

**Done when:**
- Sidebar shows 5 items + Settings
- All new routes load
- All old routes redirect correctly
- No broken links, active states work

---

### Phase 2: Page Builds — Home, Inbox, Calendar
**Goal:** Real content for Home, Inbox, and Calendar.
**Risk:** Medium — restructuring UI, reusing components.

| # | Task | Detail |
|---|------|--------|
| 2.1 | Build Home page | DailyBriefingHeader, priorities (reuse PriorityCard), TodaySchedule, PendingTasksList, ProfileCompletionNudge |
| 2.2 | Build Inbox with tabs | InboxTabs (Categories/Priority/Archive), move Discover components to Categories tab, new PriorityEmailList, move Archive components to Archive tab |
| 2.3 | Build Calendar page | Unified view toggle (calendar/list), merge DateCard + EventCard into CalendarItemCard, unified type filter, merge stats |

**Done when:**
- Home shows briefing + priorities + schedule + tasks
- Inbox has 3 working tabs, category detail pages work at `/inbox/[category]`
- Calendar shows unified dates + events with view toggle and type filtering

---

### Phase 3: Contacts Merge & Tasks Restructure
**Goal:** Merge Clients into Contacts, build Tasks tabs.
**Risk:** High (database migration) + Medium (Tasks UI).

| # | Task | Detail |
|---|------|--------|
| 3.1 | Database migration | Add columns, migrate data, add contact_id to emails/actions |
| 3.2 | Update Contacts API | Add `is_client` filter, client field updates, "promote to client" |
| 3.3 | Update Contacts page | Add tabs (All/Clients/Personal/Subscriptions), promote-to-client flow |
| 3.4 | Enhance Contact detail page | Client fields, tabs (Emails/Actions/Events/Notes) |
| 3.5 | Update client references | Deprecate useClients → use useContacts, update Hub scoring, email analysis |
| 3.6 | Build Tasks page with tabs | TasksTabs (To-dos/Campaigns/Templates), move components, nested campaign routes |

**Done when:**
- Client data appears in Contacts, promote-to-client works
- Contact detail shows full relationship history
- Tasks has 3 working tabs, campaign routes work at `/tasks/campaigns/*`

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
| File | Phase |
|------|-------|
| `app/(auth)/home/page.tsx` | 1, 2 |
| `app/(auth)/inbox/page.tsx` | 1, 2 |
| `app/(auth)/inbox/[category]/page.tsx` | 2 |
| `app/(auth)/inbox/[category]/[emailId]/page.tsx` | 2 |
| `app/(auth)/calendar/page.tsx` | 1, 2 |
| `app/(auth)/tasks/page.tsx` | 1, 3 |
| `app/(auth)/tasks/campaigns/new/page.tsx` | 3 |
| `app/(auth)/tasks/campaigns/[id]/page.tsx` | 3 |
| `supabase/migrations/XXX_merge_clients_contacts.sql` | 3 |

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

1. **Phase 1 is safe to ship independently** — additive only, nothing breaks.
2. **Phase 2 pages can be built one at a time** — Home → Inbox → Calendar.
3. **Phase 3 DB migration must be tested against a copy of production data** before running live.
4. **Phase 4 deletions only after Phase 3 is validated** in production for a few days.
5. **The `/sent` page stays as-is** — not part of this redesign.
6. **`client_id` columns kept during Phase 3**, removed only in Phase 4 after validation.
