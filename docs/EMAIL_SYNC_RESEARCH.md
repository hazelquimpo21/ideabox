# Email Sync Research: Cost, Performance & UX Analysis

> **Date:** February 2026
> **Context:** Emails are currently only fetched manually. This doc evaluates options for automated email delivery.

## Current State

The codebase has a **three-layer sync architecture** already implemented in code:

| Mechanism | Code Location | Status | Latency |
|-----------|--------------|--------|---------|
| Gmail Pub/Sub push (real-time) | `src/app/api/webhooks/gmail/route.ts`, `src/lib/gmail/watch-service.ts` | Code complete, **needs GCP Pub/Sub config** | ~2-10 seconds |
| pg_cron polling (every 15 min) | `supabase/functions/sync-emails/index.ts` | Code complete, **needs Edge Function deploy + cron schedule** | Up to 15 min |
| Manual sync (user-triggered) | `src/app/api/emails/sync/route.ts`, `SyncStatusBanner.tsx` | **Working** | Instant on click |

**The problem is activation, not implementation.** None of the automated mechanisms are deployed.

---

## Options Ranked

### Option 1: Activate pg_cron Polling (Easiest Win)

**What:** Deploy the existing `sync-emails` Edge Function and schedule it.

**Steps:**
1. `supabase functions deploy sync-emails --no-verify-jwt`
2. Run in Supabase SQL Editor:
   ```sql
   SELECT cron.schedule(
     'sync-emails',
     '*/15 * * * *',
     $$SELECT net.http_post(
       url := '<SUPABASE_URL>/functions/v1/sync-emails',
       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
     )$$
   );
   ```
3. Set `CRON_SECRET`, `APP_URL`, `INTERNAL_SERVICE_KEY` as Edge Function secrets

**Cost:** ~$0/month (within Supabase free tier)
**UX:** Emails arrive with up to 15 min delay
**Effort:** ~30 minutes of config, zero code changes

### Option 2: Activate Gmail Pub/Sub Push (Best UX)

**What:** Configure GCP Pub/Sub so Gmail pushes notifications to our existing webhook.

**Steps:**
1. Enable Pub/Sub API in Google Cloud Console
2. Create topic `gmail-notifications`
3. Grant `gmail-api-push@system.gserviceaccount.com` the Publisher role on the topic
4. Create push subscription → `https://<APP_URL>/api/webhooks/gmail`
5. Set `GOOGLE_CLOUD_PROJECT` env var
6. **Create a watch renewal Edge Function + cron** (watches expire every ~7 days)
   - `renewExpiringWatches()` method exists in `watch-service.ts` but has no Edge Function calling it
   - Needs a ~50-line Edge Function on a 6-hour cron

**Cost:** ~$0/month (GCP Pub/Sub free tier: 10GB/month, notifications are ~200 bytes)
**UX:** Near real-time (2-10 seconds)
**Effort:** ~1-2 hours (GCP config + watch renewal Edge Function)

**Gap identified:** No Edge Function exists for watch renewal. `watch-service.ts:renewExpiringWatches()` is implemented but nothing calls it on a schedule. Without this, push silently stops after ~7 days.

### Option 3: Client-Side Polling (Quick Hack)

**What:** `setInterval` in the frontend calling `/api/emails/sync` every N minutes.

**Cost:** $0 infrastructure, burns Gmail API quota
**UX:** Only works while tab is open — no emails waiting when user returns
**Effort:** ~15 minutes

**Not recommended** as a primary solution. Could serve as a belt-and-suspenders addition.

### Option 4: Vercel Cron (If Deployed on Vercel)

**What:** Use `vercel.json` cron instead of Supabase Edge Functions.

```json
{ "crons": [{ "path": "/api/emails/sync-all", "schedule": "*/15 * * * *" }] }
```

**Cost:** Free on Vercel hobby (2 cron jobs), unlimited on Pro
**UX:** Same as pg_cron (up to 15 min delay)
**Effort:** ~1 hour (new API route + vercel.json)

---

## Recommended Approach: Layered Activation

**Priority 1 — Turn on pg_cron polling (do now):**
Deploy `sync-emails` Edge Function + schedule cron. Immediate improvement from "nothing" to "15-minute sync" with zero code changes.

**Priority 2 — Turn on Pub/Sub push (do soon):**
Set up GCP Pub/Sub + create watch renewal Edge Function. Gets real-time delivery.

**Priority 3 — Client-side background poll (nice to have):**
Add a lightweight poll (every 5 min while tab is focused) as a fallback for missed push notifications.

---

## Cost Summary

| Component | 10 Users/month | 100 Users/month |
|-----------|---------------|-----------------|
| pg_cron Edge Function invocations | ~$0 | ~$0 |
| GCP Pub/Sub notifications | ~$0 | ~$0 |
| Gmail API calls | $0 (free) | $0 (free) |
| AI analysis (OpenAI) | ~$0.0006/email | ~$0.0006/email |
| **Total sync infrastructure** | **~$0** | **~$0** |

