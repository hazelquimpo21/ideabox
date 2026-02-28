# UI Field Audit: Email Analyzer Data Surfacing

**Date:** February 2026
**Scope:** Comprehensive audit of how AI analyzer fields are displayed (or not) across the IdeaBox frontend
**Last Updated:** February 28, 2026 — Phase 1 implementation complete

---

## Executive Summary

IdeaBox has 14 AI analyzers producing rich intelligence from every email. The **email detail view** does an excellent job rendering nearly everything. However, the **list views** (inbox row, inbox card, priority list, category cards) and **secondary surfaces** (contacts, home cards) had meaningful gaps where analyzer data was either not surfaced or inconsistently shown.

**Phase 1 is now complete** — all high-priority recommendations (A through F) from the original audit have been implemented. Urgency score and relationship signal are now real columns, golden nuggets have a gem badge in list views, the sidebar shows actionable badge counts, calendar events have key date type badges, and the contact detail page has a full intelligence summary section.

---

## Changes Implemented

### 1. Reply Worthiness Indicators (InboxEmailRow + InboxEmailCard)
**Gap:** The AI determines `must_reply` / `should_reply` / `optional_reply` / `no_reply` for every email, but this was only shown in the PriorityEmailList and CategoryEmailCard — not in the main inbox views where users spend most of their time.

**Fix:** Added a compact reply badge to both InboxEmailRow (row 3, next to action badge) and InboxEmailCard (row 1, next to sender). Color-coded: red for `must_reply`, orange for `should_reply`.

**Impact:** Users can now identify emails needing a response during rapid inbox scanning without opening each one.

### 2. Signal Strength in InboxEmailCard
**Gap:** InboxEmailRow had a signal strength dot (green/yellow/slate) but InboxEmailCard did not — inconsistent experience between row and card views.

**Fix:** Added the same signal dot indicator to InboxEmailCard, positioned next to the sender name.

**Impact:** Card view users get the same at-a-glance signal quality information as row view users.

### 3. EMAIL_LIST_FIELDS Expanded
**Gap:** The `useEmails` hook's `EMAIL_LIST_FIELDS` constant excluded `reply_worthiness`, `email_type`, and `additional_categories` — so these fields weren't available to any list-view component even though they exist as denormalized columns in the emails table.

**Fix:** Added `reply_worthiness`, `email_type`, and `additional_categories` to `EMAIL_LIST_FIELDS`.

**Impact:** Unlocks these fields for all inbox components without additional queries.

### 4. Link Descriptions in SavedLinksCard
**Gap:** The LinkAnalyzer produces a `description` field explaining why each link matters, but SavedLinksCard only showed the title — making it hard for users to decide whether to click.

**Fix:** Added a one-line description below the link title (line-clamped to 1 line to keep the card compact).

**Impact:** Users can make faster save/dismiss decisions with context about each link.

### 5. PriorityEmailList Lightbulb Fix
**Gap:** The idea spark lightbulb icon showed for ALL analyzed emails (`email.analyzed_at` truthy), which is misleading — noise and low-signal emails don't generate idea sparks.

**Fix:** Now only shows the lightbulb when `signal_strength` is `high` or `medium` (the actual condition for Phase 2 idea spark generation).

**Impact:** Reduces UI noise and correctly signals when ideas are actually available.

### 6. Additional Categories + Relationship Signal in CategoryEmailCard
**Gap:** The CategoryEmailCard (used in the Kanban-style category view) didn't show `additional_categories` and only showed *negative* relationship signals (as an emoji), ignoring positive ones.

**Fix:**
- Added `additional_categories` display as dashed-border badges below topics
- Added positive relationship signal (green TrendingUp icon) alongside the existing negative indicator (now a red rotated TrendingUp for consistency — replaced the emoji)
- Fixed the lightbulb indicator to use the same signal-strength condition as PriorityEmailList

**Impact:** Multi-category emails are now visible in the category view, and positive client relationship signals are surfaced instead of only warnings.

