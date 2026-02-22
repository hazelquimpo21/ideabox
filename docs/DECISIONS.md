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
| Failed Analysis | Mark unanalyzable (no retry) | Clear audit trail, prevents wasted costs |
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
| Back Navigation | `?from=` query param | Preserves originating tab on email detail back button |
| View All | Direct navigation | "View All" on category card goes to full page, not modal |
| Historical Sync | Metadata-only | Enrich contacts without full email download |
| Navigation | 5 items with tabs | 11→5 items, tabbed UIs for merged pages |
| Client Tracking | Merged into contacts | `is_client` flag + client columns on contacts table |

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

**Decision:** Single primary category per email, focused on "what part of life this email touches."

**Current Categories (12 life-buckets):**
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
category TEXT,           -- One of the 12 life-bucket categories
client_id UUID,          -- relationship to clients table (NOT a category)
topics TEXT[],           -- extracted topics for additional context

-- CHECK constraint enforces valid category values (updated Feb 2026)
CONSTRAINT emails_category_check CHECK (
  category IS NULL OR category IN (
    'clients', 'work', 'personal_friends_family', 'family',
    'finance', 'travel', 'shopping', 'local',
    'newsletters_creator', 'newsletters_industry',
    'news_politics', 'product_updates')
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

**Decision:** Add a separate content digest analyzer that extracts gist, key points, and links.

**Rationale:**
- Different from `summary` (which is action-focused); `gist` is content-focused
- Key points let users scan without reading
- Link extraction with context (article, registration, document)
- Denormalized `gist` and `key_points` to emails table for fast list views

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
