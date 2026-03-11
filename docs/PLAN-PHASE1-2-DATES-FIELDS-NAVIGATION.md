# Work Plan: Dates, Hidden Fields & Cross-Navigation

**Goal:** Surface extracted dates, show hidden email fields, and make it easy to jump between related tasks/ideas/emails/events/contacts.

Two phases. Phase 1 is backend plumbing + the biggest UI wins. Phase 2 is the cross-navigation system and remaining polish.

---

## Design Principles

1. **Don't invent new pages.** Add to existing views. Hazel already has 8+ pages — the problem isn't missing screens, it's missing connections between them.
2. **Progressive disclosure.** Show the most useful extra info inline (1 line), let users expand for more. Don't dump everything at once.
3. **Consistent "source chip" pattern.** Every item that came from an email should have a small clickable chip linking back. Every email with extracted items should show forward-links to where those items landed. This is the connective tissue.
4. **Triage is the decision queue.** If something needs a human decision (accept/dismiss/snooze), it belongs in triage — regardless of whether it's an action, idea, event, or deadline.
5. **Respect the 400-line file limit.** New components stay small and composable.

---

## Phase 1: Extracted Dates + Hidden Fields ✅ COMPLETED (March 2026)

> **Implementation notes:** Phase 1 was implemented in the frontend only — no backend API changes were needed because the existing `useExtractedDates()` hook and `useEvents()` hook already provided sufficient data. The calendar page already called both hooks and merged them via `mergeToCalendarItems()`; we added `date_type='event'` filtering to avoid duplicates. For triage, we added deadline and event sources directly to `useTriageItems` via existing hooks with date-range filters. Contact info in email detail uses `useContacts` with search rather than a new join, avoiding inbox query changes. Must-read link indicator and contact company on inbox rows deferred (marked TODO) until url_extraction and contacts data are available on the email row object.

### 1A. Bring Extracted Dates Into the Calendar Timeline

**Problem:** `extracted_dates` table has deadlines, payment_due, birthdays, expirations — but the Calendar only reads from `email_analyses.event_detection` JSONB.

**Approach:** Don't try to fix the Supabase schema cache bug. Instead, add a second data source to the existing `/api/events` endpoint that also queries `extracted_dates` for non-event date types, and merge them into the same response shape.

