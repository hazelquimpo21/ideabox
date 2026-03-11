# Phase 2 Implementation Prompt: Cross-Navigation, Source Chips & Event→Task Bridge

Read `docs/PLAN-PHASE1-2-DATES-FIELDS-NAVIGATION.md` and `docs/AUDIT-TASK-EVENT-IDEA-SEAMLESSNESS.md` for full context. Phase 1 is complete — this prompt covers Phase 2.

---

## What Was Built in Phase 1 (context for Phase 2)

- **1A Calendar dates**: Extracted dates (deadlines, payments, expirations) now appear in the Calendar timeline with distinct dot shapes/colors. `DateItemExpanded.tsx` renders slim expanded cards for non-event types with a placeholder "Create task" button.
- **1B Triage expansion**: `useTriageItems` now merges actions + ideas + deadlines (7-day window) + events (invited, 7-day window). New `TriageDeadlineCard` and `TriageEventCard` components. Filter pills: All/Tasks/Ideas/Deadlines/Events.
- **1C Inbox fields**: Timeliness date chips (late_after, expires) on inbox rows. TODOs remain for: contact company in sender line (needs join), must-read link indicator (needs url_extraction data).
- **1D Email detail**: Contact job_title + company shown in sender header via `useContacts` search. Timeliness banner shows stale/expire dates.

**Placeholder buttons to wire up in Phase 2:**
- `DateItemExpanded.tsx` has a "Create task" button (line ~82) that logs but does nothing
- `TriageDeadlineCard.tsx` "Create task" uses `QuickAcceptPopover` — already creates `project_items` with `due_date`
- `TriageEventCard.tsx` "Create task" button (secondary) calls `onAccept` — needs proper task creation

---

## What You're Building (5 sub-tasks)

### 2A. The "Related Items" Section

**Goal:** When viewing any entity, show what else is connected to it — emails, tasks, events, contacts, ideas, links.

**Current state:**
- No cross-entity navigation exists beyond `sourceEmailId` links on triage cards.
- `project_items` has `source_email_id` and `source_action_id` FKs.
- Events have `email_id`. Contacts have `id` referenced by `emails.contact_id`.
- There is no `/api/related` endpoint.

**What to do:**

