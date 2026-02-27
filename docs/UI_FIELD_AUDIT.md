# UI Field Audit: Email Analyzer Data Surfacing

**Date:** February 2026
**Scope:** Comprehensive audit of how AI analyzer fields are displayed (or not) across the IdeaBox frontend

---

## Executive Summary

IdeaBox has 14 AI analyzers producing rich intelligence from every email. The **email detail view** does an excellent job rendering nearly everything. However, the **list views** (inbox row, inbox card, priority list, category cards) and **secondary surfaces** (contacts, home cards) had meaningful gaps where analyzer data was either not surfaced or inconsistently shown. This audit identified and fixed the most impactful gaps.

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

## Remaining Recommendations (Not Implemented — Future Work)

### High Priority

#### A. Golden Nuggets Count Indicator in List Views
The ContentDigest analyzer extracts up to 7 "golden nuggets" (deals, tips, quotes, stats, recommendations). These are fully rendered in EmailDetail but there's no indicator in list views. Consider adding a small gem icon + count badge in InboxEmailRow/Card when nuggets > 0. The data lives in `email_analyses` JSONB, so this would either need:
- A new denormalized field `has_golden_nuggets` or `golden_nugget_count` on the emails table, OR
- A lightweight tooltip that loads on hover via `useEmailAnalysis`

#### B. Email Style Ideas Discovery Surface
Email style ideas (layout, subject line, tone, CTA, storytelling inspiration) are extracted but only visible buried in the EmailDetail analysis card. For the target user (solopreneur sending their own emails), these could be hugely valuable surfaced as a dedicated "Style Inspiration" tab or card on the Home page, similar to how IdeaSparks and Insights already have their own feeds.

#### C. Denormalize `urgency_score` to Emails Table
Currently `urgency_score` only exists in the `email_analyses` JSONB (`action_extraction.urgencyScore`). The CategoryEmailCard references `email.urgency_score` which likely always returns undefined since it's not a column. Either:
- Add a migration to denormalize it, OR
- Remove the urgency display from CategoryEmailCard (currently dead code)

#### D. Relationship Signal Denormalization
The `relationship_signal` from ClientTagger lives only in `email_analyses` JSONB. The CategoryEmailCard references `email.relationship_signal` directly — this field doesn't exist on the emails table, making the display dead code. Either denormalize it or fetch from analysis.

### Medium Priority

#### E. Contact Detail Page Enrichment
The `/contacts/[id]` detail page could benefit from:
- Email timeline showing communication frequency over time
- Extracted dates/events associated with this contact
- Idea sparks generated from their emails
- A "relationship health" score based on response patterns

#### F. Calendar Page: Event Locality Tags
The multi-event detector extracts `event_locality` (local, out_of_town, virtual) and `key_date_type` (registration_deadline, open_house, etc.) but the calendar list view doesn't surface these. Adding locality badges would help users quickly distinguish local events from virtual ones.

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

## Field Coverage Matrix (Post-Audit)

| Analyzer Field | EmailDetail | InboxRow | InboxCard | PriorityList | CategoryCard | Home |
|---|---|---|---|---|---|---|
| gist | Y | Y | Y | Y | Y | - |
| summary | Y | fallback | fallback | fallback | Y | Y |
| category | Y | Y | Y | Y | inherent | - |
| additional_categories | Y | Y | Y | - | **Y (NEW)** | - |
| signal_strength | Y | Y | **Y (NEW)** | used for lightbulb | Y (high only) | - |
| reply_worthiness | Y | **Y (NEW)** | **Y (NEW)** | Y | Y | - |
| email_type | Y | available | available | **Y (NEW)** | - | - |
| quick_action | Y | Y | Y | Y | Y | - |
| priority_score | - | Y (>=70) | Y (>=70) | Y | - | - |
| key_points | Y | - | - | - | Y (expandable) | - |
| topics | Y | - | Y | - | Y | - |
| golden_nuggets | Y | - | - | - | - | - |
| email_style_ideas | Y | - | - | - | - | - |
| actions (multi) | Y | - | - | - | - | - |
| idea_sparks | Y | - | - | Y (icon) | Y (icon) | Y |
| insights | Y | - | - | - | - | Y |
| news_brief | Y | - | - | - | - | Y |
| links (analyzed) | Y | - | - | - | - | **Y (enhanced)** |
| event_detection | Y | Y (badge) | Y (badge) | - | - | Y |
| multi_events | Y | - | - | - | - | - |
| client_tagging | Y | - | - | - | - | - |
| relationship_signal | Y | - | - | - | **Y (enhanced)** | - |
| date_extraction | Y | - | - | - | - | Y |
| contact birthday | - | - | - | - | - | **Y (NEW)** |
| contact notes | - | - | - | - | - | **Y (NEW)** |
| sent/received counts | - | - | - | - | - | **Y (NEW)** |
| avg_response_hours | - | - | - | - | - | **Y (NEW)** |

**Legend:** Y = displayed, **Y (NEW)** = added in this audit, - = not shown, "available" = field fetched but not yet rendered
