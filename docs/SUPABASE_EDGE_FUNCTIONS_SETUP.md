# Supabase Edge Functions Setup Guide

This guide explains how to deploy and configure the scheduled email sync using Supabase Edge Functions and pg_cron.

## Overview

The email sync system uses two mechanisms:
1. **Push Notifications** - Real-time sync via Gmail Pub/Sub (instant)
2. **Scheduled Polling** - Background sync every 15 minutes (fallback)

The scheduled sync catches any emails missed by push notifications and handles accounts with stale history IDs.

## Prerequisites

1. Supabase project with Edge Functions enabled
2. Supabase CLI installed (`npm install -g supabase`)
3. pg_cron extension enabled (Pro plan or higher, or self-hosted)

## Step 1: Environment Variables

Add these to your `.env.local`:

```bash
# Required for Edge Function
INTERNAL_SERVICE_KEY=your-random-secret-key-for-service-calls
CRON_SECRET=your-random-secret-for-cron-authentication

# Your app's public URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Generate secure random keys:
```bash
# Generate INTERNAL_SERVICE_KEY
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -base64 32
```

## Step 2: Deploy the Edge Function

```bash
# Login to Supabase
supabase login

# Link your project (get project ref from dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the sync-emails function
supabase functions deploy sync-emails --no-verify-jwt
```

## Step 3: Configure Edge Function Secrets

In Supabase Dashboard > Settings > Edge Functions, add these secrets:

| Secret Name | Value |
|-------------|-------|
| `CRON_SECRET` | Same as your `.env.local` CRON_SECRET |
| `APP_URL` | Your app's public URL (e.g., `https://ideabox.vercel.app`) |
| `INTERNAL_SERVICE_KEY` | Same as your `.env.local` INTERNAL_SERVICE_KEY |

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided.

## Step 4: Set Up pg_cron (Scheduled Sync)

In Supabase Dashboard > SQL Editor, run:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule sync every 15 minutes
SELECT cron.schedule(
  'email-sync-job',           -- Job name
  '*/15 * * * *',             -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_CRON_SECRET` with your actual CRON_SECRET

## Step 5: Test the Edge Function

```bash
# Test manually
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "status": "completed",
  "accountsProcessed": 0,
  "accountsSucceeded": 0,
  "accountsFailed": 0,
  "emailsCreated": 0,
  "emailsAnalyzed": 0,
  "durationMs": 150
}
```

## Step 6: Verify the Cron Job

Check if cron jobs are scheduled:

```sql
SELECT * FROM cron.job;
```

View job run history:

```sql
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

## Monitoring

### Check Sync Run History

```sql
-- Recent sync runs
SELECT * FROM scheduled_sync_runs
ORDER BY started_at DESC
LIMIT 20;

-- Failed syncs
SELECT * FROM scheduled_sync_runs
WHERE status = 'failed'
ORDER BY started_at DESC;

-- Sync statistics
SELECT * FROM get_sync_statistics(24); -- Last 24 hours
```

### Check Account Health

```sql
-- View all account health status
SELECT * FROM gmail_accounts_health;

-- Accounts with problems
SELECT * FROM gmail_accounts_health
WHERE health_status != 'healthy';
```

### Check Push Notification Logs

```sql
-- Recent push notifications
SELECT * FROM gmail_push_logs
ORDER BY received_at DESC
LIMIT 20;

-- Failed push notifications
SELECT * FROM gmail_push_logs
WHERE status = 'failed'
ORDER BY received_at DESC;
```

## Troubleshooting

### Cron Job Not Running

1. Check if pg_cron extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check if pg_net extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

3. Verify the job exists:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'email-sync-job';
   ```

### Edge Function Errors

1. Check Edge Function logs in Supabase Dashboard > Edge Functions > sync-emails > Logs

2. Common issues:
   - Missing secrets (APP_URL, INTERNAL_SERVICE_KEY)
   - Invalid CRON_SECRET
   - Network errors reaching your app

### Sync Not Working

1. Check if accounts need syncing:
   ```sql
   SELECT * FROM accounts_needing_sync;
   ```

2. Check for locked accounts:
   ```sql
   SELECT * FROM gmail_accounts WHERE sync_lock_until > NOW();
   ```

3. Check for accounts needing full sync:
   ```sql
   SELECT * FROM gmail_accounts WHERE needs_full_sync = TRUE;
   ```

## Maintenance

### Cleanup Old Records

The migration includes cleanup functions. Schedule them:

```sql
-- Clean up old sync runs (keep 7 days)
SELECT cron.schedule(
  'cleanup-sync-runs',
  '0 3 * * *',  -- Daily at 3 AM
  $$SELECT cleanup_old_sync_runs(7);$$
);

-- Clean up old push logs (keep 7 days)
SELECT cron.schedule(
  'cleanup-push-logs',
  '0 3 * * *',  -- Daily at 3 AM
  $$SELECT cleanup_old_push_logs(7);$$
);
```

### Manually Trigger Sync

For a specific account:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "uuid-of-account", "force": true}'
```

For all accounts (force):
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

## Security Notes

1. **CRON_SECRET** should be kept secure - it allows triggering syncs
2. **INTERNAL_SERVICE_KEY** is used for service-to-service auth between Edge Function and your app
3. Edge Function runs with service role - has full database access
4. The `/api/emails/sync` endpoint validates the service key before processing

## Cost Considerations

- Edge Functions: Billed by invocations and compute time
- pg_cron + pg_net: Included with Supabase Pro plan
- Estimated: ~2880 invocations/month (every 15 min) = minimal cost
- Each invocation typically completes in <60 seconds
