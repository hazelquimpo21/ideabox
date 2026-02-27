# IdeaBox - Architectural Decisions Log

> **Purpose:** Quick reference for all key architectural decisions made during planning.
> Each decision includes context, alternatives considered, and rationale.
>
> **Last Updated:** February 2026

---

## Quick Reference Table

| Area | Decision | Rationale |
|------|----------|-----------|
| AI Model | GPT-4.1-mini only | Best cost/capability ratio, ~$3-5/month |
| AI Fallback | None | Adds complexity without proportional benefit |
| Categories | Life-bucket focused (12 types) | Refactored Jan 2026 from action to life-bucket |
| Background Jobs | Supabase pg_cron + Edge Functions | Already using Supabase; Vercel Cron too limited |
| Gmail Labels | Sync to Gmail | Users see categories in Gmail UI |
| Failed Analysis | Mark unanalyzable; manual retry clears error | Auto-syncs skip failures; manual retry resets state |
| Body Truncation | 16K characters | Balances comprehensiveness with cost |
| Timezone | Auto-detect from browser | Better UX than manual selection |
| Log Retention | 30-day cleanup | Prevents unbounded storage growth |
| OAuth | External app (testing mode) | Allows non-Workspace users |
| Cost Tracking | api_usage_logs table | Essential for budget monitoring |
| Sender Classification | Pattern-based + AI | Distinguish direct humans from newsletters |
| Email Sending | Gmail API (not SendGrid) | Emails come from user's real address |
| Send Rate Limit | 400/day per user | Respects Gmail API limits |
| Content Digest | Separate analyzer | Gist + key points for non-reading triage |
| Signal Strength | In categorizer (not separate analyzer) | Avoids extra API call; high/medium/low/noise relevance |
| Reply Worthiness | In categorizer (not separate analyzer) | Avoids extra API call; must/should/optional/no reply |
| Noise Detection | Labels + signal_strength | Flexible labeling (5 noise types) + hard scoring (0.05x multiplier) |
| Multi-Action | Array in JSONB | One email can produce multiple to-do items |
| Archive Delete | Hard delete (Supabase) | Archived emails can be permanently deleted; soft-delete was a no-op |
| VIP Scoring | 12-signal weighted ranking | Works for fresh imports + established accounts |
| Contact Import | Batched upserts + parallel loading | Prevents timeout and UI flash during onboarding |
| Initial Sync | 100 emails, relaxed filters, batch checkpoints | More coverage, fewer missed emails, recoverable |
| Prompt Voice | Unified "Rose" persona across analyzers | Consistent feel, [Who]+[What]+[WHY] summaries |
| Back Navigation | `?from=` query param | Preserves originating tab on email detail back button |
| View All | Direct navigation | "View All" on category card goes to full page, not modal |
| Historical Sync | Metadata-only | Enrich contacts without full email download |
| Navigation | 5 items with tabs | 11→5 items, tabbed UIs for merged pages |
| Client Tracking | Merged into contacts | `is_client` flag + client columns on contacts table |
| Action Promotion | Dialog-based bridge to projects | User-controlled promote with project/type/date overrides |

---

## Detailed Decisions

### 1. AI Model: GPT-4.1-mini Only

**Decision:** Use GPT-4.1-mini exclusively for all AI analysis.

**Alternatives Considered:**
- GPT-4o-mini (similar pricing, smaller context)
- GPT-4o (10x more expensive)
- Claude fallback (adds complexity)

**Rationale:**
- GPT-4.1-mini: $0.15/M input, $0.60/M output = ~$3-5/month for 250 emails/day
- Optimized for "instruction following and tool calling" (our use case)
- 1M token context window (future-proof for long threads)
- Single model = simpler code, easier debugging

**Cost Analysis:**
```
Per email (9 analyzers):
  Input:  4,500 tokens × $0.15/1M = $0.000675
  Output: 900 tokens × $0.60/1M = $0.00054
  Total:  ~$0.0012 per email

Daily (250 emails): ~$0.30
Monthly: ~$9.00
```

---

### 2. Categories: Life-Bucket Design (REFACTORED Jan 2026)

