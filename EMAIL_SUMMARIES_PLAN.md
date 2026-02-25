# Email Summaries — Implementation Plan

## Overview

Add an AI-synthesized email summary feature that gives users a narrative digest of what's happened in their inbox. Summaries are generated **on-demand when stale + new data exists**, with a 1-hour minimum interval. Displayed prominently on the Home page and browsable as history.

---

## On "Hourly" — The Smart Approach

**Not a fixed cron.** Summaries regenerate when ALL of these are true:
1. New emails have been synced since the last summary
2. At least 1 hour has passed since the last summary
3. The user visits the Home page (lazy) OR a post-sync trigger fires (eager)

This means:
- A user who gets 50 emails across 6 syncs/day → ~6 summaries/day
- A user who gets 3 emails in the morning → 1 summary/day
- A user with no new emails → 0 new summaries (shows last one)
- Cost: ~$0.0007 per summary × ~6/day = **$0.13/month** worst case

**Staleness check:** `GET /api/summaries/latest` returns the current summary + a `is_stale` boolean. The frontend hook calls `POST /api/summaries/generate` only when stale. The generate endpoint is idempotent — if another request already generated within the hour, it returns the existing one.

---

## User Stories

### Core (Phase 1-2)
1. **As a user, I want to see a synthesized narrative summary of my recent emails on my Home page** so I can understand what's happened without reading every email individually.
2. **As a user, I want the summary to update automatically when I have new emails** so it stays current throughout my workday without manual refresh.
3. **As a user, I want the summary organized by theme** (clients needing response, deadlines approaching, FYI items, news) so I can triage by importance.
4. **As a user, I want to see what specifically needs my action** vs. what's informational, so I know where to focus.

### Extended (Phase 3)
5. **As a user, I want to browse past summaries** so I can review what happened on previous days.
6. **As a user, I want the summary to be generated right after my emails sync** so it's ready when I open the app.

---

## Pages & Components

### Home Page (`/home`) — Enhanced
- **New Section**: `EmailSummaryCard` — placed between DailyBriefingHeader (Section A) and Top Priorities (Section B)
- Shows the latest summary narrative with themed sections
- "Last updated X minutes ago" timestamp
- Auto-regenerates in the background when stale
- Collapsible sections for each theme

### Summary History Page (`/summaries`) — New (Phase 3)
- Chronological list of past summaries
- Date picker to jump to a specific day
- Each summary expandable/collapsible
- Links back to source emails

---

## Architecture

```
Email Sync completes
    │
    ├── Sets `summary_stale = true` on user record (or dedicated flag)
    │
    ▼
User visits /home (or post-sync trigger fires)
    │
    ├── useSummary() hook calls GET /api/summaries/latest
    │   └── Returns { summary, is_stale, generated_at }
    │
    ├── If is_stale AND last_generated > 1 hour ago:
    │   └── Calls POST /api/summaries/generate (background)
    │       │
    │       ├── 1. QUERY (zero AI cost)
    │       │   ├── emails: since last summary, with ai_brief + category + signal_strength
    │       │   ├── actions: new/updated pending actions
    │       │   ├── extracted_dates: upcoming 7 days
    │       │   ├── email_ideas: new since last summary
    │       │   └── saved_news: new since last summary
    │       │
    │       ├── 2. CLUSTER (zero AI cost)
    │       │   ├── Group emails by thread_id (consolidate conversations)
    │       │   ├── Group by category (clients, work, finance, etc.)
    │       │   └── Separate: needs_action vs. informational
    │       │
    │       ├── 3. SYNTHESIZE (one AI call, ~$0.0007)
    │       │   ├── Input: clustered ai_briefs + action summaries + deadlines
    │       │   ├── Model: gpt-4.1-mini, temp 0.3, ~800 max tokens
    │       │   ├── Uses function calling for structured JSON output
    │       │   └── Output: SummaryResult (see schema below)
    │       │
    │       └── 4. PERSIST to email_summaries table
    │           └── Clear stale flag
    │
    └── useSummary() receives updated summary via refetch/poll
```

### AI Synthesis Output Schema

```typescript
interface SummaryResult {
  // Narrative opening — 1-2 sentences, conversational
  headline: string;

  // Themed sections (only present if there's content)
  sections: SummarySection[];

  // Quick stats
  stats: {
    new_emails: number;
    threads_active: number;
    actions_pending: number;
    deadlines_upcoming: number;
  };
}

interface SummarySection {
  // e.g. "Clients", "Deadlines", "FYI", "News"
  theme: string;
  icon: string; // lucide icon name
  // 2-5 bullet points, each referencing specific emails/threads
  items: SummaryItem[];
}

interface SummaryItem {
  text: string;           // The narrative bullet point
  email_ids: string[];    // Source emails for linking
  action_needed: boolean; // Does this need user action?
  urgency: 'high' | 'medium' | 'low';
}
```

