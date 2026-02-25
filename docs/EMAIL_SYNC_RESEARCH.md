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

1. **No watch renewal automation** — `renewExpiringWatches()` exists in code but nothing calls it. Need a `renew-watches` Edge Function on a 6-hour cron.
2. **Edge Functions not deployed** — `sync-emails` (and other functions) need manual deployment.
3. **Cron jobs not scheduled** — `cron.schedule()` SQL must be run in Supabase dashboard.
4. **GCP Pub/Sub not configured** — Topic, subscription, and IAM permissions needed.
5. **Environment variables** — `CRON_SECRET`, `INTERNAL_SERVICE_KEY`, `GOOGLE_CLOUD_PROJECT` must be set.