**Decision:** Primary category per email, focused on "what part of life this email touches." Emails can also have up to 2 additional categories (Feb 2026).

**Current Categories (13 life-buckets):**
| Category | Description |
|----------|-------------|
| `clients` | Direct client correspondence, project work |
| `work` | Team, industry, professional (not direct clients) |
| `personal_friends_family` | Social, relationships, personal correspondence |
| `family` | School emails, kid activities, health, appointments, logistics |
| `finance` | Bills, banking, investments, receipts |
| `travel` | Flights, hotels, bookings, trip info |
| `shopping` | Orders, shipping, deals, retail |
| `local` | Community events, neighborhood, local orgs |
| `newsletters_creator` | Substacks, digests, curated content |
| `newsletters_industry` | Industry newsletters, professional digests |
| `news_politics` | News outlets, political updates |
| `product_updates` | Tech products, SaaS tools you use |
| `notifications` | Verification codes, OTPs, login alerts, password resets |

**Legacy Categories (DEPRECATED):**
| Old Category | Mapped To | Notes |
|--------------|-----------|-------|
| `action_required` | `clients` | Most action items are client/work related |
| `event` | `local` | Events detected via `has_event` label now |
| `newsletter` | `newsletters_creator` | Direct mapping |
| `promo` | `shopping` | Promotional emails are shopping-related |
| `admin` | `finance` | Admin emails often relate to accounts/billing |
| `personal` | `personal_friends_family` | Direct mapping |
| `noise` | `newsletters_industry` | Low-priority content treated as newsletter |
| `client_pipeline` | `clients` | Renamed for clarity |
| `business_work_general` | `work` | Renamed for clarity |
| `family_kids_school` | `family` | Merged into single family category |
| `family_health_appointments` | `family` | Merged into single family category |
| `newsletters_general` | `newsletters_creator` | Split into creator/industry |

**Migration:** See `supabase/migrations/028_category_cleanup_and_cache_clear.sql`

**Application Code:** See `src/types/discovery.ts` for `LEGACY_CATEGORY_MAP` and `normalizeCategory()` helper.

**Rationale:**
- Life-bucket categories better reflect how users think about their inbox
- "Where would I naturally look for this email?" vs "What action do I need to take?"
- Actions are tracked separately via the `actions` table and `has_event` label
- Client relationship still tracked via `client_id` foreign key
- Events detected via `has_event` label in categorization result

**Schema Impact:**
```sql
-- emails table
category TEXT,                    -- One of the 13 life-bucket categories (primary)
additional_categories TEXT[],     -- Up to 2 secondary categories (Feb 2026)
client_id UUID,                   -- relationship to clients table (NOT a category)
topics TEXT[],                    -- extracted topics for additional context

-- CHECK constraint enforces valid category values (updated Feb 2026)
CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'personal_friends_family', 'family',
    'finance', 'travel', 'shopping', 'local',
    'newsletters_creator', 'newsletters_industry',
    'news_politics', 'product_updates', 'notifications')
)
```

---

### 3. Background Jobs: Supabase pg_cron

**Decision:** Use Supabase pg_cron + Edge Functions for scheduled email sync.

**Alternatives Considered:**
- Vercel Cron (rejected: Hobby tier = 2 jobs, once/day only)
- BullMQ + Redis (adds infrastructure complexity)
- External cron service (another dependency)

**Rationale:**
- Already using Supabase for database
- pg_cron built into Supabase, no additional cost
- Can schedule down to every 10 seconds if needed
- Edge Functions for the actual sync logic

**Implementation:**
```sql
-- Enable pg_cron extension in Supabase dashboard
-- Then schedule the sync:
SELECT cron.schedule(
  'hourly-email-sync',
  '0 * * * *',  -- Every hour
  $$SELECT net.http_post(
    'https://your-project.supabase.co/functions/v1/email-sync',
    '{}',
    headers := '{"Authorization": "Bearer <service_role_key>"}'
  )$$
);
```

---

### 4. Failed Analysis: Mark Unanalyzable