**Backend work:**
- In `/api/events/route.ts`, add a parallel query to `extracted_dates` for `date_type NOT IN ('event')` (deadlines, payment_due, birthday, expiration, etc.)
- Transform those rows into the same `EventResponse` shape with a distinct `date_type` field (keep it — don't force everything to be 'event')
- Merge both result sets, deduplicate by email_id+date+title, sort together

**Frontend work:**
- In `TimelineItem.tsx`, render non-event dates with a different dot shape/color:
  - Deadlines: red diamond
  - Payment due: red circle
  - Birthday: pink circle (already has confetti logic)
  - Expiration: amber diamond
- Add a filter pill row to the Calendar page: "All | Events | Deadlines | Payments | Birthdays"
- Non-event dates get simpler expanded cards (no RSVP, no location — just title, date, source email link)

**New files:**
- `src/components/calendar/DateItemExpanded.tsx` — simple expanded card for non-event dates (title, date, description, source email link, "Create task" button)

**Modified files:**
- `src/app/api/events/route.ts` — add extracted_dates query + merge
- `src/components/calendar/TimelineItem.tsx` — handle date_type for dot styling
- `src/components/calendar/TimelineView.tsx` — add filter pills
- `src/hooks/useEvents.ts` — pass date type filter param

### 1B. Add Deadlines & RSVP Events to Triage Queue

**Problem:** Triage only shows actions + ideas. Upcoming deadlines and events needing RSVP are invisible there.

**Approach:** Extend `useTriageItems` to pull from two more sources: upcoming deadlines (next 7 days from extracted_dates) and events with `commitment_level: invited` that have an RSVP deadline within 7 days.

**Backend work:**
- Add query params to `/api/events`: `commitmentLevel=invited&rsvpWithinDays=7` for triage-eligible events
- Add query params to `/api/dates`: `withinDays=7&type=deadline,payment_due,expiration` for triage-eligible dates

**Frontend work:**
- Extend `TriageItem` type: `type: 'action' | 'idea' | 'deadline' | 'event'`
- New normalizer functions: `deadlineToTriageItem()`, `eventToTriageItem()`
- New card components:
  - `TriageDeadlineCard.tsx` — shows deadline title, date, urgency badge, source email link. Actions: "Create task" / Snooze / Dismiss
  - `TriageEventCard.tsx` — shows event title, date, location one-liner, RSVP deadline badge. Actions: "Add to calendar" / "Create task" / Snooze / Dismiss
- Update filter pills: "All | Tasks | Ideas | Deadlines | Events"
- Update stats: `{ total, actions, ideas, deadlines, events }`

**New files:**
- `src/components/projects/TriageDeadlineCard.tsx`
- `src/components/projects/TriageEventCard.tsx`

**Modified files:**
- `src/hooks/useTriageItems.ts` — add deadline + event sources, extend TriageItem type
- `src/components/projects/TriageContent.tsx` — render new card types, update filter pills

### 1C. Surface Hidden Fields on Inbox Email Rows

**Problem:** Timeliness dates, must-read links, and contact info are extracted but not visible in the inbox list.

**Approach:** Add lightweight inline metadata below the subject line on email rows, using the existing muted-foreground style. Only show when data exists. Max 2 extra chips to avoid clutter.

**What to surface (priority order, pick up to 2 per row):**

1. **Timeliness date** — If `timeliness.late_after` or `timeliness.expires` exists, show a small chip: "Stale after Mar 10" or "Expires Mar 15" in the timeliness accent color. This goes next to the existing 3px border — the border shows the *type* of timeliness, the chip shows the *date*.

2. **Must-read link count** — If `url_extraction` has links with `priority: 'must_read'`, show a chip: "1 must-read link" with a link icon. Clicking opens the email.

3. **Contact company/title** — If the sender's contact has `company` or `job_title`, show "Jane · Acme Corp" instead of just "Jane" in the sender line. Subtle, no extra space needed.

**Modified files:**
- `src/components/inbox/InboxEmailRow.tsx` — add timeliness date chip, tweak sender line for company
- `src/components/inbox/EmailRowIndicators.tsx` — add must-read link to the cascade (between golden_nuggets and broadcast, since it's more actionable than newsletter indicator)
- May need to pass `timeliness` object and contact data through to the row component

**Data flow consideration:** The inbox already fetches emails with their fields. `timeliness` is a JSONB column on emails — already available. Contact company/title needs a join to `contacts` table — check if `InboxFeed` already does this join or if we need to add it.

### 1D. Show Contact Company/Title in Email Detail Sender Area

**Problem:** Email detail shows sender name and email but not their company or title, even though ContactEnricher extracted it.

**Approach:** In the email detail header/sender area, add a small line below the sender email: "Product Manager at Acme Corp" (if both exist) or just "Acme Corp" or just "Product Manager".

**Modified files:**
- `src/components/email/AIDigestView.tsx` or wherever the sender header is rendered
- May need the email detail to fetch/include contact data (check if it already does via the email's `contact_id` join)

---

## Phase 2: Cross-Navigation & Remaining Polish

### 2A. The "Related Items" Sidebar/Section

**The big navigation feature.** When you're looking at any entity, you should see what else is connected to it.

**Design:** A reusable `<RelatedItems>` component that takes a context (email_id, contact_id, project_id, or event reference) and shows a compact list of related items across all entity types.

**Layout:** Small collapsible section with grouped chips:

```
Related
├─ Email: "Re: Project kickoff"          → /inbox?email=xyz
├─ Task: "Review proposal" (In Progress) → /tasks?item=abc
├─ Event: "Kickoff meeting" (Mar 10)     → /calendar?highlight=def
├─ Contact: "Jane · Acme Corp" (Client)  → /contacts/ghi
└─ Idea: "Blog about this process"       → /inbox?tab=discoveries
```

Each row: icon + title (truncated) + subtle metadata + click navigates.

**Where it appears:**
- **Email detail** — shows tasks, events, ideas, links extracted from this email + the sender contact
- **Project item detail / row expansion** — shows source email, source action, related contact
- **Event expanded card** — shows source email, any tasks created from this event, sender contact
- **Contact detail page** — shows recent emails, tasks, events involving this contact

**Backend work:**
- New endpoint: `GET /api/related?emailId=x` or `GET /api/related?contactId=y`
- Queries across: `actions` (by email_id), `project_items` (by source_email_id, source_action_id), `events` (by email_id), `email_ideas` (by email_id), `contacts` (by id), `saved_links` (by email_id)
- Returns a unified shape: `{ type, id, title, subtitle, url, status? }`
- Single query with multiple left joins, or parallel queries merged server-side

**Frontend work:**
- New component: `src/components/shared/RelatedItems.tsx`
- New hook: `src/hooks/useRelatedItems.ts`
- Integration points:
  - `EmailDetail.tsx` — add RelatedItems section after AI digest
  - `TimelineItem.tsx` — show in expanded view
  - `ProjectItemRow.tsx` — show on hover or expansion
  - Contact detail page — show as a section

**New files:**
- `src/components/shared/RelatedItems.tsx` — the reusable component
- `src/components/shared/RelatedItemRow.tsx` — individual row (icon + title + link)
- `src/hooks/useRelatedItems.ts` — data fetching hook
- `src/app/api/related/route.ts` — backend endpoint

### 2B. "Source Chip" Standardization

**Problem:** Source email links exist on some cards but not others, and the style varies. There's no standard way to show "this came from email X" or "this became task Y."

**Approach:** Create a tiny reusable `<SourceChip>` component with variants:

```tsx
// "Came from" — backward link
<SourceChip type="email" id={emailId} label="Re: Project update" />
<SourceChip type="contact" id={contactId} label="Jane · Acme" />

// "Became" — forward link
<SourceChip type="task" id={taskId} label="Review proposal" direction="forward" />
<SourceChip type="event" id={eventId} label="Kickoff meeting" direction="forward" />
```

Visual: Small pill with type icon + truncated label. Muted colors. Click navigates.

**Where to add:**
- `TriageActionCard` — already has source email link, standardize to SourceChip
- `TriageIdeaCard` — add source email chip (currently missing)
- `TriageDeadlineCard` (new) — source email chip
- `TriageEventCard` (new) — source email chip
- `ProjectItemRow` — already has source email link, standardize + add forward links
- `TimelineItem` — add source email chip in expanded view
- `EventCard` — add source email chip

**New files:**
- `src/components/shared/SourceChip.tsx`

**Modified files:** All card/row components listed above

### 2C. "Create Task From Event" Button

**Problem:** Events can't become tasks.

**Approach:** Add a "Create task" button to `EventActions.tsx` (the action bar in expanded timeline items and event cards).

Clicking opens a lightweight dialog (reuse `CreateItemDialog` or a slimmed-down version) pre-populated with:
- Title: event title
- Type: task
- Due date: event date (or RSVP deadline if earlier)
- Description: "Prep for: {event title} on {date} at {location}"
- source_email_id: the event's source email

**Schema change needed:** Add `source_event_email_id` + `source_event_index` to `project_items` (migration 047). This lets us show "This task was created from event X" in the RelatedItems view.

**Modified files:**
- `src/components/calendar/EventActions.tsx` — add "Create task" button
- `src/app/api/projects/[id]/items/route.ts` — accept source_event_email_id
- `src/lib/api/schemas.ts` — add new fields to schema
- Migration file for schema change

### 2D. Surface Email Style Ideas in Compose Flow

**Problem:** Email style ideas (subject lines, tone tips, CTAs) are extracted but only visible in a collapsed analysis section. They'd be most useful when actually writing a reply.

**Approach:** When the compose/reply panel opens for an email that has `email_style_ideas` in its analysis, show a small collapsible "Writing tips" section at the top of the compose area with 1-2 suggestions.

**Modified files:**
- Whatever compose component exists (need to locate)
- May need to pass analysis data through to compose context

### 2E. Timeliness Dates in Email Detail

**Problem:** The email detail view shows timeliness as a colored border but not the actual dates.

**Approach:** In the AI digest view header area, if `timeliness.late_after` or `timeliness.expires` exists, show a small inline banner:
- "Becomes stale after March 10" (amber)
- "Expires March 15" (red)
- "Deadline: March 20" (red)

Uses the existing timeliness accent colors.

**Modified files:**
- `src/components/email/AIDigestView.tsx` — add timeliness date banner after sender info

---

## Phase 1 vs Phase 2 Summary

| Phase | What | Views Touched | New Files | Risk |
|-------|------|---------------|-----------|------|
| **1A** | Dates in Calendar | Calendar timeline, Events API | 1 component | Low — additive, separate query |
| **1B** | Dates + Events in Triage | Triage tab | 2 components, extend hook | Medium — triage sorting gets complex |
| **1C** | Hidden fields on inbox rows | Inbox rows, indicators | 0 | Low — just chips |
| **1D** | Contact info in email detail | Email detail | 0 | Low — just text |
| **2A** | Related Items navigation | Email detail, timeline, project rows, contacts | 3 components, 1 hook, 1 API | Medium — cross-entity queries |
| **2B** | Source Chip standardization | All card/row components | 1 component | Low — mostly refactoring |
| **2C** | Task from Event | Calendar, event actions, project API | 0 (reuse dialog) + migration | Low — mostly wiring |
| **2D** | Style ideas in compose | Compose panel | 0-1 | Low — progressive disclosure |
| **2E** | Timeliness dates in detail | Email detail | 0 | Low — just a banner |

---

## UI Sketches

### Inbox Row With Hidden Fields Surfaced (1C)
```
┌─────────────────────────────────────────────────────────────────┐
│▌ [AV] Jane Smith · Acme Corp        ○ 3h  [⬦2] [📎]          │
│▌      Re: Q2 Budget Review — Here's the updated spreadsheet... │
│▌      ⏰ Stale after Mar 10  ·  🔗 1 must-read link            │
└─────────────────────────────────────────────────────────────────┘
 ▌= 3px timeliness border (existing)
 [AV] = sender avatar (existing)
 "· Acme Corp" = NEW contact company inline
 [⬦2] = golden nuggets indicator (existing)
 ⏰/🔗 = NEW timeliness + link chips (subtle, muted-foreground)
```

### Triage Queue With All Item Types (1B)
```
┌─ Triage ──────────────────────────────────────────────────────┐
│ 12 items to triage · 5 tasks · 3 ideas · 2 deadlines · 2 events │
│ [All (12)] [Tasks (5)] [Ideas (3)] [Deadlines (2)] [Events (2)] │
│                                                                │
│ ☑ Review Q2 budget spreadsheet     [Review] [Today!]           │
│   📧 Re: Q2 Budget Review          [Accept ▾] [⏰] [✕]        │
│                                                                │
│ ⚡ Deadline: Tax filing due          [Mar 15]                   │
│   📧 Your 2025 tax documents...     [Create task] [⏰] [✕]    │
│                                                                │
│ 📅 RSVP: Austin Tech Meetup         [Mar 12] [RSVP by Mar 10] │
│   📧 You're invited: March meetup   [Add to cal] [Task] [✕]   │
│                                                                │
│ 💡 Write a blog post about...       [content] [0.8]            │
│   📧 Latest React patterns...       [Accept ▾] [⏰] [✕]       │
└───────────────────────────────────────────────────────────────┘
```

### Related Items Section (2A)
```
┌─ Related ─────────────────────────────────────────────────────┐
│ 📧 Re: Q2 Budget Review           Jane · 3h ago    →         │
│ ☑ Review Q2 budget spreadsheet     In Progress      →         │
│ 📅 Q2 Budget Meeting               Mar 10, 2pm      →         │
│ 👤 Jane Smith · Acme Corp          Client (Active)   →         │
│ 💡 Blog: transparent budgeting     Saved             →         │
└───────────────────────────────────────────────────────────────┘
```

### Calendar Timeline With Dates (1A)
```
Today ──────────────────────────────────────────
  ● 9:00am   Team standup                    [📹]
  ● 2:00pm   Austin Tech Meetup              [📍]
  ◆          Tax filing deadline (3 days!)   [⚠️]

Tomorrow ───────────────────────────────────────
  ● 10:00am  Client call with Acme           [📹]
  ◆          Payment due: AWS invoice        [💰]

●  = event (circle dot, existing)
◆  = deadline/payment/date (diamond dot, NEW)
```

---

## Gotchas & Things to Watch

1. **Triage query count.** Phase 1B adds 2 more API calls to the triage hook. Consider batching into a unified `/api/triage` endpoint if performance becomes an issue, but start with parallel client-side fetches (simpler, easier to debug).

2. **extracted_dates schema cache.** We're reading from extracted_dates in 1A. If the Supabase schema cache issue from Jan 2026 resurfaces, we have a fallback: read dates from `email_analyses.date_extraction` JSONB instead (same pattern as events). Build the transformer to handle both sources.

3. **Contact data availability in inbox.** The inbox query may not currently join to contacts. If adding a join slows things down, consider denormalizing `sender_company` onto the emails table (like `sender_name` already is) during email processing.

4. **Related Items query complexity (2A).** The `/api/related` endpoint queries 5+ tables. Use parallel Promise.all queries with individual timeouts, not a mega-join. Return partial results if one query fails.

5. **Filter pill state persistence.** Triage and calendar filter selections should persist across page navigations (use URL search params, not just local state). This way "show me just deadlines" is a shareable URL.

6. **Don't break existing triage flow.** Phase 1B extends the TriageItem type. Make sure existing `handleQuickAcceptAction` and `handleQuickAcceptIdea` still work — add separate handlers for the new types rather than modifying existing ones.
