# Phase 2 Implementation Prompt: Smart Display Patterns + New Surfaces

> **STATUS: Phase 2 is NOT YET STARTED.**
> This is a session-specific prompt for a future development session.
> See `.plan.md` for the full plan and current Phase 2 item list.

## Context & Mission
You are working on **IdeaBox**, an AI-powered email intelligence system that runs 14 analyzers on every email. Phase 1 (complete) denormalized key fields, added gem badges, sidebar badges, analysis summary bars, and contact intelligence. Phase 2 introduces new UI paradigms: hover previews, smart filters, style inspiration, confidence affordances, and inline quick actions.

**Read these files first:**
- `.plan.md` — The 2-phase plan (Phase 1 is marked complete; you're implementing Phase 2)
- `docs/UI_FIELD_AUDIT.md` — Updated audit with Phase 1 changes and remaining recommendations
- `docs/CODING_STANDARDS.md` — Mandatory coding standards (400-line file limit, logging, JSDoc, etc.)

**Tech stack:** Next.js 14 App Router, TypeScript (strict), Supabase (PostgreSQL + RLS), Tailwind CSS, shadcn/ui, Lucide icons, OpenAI GPT-4.1-mini

**Branch:** Work on the current branch. Phase 1 changes are already merged.

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

### Comments
- JSDoc on all exported functions/components/interfaces
- Block comment headers (═══ style) to separate major sections within a file (match existing pattern)
- Explain **WHY** not **WHAT** in inline comments

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

### 2.2 — Smart Inbox Filter Bar
**Problem:** Users can't quickly filter the inbox by analyzer intelligence. "Show me only emails I need to reply to" requires mentally scanning every row.

**What to do:**

1. **Extend `useEmails` hook** (`src/hooks/useEmails.ts`):
   - The `UseEmailsOptions` interface (line ~76) already supports `category`, `quickAction`, `unreadOnly`, `starredOnly`. Add these new filter options:
     ```typescript
     /** Filter by reply worthiness */
     replyWorthiness?: 'must_reply' | 'should_reply' | null;
     /** Filter by signal strength */
     signalStrength?: 'high' | 'medium' | null;
     /** Only show emails with golden nuggets */
     hasNuggets?: boolean;
     /** Only show emails with events */
     hasEvents?: boolean;
     ```
   - Apply filters in the Supabase query section (around lines 330-365):
     - `replyWorthiness`: `.eq('reply_worthiness', value)`
     - `signalStrength`: `.eq('signal_strength', value)`
     - `hasNuggets`: `.gt('golden_nugget_count', 0)`
     - `hasEvents`: `.contains('labels', ['has_event'])`
   - Add filter counts to `EmailStats` (line ~161). The stats calculation section (lines 381-452) already computes `quickActionStats` and `categoryStats`. Add:
     - `mustReplyCount`: count of emails with `reply_worthiness = 'must_reply'`
     - `highSignalCount`: count of emails with `signal_strength = 'high'`
     - `nuggetCount`: count of emails with `golden_nugget_count > 0`
     - `eventCount`: already computed (line ~413)

2. **Create `InboxFilterBar` component** (`src/components/inbox/InboxFilterBar.tsx`):
   - A horizontal bar of toggle chips above the email list
   - Design:
     ```
     [All] [Must Reply (3)] [High Signal (7)] [Has Nuggets (2)] [Events (4)]
     ```
   - Each chip shows the count from `EmailStats` and toggles its filter
   - Multiple filters can be active simultaneously (AND logic)
   - Active chips use `bg-primary text-primary-foreground`, inactive use `bg-muted`
   - Props: `{ stats: EmailStats; activeFilters: Record<string, boolean>; onFilterToggle: (key: string) => void }`
   - Use URL search params (`useSearchParams`) to persist active filters across navigation
   - Keep it compact — single row, horizontally scrollable on mobile

3. **Integrate into InboxFeed** (`src/components/inbox/InboxFeed.tsx`):
   - The existing CategoryFilterBar is at line ~530. Place InboxFilterBar just above the email list (around line ~538), between the category filter and the two-column layout
   - Manage filter state with `useState` + sync to URL params
   - Pass filters through to the `useEmails` hook call (line ~116)
   - Log filter changes: `logger.debug('Filter toggled', { filter, active, stats })`

### 2.1 — Email Hover Card (Quick Intelligence Preview)
**Problem:** To see analysis detail, users must click into the email detail. For rapid triage, a quick hover preview is faster.

**What to do:**

1. **Install HoverCard from shadcn** — the project doesn't have it yet:
   ```bash
   npx shadcn@latest add hover-card
   ```
   This will create `src/components/ui/hover-card.tsx`. If the CLI doesn't work in this environment, manually create it using the shadcn hover-card source (Radix `@radix-ui/react-hover-card`).

2. **Create `EmailHoverCard` component** (`src/components/email/EmailHoverCard.tsx`):
   - Uses `useEmailAnalysis` hook (`src/hooks/useEmailAnalysis.ts`) for lazy-loaded data
   - Trigger: wrap the email subject/row in a HoverCard trigger
   - **Show on hover (300ms delay)** — only on desktop (check `window.matchMedia`)
   - Design (compact, ~250px wide):
     ```
     ┌────────────────────────────────────┐
     │ 🟢 High Signal · Must Reply · Work │
     │ ──────────────────────────────────│
     │ "Key client asking about Q2..."    │
     │ ──────────────────────────────────│
     │ 💎 2 nuggets · 📅 Mar 3 deadline  │
     │ 💡 1 idea spark · 🔗 3 links      │
     │ ──────────────────────────────────│
     │ ⚡ Reply  · 📌 Save  · 📂 Archive │
     └────────────────────────────────────┘
     ```
   - Data from `useEmailAnalysis`:
     - `analysis.contentDigest.goldenNuggets.length` for nugget count
     - `analysis.actionExtraction.actions` for deadlines
     - `analysis.ideaSparks.ideas.length` for idea count
     - `analysis.contentDigest.links.length` for link count
   - Quick action buttons: Reply (opens compose URL), Archive (calls email update API), Star (toggles star)
   - If analysis hasn't loaded yet, show a compact skeleton
   - Props: `{ email: Email; children: React.ReactNode }` (wraps the trigger element)

3. **Integrate into list views**:
   - `InboxEmailRow.tsx`: Wrap the subject line (around line ~356) with `<EmailHoverCard email={email}>`
   - `InboxEmailCard.tsx`: Wrap the subject line with `<EmailHoverCard email={email}>`
   - `PriorityEmailList.tsx`: Wrap the subject line with `<EmailHoverCard email={email}>`
   - Only render hover card on desktop — add a `useMediaQuery` check or conditional wrapper

### 2.3 — Email Style Ideas Feed (Home Card)
**Problem:** Email style ideas (layout, subject line, tone, CTA, storytelling) are extracted by ContentDigest but only visible in EmailDetail. For a solopreneur sending marketing emails, this is hidden gold.

**What to do:**

1. **Create API route** `src/app/api/style-ideas/route.ts`:
   - GET endpoint that queries `email_analyses` for recent `content_digest.emailStyleIdeas`
   - The data structure in email_analyses is:
     ```typescript
     emailStyleIdeas?: {
       idea: string;          // The design/format observation
       type: string;          // "tone", "layout", "visual_hierarchy", "cta", "subject_line", etc.
       whyItWorks: string;    // Explanation for solopreneurs
       confidence: number;    // 0-1
     }[]
     ```
   - Query: `supabase.from('email_analyses').select('email_id, analysis_data->content_digest->emailStyleIdeas, emails!inner(subject, sender_name, sender_email, date)').not('analysis_data->content_digest->emailStyleIdeas', 'is', null).order('created_at', { ascending: false }).limit(30)`
   - Flatten the arrays, sort by confidence, return top 20 unique ideas
   - Response: `{ ideas: { idea, type, whyItWorks, confidence, sourceEmail: { id, subject, senderName, date } }[] }`

2. **Create hook** `src/hooks/useEmailStyleIdeas.ts`:
   - Fetches from `/api/style-ideas`
   - Returns `{ ideas, isLoading, error }`
   - Type filter parameter: `type?: string`

3. **Create `StyleInspirationCard`** (`src/components/home/StyleInspirationCard.tsx`):
   - Same card pattern as `IdeaSparksCard` (card + header + scrollable list)
   - Each item shows: type badge (colored by type), the idea text, "why it works" as muted secondary text, source email reference
   - Type badges: layout=blue, tone=purple, subject_line=green, cta=orange, visual=pink, storytelling=amber
   - Show 5 items with "See all" link (could go to a future dedicated page)
   - Save/dismiss functionality using the same pattern as IdeaSparksCard

4. **Add to Home page** (`src/app/(auth)/home/page.tsx`):
   - Insert after the IdeaSparksCard + DailyReviewCard grid section (around line ~389)
   - Match the grid layout: `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`
   - Pair with another card (e.g., move SavedLinksCard into the same grid) or render full-width

### 2.6 — Confidence-Based Visual Affordances
**Problem:** AI confidence scores are available but hidden. Users can't tell when the AI is guessing vs. certain.

**What to do:**

1. **Create utility** `src/lib/utils/confidence.ts`:
   ```typescript
   /**
    * getConfidenceStyle — Returns CSS classes and optional prefix based on confidence score.
    *
    * Thresholds:
    * - score >= 0.9: "verified" — subtle checkmark, normal styling
    * - score >= 0.5: "normal" — default styling, no indicators
    * - score < 0.5: "uncertain" — faded/italic, "?" indicator
    *
    * @param score - Confidence score from 0 to 1
    * @returns { className, prefix, showIndicator, level }
    */
   export function getConfidenceStyle(score: number | null | undefined) { ... }
   ```
   - Return types:
     - `level: 'verified' | 'normal' | 'uncertain'`
     - `className: string` — e.g., `'opacity-60 italic'` for uncertain
     - `prefix: string | null` — `'Suggested: '` for uncertain categories, null otherwise
     - `showIndicator: boolean` — true for verified (checkmark) or uncertain (question mark)

2. **Apply to list view components**:
   - The challenge: confidence scores live in `email_analyses` JSONB, not on the denormalized emails table. Two approaches:
     - **Option A (Preferred):** Only apply confidence styling in contexts where analysis data is already loaded (EmailHoverCard, EmailDetail). Don't add it to list views since we don't have confidence in the select.
     - **Option B (Full):** Add a `categorization_confidence` field to the emails table (new migration). Denormalize during analysis. Then apply everywhere.
   - Start with **Option A** — apply in EmailHoverCard and EmailDetail only. If the user wants full coverage, implement Option B later.
   - In EmailHoverCard: Apply `getConfidenceStyle()` to the gist text and category badge
   - Render a small `?` (CircleHelp icon) next to low-confidence items, subtle checkmark (CheckCircle2) next to verified items

### 2.4 — Enhanced Browse Pages (Insights, News, Links)
**Problem:** Ideas, insights, news, and links each have Home page cards showing ~5 items, but no full-page browse with search/filter/sort.

**What to do:**

The feeds already exist and have type/topic filtering:
- `src/components/inbox/IdeasFeed.tsx` — 10 type filters
- `src/components/inbox/InsightsFeed.tsx` — 5 type filters
- `src/components/inbox/NewsFeed.tsx` — topic-based filtering

Enhance each with:

1. **Search bar**: Add a text input that filters items by keyword (searching `idea`/`insight`/`headline` + `topics` fields). Client-side filtering is fine since items are already loaded.

2. **Sort controls**: Add a sort dropdown next to the search bar:
   - "Newest" (default — by date)
   - "Highest Confidence" (by confidence score descending)
   - "By Topic" (alphabetical grouping)

3. **Pagination**: Currently these feeds show all items. Add pagination (20 items per page) using the existing `Pagination` component from `@/components/ui`.

4. **Create `LinksFeed` component** (`src/components/inbox/LinksFeed.tsx`):
   - New feed for browsing saved/analyzed links from the LinkAnalyzer
   - The data exists in `email_analyses.analysis_data.url_extraction` (or via the existing saved_links mechanism)
   - Check `src/components/home/SavedLinksCard.tsx` for the existing pattern
   - Add: search, filter by domain/category, sort by date/relevance, pagination

5. **Wire into Inbox tabs**: Check how the Inbox page manages tabs. The feeds may already be accessible via tabs — if not, add them. The tab system is likely in `src/app/(auth)/inbox/page.tsx` or `InboxFeed.tsx`.

### 2.7 — Action Quick-Complete from List View
**Problem:** Completing an email action requires 3+ clicks: open email → see action → open action → complete. Could be 1 click.

**What to do:**

1. **Create `QuickActionButtons`** (`src/components/email/QuickActionButtons.tsx`):
   - Small inline buttons that appear on hover over an inbox row
   - Only show for actionable emails: `urgency_score >= 7` OR `reply_worthiness = 'must_reply'`
   - Buttons:
     - **Reply** (`MessageSquare` icon): Opens Gmail compose URL in new tab (`https://mail.google.com/mail/?compose=new&to={email}&su=Re: {subject}`)
     - **Done** (`Check` icon): Marks the action as completed using `useActions.toggleComplete()`
     - **Archive** (`Archive` icon): Archives the email via PATCH `/api/emails/[id]` with `{ is_archived: true }`
   - Compact styling: `h-6 w-6` ghost buttons in a flex row, positioned to the right of the row
   - Include `aria-label` and `title` for accessibility
   - Prevent event propagation (`stopPropagation`) so clicks don't open the email

2. **Integrate into InboxEmailRow** (`src/components/inbox/InboxEmailRow.tsx`):
   - Add QuickActionButtons to the star button area (around line ~422), visible only on hover
   - The row already has `group` class for hover effects
   - Conditionally render based on urgency/reply criteria
   - Log: `logger.debug('Quick action triggered', { action, emailId })`

3. **Extend `useActions` hook** if needed:
   - `useActions` (line ~268) already has `toggleComplete(id)` which takes an action ID
   - You may need a `completeByEmailId(emailId)` method that finds the action for an email and completes it
   - Or fetch the action ID client-side from the email's associated actions

### 2.5 — Thread Intelligence Aggregation (Most Complex)
**Problem:** Emails in a thread are analyzed independently. A thread with 5 replies might have scattered action items, events, and evolving signals.

**What to do:**

1. **Create hook** `src/hooks/useThreadIntelligence.ts`:
   ```typescript
   /**
    * useThreadIntelligence — Aggregates analyzer outputs across a thread.
    *
    * Groups emails by thread_id and computes:
    * - Total action count across the thread
    * - Latest deadline (most recent deadline from any email in thread)
    * - Signal trend (how signal_strength changes over time)
    * - Relationship signal evolution
    * - Event count
    */
   export function useThreadIntelligence(threadId: string | null): ThreadIntelligence { ... }
   ```
   - Query: Fetch all emails with the same `thread_id`, ordered by date
   - Aggregate: count actions, find deadlines, track signal changes
   - Cache per thread_id to avoid re-fetching

2. **Create `ThreadIntelligenceBadge`** (`src/components/email/ThreadIntelligenceBadge.tsx`):
   - Small inline badge showing aggregated thread intelligence
   - Only renders for threads with > 1 email
   - Shows: thread email count, action count if > 0, latest deadline if within 7 days
   - Example: `"3 msgs · 2 actions · deadline Mar 3"`
   - Compact: `text-[10px]` with muted colors, positioned near the subject line

3. **Integrate into InboxEmailRow/Card**:
   - Check if `email.thread_id` exists and there are multiple emails in the thread
   - Render `ThreadIntelligenceBadge` below or next to the subject
   - Performance: Don't fetch thread data for every row. Instead, batch-fetch thread counts in `useEmails` and pass down, or only fetch on hover (reuse EmailHoverCard pattern)

---

## Implementation Order (Dependencies)

```
2.2  Smart inbox filter bar     ← foundation: extends useEmails, other items benefit from filters
2.6  Confidence utility         ← lightweight utility, used by hover card
2.1  Email hover card           ← uses confidence utility, lazy-loads analysis data
2.3  Email style ideas feed     ← independent: API + hook + card
2.4  Enhanced browse pages      ← independent: enhance existing feeds
2.7  Action quick-complete      ← depends on useActions, integrates into inbox row
2.5  Thread intelligence        ← most complex, least dependent, can be last
```

Items 2.3, 2.4, and 2.7 are independent of each other and can be done in any order after 2.2.

### Commit Strategy
- Commit after each logical unit (filter bar, hover card, each feed enhancement)
- Use descriptive commit messages: `feat(inbox): add smart filter bar with reply/signal/nugget filters`
- Push when all Phase 2 items are complete

---

## Important Implementation Notes

### Conflict Prevention
- Always `git pull` before starting work
- Read files before editing — never modify blind
- Check for any pending changes with `git status` before committing

### Testing Your Changes
- After updating types, run `npx tsc --noEmit` to catch type errors (note: ~7600 pre-existing errors from `@ts-nocheck` files — focus on errors in YOUR files only)
- After component changes, verify imports resolve correctly

### What NOT to Do
- Don't modify EmailDetail.tsx — it's already comprehensive
- Don't refactor existing working code unless it conflicts with your changes
- Don't add fields to `EMAIL_LIST_FIELDS` that don't have corresponding DB columns (learn from Phase 1)
- Don't create migrations in `supabase/migrations/` — this project uses `scripts/migration-*.sql`
- Don't over-engineer the hover card — keep it to one file, < 400 lines
- Don't add mobile hover support — hover cards are desktop-only (use media query guard)

### Performance Considerations
- **Hover card**: Use 300ms debounce before loading analysis data. Cancel on mouse-leave.
- **Filter bar**: Filter counts should come from the same query that fetches emails (avoid N+1)
- **Thread intelligence**: Don't fetch thread data for every row. Batch or lazy-load.
- **Browse page pagination**: Server-side via Supabase `.range()`, not client-side slicing

---

## Quick Reference: Key File Paths

| Purpose | Path |
|---------|------|
| Email list hook (filters) | `src/hooks/useEmails.ts` (~line 76 options, ~330 query filters) |
| Inbox feed | `src/components/inbox/InboxFeed.tsx` (~line 530 filter area) |
| Inbox email row | `src/components/inbox/InboxEmailRow.tsx` |
| Inbox email card | `src/components/inbox/InboxEmailCard.tsx` |
| Priority email list | `src/components/inbox/PriorityEmailList.tsx` |
| Email analysis hook | `src/hooks/useEmailAnalysis.ts` (lazy-loadable) |
| Actions hook | `src/hooks/useActions.ts` (~line 268 toggleComplete) |
| Ideas feed | `src/components/inbox/IdeasFeed.tsx` |
| Insights feed | `src/components/inbox/InsightsFeed.tsx` |
| News feed | `src/components/inbox/NewsFeed.tsx` |
| Saved links card | `src/components/home/SavedLinksCard.tsx` |
| Home page | `src/app/(auth)/home/page.tsx` (~line 370 card grid) |
| Style ideas data | `email_analyses.analysis_data.content_digest.emailStyleIdeas` |
| UI components | `src/components/ui/` (no HoverCard yet — add it) |
| Logger utility | `src/lib/utils/logger.ts` |
| Category constants | `src/types/discovery.ts` |
| Database types | `src/types/database.ts` |
| Plan document | `.plan.md` |
| Audit document | `docs/UI_FIELD_AUDIT.md` |
| Coding standards | `docs/CODING_STANDARDS.md` |