**Decision:** When AI analysis fails, mark email as unanalyzable with reason. Do NOT retry on next sync.

**Alternatives Considered:**
- Retry on next hourly sync (wastes API costs on persistent failures)
- Queue for manual review (adds complexity)

**Rationale:**
- Provides clear audit trail (`analysis_error` column)
- Prevents wasted API costs on emails that consistently fail
- Still retries within same sync (3 attempts with backoff)
- Users can see which emails failed and why

**Schema Impact:**
```sql
-- emails table
analyzed_at TIMESTAMPTZ,    -- When analysis completed (even if failed)
analysis_error TEXT,        -- NULL if success, error message if failed
```

---

### 5. Body Truncation: 16K Characters

**Decision:** Truncate email body to 16,000 characters before sending to AI.

**Alternatives Considered:**
- 8K chars (might miss important content in long threads)
- 32K chars (higher cost, diminishing returns)
- Full body (expensive for newsletters)

**Rationale:**
- 16K chars ≈ 4,000 tokens ≈ $0.0006 per email
- Captures 99%+ of typical email content
- Long emails truncated intelligently (keep beginning + end)
- Configurable via `MAX_BODY_CHARS` env var

**Implementation:**
```typescript
function truncateBody(body: string, maxChars = 16000): string {
  if (body.length <= maxChars) return body;

  const halfLimit = Math.floor(maxChars / 2);
  return body.slice(0, halfLimit) +
         '\n\n[...truncated...]\n\n' +
         body.slice(-halfLimit);
}
```

---

### 6. Gmail Label Sync: Enabled

**Decision:** Sync IdeaBox categories back to Gmail as labels.

**Alternatives Considered:**
- Internal tracking only (simpler, but less visible)

**Rationale:**
- Users see categories in Gmail UI
- Allows searching in Gmail: `label:IdeaBox/clients`
- Minimal additional API cost (one modify call per email)
- Can be disabled via `ENABLE_GMAIL_LABEL_SYNC=false`

**Labels Created (updated Feb 2026 for life-bucket categories):**
```
IdeaBox/clients
IdeaBox/work
IdeaBox/personal_friends_family
IdeaBox/family
IdeaBox/finance
IdeaBox/travel
IdeaBox/shopping
IdeaBox/local
IdeaBox/newsletters_creator
IdeaBox/newsletters_industry
IdeaBox/news_politics
IdeaBox/product_updates
```

---

### 7. Timezone: Auto-Detect

**Decision:** Auto-detect timezone from browser on signup.

**Alternatives Considered:**
- Default to America/Chicago (less flexible)
- Manual selection (friction during onboarding)

**Rationale:**
- Better UX with zero friction
- Intl.DateTimeFormat().resolvedOptions().timeZone
- Stored in user_profiles.timezone
- Can be changed in settings

---

### 8. Log Retention: 30 Days

**Decision:** Automatically delete sync_logs and api_usage_logs older than 30 days.

**Alternatives Considered:**
- Keep forever (unbounded storage)
- 7 days (too short for debugging)
- 90 days (excessive for logs)

**Rationale:**
- 30 days sufficient for debugging recent issues
- Prevents unbounded storage growth
- Implemented via pg_cron daily cleanup function

