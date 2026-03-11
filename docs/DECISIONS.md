# IdeaBox - Architectural Decisions Log

> **Purpose:** Quick reference for all key architectural decisions made during planning.
> Each decision includes context, alternatives considered, and rationale.
>
> **Last Updated:** March 2026

---

## Quick Reference Table

| Area | Decision | Rationale |
|------|----------|-----------|
| AI Model | GPT-4.1-mini only | Best cost/capability ratio, ~$3-5/month |
| AI Fallback | None | Adds complexity without proportional benefit |
| Categories | Life-bucket focused (20 types — Taxonomy v2) | Expanded Mar 2026 from 13 to 20 categories; see Decision #31 |
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
| Inbox Tabs | 8→5 (consolidated Discoveries) | Insights/News/Links are all informational, not actionable |
| Ideas on Tasks | Moved Ideas from Inbox to Tasks | Ideas are "things you might do" — actionable, not informational |
| Email Traceability | Clickable links + gist preview | Users need to see and navigate to the email that spawned an item |
| Quick Accept | 2-step popover replaces 6-step dialog | Fitts's Law: minimize motor cost for most frequent triage action |
| Query Optimization | Field selection + Supabase joins | Eliminates second round-trip, reduces payload ~6 KB per hook |
| Event Weighting | 18-type taxonomy + 4-tier commitment + composite weight | Events need structured classification + ranking, not just flat date lists; see Decision #32 |
| Preference Learning | Count-aware EMA + batch fetch + fire-and-forget writes | Fast early convergence, no N+1 queries, non-blocking preference updates; see Decision #36 |
| View Redesign Phase 1 | Shared infra + Trifecta home layout | Tooltip, Card elevation, timeliness utility, animation utils — reused across all phases; see Decision #33 |
| View Redesign Phase 2 | Inbox polish: component extraction + timeliness rows | InboxFeed 682→264 lines, 7 extracted components, sparklines, hover actions; see Decision #34 |
| View Redesign Phase 3 | Calendar redesign: timeline + heat map + RSVP badges | Calendar page 1234→297 lines, 10 new components, unified CalendarItem type; see Decision #35 |

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

**Current Categories (Taxonomy v2 — 20 life-buckets, March 2026):**
| Group | Category | Description |
|-------|----------|-------------|
| Professional | `clients` | Direct client correspondence, project work |
| Professional | `work` | Team, industry, professional (not direct clients) |
| Professional | `job_search` | Applications, recruiters, interviews, offers |
| People | `personal` | Friends, social relationships, adult hobbies/clubs |
| People | `family` | Family relationships |
| People | `parenting` | Kids: school, childcare, pediatrician, extracurriculars |
| Life Admin | `health` | Medical, dental, prescriptions, insurance EOBs, vet |
| Life Admin | `finance` | Banking, investments, tax, financial planning |
| Life Admin | `billing` | Receipts, subscriptions, autopay, bills, payment failures |
| Lifestyle | `travel` | Flights, hotels, bookings, trip planning |
| Lifestyle | `shopping` | Orders, shipping, returns, tracking |
| Lifestyle | `deals` | Sales, discounts, coupons, limited-time offers |
| Community | `local` | Community, neighborhood, local businesses/events |
| Community | `civic` | Government, council, school board, HOA, voting |
| Community | `sports` | Fan sports: scores, fantasy leagues, team updates |
| Information | `news` | News outlets, current events, breaking news |
| Information | `politics` | Political news, campaigns, policy |
| Information | `newsletters` | Substacks, digests, curated content |
| Information | `product_updates` | Tech products, SaaS tools you use |
| System | `notifications` | Verification codes, OTPs, login alerts, password resets |

