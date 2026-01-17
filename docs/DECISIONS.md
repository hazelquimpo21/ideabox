# IdeaBox - Architectural Decisions Log

> **Purpose:** Quick reference for all key architectural decisions made during planning.
> Each decision includes context, alternatives considered, and rationale.
>
> **Last Updated:** January 2026

---

## Quick Reference Table

| Area | Decision | Rationale |
|------|----------|-----------|
| AI Model | GPT-4.1-mini only | Best cost/capability ratio, ~$3-5/month |
| AI Fallback | None | Adds complexity without proportional benefit |
| Categories | Action-focused (7 types) | "client" removed; tracked via relationship |
| Background Jobs | Supabase pg_cron + Edge Functions | Already using Supabase; Vercel Cron too limited |
| Gmail Labels | Sync to Gmail | Users see categories in Gmail UI |
| Failed Analysis | Mark unanalyzable (no retry) | Clear audit trail, prevents wasted costs |
| Body Truncation | 16K characters | Balances comprehensiveness with cost |
| Timezone | Auto-detect from browser | Better UX than manual selection |
| Log Retention | 30-day cleanup | Prevents unbounded storage growth |
| OAuth | External app (testing mode) | Allows non-Workspace users |
| Cost Tracking | api_usage_logs table | Essential for budget monitoring |

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
Per email (3 analyzers):
  Input:  1,500 tokens × $0.15/1M = $0.000225
  Output: 300 tokens × $0.60/1M = $0.00018
  Total:  ~$0.0004 per email

Daily (250 emails): ~$0.10
Monthly: ~$3.00
```

---

### 2. Categories: Action-Focused Design

**Decision:** Single primary category per email, focused on "what action is needed."

**Categories:**
| Category | Description |
|----------|-------------|
| `action_required` | Needs response, decision, or action |
| `event` | Calendar-worthy with date/time/location |
| `newsletter` | Informational content, digests |
| `promo` | Marketing, promotional content |
| `admin` | Receipts, confirmations, automated |
| `personal` | Personal correspondence |
| `noise` | Low value, safe to ignore |

**Alternatives Considered:**
- "client" as a category (original design)
- Multiple categories per email

**Rationale:**
- "client" removed because it conflicts with action-tracking
- A client email asking for feedback should be "action_required", not hidden in "client"
- Client relationship tracked via `client_id` foreign key
- Allows filtering: "Show me action items from Client X"

**Schema Impact:**
```sql
-- emails table
category TEXT,           -- action_required, event, newsletter, etc.
client_id UUID,          -- relationship to clients table (NOT a category)
topics TEXT[],           -- extracted topics for additional context
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
- Allows searching in Gmail: `label:IdeaBox/action_required`
- Minimal additional API cost (one modify call per email)
- Can be disabled via `ENABLE_GMAIL_LABEL_SYNC=false`

**Labels Created:**
```
IdeaBox/action_required
IdeaBox/event
IdeaBox/newsletter
IdeaBox/promo
IdeaBox/admin
IdeaBox/personal
IdeaBox/noise
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