**Implementation:**
```sql
-- Scheduled to run daily at 3am
CREATE OR REPLACE FUNCTION cleanup_old_logs() RETURNS void AS $$
BEGIN
  DELETE FROM sync_logs WHERE started_at < NOW() - INTERVAL '30 days';
  DELETE FROM api_usage_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

---

### 9. OAuth: External App (Testing Mode)

**Decision:** Configure Google OAuth as external app in testing mode.

**Alternatives Considered:**
- Internal app (Workspace only - too restrictive)
- External with verification (takes weeks)

**Rationale:**
- Testing mode allows up to 100 test users
- No Google verification required during development
- Can upgrade to verified when ready for public launch
- Allows non-Workspace Gmail accounts

---

### 10. Cost Tracking: api_usage_logs Table

**Decision:** Track all API calls in api_usage_logs table with cost estimates.

**Alternatives Considered:**
- External monitoring (OpenAI dashboard - less granular)
- No tracking (flying blind on costs)

**Rationale:**
- Essential for staying under $50/month budget
- Enables per-user cost attribution
- Helper functions for daily/monthly cost queries
- 30-day retention keeps table size manageable

**Schema:**
```sql
CREATE TABLE api_usage_logs (
  service TEXT NOT NULL,        -- 'openai', 'gmail'
  tokens_input INTEGER,
  tokens_output INTEGER,
  estimated_cost DECIMAL(10, 6),
  analyzer_name TEXT,           -- which analyzer made the call
  created_at TIMESTAMPTZ
);
```

---

### 11. Sender Type Classification (Jan 2026)

**Decision:** Classify contacts as `direct`, `broadcast`, `cold_outreach`, `opportunity`, or `unknown` using pattern-based detection + AI fallback.

**Rationale:**
- Helps prioritize emails (direct humans > newsletters > cold outreach)
- Pattern-based first pass is free (no AI cost)
- AI enrichment only for ambiguous contacts
- Stored on `contacts` table for reuse across all emails from that sender

---

### 12. Email Sending: Gmail API Direct (Jan 2026)

**Decision:** Send emails through Gmail API directly, not third-party services.

**Rationale:**
- Emails come from user's real Gmail address
- Appear in Gmail Sent folder automatically
- No SendGrid/Mailgun costs or deliverability issues
- Requires `gmail.send` scope (requested separately via upgrade flow)
- Rate limited to 400/day per user (respects Gmail quotas)

**Schema:** See migration 026 for `outbound_emails`, `email_templates`, `email_campaigns`, `daily_send_quotas` tables.

---

### 13. Content Digest Analyzer (Jan 2026)

**Decision:** Add a separate content digest analyzer that extracts gist, key points, links, golden nuggets, and email style ideas.

**Rationale:**
- Different from `summary` (which is action-focused); `gist` is content-focused
- Key points let users scan without reading
- Link extraction with context (article, registration, document)
- Golden nuggets capture deals, tips, quotes, stats worth remembering (Feb 2026)
- Email style ideas capture design/format ideas for solopreneurs (Feb 2026)
- Denormalized `gist` and `key_points` to emails table for fast list views
- Golden nuggets and email style ideas stay in `email_analyses.content_digest` JSONB (only loaded in detail view)

---

### 14. Historical Sync: Metadata-Only (Jan 2026)

**Decision:** Historical email sync fetches metadata only (sender, date, subject) without downloading full bodies.

**Rationale:**
- Enriches contact intelligence (email_count, first_seen_at, last_seen_at) without paying AI costs
- Much faster than full sync (no body download, no analysis)
- Contacts page shows accurate frequency data even for old emails

---

### 15. Navigation Redesign: 11 Items → 5 (Feb 2026)

**Decision:** Consolidate the sidebar from 11 top-level navigation items to 5 (Home, Inbox, Contacts, Calendar, Tasks), using tabbed UIs to absorb merged pages.

**Alternatives Considered:**
- Keep all 11 items (too cluttered for users)
- Use a hamburger menu with nested groups (hides features)
- Reduce to 3 items with deeper nesting (too much clicking)

**Rationale:**
- 11 items overwhelms the sidebar and makes navigation feel unfocused
- Many pages are closely related and benefit from being tabs under one parent (e.g., Actions + Campaigns + Templates → Tasks)
- Tabbed UIs preserve full functionality while reducing cognitive load
- URL-synced tabs (`?tab=`) maintain deep-linkability

**Impact:**
- 4-phase implementation: routing shell → page builds → contacts/tasks restructure → cleanup
- Old routes redirected via `next.config.mjs` (permanent redirects)
- Clients entity merged into Contacts table (`is_client` flag, migration 029)
- Legacy `client_id` columns dropped, `clients` table renamed to `clients_deprecated` (migration 030)
- Old page directories deleted, content extracted into reusable `*Content` components
- Hub priority scoring updated to read from contacts instead of legacy clients table

---

### 16. Clients Merged into Contacts (Feb 2026)

**Decision:** Merge the separate `clients` table into the `contacts` table using an `is_client` boolean flag plus client-specific columns (`client_status`, `client_priority`, `email_domains`, `keywords`).

**Alternatives Considered:**
- Keep clients as a separate entity (creates dual management burden)
- Use a generic `entity_type` column on contacts (too loose)

**Rationale:**
- Clients are just contacts with business context — no need for a separate table
- Unified view lets users see all people in one place and promote contacts to clients
- Simpler data model: one table with optional client fields vs. two tables with join logic
- Hub priority scoring simplifies to a single contacts query

**Impact:**
- Migration 029: Add 5 columns to contacts, migrate client data, add `contact_id` FK to emails/actions
- Migration 030: Drop `client_id` from emails/actions, rename `clients` → `clients_deprecated`
- `useContacts` hook extended with client filtering (`isClient`, `clientStatus`, `clientPriority`)
- `useClients` hook and `/api/clients/` routes deleted
- New "Promote to Client" dialog on contacts pages

---

### 17. Signal Strength, Reply Worthiness & Noise Detection (Feb 2026)

**Decision:** Add `signal_strength` (high/medium/low/noise) and `reply_worthiness` (must_reply/should_reply/optional_reply/no_reply) as new fields in the categorizer output, plus 5 noise detection labels.

**Alternatives Considered:**
- Separate analyzer for signal assessment (adds API cost per email)
- Binary important/not-important flag (too coarse)
- Rely solely on urgency_score from action extractor (misses read-only emails)

**Rationale:**
- Adding to the categorizer avoids an extra API call — signal and reply assessment use the same context as categorization
- Four-level signal strength enables nuanced filtering (noise=auto-archive, low=batch, medium=see, high=prioritize)
- Reply worthiness is orthogonal to signal — a high-signal email might not need a reply (e.g., order confirmation), while a medium-signal newsletter might be worth replying to (networking)
- Noise detection labels (sales_pitch, webinar_invite, fake_recognition, mass_outreach, promotional) enable specific noise-type filtering and analytics
- Denormalized to emails table for fast Hub queries without joining to email_analyses

**Impact:**
- Categorizer prompt overhauled with "protective assistant" framing and detailed noise pattern guidance
- Function schema expanded: 2 new required fields (signal_strength, reply_worthiness)
- Hub priority scoring applies multiplicative factors: signal (0.05x–1.8x) and reply (0.8x–1.6x)
- Action extractor prompt updated to reject noise emails as actions
- Migration 032: `signal_strength` and `reply_worthiness` columns on emails table with composite indexes
- `CategorizationData` type updated with new fields
- Categorizer maxTokens increased from 500 to 600

---

### 18. Smart VIP Suggestion Ranking: 12-Signal Weighted Scoring (Feb 2026)

**Decision:** Replace the simple database RPC (`get_vip_suggestions`) with a 12-signal weighted scoring system in the contact service for ranking VIP candidates during onboarding.

**Alternatives Considered:**
- Simple email count ranking (misses relationship quality)
- Google starred contacts only (not everyone stars contacts)
- AI-based ranking (expensive, unnecessary)

**Rationale:**
- Fresh Google imports have zero email_count and zero starred status, causing the simple RPC to return 0 results
- Weighted scoring uses multiple signals that are available even for freshly imported contacts (Google labels, last name match, same email domain)
- 12 independent signals combine to rank contacts more accurately than any single heuristic
- The scoring algorithm runs entirely in-memory on a capped set (200 contacts), so it's fast with no additional API calls

**Signals & Weights:**
| Signal | Points | Why |
|--------|--------|-----|
| Google starred | 50 | Strongest explicit user signal |
| Google labels: family/VIP | 40 | User categorized them |
| Same last name | 35 | Family members |
| Same email domain | 25 | Coworkers (skips generic domains) |
| High sent count (10+) | 25 | User initiates contact = important |
| High email frequency (20+) | 20 | Regular communication |
| Recency (<7 days) | 15 | Active relationship |
| AI relationship: family | 25 | Known family |
| Sender type: broadcast | -30 | Not a real person |
| Sender type: cold_outreach | -20 | Not a real person |
| Avatar present | 3 | Real person signal |

**Impact:**
- `GET /api/contacts/vip-suggestions` now uses scored fallback when RPC returns 0 results
- Returns suggestion reasons (top 2 signals) for display as badges
- Works correctly for both fresh imports and established accounts

---

### 19. Contact Import Batching & Parallel Loading (Feb 2026)

**Decision:** Batch Google contact imports into groups of 50 upserts, and load Mad Libs profile data in parallel with VIP data.

**Alternatives Considered:**
- Individual upserts (too many database round-trips)
- Single large upsert (risks timeout on 100+ contacts)
- Sequential data loading (causes UI flash when VIP data arrives late)

**Rationale:**
- Batching: 100 contacts = 2 batches instead of 100 individual calls; prevents timeout while keeping each batch manageable
- Parallel loading: `MadLibsProfileStep` fires `POST /api/onboarding/profile-suggestions` and `GET /api/user/context` simultaneously via `Promise.all()`, preventing VIP chips from flashing in after the card renders
- Both patterns improve perceived performance during onboarding without adding complexity

---

### 20. Initial Sync Refinement: More Emails, Relaxed Filters, Batch Checkpoints (Feb 2026)

**Decision:** Increase initial sync from 50 to 100 emails, relax aggressive sender pre-filters, increase timeout to 240s, and save checkpoints between batches.

**Alternatives Considered:**
- Keep 50 emails (misses too many important emails for active inboxes)
- Remove all pre-filtering (wastes AI tokens on obviously automated emails)
- Save checkpoint after every email (too many DB writes; per-batch is sufficient)

**Rationale:**
- **100 emails**: Users with active inboxes often have 50+ emails in the last few days. The pre-filter system skips ~20-30% without AI, so 100 fetched = ~70-80 analyzed.
- **Relaxed SKIP_SENDER_PATTERNS**: Removed `noreply@`, `notifications@`, `alerts@` from skip list — these senders often send important emails (shipping confirmations, payment receipts, appointment reminders) that should be AI-categorized. Only truly worthless system senders remain (`mailer-daemon@`, `postmaster@`, `bounce@`, `auto@`, `automated@`).
- **240s timeout**: With 100 emails and batch processing, the previous 120s was too tight.
- **Batch checkpoints**: After each batch of 10 completes, checkpoint data (processed count, tokens used, discovery counts) is saved to `user_profiles.sync_progress.checkpoint`. On resume, already-analyzed emails are skipped per-email.

**Impact:**
- `INITIAL_SYNC_CONFIG.maxEmails`: 50 → 100 (override via `INITIAL_SYNC_MAX_EMAILS` env var)
- `INITIAL_SYNC_CONFIG.timeoutMs`: 120000 → 240000
- `SKIP_SENDER_PATTERNS`: 11 patterns → 6 patterns
- `StoredSyncProgress`: Added optional `checkpoint` field
- `InitialSyncOrchestrator.analyzeEmails()`: Now calls `saveAnalysisCheckpoint()` after each batch

---

### 21. Allow Re-Analysis of Previously Failed Emails (Feb 2026)

**Decision:** Clear `analysis_error` and `analyzed_at` before retrying failed emails, enabling manual re-analysis at any time.

**Alternatives Considered:**
- Automatic retry on next sync (original approach — "mark as unanalyzable, do NOT retry")
- New `retry_count` column with cap (adds schema complexity)
- Manual-only retry with error state clearing (chosen — simple, user-controlled)

**Rationale:**
- The original "permanently skip" approach was too aggressive — AI failures can be transient (rate limits, timeouts, model glitches), and users had no way to recover.
- Clearing `analysis_error` and `analyzed_at` before re-processing ensures the email processor pipeline treats them as fresh unanalyzed emails.
- Both batch retry (`POST /api/emails/retry-analysis`) and single email retry (`POST /api/emails/[id]/analyze` with `x-force-reanalyze: true`) now properly reset error state.
- The existing "mark unanalyzable" behavior is preserved for *automatic* syncs — only *manual* retries clear the error.

**Impact:**
- `POST /api/emails/retry-analysis`: Now resets `analyzed_at` and `analysis_error` to null before processing, passes `skipAnalyzed: false`
- `POST /api/emails/[id]/analyze`: Now resets error state when `x-force-reanalyze: true` header is set
- No schema changes — uses existing columns

---

### 22. Unified "Right on Top of That, Rose!" Prompt Voice (Feb 2026)

**Decision:** Unify all analyzer prompt voices around a consistent "sharp personal assistant friend" persona across categorizer, content digest, idea spark, and insight extractor.

**Alternatives Considered:**
- Different personas per analyzer (confusing, inconsistent feel)
- Formal/professional tone (too corporate, doesn't match product personality)
- Minimal/terse tone (misses the "why" — user doesn't understand prioritization)

**Rationale:**
- Users should feel like they have ONE assistant who's already read everything and is briefing them. Not 11 different bots with different voices.
- The [Who] + [What] + [WHY] summary formula ensures every summary tells the user not just what the email says, but why they should care.
- Each analyzer has its own personality shade while staying in the same "voice family":
  - **Categorizer**: Sharp triage assistant — blunt about noise, punchy about importance
  - **ContentDigest**: Thorough briefer — extracts the juice, skips the filler
  - **IdeaSpark**: Creative friend — lateral thinker, "oh wait, this gave me an idea for you"
  - **InsightExtractor**: Learning partner — texts you the good parts from newsletters

### 23. Action → Project Item Promotion Bridge (Feb 2026)

**Decision:** Build a "promote" bridge from AI-extracted actions to the manual project management system via a PromoteActionDialog, rather than auto-promoting or creating a separate import flow.

**Alternatives Considered:**
- Auto-promote all actions into project items (too noisy — many actions are quick one-off tasks)
- Batch import screen (too heavy for a one-at-a-time workflow)
- Inline "convert" button that skips the dialog (doesn't let users choose project/type/adjust fields)

**Rationale:**
- The action system (AI-extracted to-dos) and project system (user-curated work) serve different purposes. Actions are ephemeral signals; project items are deliberate commitments.
- A dialog gives users control: pick the target project, override the item type (default "task"), adjust title/priority/due date, and optionally mark the source action as completed.
- The API already supports `source_action_id` enrichment on POST `/api/projects/[id]/items`, so the promote dialog simply passes the action ID through.
- The "mark action completed" checkbox cleanly closes the loop — once promoted, the original action can be retired.
- Promote button only appears on hover for non-completed actions, keeping the UI clean.

**Impact:**
- New components: PromoteActionDialog, integrated into ActionsContent
- ActionsContent gains `useProjects` + `useProjectItems` dependencies
- No database migration needed (source_action_id FK already exists)

---

## Decision Template (For Future Decisions)

When making new architectural decisions, document them here using this template:

```markdown
### N. [Decision Title]

**Decision:** [What was decided]

**Alternatives Considered:**
- [Option A]
- [Option B]

**Rationale:**
- [Why this choice was made]

**Impact:**
- [Changes required]
- [Migration notes if applicable]
```

---

## Change Log

| Date | Decision | Changed By |
|------|----------|------------|
| Jan 2026 | Initial decisions documented | Claude (planning session) |
| Jan 2026 | Sender classification, email sending, content digest, historical sync | Claude |
| Feb 2026 | Updated references, added missing decisions | Claude (audit) |
| Feb 2026 | Navigation redesign (11→5 items), clients merged into contacts | Claude (nav redesign) |
| Feb 2026 | Signal strength, reply worthiness, noise detection in categorizer | Claude (taxonomy refinement) |
| Feb 2026 | VIP suggestion scoring (12-signal), contact import batching, parallel onboarding loading | Claude (contact onboarding) |
| Feb 2026 | Initial sync refinement (100 emails, relaxed filters, batch checkpoints), re-analysis of failed emails, unified prompt voice | Claude (analyzer refinement) |
| Feb 2026 | Action→project item promotion bridge, project edit/delete, inline item editing, sort & filter, recurrence display | Claude (projects phase 3) |