**Legacy Categories (DEPRECATED):**
| Old Category | Mapped To | Notes |
|--------------|-----------|-------|
| `action_required` | `clients` | Most action items are client/work related |
| `event` | `local` | Events detected via `has_event` label now |
| `newsletter` | `newsletters` | Direct mapping |
| `promo` | `shopping` | Promotional emails are shopping-related |
| `admin` | `finance` | Admin emails often relate to accounts/billing |
| `noise` | `newsletters` | Low-priority content treated as newsletter |
| `client_pipeline` | `clients` | Renamed for clarity |
| `business_work_general` | `work` | Renamed for clarity |
| `family_kids_school` | `family` | Merged into single family category |
| `family_health_appointments` | `family` | Merged into single family category |
| `newsletters_general` | `newsletters` | Originally split into creator/industry, now merged back |
| `personal_friends_family` | `personal` | Renamed in Taxonomy v2 (Mar 2026) |
| `newsletters_creator` | `newsletters` | Merged in Taxonomy v2 (Mar 2026) |
| `newsletters_industry` | `newsletters` | Merged in Taxonomy v2 (Mar 2026) |
| `news_politics` | `news` | Split into `news` + `politics` in Taxonomy v2 (Mar 2026) |

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
category TEXT,                    -- One of the 20 life-bucket categories (Taxonomy v2)
additional_categories TEXT[],     -- Up to 2 secondary categories (Feb 2026)
client_id UUID,                   -- relationship to clients table (NOT a category)
topics TEXT[],                    -- extracted topics for additional context
timeliness JSONB,                 -- {nature, relevant_date, late_after, expires, perishable} (Taxonomy v2)

-- CHECK constraint enforces valid category values (Taxonomy v2, Mar 2026)
CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'job_search',
    'personal', 'family', 'parenting',
    'health', 'finance', 'billing',
    'travel', 'shopping', 'deals',
    'local', 'civic', 'sports',
    'news', 'politics', 'newsletters', 'product_updates',
    'notifications')
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

