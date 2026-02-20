# Phase 3 Prompt — Contacts Merge & Tasks Restructure

> Copy this entire file as the prompt when starting Phase 3 implementation.

---

You are implementing Phase 3 of a navigation redesign for the IdeaBox app (a Next.js email intelligence platform). Read `NAVIGATION_REDESIGN_PLAN.md` in the project root for full context.

**Phase 3 Goal:** Merge the Clients entity into Contacts (database migration + UI), build out the Contacts page with tabbed filtering, enhance the Contact detail page, and replace the Tasks thin wrapper with a proper tabbed UI.

**IMPORTANT CODE QUALITY REQUIREMENTS:**
- All new code MUST have thorough logging using the project's `createLogger()` utility from `@/lib/utils/logger`
- Every component, function, and module MUST have clear JSDoc comments explaining purpose, parameters, and behavior
- Use descriptive section headers (the `═══` and `───` comment patterns used throughout the codebase)
- Log important user actions, state changes, data fetches, and errors for troubleshooting
- Follow the existing code style — look at `src/app/(auth)/discover/page.tsx` and `src/app/(auth)/events/page.tsx` as reference for logging and comment patterns

---

### What to do:

#### 1. Database Migration — Merge Clients into Contacts

Create a Supabase migration file at `supabase/migrations/` that performs the following steps **in order**. The migration must be safe, idempotent where possible, and preserve all existing data.

**Step 1: Add client columns to contacts table**
```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_status TEXT CHECK (client_status IN ('active', 'inactive', 'archived'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_priority TEXT CHECK (client_priority IN ('vip', 'high', 'medium', 'low'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_domains TEXT[];
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS keywords TEXT[];

CREATE INDEX IF NOT EXISTS idx_contacts_is_client ON contacts(user_id, is_client) WHERE is_client = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_client_status ON contacts(user_id, client_status) WHERE is_client = TRUE;
```