---

## Database: `email_summaries` Table

```sql
-- Migration 038
CREATE TABLE email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Summary content (structured JSON)
  headline TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  stats JSONB NOT NULL DEFAULT '{}',

  -- Coverage window
  period_start TIMESTAMPTZ NOT NULL,  -- Oldest email included
  period_end TIMESTAMPTZ NOT NULL,    -- Newest email included
  emails_included INTEGER NOT NULL DEFAULT 0,
  threads_included INTEGER NOT NULL DEFAULT 0,

  -- AI metadata
  tokens_used INTEGER,
  estimated_cost NUMERIC(10,6),
  processing_time_ms INTEGER,
  model TEXT DEFAULT 'gpt-4.1-mini',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- For fast lookups
  CONSTRAINT email_summaries_user_id_idx UNIQUE (user_id, created_at)
);

-- Index for "latest summary" query
CREATE INDEX idx_email_summaries_user_latest
  ON email_summaries (user_id, created_at DESC);

-- Staleness tracking on users or a lightweight table
-- Option: Add last_summary_at and summary_stale columns to an existing user-settings table
-- Or use a simple key-value approach
CREATE TABLE user_summary_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_summary_at TIMESTAMPTZ,
  is_stale BOOLEAN NOT NULL DEFAULT true,
  emails_since_last INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Three-Phase Implementation Plan

### Phase 1: Foundation — Database + Service + API
> Goal: Summary generation works end-to-end, callable via API

#### Files to Create/Modify

| # | Action | File | Description |
|---|--------|------|-------------|
| 1 | CREATE | `scripts/migration-038-email-summaries.sql` | New tables: `email_summaries` + `user_summary_state` |
| 2 | MODIFY | `src/types/database.ts` | Add `EmailSummary`, `UserSummaryState` types |
| 3 | CREATE | `src/services/summary/summary-generator.ts` | Core service: query → cluster → synthesize → persist |
| 4 | CREATE | `src/services/summary/summary-prompt.ts` | System prompt + function schema for AI synthesis |
| 5 | CREATE | `src/services/summary/types.ts` | `SummaryResult`, `SummarySection`, `SummaryItem` types |
| 6 | CREATE | `src/app/api/summaries/latest/route.ts` | `GET` — Returns latest summary + staleness info |
| 7 | CREATE | `src/app/api/summaries/generate/route.ts` | `POST` — Generates new summary if stale + new data |
| 8 | MODIFY | `src/config/analyzers.ts` | Add summary generator config (model, temp, maxTokens) |

#### Detailed Steps

**1. Migration (`migration-038-email-summaries.sql`)**
- Create `email_summaries` table with headline, sections (JSONB), stats (JSONB), coverage window, AI metadata
- Create `user_summary_state` table for staleness tracking
- Add indexes for fast latest-summary lookup
- Idempotent (safe to re-run)

**2. Types (`src/types/database.ts`)**
- Add `EmailSummary` interface matching the table
- Add `UserSummaryState` interface
- Add `SummaryResult` / `SummarySection` / `SummaryItem` for the AI output

**3. Summary Generator Service (`summary-generator.ts`)**
- `generateSummary(userId: string): Promise<EmailSummary>`
- Step 1: Check staleness — return existing if not stale or < 1 hour old
- Step 2: Query DB for all inputs since last summary:
  - `emails` — WHERE date > last_summary_at, with `ai_brief`, `category`, `signal_strength`, `thread_id`, `subject`, `sender_name`
  - `actions` — new or updated pending actions
  - `extracted_dates` — upcoming 7 days, not acknowledged
  - `email_ideas` — status = 'new', since last summary
  - `saved_news` — since last summary
- Step 3: Cluster (in-memory, no AI):
  - Group emails by `thread_id` → pick latest `ai_brief` per thread, count messages
  - Group threads by `category`
  - Separate: `signal_strength` high/medium vs low
  - Separate: `reply_worthiness` must/should_reply vs informational
- Step 4: Build AI prompt with clustered data
- Step 5: Call `analyzeWithFunction<SummaryResult>()` using the existing OpenAI client
- Step 6: Persist to `email_summaries` table
- Step 7: Update `user_summary_state` (clear stale flag, reset counter)

**4. Summary Prompt (`summary-prompt.ts`)**
- System prompt: "You are composing a brief, conversational email digest for a busy professional..."
- Inject user context (name, VIP contacts, priorities) via `buildSystemPrompt` pattern
- User content: The clustered ai_briefs, actions, deadlines
- Function schema: `create_summary` with headline, sections[], stats{}
- Temperature: 0.3 (factual but readable)
- Max tokens: 800

**5. API Routes**
- `GET /api/summaries/latest` — Auth check → query latest summary for user → return with `is_stale` flag
- `POST /api/summaries/generate` — Auth check → call `generateSummary()` → return new summary
  - Idempotent: if summary < 1 hour old AND not stale, return existing
  - Race-safe: use `user_summary_state` as a soft lock

**6. Config**
- Add to `analyzerConfig`:
  ```
  summaryGenerator: { enabled: true, model: 'gpt-4.1-mini', temperature: 0.3, maxTokens: 800 }
  ```

---

### Phase 2: UI Integration — Home Page + Hook
> Goal: Users see summaries on their Home page with auto-refresh

#### Files to Create/Modify

| # | Action | File | Description |
|---|--------|------|-------------|
| 1 | CREATE | `src/hooks/useSummary.ts` | Hook: fetch latest, auto-regenerate if stale |
| 2 | CREATE | `src/components/home/EmailSummaryCard.tsx` | Summary display component with themed sections |
| 3 | CREATE | `src/components/home/SummarySection.tsx` | Individual themed section (collapsible) |
| 4 | MODIFY | `src/components/home/index.ts` | Export new components |
| 5 | MODIFY | `src/hooks/index.ts` | Export `useSummary` |
| 6 | MODIFY | `src/app/(auth)/home/page.tsx` | Add EmailSummaryCard between header and priorities |

#### Detailed Steps

**1. `useSummary` Hook**
```typescript
interface UseSummaryOptions {
  refreshInterval?: number;  // Poll interval for staleness check (default: 5 min)
  autoGenerate?: boolean;    // Auto-generate when stale (default: true)
}