### 7. Email Type in PriorityEmailList
**Gap:** The `email_type` field (personal, newsletter, transactional, notification, etc.) was denormalized to the emails table but never shown in any list view.

**Fix:** Added a subtle email type label in the PriorityEmailList next to the category badge (hidden for `personal` and `needs_response` which are the default/obvious types).

**Impact:** Helps users distinguish newsletters from personal emails in the priority ranking.

### 8. Richer Contact Cards
**Gap:** Contact cards showed only email count + last seen. The database has `birthday`, `sent_count`, `received_count`, `avg_response_hours`, and `notes` — all invisible to users.

**Fix:**
- Added birthday display (cake icon + formatted date)
- Added notes preview (sticky note icon + 1-line italic preview)
- Added sent/received counts breakdown (replaces just "X emails" with sent/received split)
- Added average response time when available
- Extended the `Contact` TypeScript interface to include these fields

**Impact:** Contacts page becomes a true CRM view — users can see birthdays, relationship notes, and communication patterns at a glance.

---

## Phase 1 Implementation (Complete — February 2026)

The following recommendations from the original audit have been fully implemented:

### A. Golden Nuggets Count Indicator in List Views ✅
**Migration 044:** Added `golden_nugget_count INTEGER DEFAULT 0` to emails table with backfill from `email_analyses` JSONB. Gem badge (purple `Gem` icon + count) now renders in InboxEmailRow, InboxEmailCard, and CategoryEmailCard when count > 0.

### B. Email Style Ideas Discovery Surface
Deferred to Phase 2 (item 2.3 in `.plan.md`).

### C. Denormalize `urgency_score` ✅
**Migration 043:** Added `urgency_score INTEGER` to emails table. Backfilled from `email_analyses.action_extraction.urgencyScore`. Email processor now denormalizes during analysis. CategoryEmailCard urgency display is no longer dead code.

### D. Relationship Signal Denormalization ✅
**Migration 043:** Added `relationship_signal TEXT` with check constraint (`positive`, `neutral`, `negative`, `unknown`). Backfilled from `email_analyses.client_tagging.relationship_signal`. Email processor denormalizes during analysis. CategoryEmailCard relationship display is no longer dead code.

### E. Contact Detail Page Enrichment ✅
New `/api/contacts/[id]/intelligence` API route aggregates relationship signal trend, common topics, extracted dates, and 6-month communication frequency. New `useContactIntelligence` hook and `ContactIntelligenceCard` component. Integrated into contact detail page between Notes and Email History sections.

### F. Calendar Page: Event Locality + Key Date Badges ✅
Locality badges already existed in EventCard (via `LocalityBadge` component). Added `KeyDateTypeBadge` component showing "Reg. Deadline", "Open House", "Deadline", "Release Date" labels. Renders in both compact and full card views. Extended `EventMetadata` TypeScript interface with `isKeyDate`, `keyDateType`, `eventSummary`, `keyPoints`.

### Additional Phase 1 Work

- **CategoryModal fields expanded:** `MODAL_LIST_FIELDS` now includes `signal_strength`, `reply_worthiness`, `quick_action`, `additional_categories`, `email_type`, `urgency_score`, `relationship_signal`, `golden_nugget_count`
- **EmailPreviewModal analysis bar:** New `AnalysisSummaryBar` component shows category, signal, quick action, reply worthiness, and "View full analysis" link above email body
- **DailyReviewCard enhanced:** Category badge (color-coded) and quick action icon added to each review queue item
- **Sidebar actionable badges:** New `useSidebarBadges` hook (5-min auto-refresh). Red badge on Inbox nav for must-reply unread count, amber badge on Calendar for today's deadline count

---

## Remaining Recommendations (Future Work — Phase 2+)

### Medium Priority

#### G. Home Page: Email Type Breakdown in Summary
The daily briefing could show a breakdown of email types received (e.g., "12 personal, 8 newsletters, 3 notifications") using the now-denormalized `email_type` field. This gives users a sense of their email composition.

