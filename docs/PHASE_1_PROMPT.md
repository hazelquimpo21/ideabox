# Phase 1 Implementation Prompt — Surface Email Analyzer Data Across All UI

> **ARCHIVED — Phase 1 is COMPLETE as of February 28, 2026.**
> This was a session-specific prompt used to implement Phase 1 of the UI analyzer data surfacing plan.
> See `.plan.md` for the full plan and `docs/UI_FIELD_AUDIT.md` for results.

> **Give this prompt to a new Claude Code instance to implement Phase 1 of the UI analyzer data surfacing plan.**

---

## Context & Mission

You are working on **IdeaBox**, an AI-powered email intelligence system that runs 14 analyzers on every email (Categorizer, ContentDigest, ActionExtractor, ClientTagger, DateExtractor, EventDetector, MultiEventDetector, ContactEnricher, SenderTypeDetector, IdeaSpark, InsightExtractor, NewsBrief, LinkAnalyzer, LinkResolver). The analyzers produce rich intelligence but much of it is only visible in the EmailDetail view. Your job is to surface this intelligence across the rest of the app.

**Read these files first to understand the full picture:**
- `.plan.md` — The 2-phase plan (you're implementing Phase 1)
- `docs/UI_FIELD_AUDIT.md` — Audit showing what's displayed where and what's missing
- `docs/CODING_STANDARDS.md` — Mandatory coding standards

**Tech stack:** Next.js 14 App Router, TypeScript (strict), Supabase (PostgreSQL + RLS), Tailwind CSS, shadcn/ui, Lucide icons, OpenAI GPT-4.1-mini

**Branch:** Work on the current branch. The branch already has audit changes from a previous session — your work builds on top of those.

---

## Coding Standards (Non-Negotiable)

### File Size
Every file must be ≤ **400 lines** of code (excluding comments/imports). If a file approaches 400 lines, extract sub-components or utilities into separate files.

### Logging
Every new function, component mount, data fetch, and error path MUST use the project's logger:

```typescript
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('ComponentOrServiceName');

logger.start('Starting operation', { context });    // 🚀
logger.success('Operation completed', { result });  // ✅
logger.error('Operation failed', { error });        // ❌
logger.warn('Warning condition', { detail });       // ⚠️
logger.debug('Debug info', { data });               // 🔍
```

Log at minimum: component mount/unmount, data fetch start/success/error, user actions, and any conditional logic branches that affect what renders.

### Comments
- JSDoc on all exported functions/components/interfaces
- Block comment headers (═══ style) to separate major sections within a file (match existing pattern in the codebase)
- Explain **WHY** not **WHAT** in inline comments
- Document every new type field with a brief description

### TypeScript
- Strict mode — no `any` unless absolutely unavoidable (and then document why)
- All new interfaces/types go in `src/types/database.ts` or relevant type files
- Use `Record<string, T>` over `{ [key: string]: T }`

### Import Order
1. External libraries (react, next, lucide-react)
2. Internal modules (@/lib, @/types, @/hooks)
3. Components (@/components)
4. Styles

---

## Implementation Items (In Dependency Order)

### 1.1 — Denormalize `urgency_score` and `relationship_signal` (Migration + Processor + Types)

**Problem:** `urgency_score` and `relationship_signal` are referenced in CategoryEmailCard (`src/components/categories/EmailCard.tsx`) but only exist in `email_analyses` JSONB. The component reads `email.urgency_score` and `email.relationship_signal` which are always `undefined` at runtime. The types file (`src/types/database.ts` lines 349-354) has a NOTE comment confirming these columns don't exist in the DB yet.

**What to do:**

1. **Create migration** `scripts/migration-043-denormalize-urgency-relationship.sql`:
```sql
-- Migration 043: Denormalize urgency_score and relationship_signal to emails table
-- These fields exist in email_analyses JSONB but are needed for fast list-view access.
-- See: .plan.md section 1.1, docs/UI_FIELD_AUDIT.md recommendations C and D.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS urgency_score INTEGER;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS relationship_signal TEXT;

-- Add check constraint for relationship_signal valid values
ALTER TABLE emails ADD CONSTRAINT emails_relationship_signal_check
  CHECK (relationship_signal IS NULL OR relationship_signal IN ('positive', 'neutral', 'negative', 'unknown'));

-- Backfill from email_analyses JSONB (action_extraction.urgencyScore and client_tagging.relationship_signal)
UPDATE emails e
SET
  urgency_score = COALESCE(
    (ea.analysis_data->'action_extraction'->>'urgencyScore')::INTEGER,
    NULL
  ),
  relationship_signal = COALESCE(
    ea.analysis_data->'client_tagging'->>'relationship_signal',
    NULL
  )
FROM email_analyses ea
WHERE ea.email_id = e.id
  AND ea.analysis_data IS NOT NULL;

-- Index for filtering high-urgency emails
CREATE INDEX IF NOT EXISTS idx_emails_urgency_score ON emails (urgency_score) WHERE urgency_score IS NOT NULL;
```

2. **Update email processor** (`src/services/processors/email-processor.ts`):
   - Find the `updateEmailAnalysisFields()` method (around line 2586)
   - Add `urgency_score` and `relationship_signal` to the `updates` object
   - The urgency score comes from `actionExtraction.urgencyScore` — you'll need to pass the action extraction result into this method or extract it separately
   - The relationship signal comes from `clientTagging.relationshipSignal` — check how this is already available in the processor's `processEmail()` flow (look around line 1698 where `relationship_signal: analysis.clientTagging.relationshipSignal` is written to email_analyses)
   - Add logging: `logger.debug('Denormalizing urgency_score and relationship_signal', { emailId, urgencyScore, relationshipSignal })`

3. **Update database types** (`src/types/database.ts`):
   - Remove the NOTE comment at lines 349-354 that says "no DB migration"
   - The type declarations for `urgency_score` and `relationship_signal` already exist — just update the comment to reflect they are now real columns

4. **Update `useEmails.ts`** (`src/hooks/useEmails.ts`):
   - Add `urgency_score` and `relationship_signal` to the `EMAIL_LIST_FIELDS` constant (line ~51)
   - Note the existing comment at line 57 says "Excludes urgency_score/relationship_signal — no DB columns" — update this comment

### 1.8 — Golden Nuggets Count Indicator in List Views

**Problem:** ContentDigest extracts up to 7 golden nuggets per email (deals, tips, quotes, stats, recommendations). These are fully rendered in EmailDetail but there's zero indicator in list views.

**What to do:**

1. **Create migration** `scripts/migration-044-golden-nugget-count.sql`:
```sql
-- Migration 044: Add golden_nugget_count for list-view gem badge display
-- ContentDigest extracts up to 7 nuggets per email but list views can't show this
-- without a denormalized count (nuggets live in email_analyses JSONB).

ALTER TABLE emails ADD COLUMN IF NOT EXISTS golden_nugget_count INTEGER DEFAULT 0;

-- Backfill from email_analyses JSONB
UPDATE emails e
SET golden_nugget_count = COALESCE(
  jsonb_array_length(
    COALESCE(
      ea.analysis_data->'content_digest'->'golden_nuggets',
      ea.analysis_data->'content_digest'->'goldenNuggets',
      '[]'::jsonb
    )
  ),
  0
)
FROM email_analyses ea
WHERE ea.email_id = e.id
  AND ea.analysis_data IS NOT NULL;
```

2. **Update email processor** — After content digest analysis, set `golden_nugget_count`:
   - In `updateEmailAnalysisFields()`, add: `updates.golden_nugget_count = contentDigest?.goldenNuggets?.length ?? 0;`
   - Log: `logger.debug('Setting golden_nugget_count', { emailId, count: contentDigest?.goldenNuggets?.length ?? 0 })`

3. **Update `EMAIL_LIST_FIELDS`** in `useEmails.ts` — Add `golden_nugget_count`

4. **Update database types** — Add `golden_nugget_count: number` to the Email Row type

5. **Add gem badge to list view components:**

   In `src/components/inbox/InboxEmailRow.tsx`, `src/components/inbox/InboxEmailCard.tsx`, and `src/components/categories/EmailCard.tsx`:
   - Import `Gem` from lucide-react
   - Add a small gem icon + count when `golden_nugget_count > 0`:
   ```tsx
   {email.golden_nugget_count > 0 && (
     <span className="inline-flex items-center gap-0.5 text-purple-500" aria-label={`${email.golden_nugget_count} golden nuggets`}>
       <Gem className="h-3 w-3" />
       <span className="text-[10px] font-medium">{email.golden_nugget_count}</span>
     </span>
   )}
   ```
   - Position: next to the reply worthiness badge and action icon in the indicator row

### 1.2 — CategoryModal Gets the Same Treatment as Inbox

**Problem:** CategoryModal renders email items using a ModalEmailItem that delegates to EmailCard. The modal fetches fields via `MODAL_LIST_FIELDS` (in `src/components/discover/CategoryModal.tsx` ~line 61) which is missing several fields that inbox views now use.

**What to do:**

1. **Update `MODAL_LIST_FIELDS`** in `src/components/discover/CategoryModal.tsx`:
   - Add: `signal_strength, reply_worthiness, quick_action, additional_categories, email_type, urgency_score, relationship_signal, golden_nugget_count`
   - These should now all be denormalized columns after migrations 043 and 044

2. **The EmailCard component** (`src/components/categories/EmailCard.tsx`) already shows some of these fields. Verify that after you add the fields to MODAL_LIST_FIELDS, the data flows through properly. The ModalEmailItem wraps EmailCard, so as long as MODAL_LIST_FIELDS includes the fields, EmailCard should render them.

3. **Log the field additions**: Add a comment explaining why MODAL_LIST_FIELDS was expanded

### 1.3 — EmailPreviewModal: Add Analysis Summary Bar

**Problem:** EmailPreviewModal (`src/components/events/EmailPreviewModal.tsx`) is used from calendar/events to view the source email. It shows raw email content but zero analysis data. When a user taps "View source email" from a calendar event, they get the body but not *why* IdeaBox extracted an event from it.

**What to do:**

1. **Create a new component** `src/components/email/AnalysisSummaryBar.tsx`:
   - A compact horizontal bar showing: category badge, signal strength dot, quick action badge, reply worthiness badge
   - Props: `{ emailId: string; category?: string | null; signalStrength?: string | null; quickAction?: string | null; replyWorthiness?: string | null; }`
   - Renders as a flex row with gap-2, items centered, small text
   - Include a "View full analysis" link to `/inbox/{category}/{emailId}`
   - Full JSDoc + logger

2. **Integrate into EmailPreviewModal**:
   - The modal fetches from `/api/emails/[id]` — check if that API route already returns analysis fields (category, signal_strength, etc.)
   - If not, either expand the API response to include denormalized analysis fields, OR fetch them separately
   - Place the AnalysisSummaryBar above the email body, inside the modal content area
   - Import and render: `<AnalysisSummaryBar emailId={email.id} category={email.category} signalStrength={email.signal_strength} ... />`

3. **Keep it compact** — this is a preview modal, not the full detail view. Just enough to understand why the email was flagged.

### 1.5 — DailyReviewCard: Add Quick Action + Category

**Problem:** DailyReviewCard (`src/components/home/DailyReviewCard.tsx`) shows signal strength and reply worthiness but is missing `quick_action` badge and `category` — two pieces of context that help users decide what to do without clicking in.

**What to do:**

1. **Read the ReviewQueueItem interface** in `src/hooks/useReviewQueue.ts` — it already includes `quick_action` and `category` fields

2. **In `DailyReviewCard.tsx`**, find the review item rendering (around lines 189-251) and add:
   - **Category badge**: Small colored badge using `CATEGORY_BADGE_COLORS` and `CATEGORY_SHORT_LABELS` from `@/types/discovery` (same pattern as PriorityEmailList)
   - **Quick action icon**: Use the same `ACTION_ICONS` mapping as PriorityEmailList (MessageSquare for respond, Eye for review, Calendar for calendar, CornerUpRight for follow_up, Bookmark for save)
   - Position these after the existing signal/reply indicators

3. **Import** `CATEGORY_BADGE_COLORS`, `CATEGORY_SHORT_LABELS` from `@/types/discovery` and relevant Lucide icons

4. **Log**: `logger.debug('Rendering review item with category + quick_action', { emailId, category, quickAction })`

### 1.4 — Sidebar: Actionable Badges

**Problem:** Sidebar (`src/components/layout/Sidebar.tsx`) shows category counts but nothing about what *needs attention*. A user scanning the sidebar has no idea that 3 emails need replies or 2 deadlines are today.

**What to do:**

1. **Create a lightweight hook** `src/hooks/useSidebarBadges.ts`:
   ```typescript
   /**
    * useSidebarBadges — Fetches lightweight counts for sidebar action badges.
    *
    * Queries:
    * 1. Must-reply count: emails where reply_worthiness = 'must_reply' AND is_read = false
    * 2. Today's deadlines count: actions where deadline is today and status != 'completed'
    *
    * Refreshes every 5 minutes. Returns { mustReplyCount, todayDeadlineCount, isLoading }.
    */
   ```
   - Use `createClient()` from `@/lib/supabase/client`
   - Query 1: `supabase.from('emails').select('id', { count: 'exact', head: true }).eq('reply_worthiness', 'must_reply').eq('is_read', false)`
   - Query 2: `supabase.from('actions').select('id', { count: 'exact', head: true }).gte('deadline', todayStart).lte('deadline', todayEnd).neq('status', 'completed')`
   - Include `createLogger('useSidebarBadges')` with fetch start/success/error logs
   - Auto-refresh with `setInterval` every 5 minutes, clean up on unmount

2. **Update Sidebar.tsx**:
   - Import and use `useSidebarBadges()`
   - Add a small red badge next to "Inbox" nav item showing must-reply count (only when > 0)
   - Add a small amber badge next to "Calendar" nav item showing today's deadline count (only when > 0)
   - Badge style: small pill (text-[10px], px-1.5, rounded-full, font-medium)
   - The NavItem interface already supports badges — extend or use the existing `badge` pattern

### 1.7 — Calendar: Event Locality + Key Date Badges

**Problem:** The MultiEventDetector extracts `event_locality` (local / out_of_town / virtual) and `key_date_type` (registration_deadline, open_house, etc.) but the calendar view doesn't always surface these consistently.

**What to do:**

1. **Check `src/components/events/EventCard.tsx`** — it may already have some locality display. Verify and enhance:
   - Locality badge: green for local (Home icon), blue for virtual (Globe icon), orange for out-of-town (Plane icon)
   - Key date type badge: if `key_date_type` exists, show it as a subtle label (e.g., "Registration Deadline", "Open House")

2. **Check `src/components/calendar/CalendarStats.tsx`** and any calendar list views — add locality badges there too

3. **Check the event data flow**: Events come from the `events` table which has an `event_metadata` JSONB column. Verify that `event_locality` and `key_date_type` are stored there and passed through to components. If not, trace the data flow from MultiEventDetector → events table → calendar components and fix any gaps.

4. **Use consistent styling** — same badge pattern used in other components (Badge component from shadcn, same size/spacing)

### 1.6 — Contact Detail Page: Email Intelligence Summary

**Problem:** The `/contacts/[id]` detail page (`src/app/(auth)/contacts/[id]/page.tsx`) shows contact info + email history but no aggregated intelligence from the analyzers.

**What to do:**

1. **Create hook** `src/hooks/useContactIntelligence.ts`:
   ```typescript
   /**
    * useContactIntelligence — Aggregates analyzer intelligence for a specific contact.
    *
    * Fetches from email_analyses for emails associated with this contact to compute:
    * - Relationship signal trend (positive/neutral/negative from recent emails)
    * - Common topics (aggregated from email topics)
    * - Extracted dates (birthdays, deadlines, events from their emails)
    * - Communication stats (email frequency, avg response time)
    */
   ```
   - Accept `contactId: string` parameter
   - Query emails by `contact_id`, then aggregate:
     - `relationship_signal` distribution from recent 20 emails
     - `topics` aggregated (count occurrences, show top 5)
     - Dates from `date_extraction` in email_analyses
     - Communication frequency: count emails per month for last 6 months
   - Full logging with createLogger

2. **Create API route** `src/app/api/contacts/[id]/intelligence/route.ts`:
   - Server-side aggregation (more efficient than client-side)
   - Returns: `{ relationshipTrend, commonTopics, extractedDates, communicationStats }`
   - Zod validation on the contactId parameter
   - Full error handling + logging

3. **Add "Intelligence" section to contact detail page**:
   - Below the email history section
   - Cards showing: Relationship Trend (with color-coded signal), Common Topics (pill badges), Key Dates (list), Communication Pattern (simple stats)
   - Gracefully handle empty data (show "Not enough data" placeholder)

---

## Important Implementation Notes

### Conflict Prevention
- Always `git pull` before starting work
- Read files before editing — never modify blind
- Check for any pending changes with `git status` before committing

### Testing Your Changes
- After each migration, verify the SQL is syntactically correct
- After updating types, run `npx tsc --noEmit` to catch type errors
- After component changes, verify imports resolve correctly

### What NOT to Do
- Don't modify EmailDetail.tsx — it's already comprehensive
- Don't add Phase 2 features (hover cards, filter bar, etc.)
- Don't refactor existing working code unless it conflicts with your changes
- Don't add fields to `EMAIL_LIST_FIELDS` that don't have corresponding DB columns
- Don't create migrations in `supabase/migrations/` — this project uses `scripts/migration-*.sql`

### Implementation Order (Dependencies)
```
1. migration-043 (urgency_score + relationship_signal columns)  ← foundation
2. migration-044 (golden_nugget_count column)                   ← foundation
3. email-processor.ts updates (denormalize new fields)          ← depends on 1+2
4. database.ts type updates                                     ← depends on 1+2
5. useEmails.ts EMAIL_LIST_FIELDS expansion                     ← depends on 4
6. Component work (1.2, 1.3, 1.5, 1.8 gem badges)             ← depends on 5, parallel
7. useSidebarBadges.ts + Sidebar.tsx (1.4)                     ← independent
8. Calendar enhancements (1.7)                                  ← independent
9. Contact intelligence (1.6)                                   ← independent, most complex
```

Items 6-9 are independent and can be done in any order after 1-5.

### Commit Strategy
- Commit after each logical unit (migrations, processor updates, each component)
- Use descriptive commit messages: `feat(migration): add urgency_score + relationship_signal columns to emails table`
- Push when all Phase 1 items are complete

---

## Quick Reference: Key File Paths

| Purpose | Path |
|---------|------|
| Email processor (denormalization) | `src/services/processors/email-processor.ts` (~line 2586) |
| Database types | `src/types/database.ts` (~line 340) |
| Email list hook | `src/hooks/useEmails.ts` (~line 51) |
| Inbox email row | `src/components/inbox/InboxEmailRow.tsx` |
| Inbox email card | `src/components/inbox/InboxEmailCard.tsx` |
| Category email card | `src/components/categories/EmailCard.tsx` |
| Category modal | `src/components/discover/CategoryModal.tsx` |
| Email preview modal | `src/components/events/EmailPreviewModal.tsx` |
| Priority email list | `src/components/inbox/PriorityEmailList.tsx` |
| Daily review card | `src/components/home/DailyReviewCard.tsx` |
| Sidebar | `src/components/layout/Sidebar.tsx` |
| Calendar event card | `src/components/events/EventCard.tsx` |
| Calendar stats | `src/components/calendar/CalendarStats.tsx` |
| Contact detail page | `src/app/(auth)/contacts/[id]/page.tsx` |
| Review queue hook | `src/hooks/useReviewQueue.ts` |
| Email analysis hook | `src/hooks/useEmailAnalysis.ts` |
| Category constants | `src/types/discovery.ts` (CATEGORY_BADGE_COLORS, CATEGORY_SHORT_LABELS) |
| Logger utility | `src/lib/utils/logger.ts` |
| Migrations folder | `scripts/migration-*.sql` |
| Plan document | `.plan.md` |
| Audit document | `docs/UI_FIELD_AUDIT.md` |
