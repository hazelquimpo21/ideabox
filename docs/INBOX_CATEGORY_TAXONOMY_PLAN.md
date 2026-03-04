# Inbox Category Taxonomy v2 — Implementation Plan

> **STATUS: IMPLEMENTED (March 2026)**
> This plan has been implemented. The 20-category taxonomy, timeliness JSONB column,
> 5-dimension scoring, smart views API, and timeliness cron job are all live.
> See `DATABASE_SCHEMA.md` for current schema, `AI_ANALYZER_SYSTEM.md` for analyzer details,
> and `DECISIONS.md` (#31) for the architectural decision record.

## Overview

A complete overhaul of IdeaBox's email classification system, expanding from 13 categories to 20 life-bucket categories, introducing a structured `timeliness` object, multi-dimensional scoring algorithms (importance, urgency, action, cognitive load, missability), and custom SVG icons for all taxonomy objects.

---

## Part 1: Schema & Types

### 1A. New Category Taxonomy (20 categories)

**Current** (13): `clients`, `work`, `personal_friends_family`, `family`, `finance`, `travel`, `shopping`, `local`, `newsletters_creator`, `newsletters_industry`, `news_politics`, `product_updates`, `notifications`

**New** (20):

| Category | Replaces / New | Description |
|---|---|---|
| `clients` | kept | Direct client work, billable relationships |
| `work` | kept | Professional non-client |
| `job_search` | **new** | Applications, recruiters, interviews, offers |
| `personal` | rename `personal_friends_family` | Friends, social relationships, adult hobbies/clubs (craft club, running group, book club) |
| `family` | kept | Family relationships |
| `parenting` | **new** | Kids: school, childcare, pediatrician, extracurriculars, tutors, sports teams, art class |
| `health` | **new** | Medical, dental, prescriptions, insurance EOBs, vet |
| `finance` | narrowed | Banking, investments, tax, financial planning |
| `billing` | **new** (split from finance) | Receipts, subscriptions, autopay, bills, payment failures |
| `travel` | kept | Flights, hotels, bookings, trip planning |
| `shopping` | kept | Orders, shipping, returns, tracking |
| `deals` | **new** | Sales, discounts, coupons, limited-time offers |
| `local` | kept | Community, neighborhood, local businesses/events |
| `civic` | **new** | Government, council, school board, HOA, voting |
| `sports` | **new** | Fan sports: scores, fantasy leagues, team updates, game schedules (NOT kids sports teams — those go in `parenting`) |
| `news` | split from `news_politics` | News outlets, current events, breaking news |
| `politics` | split from `news_politics` | Political news, campaigns, policy |
| `newsletters` | merge `newsletters_creator` + `newsletters_industry` | Substacks, digests, curated content |
| `product_updates` | kept | SaaS tools, release notes, changelogs |
| `notifications` | kept | Verification codes, OTPs, 2FA, login alerts |

### 1B. New `email_type` values

Replace existing 9-value email_type with a cleaner 6-value set:

| Value | Description |
|---|---|
| `needs_response` | Someone is waiting for a reply |
| `fyi` | Worth knowing, no action needed |
| `automated` | Machine-generated (receipts, alerts, 2FA) |
| `marketing` | Promotional, sales, deals |
| `newsletter` | Content/digest delivery |
| `personal` | Direct human-to-human |

### 1C. New Labels

Add to existing labels array:

- `invited` — Personally/directly invited to something. Social weight.
- `confirmation` — Booking/order/appointment confirmed. Reference material.
- `has_tickets` — Contains tickets, passes, QR codes.
- `deadline` — Something expires or is due by a date.

### 1D. Timeliness Object

New JSONB column `timeliness` on the `emails` table:

```typescript
interface Timeliness {
  nature: 'ephemeral' | 'today' | 'upcoming' | 'asap' | 'reference' | 'evergreen';
  relevant_date?: string;  // ISO date — the thing itself (event, flight, meeting)
  late_after?: string;     // ISO date — consequence threshold (bill due, RSVP soft deadline)
  expires?: string;        // ISO date — hard cutoff (sale ends, 2FA expires, registration closes)
  perishable: boolean;     // Worthless after its moment?
}
```

### 1E. Scoring Columns

New computed score columns on `emails` (denormalized for fast queries):

- `importance_score` REAL — 0.0-1.0
- `urgency_score` REAL — already exists, redefine to 0.0-1.0 scale
- `action_score` REAL — 0.0-1.0
- `cognitive_load` REAL — 0.0-1.0
- `missability_score` REAL — 0.0-1.0
- `surface_priority` REAL — 0.0-1.0 (composite)

---

## Part 2: SQL Migration

**File**: `supabase/migrations/migration-044-inbox-category-taxonomy-v2.sql`

### Steps:

1. Drop old category CHECK constraint
2. Migrate old category values:
   - `personal_friends_family` → `personal`
   - `news_politics` → `news` (default, some may need `politics`)
   - `newsletters_creator` → `newsletters`
   - `newsletters_industry` → `newsletters`
   - Finance emails with billing signals → `billing`
3. Add new CHECK constraint with all 20 categories
4. Add `timeliness` JSONB column (nullable)
5. Add scoring columns: `importance_score`, `action_score`, `cognitive_load`, `missability_score`, `surface_priority` (all REAL, nullable)
6. Update `email_type` CHECK constraint with new 6-value set (map old values)
7. Create indexes:
   - `idx_emails_surface_priority` on `surface_priority DESC NULLS LAST`
   - `idx_emails_timeliness_nature` on `((timeliness->>'nature'))`
   - `idx_emails_timeliness_relevant_date` on `((timeliness->>'relevant_date'))`
   - GIN index on `timeliness` for flexible JSONB queries
8. Add new labels to any CHECK constraint if applicable (labels are TEXT[], no constraint currently)

---

## Part 3: TypeScript Types

**Files to update**:

### `src/types/discovery.ts`
- Update `EmailCategory` type to 20 values
- Update `EMAIL_CATEGORIES` array
- Add legacy mapping for `personal_friends_family`, `news_politics`, `newsletters_creator`, `newsletters_industry`
- Add `Timeliness` interface
- Add `TimelinessNature` type

### `src/types/database.ts`
- Update `EmailCategory` type
- Add `Timeliness` interface
- Add scoring fields to `emails` Row/Insert/Update
- Update `EmailTypeDb` type

### `src/services/analyzers/types.ts`
- Update `EMAIL_TYPES` array
- Add `TIMELINESS_NATURES` constant
- Add `Timeliness` type
- Add new labels to `EMAIL_LABELS`
- Update `CategorizationData` to include timeliness output

---

## Part 4: Backend — Analyzer Updates

### `src/services/analyzers/categorizer.ts` (prompt update)

The categorizer prompt needs to:
1. Know about 20 categories (replace old 13)
2. Output `timeliness` object alongside category
3. Output refined `email_type` (6 values)
4. Output new labels (`invited`, `confirmation`, `has_tickets`, `deadline`)
5. Multi-category via `additional_categories` (already exists)

No new API calls — this all fits in the existing categorizer pass.

### `src/services/analyzers/scoring-engine.ts` (NEW file)

Pure computation — no AI calls. Runs after categorizer + other analyzers complete.

```typescript
interface ScoringInput {
  category: EmailCategory;
  additional_categories: EmailCategory[];
  email_type: EmailType;
  labels: EmailLabel[];
  timeliness: Timeliness;
  sender_email: string;
  contact_id: string | null;
  signal_strength: SignalStrength;
  reply_worthiness: ReplyWorthiness;
}

interface ScoringOutput {
  importance: number;    // 0.0-1.0
  urgency: number;       // 0.0-1.0
  action_score: number;  // 0.0-1.0
  cognitive_load: number; // 0.0-1.0
  missability: number;   // 0.0-1.0
  surface_priority: number; // 0.0-1.0 composite
}
```

**Importance algorithm**:
```
base = CATEGORY_WEIGHTS[category]  // 0.1-0.9 defaults
+ sender_weight                     // +0.0-0.3 based on contact relationship
+ type_weight                       // +0.2 needs_response, -0.1 marketing
+ label_modifiers                   // +0.3 urgent, +0.2 invited, etc.
cap at 1.0
```

**Urgency algorithm**:
```
if timeliness.expires exists and past → 0.0 (dead email)
if timeliness.expires exists → calculate from hours_left
elif timeliness.late_after exists and past → 0.95
elif timeliness.late_after exists → calculate from days_left
elif timeliness.relevant_date exists → calculate from days_left
else → NATURE_BASE[timeliness.nature]

+ 0.2 if perishable
```

**Missability algorithm**:
```
base from:
  +0.4 if perishable
  +0.3 if ephemeral
  +0.3 if deadline label
  +0.2 if invited
  +0.2 if needs_response
  +0.2 if urgent
  -0.3 if evergreen
  -0.2 if reference
  -0.2 if automated
```

**Surface priority composite**:
```
surface_priority = importance * 0.25 + urgency * 0.25 + action_score * 0.25 + missability * 0.25
```

### `src/services/processors/batch-processor.ts` (update)

After all analyzers run, call the scoring engine and write scores to the `emails` row.

### `src/services/jobs/priority-reassessment.ts` (update)

Recalculate urgency + surface_priority on a cron schedule as dates approach. Key behaviors:
- `expires` past → auto-archive candidate
- `late_after` approaching → escalate
- `relevant_date` approaching → surface context
- `relevant_date` past + perishable → de-prioritize

---

## Part 5: Frontend — SVG Icons

### `src/components/inbox/CategoryIcon.tsx` (rewrite)

Expand from 12 icons to 20. New icons needed:

| Category | Icon concept | SVG description |
|---|---|---|
| `clients` | Briefcase | Keep existing |
| `work` | Building | Keep existing |
| `job_search` | Magnifying glass + person | Person silhouette with search circle |
| `personal` | Two people | Simplified from current heart+people |
| `family` | House | Keep existing |
| `parenting` | Parent + child | Adult figure holding small figure's hand |
| `health` | Heart + pulse | Heart shape with ECG line through it |
| `finance` | Chart trending up | Simple line graph going up |
| `billing` | Receipt/dollar | Receipt paper with dollar sign |
| `travel` | Airplane | Keep existing |
| `shopping` | Shopping bag | Keep existing |
| `deals` | Tag/percent | Price tag with percent symbol |
| `local` | Map pin | Keep existing |
| `civic` | Landmark/columns | Classical building facade (like a courthouse) |
| `sports` | Trophy/ball | Simple trophy cup |
| `news` | Newspaper | Keep existing industry newsletter icon |
| `politics` | Ballot/vote | Ballot box with checkmark |
| `newsletters` | Open book/letter | Merge of creator pen + industry newspaper |
| `product_updates` | Box/package | Keep existing |
| `notifications` | Bell | Simple notification bell |

Color assignments for new categories:
```typescript
job_search:    { bg: 'bg-lime-100',    fg: 'text-lime-600' }
parenting:     { bg: 'bg-rose-100',    fg: 'text-rose-600' }
health:        { bg: 'bg-red-100',     fg: 'text-red-600' }
billing:       { bg: 'bg-emerald-100', fg: 'text-emerald-600' }
deals:         { bg: 'bg-fuchsia-100', fg: 'text-fuchsia-600' }
civic:         { bg: 'bg-stone-200',   fg: 'text-stone-600' }
sports:        { bg: 'bg-yellow-100',  fg: 'text-yellow-600' }
news:          { bg: 'bg-slate-200',   fg: 'text-slate-600' }
politics:      { bg: 'bg-zinc-200',    fg: 'text-zinc-600' }
newsletters:   { bg: 'bg-emerald-100', fg: 'text-emerald-600' }  // re-use creator green
```

### `src/components/inbox/TimelinessIcon.tsx` (NEW)

Small SVG icons for timeliness nature values:

| Nature | Icon | Description |
|---|---|---|
| `ephemeral` | Lightning bolt | Fleeting, act now |
| `today` | Sun | Today's relevance |
| `upcoming` | Calendar + arrow | Future event |
| `asap` | Exclamation in circle | Needs action |
| `reference` | Bookmark | File for later |
| `evergreen` | Leaf | No time pressure |

### `src/components/inbox/EmailTypeIcon.tsx` (NEW)

Small icons for email_type values:

| Type | Icon | Description |
|---|---|---|
| `needs_response` | Reply arrow | Someone is waiting |
| `fyi` | Info circle | For your information |
| `automated` | Gear/cog | Machine-generated |
| `marketing` | Megaphone | Promotional |
| `newsletter` | Open envelope | Content delivery |
| `personal` | Person | Human-to-human |

### `src/components/inbox/ScoreBadge.tsx` (NEW)

Visual display of the composite scores. Shows surface_priority as a colored dot/bar:
- Green (< 0.3): Low priority, can wait
- Yellow (0.3-0.6): Moderate, include in summary
- Orange (0.6-0.8): Important, surface soon
- Red (> 0.8): Critical, push notification

---

## Part 6: Frontend — Surfacing Logic

### `src/app/(auth)/inbox/[category]/page.tsx` (update)

- Update category routing to handle 20 categories
- Sort emails by `surface_priority DESC` instead of `date DESC`
- Show timeliness indicators inline on email cards

### `src/components/inbox/InboxEmailCard.tsx` (update)

Add to existing card:
- Timeliness nature icon (small, left of date)
- `late_after` / `expires` countdown badge when approaching
- `invited` indicator (distinct from generic events)
- Surface priority color dot

### `src/components/inbox/InboxEmailRow.tsx` (update)

Same additions in compact row format.

### Smart Views (new API routes + pages):

**`/api/emails/smart-views/today`** — Emails where:
- `timeliness.nature` = 'asap' or 'today'
- OR `timeliness.relevant_date` = today
- OR `timeliness.late_after` <= today
- Sorted by `surface_priority DESC`

**`/api/emails/smart-views/upcoming`** — Emails where:
- `timeliness.nature` = 'upcoming'
- `timeliness.relevant_date` within next 14 days
- Sorted by `relevant_date ASC`

**`/api/emails/smart-views/reading-list`** — Emails where:
- `timeliness.nature` = 'evergreen'
- `email_type` = 'newsletter'
- Sorted by `importance_score DESC`

**`/api/emails/smart-views/expiring`** — Emails where:
- `timeliness.expires` exists and is within 48 hours
- Sorted by `expires ASC`

---

## Part 7: Auto-behaviors

### `src/services/jobs/timeliness-actions.ts` (NEW)

Cron job (runs hourly) that:
1. **Auto-archive expired**: `expires` is past → mark `is_archived = true`
2. **Escalate late**: `late_after` is past → boost `surface_priority` by 0.2
3. **Surface approaching**: `relevant_date` within 24h → push to "today" smart view
4. **De-prioritize stale perishables**: `relevant_date` past + `perishable` → decay priority

---

## Part 8: Categorizer Prompt Update

### `src/services/analyzers/categorizer.ts`

Update the system prompt to include:
1. Full 20-category taxonomy with descriptions and examples
2. Timeliness extraction instructions with examples for each nature type
3. Date detection guidance (relevant_date vs late_after vs expires)
4. New label definitions (invited, confirmation, has_tickets, deadline)
5. Updated email_type with 6 values

The prompt should output a JSON object like:
```json
{
  "category": "billing",
  "additional_categories": ["travel"],
  "email_type": "automated",
  "timeliness": {
    "nature": "upcoming",
    "relevant_date": "2026-03-20",
    "late_after": "2026-03-18",
    "expires": null,
    "perishable": false
  },
  "labels": ["confirmation", "has_tickets"],
  "signal_strength": "medium",
  "reply_worthiness": "no_reply",
  "summary": "...",
  "quick_action": null
}
```

---

## Implementation Order

1. **SQL Migration** — Add columns, update constraints, migrate data
2. **TypeScript Types** — Update all type definitions
3. **Scoring Engine** — New pure-computation service
4. **Categorizer Prompt** — Update to output new taxonomy + timeliness
5. **Batch Processor** — Wire scoring engine into pipeline
6. **Category Icons** — Expand to 20 icons
7. **Timeliness + EmailType + Score Icons** — New icon components
8. **Inbox UI** — Update cards/rows with new indicators
9. **Smart Views** — API routes + pages
10. **Auto-behaviors** — Timeliness cron job
11. **Priority Reassessment** — Update with new scoring model
12. **Legacy Data Migration** — Backfill timeliness + scores for existing emails

---

## Files Changed (summary)

**New files:**
- `supabase/migrations/migration-044-inbox-category-taxonomy-v2.sql`
- `src/services/analyzers/scoring-engine.ts`
- `src/services/jobs/timeliness-actions.ts`
- `src/components/inbox/TimelinessIcon.tsx`
- `src/components/inbox/EmailTypeIcon.tsx`
- `src/components/inbox/ScoreBadge.tsx`
- `src/app/api/emails/smart-views/today/route.ts`
- `src/app/api/emails/smart-views/upcoming/route.ts`
- `src/app/api/emails/smart-views/reading-list/route.ts`
- `src/app/api/emails/smart-views/expiring/route.ts`

**Modified files:**
- `src/types/discovery.ts` — 20 categories, Timeliness type
- `src/types/database.ts` — Updated Email row types, scoring columns
- `src/services/analyzers/types.ts` — New types, updated constants
- `src/services/analyzers/categorizer.ts` — Updated prompt for taxonomy v2
- `src/services/processors/batch-processor.ts` — Wire in scoring engine
- `src/services/jobs/priority-reassessment.ts` — Use new scoring model
- `src/components/inbox/CategoryIcon.tsx` — 20 icons + colors
- `src/components/inbox/InboxEmailCard.tsx` — Timeliness + score indicators
- `src/components/inbox/InboxEmailRow.tsx` — Same updates
- `src/app/(auth)/inbox/[category]/page.tsx` — 20-category routing