interface UseSummaryReturn {
  summary: EmailSummary | null;
  isLoading: boolean;
  isGenerating: boolean;  // True while AI is synthesizing
  isStale: boolean;
  error: Error | null;
  regenerate: () => Promise<void>;  // Manual regenerate
}
```
- On mount: `GET /api/summaries/latest`
- If `is_stale` and `autoGenerate`: fire `POST /api/summaries/generate` in background
- Poll every `refreshInterval` ms for staleness
- Expose `isGenerating` state so UI can show "Updating summary..." indicator

**2. `EmailSummaryCard` Component**
- Card with headline as the title
- Stats bar: "12 new emails · 4 threads · 3 actions · 2 deadlines"
- Collapsible themed sections (Clients, Deadlines, FYI, News, etc.)
- Each bullet links to source email(s) via `email_ids`
- Action-needed items get a subtle highlight/badge
- "Updated 23 min ago" footer with manual refresh button
- Loading state: skeleton with pulsing lines
- Empty state: "No new emails since your last summary"
- Generating state: "Summarizing your latest emails..." with spinner

**3. Home Page Integration**
- Add `useSummary()` call alongside existing hooks
- Insert `<EmailSummaryCard>` between `<DailyBriefingHeader>` and Top Priorities section
- Pass summary data + loading/generating states

---

### Phase 3: Automation + History
> Goal: Summaries generate proactively after sync; browsable history

#### Files to Create/Modify

| # | Action | File | Description |
|---|--------|------|-------------|
| 1 | MODIFY | Email sync service (wherever sync completes) | Mark summary stale + increment counter after sync |
| 2 | CREATE | `src/services/jobs/summary-generation.ts` | Job: generate summaries for users with stale flag |
| 3 | CREATE | `src/app/api/summaries/history/route.ts` | `GET` — Paginated summary history |
| 4 | CREATE | `src/app/(auth)/summaries/page.tsx` | Summary history page |
| 5 | CREATE | `src/hooks/useSummaryHistory.ts` | Hook for paginated history |
| 6 | CREATE | `src/components/summaries/SummaryHistoryList.tsx` | History list component |

#### Detailed Steps

**1. Post-Sync Staleness Trigger**
- Find where email sync completes (likely in the sync service or Gmail webhook handler)
- After sync, if new emails were added:
  - `UPDATE user_summary_state SET is_stale = true, emails_since_last = emails_since_last + $newCount`
- This is a simple DB write, no AI cost

**2. Summary Generation Job (`summary-generation.ts`)**
- Follow the `priority-reassessment.ts` pattern
- `generateSummariesForStaleUsers()`: query all users where `is_stale = true AND last_summary_at < NOW() - INTERVAL '1 hour'`
- For each: call `generateSummary(userId)`
- Designed to be called via HTTP endpoint / Edge Function / external cron
- Optional: trigger immediately after sync for the specific user (eager mode)

**3. Summary History API**
- `GET /api/summaries/history?page=1&limit=10`
- Returns paginated list of past summaries, newest first
- Each summary includes headline, stats, created_at

**4. History Page (`/summaries`)**
- Date-grouped list of past summaries
- Click to expand full summary
- "Today", "Yesterday", then by date
- Each summary shows headline + stats + expandable sections
- Links to source emails within each bullet

**5. Navigation**
- Add "Summaries" to sidebar/nav (alongside Inbox, Tasks, Calendar, Contacts)
- "View history" link in EmailSummaryCard footer

---

## Key Design Decisions

### Why `ai_brief` is the perfect input
Migration 037 already added `ai_brief` to every email — a dense, structured summary format: `"IMPORTANCE | From WHO (relationship) | What about | Action | Context"`. This was explicitly designed for batch-summarization. We feed these to the summary AI instead of full email bodies, keeping input tokens tiny (~50 tokens per email vs ~2000).

### Why one AI call per summary
Thread clustering and category grouping happen in code (zero cost). The AI only does the final synthesis — turning structured bullet points into a readable narrative. This keeps costs at ~$0.0007 per summary.

### Why lazy generation (not fixed cron)
- Zero cost for inactive users
- No wasted summaries (only generate when there's new data AND it's been > 1 hour)
- Still feels instant — generation takes ~2-3 seconds, shown as "Updating..." state
- Phase 3 adds eager generation post-sync for users who want it ready before they look

### Thread consolidation
Emails with the same `thread_id` are collapsed into one item: "3-message thread: [latest ai_brief]". This prevents a 10-reply thread from dominating the summary.

### Section themes (AI-decided, not hardcoded)
The AI decides which sections to create based on content. Common themes:
- "Needs Your Response" (must_reply + should_reply)
- "Client Updates" (category = clients)
- "Upcoming Deadlines" (extracted_dates within 48h)
- "FYI / Newsletters" (informational, no action needed)
- "News" (saved_news items)

But the AI can create ad-hoc themes like "Travel Planning" or "Hiring" if multiple emails cluster around a topic. The function schema accepts an array of sections with flexible theme names.

---

## File Tree (New Files)

```
src/
├── services/
│   ├── summary/
│   │   ├── summary-generator.ts    ← Phase 1: Core generation logic
│   │   ├── summary-prompt.ts       ← Phase 1: AI prompt + schema
│   │   └── types.ts                ← Phase 1: TypeScript types
│   └── jobs/
│       └── summary-generation.ts   ← Phase 3: Batch job for stale users
├── hooks/
│   ├── useSummary.ts               ← Phase 2: Latest summary hook
│   └── useSummaryHistory.ts        ← Phase 3: History hook
├── components/
│   ├── home/
│   │   ├── EmailSummaryCard.tsx     ← Phase 2: Main summary card
│   │   └── SummarySection.tsx       ← Phase 2: Themed section
│   └── summaries/
│       └── SummaryHistoryList.tsx   ← Phase 3: History list
├── app/
│   ├── api/
│   │   └── summaries/
│   │       ├── latest/route.ts     ← Phase 1: GET latest
│   │       ├── generate/route.ts   ← Phase 1: POST generate
│   │       └── history/route.ts    ← Phase 3: GET history
│   └── (auth)/
│       └── summaries/
│           └── page.tsx            ← Phase 3: History page
└── scripts/
    └── migration-038-email-summaries.sql  ← Phase 1: DB tables
```

---

## Cost Estimate

| Scenario | Summaries/day | Cost/day | Cost/month |
|----------|--------------|----------|------------|
| Light user (10 emails/day) | 1-2 | $0.001 | $0.03 |
| Normal user (50 emails/day) | 3-5 | $0.003 | $0.10 |
| Heavy user (200 emails/day) | 6-10 | $0.007 | $0.21 |
| Power user (500 emails/day) | 10-15 | $0.011 | $0.33 |

All estimates assume GPT-4.1-mini at current pricing ($0.15/M input, $0.60/M output).