The only meaningful cost is OpenAI for AI analysis, which is already being paid. Sync infrastructure is essentially free at this scale.

---

## Identified Gaps (Action Items)

1. ~~**No watch renewal automation**~~ **DONE** — Created `supabase/functions/renew-watches/index.ts` Edge Function + `src/app/api/gmail/watch/route.ts` API route.
2. **Edge Functions not deployed** — `sync-emails` and `renew-watches` need manual deployment (see Deployment Guide below).
3. **Cron jobs not scheduled** — `cron.schedule()` SQL must be run in Supabase dashboard (see Deployment Guide below).
4. **GCP Pub/Sub not configured** — Topic, subscription, and IAM permissions needed (see Deployment Guide below).
5. **Environment variables** — `CRON_SECRET`, `INTERNAL_SERVICE_KEY`, `GOOGLE_CLOUD_PROJECT` must be set.
6. ~~**Missing database functions**~~ **DONE** — Created `scripts/migration-039-scheduled-sync-and-watch-functions.sql` with `accounts_needing_sync` VIEW, watch management RPCs, history RPCs, and cleanup functions.
7. ~~**No post-initial-sync backfill**~~ **DONE** — `sync-emails` Edge Function now detects accounts that completed initial sync but haven't had a background backfill, and fetches last 20 days or 1,000 emails (whichever is first) with full AI analysis.

---

## Deployment Guide

### Prerequisites

Generate two secure random tokens:
```bash
# For cron authentication
export CRON_SECRET=$(openssl rand -hex 32)
# For service-to-service auth
export INTERNAL_SERVICE_KEY=$(openssl rand -hex 32)
```

### Phase 1: Activate pg_cron Polling

**Step 1 — Run migration 039:**
```sql
-- Run in Supabase SQL Editor or via psql
-- See: scripts/migration-039-scheduled-sync-and-watch-functions.sql
```

**Step 2 — Set Edge Function secrets:**
```bash
supabase secrets set CRON_SECRET="$CRON_SECRET"
supabase secrets set APP_URL="https://your-app.vercel.app"
supabase secrets set INTERNAL_SERVICE_KEY="$INTERNAL_SERVICE_KEY"
```

**Step 3 — Deploy sync-emails Edge Function:**
```bash
supabase functions deploy sync-emails --no-verify-jwt
```

**Step 4 — Schedule cron job (run in SQL Editor):**
```sql
-- Email sync every 15 minutes
SELECT cron.schedule(
  'sync-emails-cron',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/sync-emails',
    headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{"trigger_source": "cron"}'::jsonb
  )$$
);

-- Cleanup old sync runs weekly (keep 30 days)
SELECT cron.schedule(
  'cleanup-sync-runs',
  '0 3 * * 0',
  $$SELECT cleanup_old_sync_runs(30)$$
);
```

**Step 5 — Set `INTERNAL_SERVICE_KEY` in your Next.js app environment** (Vercel dashboard or `.env.local`):
```
INTERNAL_SERVICE_KEY=<same value as Edge Function secret>
```

### Phase 2: Activate Gmail Pub/Sub Push

**Step 1 — GCP Pub/Sub setup:**
1. Enable Pub/Sub API in Google Cloud Console
2. Create topic `gmail-notifications` in your project
3. Grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic
4. Create a **push subscription** pointing to `https://<APP_URL>/api/webhooks/gmail`
5. Set the `GOOGLE_CLOUD_PROJECT` environment variable in your Next.js app

**Step 2 — Deploy renew-watches Edge Function:**
```bash
supabase functions deploy renew-watches --no-verify-jwt
```

**Step 3 — Schedule watch renewal cron (run in SQL Editor):**
```sql
-- Renew watches every 6 hours
SELECT cron.schedule(
  'renew-watches-cron',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/renew-watches',
    headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{"trigger_source": "cron"}'::jsonb
  )$$
);

-- Cleanup old push logs weekly (keep 14 days)
SELECT cron.schedule(
  'cleanup-push-logs',
  '0 4 * * 0',
  $$SELECT cleanup_old_push_logs(14)$$
);
```

### Verification

After deploying, verify everything works:

```bash
# Test sync-emails Edge Function manually
curl -X POST https://<PROJECT>.supabase.co/functions/v1/sync-emails \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"

# Test renew-watches Edge Function manually
curl -X POST https://<PROJECT>.supabase.co/functions/v1/renew-watches \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"

# Check cron jobs are running
SELECT * FROM cron.job;

# Check recent sync runs
SELECT id, status, accounts_processed, emails_created, duration_ms, started_at
FROM scheduled_sync_runs
ORDER BY started_at DESC
LIMIT 10;

# Check recent push logs
SELECT email_address, status, messages_synced, processing_time_ms, created_at
FROM gmail_push_logs
ORDER BY created_at DESC
LIMIT 10;
```
