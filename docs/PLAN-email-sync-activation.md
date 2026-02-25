# Plan: Activate Automated Email Sync (2 Phases)

## Phase 1: Scheduled Polling via pg_cron (the safety net)

Gets emails syncing automatically every 15 minutes with zero GCP dependency.

### Step 1: Migration 039 — Database objects for scheduled sync

Create `scripts/migration-039-scheduled-sync-and-watch-functions.sql`:

**A. `accounts_needing_sync` VIEW** — used by the sync-emails Edge Function to find accounts due for sync:
```sql
CREATE OR REPLACE VIEW accounts_needing_sync AS
SELECT
  ga.id AS account_id,
  ga.user_id,
  ga.email,
  EXTRACT(EPOCH FROM (NOW() - ga.last_sync_at)) / 60 AS minutes_since_sync
FROM gmail_accounts ga
WHERE ga.sync_enabled = true
  AND (ga.last_sync_at IS NULL OR ga.last_sync_at < NOW() - INTERVAL '15 minutes')
ORDER BY ga.last_sync_at ASC NULLS FIRST;
```

**B. Watch management RPC functions** — all 8 RPCs that `watch-service.ts` already calls but don't exist yet:
- `update_gmail_watch(p_account_id, p_history_id, p_expiration, p_resource_id)`
- `clear_gmail_watch(p_account_id)`
- `get_expiring_watches(p_hours_ahead)` — returns accounts with watches expiring within N hours
- `get_accounts_needing_watch()` — returns accounts with `push_enabled=true` but no active watch
- `record_watch_failure(p_account_id, p_error_message)` — increments failure count
- `reset_watch_failures(p_account_id)` — clears failure count after success
- `mark_watch_alert_sent(p_account_id)` — tracks alert delivery time
- `get_accounts_with_watch_problems(p_min_failures)` — finds accounts with repeated failures

**C. History management RPCs** — called by the webhook handler:
- `mark_history_stale(p_account_id)` — sets `needs_full_sync = true`
- `validate_history_id(p_account_id, p_history_id)` — updates validated timestamp

**D. Cleanup functions:**
- `cleanup_old_sync_runs(p_days_to_keep)` — prunes old `scheduled_sync_runs` rows
- `cleanup_old_push_logs(p_days_to_keep)` — prunes old `gmail_push_logs` rows

### Step 2: Update database types

Add all new RPC function signatures to `src/types/database.ts` in the `Functions` section, and add `accounts_needing_sync` to the `Views` section.

### Step 3: Verify Edge Function compatibility

Read through `supabase/functions/sync-emails/index.ts` and confirm it works correctly with the VIEW + current `/api/emails/sync` endpoint. Fix any mismatches, clean up comments, ensure logging is thorough.

### Step 4: Add deployment/setup docs

Add a "Deploying Scheduled Sync" section to `docs/EMAIL_SYNC_RESEARCH.md` with the exact Edge Function deploy commands and `cron.schedule()` SQL.

---

## Phase 2: Real-time Push via Gmail Pub/Sub

Gets emails arriving within seconds via push notifications.

### Step 5: Create `renew-watches` Edge Function

New file: `supabase/functions/renew-watches/index.ts`

A lightweight Edge Function (~100-150 lines) that:
1. Authenticates via `CRON_SECRET` (same pattern as `sync-emails`)
2. Calls the app's new `/api/gmail/watch/renew` endpoint
3. Logs results to `scheduled_sync_runs` with `trigger_source: 'watch_renewal'`
4. Designed to run every 6 hours via pg_cron

### Step 6: Create watch management API route

New file: `src/app/api/gmail/watch/route.ts`

- `POST /api/gmail/watch` — renew expiring watches + setup missing watches (called by Edge Function and manually)
  - Supports both user auth and `X-Service-Key` service auth
  - Calls `gmailWatchService.renewExpiringWatches()` + `gmailWatchService.setupMissingWatches()`
  - Returns structured results with per-account success/failure
  - Thorough logging via `createLogger('WatchManager')`

### Step 7: Clean up webhook handler logging

Review `src/app/api/webhooks/gmail/route.ts` — ensure logging is consistent, add any missing structured metadata, verify error paths log properly.

### Step 8: Update docs and deployment instructions

Update `docs/EMAIL_SYNC_RESEARCH.md` with:
- GCP Pub/Sub setup steps (topic, subscription, IAM)
- Watch renewal cron schedule SQL
- End-to-end verification steps

---

## Files Changed

| File | Action | Phase |
|------|--------|-------|
| `scripts/migration-039-scheduled-sync-and-watch-functions.sql` | **Create** | 1 |
| `src/types/database.ts` | Edit (add Functions + Views) | 1 |
| `supabase/functions/sync-emails/index.ts` | Review/cleanup | 1 |
| `docs/EMAIL_SYNC_RESEARCH.md` | Edit (add deployment docs) | 1+2 |
| `supabase/functions/renew-watches/index.ts` | **Create** | 2 |
| `src/app/api/gmail/watch/route.ts` | **Create** | 2 |
| `src/app/api/webhooks/gmail/route.ts` | Review/cleanup logging | 2 |

## What We're NOT Doing
- Client-side polling (nice-to-have, out of scope)
- Dedicated watch start/stop/status routes (unnecessary complexity — start happens at OAuth callback, stop at disconnect)
- GCP Pub/Sub provisioning (infrastructure config, not code)
