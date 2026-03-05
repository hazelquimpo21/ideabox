# IdeaBox Audit: Tasks, Ideas, Events & Triage Seamlessness

**Date:** March 5, 2026
**Auditor Role:** Product Manager meeting with indie dev
**Goal:** Make tasks, idea sparks, triage/"not idea yet" items, and events more seamlessly connected across frontend and backend. Surface hidden email data.

---

## Executive Summary

IdeaBox has strong individual subsystems — email analysis, event detection, idea sparks, actions, and project items — but they operate as **separate data silos** connected only through `source_email_id` foreign keys. The triage system is the closest thing to a unifier, but it only merges actions + ideas (not events, not dates/deadlines, not links). There are also several email-extracted fields that the backend captures but the UI never shows.

---

## 1. The Six Data Entities & Where They Live

| Entity | Backend Table | Created By | Promoted To | UI Location |
|--------|--------------|------------|-------------|-------------|
| **Actions** | `actions` | AI ActionExtractor | `project_items` (via triage accept) | Triage tab, email detail |
| **Idea Sparks** | JSONB in `email_analyses.idea_sparks` → `email_ideas` on save | AI IdeaSparkAnalyzer | `project_items` (via triage accept) | Triage tab, Discoveries tab, Home card |
| **Events** | JSONB in `email_analyses.event_detection` / `multi_event_detection` | AI EventDetector | `user_event_states` (save/dismiss) | Calendar page, Home sidebar |
| **Dates/Deadlines** | `extracted_dates` | AI DateExtractor | Nothing — dead end | Nowhere consistently (dates API exists but calendar uses event_detection JSONB instead) |
| **Links** | JSONB in `email_analyses.url_extraction` → `saved_links` on save | AI LinkAnalyzer | `saved_links` table | Discoveries tab, email detail |
| **Project Items** | `project_items` | User (manual or triage accept) | N/A — final destination | Board/Kanban, Project lists |

---

## 2. Gotcha #1: extracted_dates Is a Dead End

**The Problem:**
The `DateExtractor` analyzer writes to `extracted_dates` table. There's an `/api/dates` endpoint. But the actual Calendar/Events page reads from `email_analyses.event_detection` JSONB instead, because of a documented schema cache bug (January 2026).

**Impact:**
- Deadlines, payment dues, birthdays, and expirations extracted by DateExtractor **are not surfaced in the Calendar** unless they also get picked up by EventDetector.
- The `/api/dates` endpoint exists but nothing in the UI calls it.
- Non-event dates (deadlines, payment_due, birthday, expiration) have no home in the UI.

**Recommendation:**
Either fix the schema cache issue and unify both into the Calendar/Timeline view, or migrate DateExtractor output into the event_detection JSONB pipeline. Deadlines especially should flow into the triage queue.

---

## 3. Gotcha #2: Triage Only Merges Actions + Ideas (Not Events or Deadlines)

**The Problem:**
`TriageContent.tsx` merges:
- Pending actions from `/api/actions`
- Idea sparks from `/api/ideas`

But it does NOT include:
- Upcoming events that need RSVP (commitment_level = "invited")
- Deadlines approaching (from extracted_dates)
- Links with expiration dates

**Impact:**
Users must check the Calendar page separately to catch RSVP deadlines, and there's no unified "things that need your attention" queue.

**Recommendation:**
The triage queue should be the single inbox for all "items needing a decision." Add event RSVPs and approaching deadlines to the triage stream, with their own card types (like `TriageEventCard`).

---

## 4. Gotcha #3: Events Have No Path to Tasks

**The Problem:**
Events can be: saved to "Maybe" list (`user_event_states`), added to Google Calendar, or dismissed. But there's **no way to create a task from an event** — like "Buy tickets for X" or "Prep for meeting Y" or "Register before deadline Z."

Actions can become project_items. Ideas can become project_items. But events just... exist in the calendar.

**Impact:**
If an event requires preparation (prep slides, buy tickets, book travel), the user has to manually create a task and remember the connection.

**Recommendation:**
Add "Create task from event" action on event cards. Pre-populate with event title, set due_date to event date (or RSVP deadline), and store `source_event_id` on the project_item for traceability.

---

## 5. Gotcha #4: Ideas Have a Broken Lifecycle

**The Problem:**
The idea lifecycle is:
1. AI generates spark → stored in `email_analyses.idea_sparks` JSONB
2. User saves → creates row in `email_ideas` table (status: saved)
3. User accepts in triage → creates `project_item` (type: idea)