1. **Create `GET /api/related` endpoint** (`src/app/api/related/route.ts`):
   - Accept query params: `emailId`, `contactId`, `projectId`, `eventEmailId`
   - For a given anchor, query related items across tables using `Promise.all`:
     - `actions` (by `email_id`)
     - `project_items` (by `source_email_id` or `source_action_id`)
     - `extracted_dates` (by `email_id`, date_type != 'event')
     - Events from `email_analyses.event_detection` (by email_id)
     - `contacts` (by `id` matching email's `contact_id`)
     - `saved_links` (by `email_id`)
   - Return unified shape: `{ items: Array<{ type: 'email'|'task'|'event'|'deadline'|'contact'|'link'|'idea', id: string, title: string, subtitle?: string, url: string, status?: string }> }`
   - Use `@ts-nocheck` if needed for Supabase type issues (follows existing pattern)

2. **Create `useRelatedItems` hook** (`src/hooks/useRelatedItems.ts`):
   - Accepts `{ emailId?, contactId?, projectId? }`
   - Calls `GET /api/related` with the appropriate param
   - Returns `{ items: RelatedItem[], isLoading: boolean }`

3. **Create `RelatedItems` component** (`src/components/shared/RelatedItems.tsx`):
   - Collapsible section (use existing `CollapsibleSection` component)
   - Each row: type icon + title (truncated) + subtle metadata + click navigates
   - Type icons: Mail for email, CheckSquare for task, Calendar for event, AlertTriangle for deadline, User for contact, Link2 for link, Lightbulb for idea
   - Max 8 items shown, "Show all X items" link if more
   - Empty state: don't render the section at all

4. **Integrate RelatedItems in:**
   - `EmailDetail.tsx` — after TimelinessBanner, before AIDigestView. Pass `emailId={email.id}`.
   - `TimelineItem.tsx` — in expanded content (both event and DateItemExpanded). Pass `emailId={item.sourceEmailId}`.
   - Contact detail page (`src/app/(auth)/contacts/[id]/page.tsx`) — as a section. Pass `contactId`.

---

### 2B. "Source Chip" Standardization

**Goal:** Replace inconsistent source email links across card components with a reusable `SourceChip` component.

**Current state:**
- `TriageIdeaCard`, `TriageActionCard`, `TriageDeadlineCard`, `TriageEventCard` all have inline source email links with slightly different styles.
- `ProjectItemRow` has a source email link.
- `DateItemExpanded` has an inline source email link.
- No standard "forward link" pattern exists (e.g., "This email produced task X").

**What to do:**

1. **Create `SourceChip` component** (`src/components/shared/SourceChip.tsx`):
   ```tsx
   interface SourceChipProps {
     type: 'email' | 'task' | 'event' | 'contact' | 'link' | 'idea';
     id: string;
     label: string;
     direction?: 'backward' | 'forward'; // default: backward
   }
   ```
   - Visual: small pill (`text-[10px]`) with type-specific icon + truncated label
   - Backward (default): muted bg, "from" semantics
   - Forward: slightly more prominent, "became" semantics (e.g., "→ Task: Review proposal")
   - Click navigates: email→`/inbox?email=id`, task→`/tasks?item=id`, event→`/calendar?highlight=id`, contact→`/contacts/id`

2. **Replace inline source email links** in:
   - `TriageActionCard.tsx` — replace the `<Link>` inside the metadata chips
   - `TriageIdeaCard.tsx` — same
   - `TriageDeadlineCard.tsx` — same
   - `TriageEventCard.tsx` — same
   - `DateItemExpanded.tsx` — replace the inline `<Link>`
   - `ProjectItemRow.tsx` — replace source email chip (check current implementation)

3. **Add forward-direction chips** to email detail:
   - In `EmailDetail.tsx`, if the email has produced actions/tasks/events (available from RelatedItems data), show forward chips: "→ Task: Review proposal", "→ Event: Team meeting"

---

### 2C. "Create Task From Event" Button (Wire Up)

**Goal:** Wire up the "Create task" buttons that were placeholders in Phase 1.

**Current state:**
- `DateItemExpanded.tsx` has a "Create task" button that only logs
- `EventActions.tsx` has no "Create task" button at all
- `TriageEventCard.tsx` "Create task" secondary button calls `onAccept` which is a no-op for events in legacy mode

**What to do:**

1. **Add `source_event_email_id` and `source_event_index` columns to `project_items`**:
   - Create migration file `scripts/migration-046-project-item-event-source.sql`
   - `ALTER TABLE project_items ADD COLUMN source_event_email_id UUID REFERENCES emails(id);`
   - `ALTER TABLE project_items ADD COLUMN source_event_index INTEGER;`

2. **Update Zod schema** in `src/lib/api/schemas.ts`:
   - Add `source_event_email_id` and `source_event_index` to the project item create schema

3. **Create `CreateTaskFromEventDialog` component** (`src/components/calendar/CreateTaskFromEventDialog.tsx`):
   - Lightweight dialog (reuse patterns from `CreateItemDialog`)
   - Pre-populated fields:
     - Title: event/date title
     - Type: task
     - Due date: event date (or RSVP deadline if earlier)
     - Description: "Prep for: {event title} on {date}" + location if available
     - Priority: auto-set based on urgency (today→urgent, this week→high, later→medium)
   - Project selector dropdown (same as QuickAcceptPopover)
   - On submit: calls `createItem` with `source_event_email_id` and `source_email_id`

4. **Wire up existing placeholder buttons:**
   - `DateItemExpanded.tsx`: Replace placeholder `handleCreateTask` with opening `CreateTaskFromEventDialog`
   - `EventActions.tsx`: Add a "Create task" button (between "Add to Calendar" and "Dismiss")
   - `TriageEventCard.tsx`: Wire secondary "Create task" button to open `CreateTaskFromEventDialog`

---

### 2D. Complete the 1C TODOs: Contact Company & Must-Read Links on Inbox Rows

**Goal:** Finish the two deferred items from Phase 1C that needed data availability changes.

**Current state:**
- `InboxEmailRow.tsx` has a TODO for contact company in sender line
- `EmailRowIndicators.tsx` has a TODO for must-read link indicator
- The inbox feed query (`useEmails` or wherever the inbox fetches data) doesn't join to contacts or include url_extraction data

**What to do:**

1. **For contact company in sender line:**
   - Check if `useEmails` or the inbox API already returns `contact_id`
   - Option A (preferred): Denormalize `sender_company` onto the `emails` table during email processing (like `sender_name` already is). Add to EmailProcessor output or ContactEnricher.
   - Option B: Add a lightweight join in the inbox API to fetch `contacts.company` via `emails.contact_id`
   - Option C (simplest): In `InboxEmailRow`, use the email's `sender_email` domain as a proxy — not the real company name but better than nothing (e.g., "jane@acme.com" → show "acme.com" after sender name)
   - Once data is available, implement: `"Jane Smith · Acme Corp"` in the sender line. Style: `text-xs text-muted-foreground/50 truncate hidden sm:inline`

2. **For must-read link indicator:**
   - Check if `email_analyses.url_extraction` data is accessible from the email object
   - If the inbox query already includes analysis data, extract must_read count from url_extraction JSONB
   - If not, add a denormalized `must_read_link_count` field to the emails table (computed during analysis)
   - Once data is available: In `EmailRowIndicators.tsx` cascade, between golden_nuggets and broadcast, show `Link2` icon in blue with tooltip "X must-read link(s)"

**Important:** If adding joins or denormalized columns would significantly change the inbox query performance, pick the simplest option even if it's approximate. The inbox is the most performance-sensitive page.

---

### 2E. Surface Email Style Ideas in Compose Flow

**Goal:** Show AI-generated writing tips when replying to emails that have style ideas.

**Current state:**
- `email_analyses.email_style_ideas` contains subject line suggestions, tone tips, CTA ideas
- Only visible in the collapsed AnalysisSummary deep-dive section
- There's a ComposeEmail component at `src/components/email/ComposeEmail.tsx` (or similar)

**What to do:**

1. **Find the compose/reply component** and understand how it receives context about the email being replied to.

2. **Create a `WritingTips` component** (`src/components/email/WritingTips.tsx`):
   - Collapsible section at the top of compose area
   - Shows 1-3 writing tips from `email_style_ideas`:
     - Subject line suggestion (if replying, show "Consider: {suggestion}")
     - Tone tip
     - CTA idea
   - Style: subtle, non-intrusive — `text-xs text-muted-foreground` with a small `Sparkles` icon
   - Dismissible (localStorage flag per email to avoid showing again after dismissed)

3. **Integrate in compose flow**: Pass `email_style_ideas` from the analysis data through to the compose component and render `WritingTips` when data exists.

---

## Important Patterns to Follow

Same as Phase 1:
1. **File headers**: JSDoc with `@module` and `@since`
2. **Logger**: `createLogger('ComponentName')` in every file
3. **cn() utility**: All conditional classNames
4. **400-line file limit**: New components stay small
5. **`@ts-nocheck`**: Use on Supabase query files if needed
6. **Don't break existing functionality**

Additional for Phase 2:
7. **RelatedItems queries**: Use `Promise.all` with individual try/catch — return partial results if one query fails
8. **Migration safety**: The new columns are nullable, so existing data is unaffected
9. **SourceChip should be a drop-in replacement**: Don't change the visual appearance significantly — just standardize the code

---

## Files You'll Create

- `src/app/api/related/route.ts` — Related items API endpoint
- `src/hooks/useRelatedItems.ts` — Data fetching hook
- `src/components/shared/RelatedItems.tsx` — Reusable related items section
- `src/components/shared/RelatedItemRow.tsx` — Individual row component
- `src/components/shared/SourceChip.tsx` — Standardized source link pill
- `src/components/calendar/CreateTaskFromEventDialog.tsx` — Task creation from events
- `src/components/email/WritingTips.tsx` — Writing tips in compose flow
- `scripts/migration-046-project-item-event-source.sql` — Schema migration

## Files You'll Modify

- `src/components/email/EmailDetail.tsx` — Add RelatedItems, forward SourceChips
- `src/components/calendar/TimelineItem.tsx` — Add RelatedItems in expanded view
- `src/components/calendar/DateItemExpanded.tsx` — Wire up "Create task", use SourceChip
- `src/components/calendar/EventActions.tsx` — Add "Create task" button
- `src/components/projects/TriageActionCard.tsx` — Replace inline source link with SourceChip
- `src/components/projects/TriageIdeaCard.tsx` — Same
- `src/components/projects/TriageDeadlineCard.tsx` — Same
- `src/components/projects/TriageEventCard.tsx` — Wire up "Create task", use SourceChip
- `src/components/inbox/InboxEmailRow.tsx` — Add contact company
- `src/components/inbox/EmailRowIndicators.tsx` — Add must-read link indicator
- `src/lib/api/schemas.ts` — Add event source fields
- Contact detail page — Add RelatedItems section

## Commit Strategy

One commit per sub-task (2A, 2B, 2C, 2D, 2E). Push to branch when done.