**Labels Created (updated Mar 2026 for Taxonomy v2 — 20 categories):**
```
IdeaBox/clients
IdeaBox/work
IdeaBox/job_search
IdeaBox/personal
IdeaBox/family
IdeaBox/parenting
IdeaBox/health
IdeaBox/finance
IdeaBox/billing
IdeaBox/travel
IdeaBox/shopping
IdeaBox/deals
IdeaBox/local
IdeaBox/civic
IdeaBox/sports
IdeaBox/news
IdeaBox/politics
IdeaBox/newsletters
IdeaBox/product_updates
IdeaBox/notifications
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

### 24. Inbox Tab Consolidation: 8→5 Tabs (March 2026)

**Decision:** Reduce the Inbox from 8 tabs (Inbox, Priority, Categories, Ideas, Insights, News, Links, Archive) to 5 tabs (Inbox, Priority, Categories, Discoveries, Archive). Insights, News, and Links are consolidated into a single "Discoveries" tab with internal sub-tabs. Ideas are moved to the Tasks page.

**Alternatives Considered:**
- Keep all 8 tabs (too many — users face tab fatigue, cognitive overload)
- Collapse to 3 tabs with deep nesting (hides useful features)
- Use a sidebar filter instead of tabs (breaks the established UI pattern)

**Rationale:**
- Insights, News, and Links are all *informational* content — "things worth knowing." They share the same mental model: information extracted from emails. Consolidating them under "Discoveries" reduces tab count while preserving all functionality via internal sub-tabs.
- Ideas are *actionable* — "things you might do." They belong alongside tasks and projects on the Tasks page, not with informational feeds in the Inbox.
- 5 tabs is the sweet spot: clean enough to scan, comprehensive enough to find everything.
- Legacy URL redirects ensure old bookmarks and links still work (`?tab=ideas` → `/tasks?tab=ideas`, `?tab=insights` → `?tab=discoveries`, etc.).

**Impact:**
- New `DiscoveriesFeed` component with internal sub-tabs (insights/news/links)
- `InboxTabs` reduced from 8 to 5 `TabsTrigger` entries
- `TasksTabs` expanded from 5 to 6 tabs (added Ideas with `IdeasFeed`)
- `LEGACY_TAB_MAP` constant for backward-compatible redirects
- `IdeaSparksCard` "View all" link updated from `/inbox` to `/tasks?tab=ideas`

---

### 25. Email Traceability: Clickable Source Links + Gist Preview (March 2026)

**Decision:** Every item, task, or idea that originated from an email must show a clickable link back to the source email, enhanced with an AI gist preview for context.

**Alternatives Considered:**
- Plain text "From email" label (not actionable — users can't navigate back)
- Full email embed in the item detail (too heavy, duplicates content)
- Email ID reference only (meaningless to users)

**Rationale:**
- The connection between "email that triggered this" and "task I need to do" is critical for context. Users frequently need to re-read the original email to understand the full scope of a task.
- Clickable pill-style chips with Mail icon + subject line give users instant recognition and one-click navigation.
- The gist preview (one-line AI summary) provides enough context to decide whether to click through, reducing unnecessary navigation.
- The `?email=` deep-link pattern (already used by InboxTabs) opens the email in a modal, preserving the user's current context.

**Impact:**
- `IdeaSparksCard`: Email reference changed from plain `<p>` to clickable `<Link>` with Mail icon
- `ProjectItemRow`: Enhanced email provenance chip with `bg-muted/50` background + gist preview line
- `ProjectItemWithEmail` type: Added `source_email_gist` field
- `useProjectItems` hook: Enrichment query now fetches `gist` from emails table
- `EmailDetail`: New `EmailQuickActions` component for one-click task creation from emails

---

### 26. Quick Task Creation from Email Detail (March 2026)

**Decision:** Add an inline "Create Task" quick action bar directly in the email detail view, allowing users to create a task from an email with one click.

**Alternatives Considered:**
- Navigate to Tasks page and manually create (too many steps, context lost)
- Drag-and-drop email onto Tasks sidebar (complex, discoverability issue)
- Auto-create tasks for all emails with actions (too noisy)

**Rationale:**
- The email detail view is the moment of highest context — the user has just read the email and knows what action is needed. A one-click "Create Task" button captures that intent immediately.
- Pre-fills title from email subject, description from gist, and links via `email_id` so the provenance trail is preserved.
- Uses the existing `POST /api/actions` endpoint with inline `fetch()`, matching the established pattern used for saving nuggets and ideas.
- Shows a green checkmark success state to confirm the action was taken.

**Impact:**
- New `EmailQuickActions` sub-component in `EmailDetail.tsx`
- Placed between `EmailSubject` and `EmailBody` for prominence without interrupting reading flow
- No database migration needed — uses existing `actions` table

---

### 27. Tasks Page Triage-First Redesign: 6→4 Tabs (March 2026)

**Decision:** Restructure the Tasks page from 6 tabs (Projects, All Items, Inbox Tasks, Ideas, Campaigns, Templates) to 4 tabs (Triage, Board, Projects, Library) with Triage as the default tab. Triage promotes the TriageTray into a full-width unified inbox of actions + ideas. Board is a kanban-first fork of AllItemsContent. Library consolidates Campaigns + Templates behind sub-tabs.

**Alternatives Considered:**
- Keep 6 tabs, just reorder (still too many choices per Hick's Law)
- Merge everything into 3 tabs (too much crammed into each tab)
- Make Board the default (answers "what am I doing?" but not "what's new?")
- Delete AllItemsContent entirely (too aggressive, prevents rollback)

**Rationale:**
- **Hick's Law:** 6 tabs → 4 tabs reduces cognitive load on every visit. Daily-use tabs (Triage, Board) are separated from periodic-use (Projects, Library).
- **Eisenhower separation:** "Deciding what to do" (Triage) and "doing it" (Board) are different mental modes that deserve separate tabs.
- **Progressive commitment funnel:** Suggestions → Triage → Board → Done. Each stage has lower volume and higher commitment.
- **Performance split:** Triage tab loads ~42 KB (3 queries), Board loads ~75 KB (3 queries) vs. AllItemsContent loading ~143 KB (6-7 queries).
- **Backward compatibility:** `LEGACY_TAB_MAP` redirects all old URLs to new equivalents, preserving bookmarks.

**Impact:**
- 7 new files: `useTriageItems.ts`, `TriageContent.tsx`, `TriageActionCard.tsx`, `TriageIdeaCard.tsx`, `TriageEmptyState.tsx`, `BoardContent.tsx`, `LibraryContent.tsx`
- Modified: `TasksTabs.tsx` (6→4 tabs), `useSidebarBadges.ts` (+triageCount), `Sidebar.tsx` (+amber badge on Tasks)
- `AllItemsContent.tsx` and `TriageTray.tsx` kept as-is for rollback safety
- Phase 2 will add QuickAcceptPopover (2-step promote) and Board refinements
- Phase 3 will optimize queries and add snooze persistence

### 28. QuickAcceptPopover: 2-Step Promote (March 2026)

**Decision:** Replace the 6-step PromoteActionDialog as the primary accept path in triage with a lightweight 2-step popover (project + priority only). PromoteActionDialog kept as fallback via "More options..." link.

**Alternatives Considered:**
- Keep PromoteActionDialog as the only promote path — too many steps for a frequent action
- Inline accept (no project selection) — users need to categorize into projects at triage time
- Full redesign of PromoteActionDialog — unnecessary, the full dialog has its place for detailed editing

**Rationale:**
- **Fitts's Law:** Reducing motor cost from 6-7 interaction steps to 2 for the most frequent triage operation.
- **Context preservation:** Popover doesn't obscure the triage list, maintaining spatial context. Dialog is a modal that interrupts flow.
- **Progressive disclosure:** Quick popover for the 80% case, full dialog for the 20% that need title edits, description, due dates, etc.
- **MRU project default:** localStorage persistence of last-used project means repeat triage sessions need even fewer clicks.

**Impact:**
- New files: `popover.tsx` (lightweight UI primitive), `QuickAcceptPopover.tsx` (~150 lines)
- Modified: `TriageActionCard.tsx` + `TriageIdeaCard.tsx` (Accept button becomes popover trigger), `TriageContent.tsx` (new accept handlers for quick promote)
- `PromoteActionDialog.tsx` unchanged — still importable for "More options..." fallback
- Board enhancements: project color stripes on kanban cards, Done column auto-collapse (7-day threshold), quick-add "+" buttons on column headers

### 29. Query Optimization: Field Selection + Supabase Joins (March 2026)

**Decision:** Replace `select('*')` + second email enrichment query in `useActions` and `useProjectItems` with field-specific `select()` using Supabase PostgREST foreign key joins (e.g., `emails!email_id(subject, sender_name, sender_email)`). Smarter triage badge subtracts promoted actions. Snooze state persists to localStorage.

**Alternatives Considered:**
- Keep `select('*')` and optimize only the enrichment query — still over-fetches columns
- Add database views for pre-joined data — adds migration complexity
- Store snooze state in database — over-engineered for a temporary UI state

**Rationale:**
- **Payload reduction:** `select('*')` returns all columns (~6 KB extra per query). Field-specific select returns only what the UI needs.
- **Network round-trip elimination:** Each hook made 2 sequential queries (fetch + enrich). Supabase joins collapse this to 1 query.
- **Accurate triage badge:** Pending actions that have already been promoted to project_items were inflating the sidebar badge count.
- **Snooze durability:** Users expect snoozed items to stay snoozed after a page refresh. localStorage is the right persistence tier — no migration needed, auto-cleans expired entries.

**Impact:**
- Modified: `useActions.ts` (TRIAGE_LIST_FIELDS constant + join), `useProjectItems.ts` (BOARD_LIST_FIELDS constant + join), `useSidebarBadges.ts` (4th query for promoted count), `useTriageItems.ts` (localStorage hydration + persistence)
- `AllItemsContent.tsx` deprecated (JSDoc + removed from barrel export)
- No database migrations required
- No changes to hook return types — fully backward compatible

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

### 30. Idea Spark Refinement: Solopreneur Focus, 0-3 Ideas, Smarter Gating (March 2026)

**Decision:** Overhaul the Idea Spark analyzer to generate 0-3 ideas (was always 3), add solopreneur-oriented idea types, and skip emails that never produce good ideas.

**Alternatives Considered:**
- Keep always-3 with better prompt (still forces bad ideas on thin content)
- Add a pre-scoring step to decide if ideas are worth generating (extra API call cost)
- Remove idea generation entirely for non-newsletter emails (too aggressive, misses genuine opportunities from personal/client emails)

**Rationale:**
- **0-3 instead of always-3**: The single biggest quality improvement. A password reset doesn't need 3 ideas. Now the model can return 0 with a `skip_reason`. This eliminated ~80% of low-quality forced ideas.
- **Smarter gating**: Previously only skipped `signal_strength = 'noise'` (~30% of emails). Now also skips `low` signal, `automated`/`notification`/`transactional` email types, and `notifications` category. ~60% skip rate saves tokens and prevents dumb ideas on receipts, codes, and alerts.
- **Solopreneur framing**: The user builds things, ships products, creates content. Ideas oriented toward building, growing, learning, and living well — not generic brainstorming.
- **New idea types**: `tweet_draft` (actual draft text, not "write a tweet"), `learning` (concrete skill/course/concept), `tool_to_try` (specific tool mentioned), `place_to_visit` (nearby experience). Removed `social_post` (too vague), `hobby` (merged into learning), `shopping` (rarely useful).
- **Legacy type mapping**: Old types (`social_post`, `hobby`, `shopping`) mapped to new equivalents in the normalizer and UI. DB CHECK constraint accepts both old and new types.

**Impact:**
- `idea-spark.ts`: Complete rewrite — new prompt, 0-3 schema, `skip_reason` field, `LEGACY_TYPE_MAP`, confidence floor filter (drops <0.3)
- `email-processor.ts`: New gating logic — checks `emailType`, `category`, `signalStrength` (was only noise check)
- `types.ts`: `IDEA_TYPES` updated (11 types), `IdeaSparkData` gains `skipReason?` field
- `IdeaSparksCard.tsx` + `IdeasFeed.tsx`: New type badge configs with icons, legacy type fallbacks
- `EmailDetail.tsx`: Colored idea type badges (was plain text), fixed nugget type mapping
- Migration 043: Updated `email_ideas.idea_type` CHECK constraint for new types + legacy compat
- Cost reduction: ~$0.60/month (was ~$1.05/month) from smarter gating

---

### 31. Taxonomy v2: 20 Categories, Timeliness, Multi-Dimensional Scoring (March 2026)

**Decision:** Expand the category taxonomy from 13 to 20 life-bucket categories, add a structured `timeliness` JSONB column, simplify email types from 9 to 6, and introduce 5-dimension scoring with a composite `surface_priority`.

**Alternatives Considered:**
- Keep 13 categories and add sub-categories (adds query complexity without clearer separation)
- Use tags instead of categories for new concepts like health, parenting, billing (tags lack the routing/view semantics categories provide)
- Keep 9 email types (redundancy between transactional/notification/automated caused classifier confusion)

**Rationale:**
- **20 categories** solve real classification gaps: `parenting` vs `family` (kids' school emails are distinct from adult family), `health` (medical is not finance), `billing` (receipts are not investment statements), `deals` (sales promotions are not shopping orders), `civic` (government is not local community), `sports` (fan content is distinct from news), `job_search` (career emails are not generic work)
- **Timeliness object** (`{nature, relevant_date, late_after, expires, perishable}`) enables time-aware surfacing: auto-archive expired emails, escalate approaching deadlines, build smart views (today/upcoming/expiring/reading-list)
- **6 email types** reduce classifier confusion: `transactional` and `notification` were ambiguous (is a shipping confirmation transactional or notification?), both now map to `automated`; `promo` and `cold_outreach` both map to `marketing`
- **5 scoring dimensions** (`importance_score`, `urgency_score`, `action_score`, `cognitive_load`, `missability_score`) plus composite `surface_priority` enable nuanced priority sorting that accounts for both "how important?" and "how time-sensitive?" independently
- **Smart views API** (`/api/emails/smart-views?view=today|upcoming|expiring|reading-list|high-priority|needs-action`) surfaces emails by temporal relevance rather than just category

**Impact:**
- Migration 045: New CHECK constraint (20 categories), `timeliness` JSONB column, 5 scoring columns, `email_type` constraint updated, indexes on `surface_priority`, timeliness fields
- Category data migration: `personal_friends_family` -> `personal`, `newsletters_creator`/`newsletters_industry` -> `newsletters`, `news_politics` -> `news`
- Email type migration: `transactional`/`notification` -> `automated`, `promo`/`cold_outreach` -> `marketing`
- Categorizer prompt updated for 20 categories + timeliness extraction
- New `scoring-engine.ts` (pure computation, no AI calls)
- New `timeliness-actions.ts` cron job (auto-archive expired, escalate late, decay stale perishables)
- New UI components: `TimelinessIcon`, `EmailTypeIcon`, `ScoreBadge`
- Smart views API routes for temporal surfacing
- See `IMPLEMENTATION_STATUS.md` (Taxonomy v2 session) for implementation details

### 32. Event Suggestion Weighting: Taxonomy, Commitment, Composite Weight (March 2026)

**Decision:** Add structured event type taxonomy (18 types), commitment level inference (4 tiers), and composite weight scoring (6 signals) to the event detection pipeline.

**Alternatives Considered:**
- Use relevanceScore (0-10) alone for ranking (single score can't distinguish "confirmed dinner" from "interesting webinar" — both could score 7)
- Add user-facing priority slider per event (too much friction, users won't use it)
- Only filter by category (too coarse — "local" events include both farmers markets and city council meetings)
- Let the categorizer handle event classification (categorizer already outputs 20+ fields, adding event-specific taxonomy there would bloat the prompt and increase cost for all emails, not just events)

**Rationale:**
- **18 event types** solve the "all events look equal" problem. A team standup, a marketing webinar, and a pottery class are fundamentally different. Types enable filtering (show only social events), preference learning (user dismisses every webinar), and default weighting (meetings=0.9, webinars=0.25).
- **4 commitment tiers** capture "is the user going?" — the strongest signal for ranking. A confirmed booking should always appear above a newsletter FYI. AI infers from email signals (booking confirmation → confirmed, personal invite → invited, newsletter listing → fyi). User actions can upgrade/downgrade (save to calendar → calendar tier, dismiss → dismissed).
- **Composite weight (6 signals)** replaces flat date sorting within time groups. Components: base type weight (0.15), commitment boost (0.20), AI relevance score (0.25), sender weight (0.15), temporal urgency (0.10), behavior weight (0.15 — placeholder for Phase 4 preference learning). Sort order: commitment tier → compositeWeight → date.
- **Webinar scoring recalibrated** — previous prompt scored webinars too generously (locality=virtual +2, free +2, tangential interest +1 = score 5). Now: webinar type penalty -2, fyi commitment starts at 1-2 base. Marketing webinars properly score 0-2.

**Impact:**
- `types.ts`: New `EventType`, `CommitmentLevel` types with `EVENT_TYPE_WEIGHTS` and `COMMITMENT_BOOSTS` constants
- `event-detector.ts`: Updated prompt with taxonomy section, commitment inference rules, recalibrated scoring. New required output fields: `event_type`, `commitment_level`
- `multi-event-detector.ts`: Same additions, commitment defaults to `fyi` for newsletter events
- `services/events/composite-weight.ts`: New module — `computeCompositeWeight()` + `computeCompositeWeightBreakdown()` + `compareEvents()` sort comparator
- `api/events/route.ts`: Computes compositeWeight in `buildEventResponse()`, passes through eventType + commitmentLevel in EventMetadata
- `hooks/useEvents.ts`: Sorts within time groups by commitment tier → compositeWeight → date
- `components/events/EventCard.tsx`: New `EventTypeBadge` (18 colored badges), `CommitmentBadge` (Going/Invited/FYI), `whyAttend` text display
- Future (Phase 4): `user_event_preferences` table for behavior weight. Future (Phase 5): event type filters, "Teach Me" prompts

### 33. View Redesign Phase 1: Shared Infrastructure + Trifecta Home (March 2026)

**Decision:** Build reusable UI infrastructure (tooltip, card variants, timeliness utility, animations) and redesign the Home page into a "Trifecta" layout before touching Inbox or Calendar.

**Alternatives Considered:**
- Per-view ad-hoc styling (each phase creates its own helpers)
- Full design system overhaul (too large for scope)

**Rationale:**
- Shared utilities (tooltip, card elevation/accent, timeliness colors) are reused by Inbox and Calendar phases — building them first avoids duplication
- The Trifecta layout (NowCard, TodayCard, ThisWeekCard above fold + CollapsibleSections below) replaced a cluttered 10-widget page
- 6 components deleted (EmailSummaryCard, InsightsCard, NewsBriefCard, SavedLinksCard, StyleInspirationCard, SummaryItemCapture) — net -607 lines

**Implementation:** See `docs/prompts/PHASE_1_PROMPT.md` for full prompt. 28 files changed, 1565 insertions, 2172 deletions.

### 34. View Redesign Phase 2: Inbox Polish — Component Extraction + Timeliness Rows (March 2026)

**Decision:** Break the monolithic InboxFeed (682 lines) into composable pieces, add timeliness-driven visual language to email rows, and consolidate the Discoveries tab.

**Alternatives Considered:**
- Keep InboxFeed monolithic but add features inline (faster but unmaintainable)
- Full inbox rewrite from scratch (risky, breaks existing patterns)

**Rationale:**
- InboxFeed was the largest component in the app — extracting EmailList, InboxSearchBar, InboxEmptyState, EmailHoverActions, EmailRowIndicators, CategorySparkline, and DiscoveryItem made each piece testable and reusable
- Timeliness left borders (via `getTimelinessAccent()`) give instant visual scanning cues without adding badges
- Badge cascade (star + one contextual indicator, max 2 per row) reduced visual noise
- Hover action tray (Archive/Star/Snooze) moved actions off-screen until needed
- PriorityEmailList groups by reply_worthiness (must/should/optional) with CollapsibleSection — more actionable than flat score list
- Category sparklines (7-day inline SVG) give at-a-glance volume trends without a dedicated chart library
- DiscoveryItem unified 4 separate feed components (InsightsFeed, NewsFeed, LinksFeed, IdeasFeed) into one — legacy feeds kept for backward compat

**Implementation:**
- 15 Phase 2 inbox components created/refactored
- All files under 400 lines (largest: CategoryIcon at 394)
- React.memo on InboxEmailRow, InboxEmailCard, DiscoveryItem, PriorityRow
- useMemo for sparkline computation, priority grouping, filtering
- useCallback on all handlers passed as props
- See `docs/prompts/PHASE_2_PROMPT.md` for full prompt

### 35. View Redesign Phase 3: Calendar Redesign — Timeline + Heat Map + RSVP Badges (March 2026)

**Decision:** Break the monolithic Calendar page (1,234 lines) into a thin orchestrator with extracted timeline, grid, and action components. Introduce a unified `CalendarItem` type to merge both data sources, and add event type color/shape consistency across all views.

**Alternatives Considered:**
- Keep the page monolithic but add timeline features inline (unmaintainable at 1,234 lines)
- Create a separate timeline page instead of refactoring (fragments user experience)
- Use a third-party calendar library (unnecessary weight, limits customization)

**Rationale:**
- Calendar page was the second largest file in the codebase — extracting TimelineView, CalendarGrid, CalendarStats, EventActions, RsvpBadge, and type utilities made each piece focused and testable
- Unified `CalendarItem` type normalizes EventData (from useEvents) and ExtractedDate (from useExtractedDates) into one shape, eliminating parallel rendering paths
- Event type color map (§2b) uses circle shapes for general events and diamond shapes for deadlines/payments — visual distinction without reading labels
- Heat map intensity on calendar grid cells provides at-a-glance density awareness (4 levels)
- Birthday items get `confetti-pop` animation on first mount only (hasMounted ref guard)
- RSVP badges show 4 urgency tiers computed from deadline proximity
- Timeline groups items by time period (Overdue first with red strip) with vertical line + colored dots
- Inline expansion (no modals) for both timeline items and calendar day cells preserves spatial context

**Implementation:**
- 10 new components + 3 refactored, 14 files changed, 1729 insertions, 1179 deletions
- Calendar page: 1,234 → 297 lines
- React.memo on TimelineItem and CalendarDayCell (list items)
- useMemo for data grouping, heat map, stat calculations; useCallback on all handlers
- See `docs/prompts/PHASE_3_PROMPT.md` for full prompt

---

### Decision #36: View Redesign Phase 4 — Keyboard Shortcuts, Streak Gamification, Animations (March 2026)

**Context:** Final polish phase of the 4-phase view redesign. Phases 1-3 built the component infrastructure, inbox, and calendar. Phase 4 adds delight layer: keyboard navigation, entrance/exit animations, and streak gamification.

**Decision:**
- **Keyboard shortcuts:** Single `useKeyboardShortcuts` hook with one document-level `keydown` listener (not per-shortcut). Form elements suppressed. `?` key opens ShortcutsModal globally via `GlobalShortcuts` in root layout.
- **Navigation:** J/K in inbox (DOM-based via `data-email-row` attribute) and calendar (via `[id^="item-"]` selector). E/S for archive/star in inbox. N for top priority on home.
- **Streak:** Weekend-aware calculation (Mon-Fri only). 3-tier display: 3-6 days (🔥), 7-13 (🔥🔥), 14+ (🔥🔥🔥). Hidden below 3. Wrapped in `useMemo` for perf.
- **Animations:** Staggered entrance on EmailList/PriorityEmailList (capped at item 6, `hasMounted` ref guard). State transitions: `slide-out-right` (archive, 300ms), `star-spin` (star, 200ms), `slide-out-down` (calendar dismiss, 200ms). Exit animations complete before DOM removal via `setTimeout`.
- **ShortcutHint:** Reusable `<kbd>` component, desktop-only via `hidden md:inline-flex`. Applied to NowCard and EmailHoverActions.

**Alternatives considered:**
- Per-component keyboard listeners → rejected (multiple listeners, no central management)
- React context for keyboard state → rejected (too heavy for this use case, ref pattern is simpler)
- Streak counting weekends → rejected (unfair to users who don't work weekends)

**Status:** Implemented

---

### Decision #36: Preference Learning — Count-Aware EMA + Batch Fetch + Fire-and-Forget Writes

**Context:**
Phase 4 of event weighting adds personalized ranking based on user dismiss/maybe/save patterns.
Three key design decisions:

1. **EMA decay rate:** The original plan used fixed `0.9/0.1` decay, but this converges too slowly (~23 actions to reach -0.9). A count-aware approach `alpha = max(0.1, 1/(total_count+1))` gives early signals high impact (alpha=0.5 for first action) and stabilizes over time (alpha=0.1 after 10 actions).

2. **Preference reads:** Each event needs 3 preference lookups (event_type, sender_domain, category). With 100 events per page, that's 300 queries. Solution: batch-fetch ALL user preferences once per request (~50-100 rows) into an in-memory `PreferenceCache` Map, then do pure-computation lookups per event.

3. **Preference writes:** Updating preferences on every dismiss/save adds 2-3 DB operations. These should NOT block the user action response. Solution: fire-and-forget async side-effect after the state insert succeeds. Failures are logged but don't affect the user experience.

4. **Batch states endpoint:** The existing `useEvents` hook fetched states one-by-one (100 API calls for 100 events). New `GET /api/events/states?ids=...` endpoint returns all states in a single query.

**Decision:**
- Count-aware EMA for fast early convergence: `alpha = max(0.1, 1/(total_count+1))`
- Action weights: `saved_to_calendar=+1.0`, `maybe=+0.5`, `dismissed=-1.0`
- Behavior weight = event_type (50%) + sender_domain (30%) + category (20%), normalized from [-1,1] to [0,1]
- Preferences batch-fetched once per request via `fetchUserPreferences()`, passed as `PreferenceCache`
- Preference updates are fire-and-forget side-effects in `POST /api/events/[id]/state`
- `user_event_states` table includes `event_index` column for multi-event email support
- `user_event_preferences` table with RLS, composite unique constraint, auto-update trigger
- "Teach Me" prompts deferred to Phase 5

**Key files:**
- `src/services/events/preference-learning.ts` — EMA scoring, batch read, behavior weight calculation
- `src/services/events/composite-weight.ts` — `getBehaviorWeight()` now reads real preferences
- `src/app/api/events/[id]/state/route.ts` — fires preference update side-effect
- `src/app/api/events/states/route.ts` — batch states endpoint
- `supabase/migrations/migration-045-user-event-states.sql`
- `supabase/migrations/migration-046-user-event-preferences.sql`

**Status:** Implemented (steps 1-4). "Teach Me" prompts deferred.

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
| Mar 2026 | Inbox tab consolidation (8→5), Ideas moved to Tasks, email traceability, quick task creation from email, search in AllItemsContent | Claude (items & email UX) |
| Mar 2026 | QuickAcceptPopover (2-step promote), Board project color stripes, Done auto-collapse, column quick-add | Claude (tasks redesign phase 2) |
| Mar 2026 | Query optimization (field selection + Supabase joins), smarter triage badge, snooze persistence, AllItemsContent deprecation | Claude (tasks redesign phase 3) |
| Mar 2026 | Idea Spark refinement: solopreneur focus, 0-3 ideas, smarter gating, new types | Claude (idea spark overhaul) |
| Mar 2026 | Taxonomy v2: 20 categories, timeliness JSONB, 6 email types, 5-dimension scoring, smart views, timeliness cron | Claude (taxonomy v2) |
| Mar 2026 | Event suggestion weighting: 18-type taxonomy, 4-tier commitment, composite weight (6 signals), recalibrated relevance scoring | Claude (event weighting) |
| Mar 2026 | View Redesign Phase 1: Shared infra (tooltip, card, timeliness, animations) + Trifecta home layout | Claude (view redesign phase 1) |
| Mar 2026 | View Redesign Phase 2: Inbox polish — InboxFeed breakup (682→264 lines), 7 extracted components, timeliness rows, sparklines, hover actions | Claude (view redesign phase 2) |
| Mar 2026 | View Redesign Phase 3: Calendar redesign — timeline view, heat map grid, RSVP badges, birthday delight, calendar page 1234→297 lines | Claude (view redesign phase 3) |
| Mar 2026 | Phase 4 preference learning: count-aware EMA, batch states endpoint, fire-and-forget preference writes, behavior weight in composite scoring | Claude (preference learning) |
| Mar 2026 | Inbox Redesign v3: Split-panel layout (list+detail), 4 filter tabs + overflow, date grouping, keyboard shortcuts, retired modal + 5 tab bar | Claude (inbox split panel) |