But step 2 and step 3 are **independent**. An idea saved to `email_ideas` is NOT automatically a `project_item`. And a project_item created from triage doesn't reference the `email_ideas` record.

**Impact:**
- Saved ideas in `email_ideas` have no project assignment, no due date, no priority
- The `email_ideas` table becomes a graveyard — items saved but never acted on
- No way to see "ideas I saved that I haven't started working on"

**Recommendation:**
Either eliminate `email_ideas` as a separate table and go straight to `project_items`, or add a foreign key (`source_idea_id`) on project_items and auto-promote saved ideas.

---

## 6. Gotcha #5: Links Are Disconnected From Tasks & Projects

**The Problem:**
Links are extracted, displayed in Discoveries, and can be saved to `saved_links`. But there's no connection to project_items or tasks.

A "must_read" article relevant to a client project has no way to land on that project's board.

**Recommendation:**
Allow "Add to project" from links, or create a task with the link URL embedded. The `project_items` table already has a `description` field that could hold link context.

---

## 7. Hidden Email Data — Fields Extracted But Not Surfaced

### 7.1 Contact Enrichment (Partially Hidden)
**Extracted:** company, job_title, phone, relationship_type, social_links
**Shown:** Name, email, VIP badge, is_client flag
**Hidden:** Job title and company are in contacts table but rarely shown in email context. Social links are captured by ContactEnricher but not displayed in email detail or contact cards.

### 7.2 Email Links / URLs
**Extracted:** Full URL intelligence — type, title, description, priority, topics, expiration, save_worthy flag
**Shown:** Only in Discoveries tab and email detail analysis (collapsed section)
**Hidden in:** Inbox list view, triage cards, home page. A "must_read" link in a high-signal email is invisible unless you open the email and expand the analysis.

### 7.3 Email Timeliness / Perishability
**Extracted:** nature (deadline/reminder/perishable/static), relevant_date, late_after, expires
**Shown:** Only as a 3px left border color on inbox rows (action/reference/info/timely/urgent)
**Hidden:** The actual dates (late_after, expires) are never shown. Users can't see "this email becomes stale after March 10."

### 7.4 Golden Nuggets
**Extracted:** interesting_fact, useful_tip, recommendation, quote, statistic, counter_intuitive, opportunity (7 types)
**Shown:** In email detail AI digest and as indicator icon in inbox rows
**Hidden:** Never surfaced in home page, triage, or as standalone browsable items. No "nugget feed."

### 7.5 Email Style Ideas
**Extracted:** Subject line ideas, tone suggestions, call-to-action ideas
**Shown:** Only in deep analysis section of email detail (collapsed)
**Hidden:** Never surfaced in sent/compose flow where they'd actually be useful.

### 7.6 Sender Type (Direct vs Broadcast)
**Extracted:** Whether email is from a human or automated system
**Shown:** Used internally for filtering
**Hidden:** Never shown as a label or used to visually distinguish emails in inbox.

### 7.7 Reply Worthiness Score
**Extracted:** Numerical score of whether this email deserves a reply
**Shown:** Used for "must_reply" smart filter
**Hidden:** The actual score and reasoning are never shown. Users might want to see "Why does IdeaBox think I should reply to this?"

### 7.8 Cognitive Load Score
**Extracted:** How mentally demanding the email is (1-10)
**Shown:** Never
**Hidden:** Could be useful for "light reading" vs "deep work" email batching.

### 7.9 Attachments
**Status:** NOT extracted at all. Gmail API returns attachment metadata but it's never parsed or stored.
**Impact:** Users can't search for "emails with PDFs" or "emails with invoices."

---

## 8. The Connectivity Gap — Current State

```
Email Arrives
  │
  ├── Categorizer ──── category, timeliness, signal_strength
  ├── ContentDigest ── gist, key_points, links, nuggets, style_ideas
  ├── ActionExtractor ── actions ──── [TRIAGE] ──── project_items ✓
  ├── IdeaSparkAnalyzer ── ideas ── [TRIAGE] ──── project_items ✓
  ├── EventDetector ──── events ───── [CALENDAR] ──── user_event_states (save/dismiss only)
  ├── DateExtractor ──── dates ────── [DEAD END — /api/dates exists, UI doesn't call it]
  ├── LinkAnalyzer ───── links ────── [DISCOVERIES] ── saved_links (save only)
  ├── ContactEnricher ── contacts ─── [CONTACTS PAGE]
  ├── ClientTagger ───── client tag ── [CONTACTS PAGE]
  ├── InsightExtractor ── insights ── [DISCOVERIES]
  └── NewsBrief ──────── news ─────── [DISCOVERIES]
```