#### H. Inbox: Confidence-Based Visual Affordances
Analysis confidence scores are available but mostly hidden. Consider:
- Slightly fading/italicizing low-confidence gist text
- Adding a subtle "?" badge when categorization confidence < 0.5
- This helps users understand when the AI is uncertain

### Low Priority (Nice-to-Have)

#### I. Saved Insights/News/Links Full-Page Views
Currently these are only shown on the Home page cards. Dedicated `/insights`, `/news`, `/links` pages (or tabs within Inbox) would let users browse, search, and manage their saved intelligence.

#### J. Email Thread Intelligence
When multiple emails in a thread are analyzed, the insights could be aggregated — e.g., "This thread has 3 action items across 5 messages." Currently each email is treated independently.

#### K. Export/Share Capabilities
Golden nuggets, insights, and saved links could be exportable to tools like Notion, Obsidian, or a simple markdown format.

---

## Field Coverage Matrix (Post–Phase 1)

| Analyzer Field | EmailDetail | InboxRow | InboxCard | PriorityList | CategoryCard | CategoryModal | Home | Sidebar | Calendar | Contacts |
|---|---|---|---|---|---|---|---|---|---|---|
| gist | Y | Y | Y | Y | Y | Y | - | - | - | - |
| summary | Y | fallback | fallback | fallback | Y | Y | Y | - | - | - |
| category | Y | Y | Y | Y | inherent | inherent | **P1** | - | - | - |
| additional_categories | Y | Y | Y | - | Y | **P1** | - | - | - | - |
| signal_strength | Y | Y | Y | lightbulb | Y (high) | **P1** | - | - | - | - |
| reply_worthiness | Y | Y | Y | Y | Y | **P1** | - | **P1** (count) | - | - |
| email_type | Y | available | available | Y | - | **P1** | - | - | - | - |
| quick_action | Y | Y | Y | Y | Y | **P1** | **P1** | - | - | - |
| priority_score | - | Y (>=70) | Y (>=70) | Y | - | - | - | - | - | - |
| key_points | Y | - | - | - | Y | Y | - | - | - | - |
| topics | Y | - | Y | - | Y | Y | - | - | - | **P1** (agg) |
| golden_nuggets | Y | **P1** (gem) | **P1** (gem) | - | **P1** (gem) | **P1** | - | - | - | - |
| email_style_ideas | Y | - | - | - | - | - | - | - | - | - |
| actions (multi) | Y | - | - | - | - | - | - | **P1** (count) | - | - |
| idea_sparks | Y | - | - | Y (icon) | Y (icon) | - | Y | - | - | - |
| insights | Y | - | - | - | - | - | Y | - | - | - |
| news_brief | Y | - | - | - | - | - | Y | - | - | - |
| links (analyzed) | Y | - | - | - | - | - | Y | - | - | - |
| event_detection | Y | Y (badge) | Y (badge) | - | - | - | Y | - | Y | - |
| multi_events | Y | - | - | - | - | - | - | - | Y | - |
| urgency_score | Y | available | available | - | **P1** | **P1** | - | - | - | - |
| relationship_signal | Y | available | available | - | **P1** | **P1** | - | - | - | **P1** (trend) |
| date_extraction | Y | - | - | - | - | - | Y | - | Y | **P1** |
| event_locality | Y | - | - | - | - | - | - | - | Y | - |
| key_date_type | Y | - | - | - | - | - | - | - | **P1** | - |
| contact birthday | - | - | - | - | - | - | Y | - | - | Y |
| contact notes | - | - | - | - | - | - | Y | - | - | Y |
| comm. frequency | - | - | - | - | - | - | - | - | - | **P1** |

**Legend:** Y = displayed, **P1** = added in Phase 1, - = not shown, "available" = field fetched but not yet rendered, "(agg)" = aggregated view, "(count)" = count badge only
