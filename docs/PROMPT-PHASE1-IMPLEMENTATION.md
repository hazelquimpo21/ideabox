# Phase 1 Implementation Prompt: Extracted Dates + Hidden Frontend Fields

You are implementing Phase 1 of a 2-phase plan for IdeaBox, a Next.js email intelligence app. This phase surfaces extracted dates in the calendar/triage views and shows hidden email metadata on inbox rows and email detail.

Read `docs/PLAN-PHASE1-2-DATES-FIELDS-NAVIGATION.md` and `docs/AUDIT-TASK-EVENT-IDEA-SEAMLESSNESS.md` for full context.

---

## What You're Building (4 sub-tasks)

### 1A. Bring Extracted Dates Into the Calendar Timeline

**Goal:** Deadlines, payment_due, birthdays, and expirations from the `extracted_dates` table should appear in the Calendar timeline alongside events.

**Current state:**
- The Calendar page uses `useEvents()` hook which calls `GET /api/events` — this reads from `email_analyses.event_detection` JSONB only (events from EventDetector).
- There's a separate `useExtractedDates()` hook and `GET /api/dates` endpoint that reads the `extracted_dates` table. This data is **never displayed anywhere** in the UI.
- The `CalendarItem` type in `src/components/calendar/types.ts` already has a `mergeToCalendarItems()` function that can merge EventData + ExtractedDate arrays. But the calendar page currently only passes events through it.
- `TimelineItem.tsx` renders all items — it uses `getEventTypeConfig(item.eventType)` for dot colors. Non-event types like `deadline`, `payment_due`, `expiration` may not have configs yet.

**What to do:**

1. **In the Calendar page** (find it — likely `src/app/(app)/calendar/page.tsx` or similar), add `useExtractedDates()` alongside the existing `useEvents()`, and pass both to `mergeToCalendarItems()`. Filter out `date_type: 'event'` from extracted dates to avoid duplicates with events already coming from `/api/events`.

2. **In `src/lib/utils/event-colors.ts`** (or wherever `getEventTypeConfig` lives), add configs for non-event date types:
   - `deadline` → red diamond dot, AlertTriangle icon
   - `payment_due` → red circle dot, DollarSign or CreditCard icon
   - `birthday` → pink circle dot, Cake icon (already partially handled)
   - `expiration` → amber diamond dot, Clock icon
   - `appointment` → blue circle dot, Calendar icon
   - `follow_up` → amber circle, ArrowRight icon
   - `reminder` → purple circle, Bell icon