**Step 2: Migrate existing client data into contacts**
- For clients that match an existing contact by email: update the contact with client fields (`is_client=TRUE`, `client_status`, `client_priority`, `email_domains`, `keywords`), merge notes, set `relationship_type='client'`
- For clients with no matching contact: insert a new contact row with all client data
- The `clients` table is NOT deleted (that's Phase 4)
- See `NAVIGATION_REDESIGN_PLAN.md` § "Database Migrations" for the exact SQL

**Step 3: Add contact_id to emails and actions**
```sql
ALTER TABLE emails ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
```
Then populate `contact_id` from the `client_id` mapping (see plan for SQL).

**Important:** Do NOT drop `client_id` columns or the `clients` table. That's Phase 4.

---

#### 2. Update the Contacts API

**File: `src/app/api/contacts/route.ts`**
- Add support for `?isClient=true` filter parameter (filters to `is_client = TRUE`)
- Add support for `?clientStatus=active` filter parameter
- Add support for `?clientPriority=vip` filter parameter
- Ensure the response includes the new client columns

**New File: `src/app/api/contacts/promote/route.ts`**
- POST endpoint to promote a contact to client status
- Accepts: `{ contactId, clientStatus, clientPriority, emailDomains?, keywords? }`
- Updates: `is_client=TRUE`, sets client fields, `relationship_type='client'`
- Returns the updated contact

**File: `src/app/api/contacts/[id]/route.ts`** (if separate from main route)
- Ensure PUT/PATCH supports updating client fields (`client_status`, `client_priority`, `email_domains`, `keywords`)

---

#### 3. Update the `useContacts` hook

**File: `src/hooks/useContacts.ts`**

Add to `UseContactsOptions`:
- `isClient?: boolean` — filter by `is_client` column
- `clientStatus?: 'active' | 'inactive' | 'archived'` — filter by client status
- `clientPriority?: 'vip' | 'high' | 'medium' | 'low'` — filter by client priority

Add to the hook return value:
- `promoteToClient(contactId: string, clientData: { clientStatus, clientPriority, emailDomains?, keywords? }): Promise<void>` — calls the promote API endpoint
- `updateClientFields(contactId: string, fields: Partial<ClientFields>): Promise<void>` — updates client-specific fields

Update the `Contact` interface to include:
- `is_client: boolean`
- `client_status: string | null`
- `client_priority: string | null`
- `email_domains: string[] | null`
- `keywords: string[] | null`

Update `ContactStats` to include:
- `clients: number` (count where `is_client = TRUE`)

---

#### 4. Build the Contacts page with tabs (`src/app/(auth)/contacts/page.tsx`)

Replace the current Contacts page with a tabbed interface:

**Tab Structure:**
```
[All]  [Clients]  [Personal]  [Subscriptions]
```

**Tab A: All (default)**
- Show all contacts (existing behavior)
- Keep existing filters: VIP, Muted, search, sort
- Keep existing stats cards

**Tab B: Clients**
- Filter to `is_client = TRUE`
- Show client-specific fields: status badge, priority badge, email domains
- Add "Promote to Client" action on non-client contact cards
- Keep existing sort/search

**Tab C: Personal**
- Filter to `relationship_type IN ('friend', 'family')` (or `sender_type = 'direct'` and not client)
- Same contact card format as All tab

**Tab D: Subscriptions**
- Filter to `sender_type = 'broadcast'` (existing "Subscriptions" sender type filter)
- Same contact card format as All tab

**Tab container component to create:**
- `src/components/contacts/ContactsTabs.tsx` — manages tab state via URL query param `?tab=`
- Use existing `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui`

**Promote to Client action:**
- Create `src/components/contacts/PromoteToClientDialog.tsx`
- Dialog form with fields: Status (active/inactive), Priority (low/medium/high/vip), Email Domains (comma-separated), Keywords (comma-separated)
- Calls `promoteToClient()` from useContacts hook
- Available as an action button on contact cards in the All tab

---

#### 5. Enhance the Contact detail page (`src/app/(auth)/contacts/[id]/page.tsx`)

The current Contact detail page already has: profile info, email history, related dates, notes. Enhance it with:

**Client Section (shown when `is_client = TRUE`):**
- Client status badge (Active/Inactive/Archived)
- Client priority badge (VIP/High/Medium/Low)
- Email domains list (editable)
- Keywords list (editable)
- Inline editing for these fields

**"Promote to Client" button (shown when NOT a client):**
- Opens PromoteToClientDialog
- After promotion, client section appears

**Content Tabs (below the profile card):**
The existing page already has email history and related dates sections. Restructure as tabs:
```
[Emails]  [Actions]  [Events]  [Notes]
```

- **Emails tab:** Existing email history with direction tabs (All/Received/Sent)
- **Actions tab:** Tasks related to this contact — fetch from `useActions({ contactId: id })` or filter by `contact_id`. If no `contact_id` support exists yet in useActions, use `clientId` with the contact's matching client entry, or add `contactId` support.
- **Events tab:** Events and extracted dates related to this contact — use `useExtractedDates({ contactId: id })`
- **Notes tab:** Existing editable notes section

---

#### 6. Update client references in priority scoring

**File: `src/services/hub/hub-priority-service.ts`**

The hub priority scoring currently reads from the `clients` table for VIP detection and client importance scoring. Update it to:
- Query `contacts` with `is_client = TRUE` instead of `clients` table
- Map `client_priority` from contacts to the scoring weights (the mapping logic stays the same, just the data source changes)
- Keep backward compatibility: if `contact_id` is null on an email/action, fall back to `client_id` lookup (dual-source strategy until Phase 4 removes `client_id`)

---

#### 7. Build the Tasks page with tabs (`src/app/(auth)/tasks/page.tsx`)

Replace the Phase 1 thin wrapper with a proper tabbed interface:

**Tab Structure:**
```
[To-dos]  [Campaigns]  [Templates]
```

**Tab A: To-dos (default)**
- Render the existing Actions page content: `ActionsPage`
- All actions/tasks logic from `src/app/(auth)/actions/page.tsx`

**Tab B: Campaigns**
- Render the existing Campaigns page content: `CampaignsPage`
- All campaign management from `src/app/(auth)/campaigns/page.tsx`

**Tab C: Templates**
- Render the existing Templates page content: `TemplatesPage`
- All template management from `src/app/(auth)/templates/page.tsx`

**Tab container component to create:**
- `src/components/tasks/TasksTabs.tsx` — manages tab state via URL query param `?tab=`
- Use existing `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui`
- Pattern: identical to how InboxTabs works (see `src/components/inbox/InboxTabs.tsx`)

**Campaign sub-routes:**
Create thin wrappers that render existing campaign pages:
- `src/app/(auth)/tasks/campaigns/new/page.tsx` → wraps the existing campaign creation page
- `src/app/(auth)/tasks/campaigns/[id]/page.tsx` → wraps the existing campaign detail page

These sub-routes are separate pages, NOT part of the tabbed UI (same pattern as `/inbox/[category]`).

---

### Acceptance criteria:

**Database:**
- [ ] Migration file exists and runs without errors
- [ ] Contacts table has new columns: `is_client`, `client_status`, `client_priority`, `email_domains`, `keywords`
- [ ] Existing client data is migrated into contacts
- [ ] `contact_id` column exists on emails and actions tables
- [ ] `client_id` columns and `clients` table are NOT deleted

**Contacts:**
- [ ] Contacts page has 4 working tabs: All (default), Clients, Personal, Subscriptions
- [ ] Clients tab shows only `is_client = TRUE` contacts with client-specific badges
- [ ] "Promote to Client" dialog works from contact cards and detail page
- [ ] Contact detail page shows client section when `is_client = TRUE`
- [ ] Contact detail page has content tabs: Emails, Actions, Events, Notes
- [ ] Contact stats include client count

**Tasks:**
- [ ] Tasks page has 3 working tabs: To-dos (default), Campaigns, Templates
- [ ] To-dos tab renders full ActionsPage functionality
- [ ] Campaigns tab renders full CampaignsPage functionality
- [ ] Templates tab renders full TemplatesPage functionality
- [ ] `/tasks/campaigns/new` route works
- [ ] `/tasks/campaigns/[id]` route works
- [ ] Tab state persists in URL via `?tab=`

**Integration:**
- [ ] Hub priority scoring reads from contacts (not clients table)
- [ ] Active sidebar highlighting works on all Contacts and Tasks sub-pages
- [ ] All new components have `createLogger()` logging
- [ ] All new components have JSDoc comments
- [ ] The app compiles without new TypeScript errors

### Important constraints:

- Do NOT delete the `clients` table, `client_id` columns, or old page files — that's Phase 4
- Do NOT modify the Home, Inbox, or Calendar pages — those are done (Phase 2)
- Do NOT change the database schema beyond what's specified — add columns to contacts, add `contact_id` to emails/actions
- Keep the existing hooks and data fetching patterns — extend, don't rewrite
- Maintain backward compatibility: `client_id` references should still work alongside new `contact_id`
- Follow the project's existing logging patterns using `createLogger()` from `@/lib/utils/logger`
- Follow the project's existing comment/docstring patterns
- Commit your work with clear messages and push to the working branch

### Key files to reference (read these first):

**Existing pages to work with:**
- `src/app/(auth)/contacts/page.tsx` — Current contacts list (1,042 lines, full implementation)
- `src/app/(auth)/contacts/[id]/page.tsx` — Current contact detail (1,194 lines, full implementation)
- `src/app/(auth)/clients/page.tsx` — Current clients page (239 lines, will be absorbed)
- `src/app/(auth)/tasks/page.tsx` — Current tasks thin wrapper (82 lines, will be replaced)
- `src/app/(auth)/actions/page.tsx` — Actions page (rendered in To-dos tab)
- `src/app/(auth)/campaigns/page.tsx` — Campaigns page (rendered in Campaigns tab)
- `src/app/(auth)/templates/page.tsx` — Templates page (rendered in Templates tab)

**Phase 2 tab implementations to use as patterns:**
- `src/components/inbox/InboxTabs.tsx` — Tab container pattern with URL sync
- `src/components/inbox/PriorityEmailList.tsx` — Supabase fetch pattern
- `src/app/(auth)/inbox/page.tsx` — Page with PageHeader + tabs pattern

**Hooks to extend/use:**
- `src/hooks/useContacts.ts` — Contact data (will gain client fields)
- `src/hooks/useClients.ts` — Client data (reference only, will be deprecated)
- `src/hooks/useActions.ts` — Task/action data
- `src/hooks/useCampaigns.ts` — Campaign data
- `src/hooks/useTemplates.ts` — Template data
- `src/hooks/useEvents.ts` — Event data (for contact detail)
- `src/hooks/useExtractedDates.ts` — Date data (for contact detail)

**API routes:**
- `src/app/api/contacts/` — Contacts API (to extend)
- `src/app/api/clients/` — Clients API (reference only)

**Services:**
- `src/services/hub/hub-priority-service.ts` — Priority scoring (update client references)

**Database types:**
- `src/types/database.ts` — `contacts` table Row type (lines 754-799), `clients` table Row type (lines 265-307)

**UI components:**
- `src/components/ui/tabs.tsx` — Tabs, TabsList, TabsTrigger, TabsContent (3 variants: default, underline, pills)
- `src/components/layout/PageHeader.tsx` — Consistent page headers