**What's missing:**
- Events → Tasks (no path)
- Dates/Deadlines → Triage or Calendar (dead end)
- Links → Tasks/Projects (no path)
- Nuggets → Browsable feed (no standalone view)
- Ideas in email_ideas → project_items (disconnected)
- Timeliness dates → anywhere visible (hidden)

---

## 9. The Seamless Vision — What "Connected" Looks Like

### 9.1 Unified Triage Queue
Everything that needs a decision in ONE place:
- Actions from email (existing)
- Idea sparks (existing)
- Events needing RSVP (NEW)
- Deadlines approaching (NEW)
- Expiring links (NEW)

### 9.2 Bidirectional Item Creation
- Event → "Create prep task" → project_item with source_event reference
- Link → "Add to project" → project_item with link URL in description
- Nugget → "Save to ideas" → project_item or email_ideas
- Deadline → "Track this" → project_item with auto due_date

### 9.3 Source Traceability on Everything
project_items should track where they came from:
- `source_email_id` ✓ (exists)
- `source_action_id` ✓ (exists)
- `source_event_id` (NEW — doesn't exist, events use email_id as proxy)
- `source_idea_id` (NEW — no FK to email_ideas)
- `source_link_url` (NEW — no link reference)

### 9.4 Surface Hidden Data Where It's Useful
- Show timeliness expiration on inbox rows ("stale in 2 days")
- Show "must_read" links as chips on inbox rows
- Show contact job_title/company in email sender info
- Surface email style ideas in compose/reply flow
- Show cognitive load as a visual indicator for email batching

---

## 10. Prioritized Recommendations

### P0 — Fix Broken Things
1. **Fix extracted_dates dead end** — Either wire `/api/dates` into the Calendar view or consolidate date extraction into event_detection pipeline
2. **Unify idea lifecycle** — Decide if `email_ideas` is the source of truth or `project_items`. Eliminate the gap.

### P1 — Expand Triage (Highest Impact)
3. **Add events to triage** — Events with `commitment_level: invited` and RSVP deadlines should appear in the triage queue
4. **Add deadlines to triage** — Any extracted date within 7 days should be triageable
5. **"Create task from event"** — Single most impactful cross-entity connection

### P2 — Surface Hidden Email Data
6. **Show timeliness dates** on inbox rows (late_after, expires)
7. **Show "must_read" link badge** on inbox rows (currently only nuggets and events get indicator icons)
8. **Show contact company/title** in email sender area
9. **Surface email style ideas** in compose flow

### P3 — Deepen Connections
10. **Add source_event_id, source_idea_id to project_items** schema
11. **Link → project_item path** for bookmarking links to specific projects
12. **Golden nuggets standalone feed** — browsable/searchable nuggets across all emails
13. **Attachment parsing** — extract and index attachment metadata from Gmail API

---

## 11. Schema Changes Needed (For Reference)

```sql
-- project_items: add source references
ALTER TABLE project_items ADD COLUMN source_event_id UUID REFERENCES extracted_dates(id);
ALTER TABLE project_items ADD COLUMN source_idea_id UUID REFERENCES email_ideas(id);
ALTER TABLE project_items ADD COLUMN source_link_url TEXT;

-- Or, if events stay in JSONB, a composite reference:
ALTER TABLE project_items ADD COLUMN source_event_email_id UUID REFERENCES emails(id);
ALTER TABLE project_items ADD COLUMN source_event_index INTEGER; -- for multi-event emails
```

---

## 12. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Triage queue gets too noisy with events + deadlines | Medium | Add smart filtering, confidence thresholds, and "quiet hours" for low-priority items |
| extracted_dates schema cache bug returns | High | Consider eliminating extracted_dates table entirely and storing everything in event_detection JSONB |
| email_ideas table becomes permanently orphaned | Low | Migration to backfill source_idea_id on existing project_items that match by title |
| Performance — triage now queries 4+ endpoints | Medium | Create a unified `/api/triage` endpoint that merges server-side |
| UI complexity — too many card types in triage | Medium | Use a shared card layout with type-specific badges, not wholly different components |