3. **In `TimelineItem.tsx`**, the existing `TimelineDot` component already supports circle vs diamond shapes via `config.shape`. Just make sure the new date type configs specify `shape: 'diamond'` for deadlines and expirations (they're not "events" — diamond distinguishes them visually).

4. **Add filter pills** to the Calendar/Timeline page. Above the timeline, add a row of filter buttons:
   - `All` | `Events` | `Deadlines` | `Payments` | `Birthdays` | `Other`
   - Filter by `item.eventType`. Use the same pill style as `TriageContent.tsx` (see its filter pills pattern at line ~190).
   - Store filter in URL search params (`?filter=deadline`) so it's shareable/persistent.

5. **For expanded non-event dates**, `TimelineItem.tsx` renders an expanded card with location, RSVP, summary, etc. Non-event dates don't have most of this metadata. Create a slim `DateItemExpanded.tsx` component that shows:
   - Title + date
   - Description (if any)
   - Source email link (same pattern as triage cards: small chip with Mail icon + truncated subject)
   - A "Create task" button (just a placeholder button for now — Phase 2 will wire it up)

   In `TimelineItem.tsx`, conditionally render `DateItemExpanded` instead of the default expanded content when `item.eventType` is a non-event type (deadline, payment_due, expiration, etc.).

---

### 1B. Add Deadlines & RSVP Events to Triage Queue

**Goal:** The triage queue currently only shows actions + ideas. Add upcoming deadlines (within 7 days) and events needing RSVP to the triage stream.

**Current state:**
- `useTriageItems.ts` merges `useActions()` + `useIdeas()` into a `TriageItem[]` array sorted by urgency.
- `TriageItem` type has `type: 'action' | 'idea'`.
- `TriageContent.tsx` renders items with `TriageActionCard` or `TriageIdeaCard` based on `item.type`.
- Filter pills: `All | Tasks | Ideas`.
- Stats: `{ total, actions, ideas }`.

**What to do:**

1. **Extend `TriageItem` type** in `useTriageItems.ts`:
   - Add `type: 'action' | 'idea' | 'deadline' | 'event'`
   - The `raw` type union needs to include the new source types. Use `ExtractedDate` from `useExtractedDates` and `EventData` from `useEvents`.

2. **Add two normalizer functions** in `useTriageItems.ts`:
   ```ts
   function deadlineToTriageItem(date: ExtractedDate): TriageItem
   function eventToTriageItem(event: EventData): TriageItem
   ```
   - For deadlines: urgency based on how soon (today=10, tomorrow=8, 3 days=6, 7 days=4)
   - For events: urgency based on RSVP deadline proximity, or event date if no RSVP deadline
   - Both get `sourceEmailId`, `sourceEmailSubject`, `sourceEmailSender` from their `.emails` join

3. **Add data fetching** in `useTriageItems()`:
   - Add `useExtractedDates({ type: 'deadline,payment_due,expiration', from: today, to: sevenDaysFromNow })` — filter for upcoming deadlines within 7 days. Check the hook's filter params.
   - Add `useEvents()` and filter client-side for events where `event_metadata.commitmentLevel === 'invited'` and either event date or RSVP deadline is within 7 days.
   - Merge all four arrays into `allItems`.

4. **Update `sortTriageItems()`**: Deadlines and events with dates should sort like actions with deadlines — by date proximity first, then urgency.

5. **Update stats** to `{ total, actions, ideas, deadlines, events }`.

6. **Update `dismissItem` and `snoozeItem`** to handle the new types. For deadlines, dismiss via local state (same as actions). For events, dismiss via local state.

7. **Create `TriageDeadlineCard.tsx`** — follow the exact same structure as `TriageActionCard.tsx`:
   - Left icon: AlertTriangle in red/amber bg (instead of CheckSquare in blue)
   - Title: deadline title
   - Type badge: date_type label (Deadline, Payment Due, Expiration) with appropriate colors
   - Date chip: same `formatDeadline()` function — show "Today!", "Tomorrow", "3d", "Mar 15"
   - Source email link: same pattern (Mail icon + truncated subject)
   - Actions (hover): "Create task" button (primary), Snooze, Dismiss. No "Accept" — deadlines create tasks, not project items directly. For now, "Create task" can call the same `onAccept` handler.

8. **Create `TriageEventCard.tsx`** — same structure:
   - Left icon: Calendar in purple bg
   - Title: event title
   - Subtitle: location one-liner if available
   - RSVP deadline badge if present (use the same `RsvpBadge` component from `src/components/calendar/RsvpBadge.tsx`)
   - Date chip: event date
   - Source email link
   - Actions (hover): "Add to calendar" (primary, links to calendar page), "Create task", Snooze, Dismiss

9. **Update `TriageContent.tsx`**:
   - Import new card components
   - Extend `TriageFilter` type: `'all' | 'action' | 'idea' | 'deadline' | 'event'`
   - Update filter pills array to include Deadlines and Events with counts
   - Update the render switch to handle `item.type === 'deadline'` and `item.type === 'event'`
   - Add handlers: `handleQuickAcceptDeadline` (creates a task project_item with the deadline date as due_date) and `handleQuickAcceptEvent` (same, with event date as due_date)

---

### 1C. Surface Hidden Fields on Inbox Email Rows

**Goal:** Show timeliness dates, must-read links, and contact company on inbox rows.

**Current state:**
- `InboxEmailRow.tsx` shows: avatar, sender name, domain, subject, gist, timestamp, indicators, star, hover actions.
- `EmailRowIndicators.tsx` shows max 2 indicators in cascade: star → must_reply → golden_nuggets → broadcast → category.
- The email's `timeliness` JSONB field is used for the 3px left border color but the actual dates (`late_after`, `expires`) inside it are never shown.
- Contact company/job_title are in the `contacts` table but the inbox query may not join to it.

**What to do:**

1. **Add timeliness date chip** to `InboxEmailRow.tsx`:
   - After the subject+gist line, add a new optional line for metadata chips.
   - Read `email.timeliness` JSONB. If it has `late_after` or `expires`, show a small chip:
     - `late_after`: "Stale after Mar 10" in amber — use `Clock` icon, 10px text, muted style
     - `expires`: "Expires Mar 15" in red — use `AlertTriangle` icon
   - Only show if the date is in the future (no point showing "stale after yesterday").
   - Use the existing timeliness accent colors from `src/lib/utils/timeliness.ts`.
   - Keep it subtle — `text-xs text-muted-foreground` with a tiny bg pill.

2. **Add must-read link indicator** to `EmailRowIndicators.tsx`:
   - In the cascade, between golden_nuggets and broadcast, check if `email.url_extraction` (or however link data is accessible) has any links with `priority: 'must_read'`.
   - If yes, show a `Link2` icon (from lucide) in blue with tooltip "X must-read link(s)".
   - This requires the email object to carry URL extraction data. Check if the inbox feed query already includes `email_analyses.url_extraction`. If not, you'll need to add a field to the email type or check if it's accessible through existing fields.
   - **If the data isn't available on the email row object**, skip this for now and add a TODO comment. Don't add a join that would slow down the inbox query.

3. **Show contact company in sender line** in `InboxEmailRow.tsx`:
   - After the sender name, if the email has a related contact with `company`, show it: "Jane Smith · Acme Corp"
   - The email has a `contact_id` FK. Check if the inbox query joins to contacts. If the contact data isn't available on the email object, check if `sender_name` could be extended, or skip with a TODO.
   - Style: same as senderDomain — `text-xs text-muted-foreground/50 truncate hidden sm:inline`

---

### 1D. Show Contact Company/Title in Email Detail Sender Area

**Goal:** The email detail header shows sender name + email. Add company and job title.

**Current state:**
- `EmailDetail.tsx` has a `SenderHeader` component (~line 100-146) that shows an avatar circle, sender_name, and sender_email.
- The email object has `contact_id` but the detail view may not fetch contact data.

**What to do:**

1. **In `EmailDetail.tsx`'s `SenderHeader`**:
   - If contact data is available (company, job_title), add a third line below sender_email:
     - "Product Manager at Acme Corp" (if both title and company)
     - "Acme Corp" (if only company)
     - "Product Manager" (if only title)
   - Style: `text-xs text-muted-foreground/70` — even more subtle than the email address.

2. **Data availability**: The email detail page likely fetches the full email. Check if it includes a contact join. If not, either:
   - Add a contact join to the email detail fetch query, OR
   - Use a separate `useContact(email.contact_id)` hook call in the SenderHeader.

   Prefer the join approach if the detail already does joins (e.g., for email_analyses).

3. **Also show a timeliness banner** in the email detail. In the email detail body area (after the sender header, before or at the top of the AI digest), if `email.timeliness` has `late_after` or `expires`:
   - Show a thin inline banner: "This email becomes stale after March 10" or "Content expires March 15"
   - Style: use `getTimelinessAccent(nature)` for the border/bg color. Small text, rounded corners, not too prominent.
   - If the date is already past, show in red: "This email became stale on March 3" — past tense, softer.

---

## Important Patterns to Follow

1. **File headers**: Every file in this codebase has a JSDoc header with `@module` and `@since`. Follow this pattern.

2. **Logger**: Every component/hook uses `createLogger('ComponentName')`. Add this to new files.

3. **cn() utility**: All conditional classNames use `cn()` from `@/lib/utils/cn`.

4. **Card structure**: Triage cards follow this layout:
   ```
   [Icon bg] [Title + type badge] ............ [Actions on hover]
              [Description line-clamp-1]
              [Deadline chip] [Source email chip]
   ```

5. **Filter pills**: Use the exact same pill button style from `TriageContent.tsx` lines 190-209.

6. **Don't break existing functionality**: The triage queue, inbox, and calendar all work today. Extend, don't rewrite.

7. **Types**: Extend existing type unions rather than creating parallel type systems. `TriageItem.type` gets new values. `CalendarItem.eventType` already accepts any string.

8. **Hooks**: The codebase uses custom hooks extensively. Don't inline fetch logic in components.

9. **`@ts-nocheck`**: Some hooks/routes have `// @ts-nocheck` due to Supabase type generation issues. If you hit type errors on Supabase queries, add the same pragmas.

10. **Commit frequently** — one commit per sub-task (1A, 1B, 1C, 1D) is fine. Push to the branch when done.

---

## Files You'll Modify

**1A (Calendar dates):**
- `src/components/calendar/types.ts` — no changes needed (mergeToCalendarItems already handles both)
- Calendar page component — add `useExtractedDates()` call + pass to merge function
- `src/lib/utils/event-colors.ts` (or similar) — add date type configs
- `src/components/calendar/TimelineItem.tsx` — conditional expanded content for non-event dates
- Calendar page — add filter pills

**1B (Triage expansion):**
- `src/hooks/useTriageItems.ts` — extend TriageItem type, add normalizers, add data sources
- `src/components/projects/TriageContent.tsx` — new card types, extended filters, new handlers
- NEW: `src/components/projects/TriageDeadlineCard.tsx`
- NEW: `src/components/projects/TriageEventCard.tsx`

**1C (Inbox hidden fields):**
- `src/components/inbox/InboxEmailRow.tsx` — timeliness chip, contact company
- `src/components/inbox/EmailRowIndicators.tsx` — must-read link indicator

**1D (Email detail):**
- `src/components/email/EmailDetail.tsx` — contact info in sender header, timeliness banner

**New files:**
- `src/components/calendar/DateItemExpanded.tsx`
- `src/components/projects/TriageDeadlineCard.tsx`
- `src/components/projects/TriageEventCard.tsx`
