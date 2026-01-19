# Email Intake Fix Implementation Plan

> **Audit Date:** January 2026
> **Status:** Planning
> **Priority:** P0 (Critical for core functionality)

## Executive Summary

This plan addresses three critical gaps in the email intake system:

1. **Contact Upsert Issues** - Verify the existing function works correctly
2. **No Scheduled Sync** - Implement automatic background email sync
3. **No Push Notifications** - Add real-time Gmail push for instant updates

---

## Gap 1: Contact Upsert Fix

### Current State

The `upsert_contact_from_email` function **already exists** in `supabase/migrations/012_contacts.sql:127-161`. It uses `SECURITY DEFINER` which should bypass RLS.

### Potential Issues

1. **Migration not applied** - The function might not be deployed
2. **Error handling in code** - Failures are logged but swallowed silently
3. **Service role vs anon key** - Server client might not have permissions

### Verification Steps

```sql
-- Check if function exists
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'upsert_contact_from_email';

-- Test the function directly
SELECT upsert_contact_from_email(
  'user-uuid-here'::UUID,
  'test@example.com',
  'Test User',
  NOW(),
  FALSE
);
```

### Implementation

#### Step 1: Add Migration Verification Script

Create `scripts/verify-migrations.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

async function verifyMigrations() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role
  );

  // Check for upsert_contact_from_email function
  const { data, error } = await supabase.rpc('upsert_contact_from_email', {
    p_user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
    p_email: 'verify@test.com',
    p_name: 'Verification Test',
    p_email_date: new Date().toISOString(),
    p_is_sent: false,
  });

  if (error) {
    console.error('Function missing or broken:', error.message);
    process.exit(1);
  }

  console.log('Migration verified: upsert_contact_from_email works');
}
```

#### Step 2: Improve Error Handling in Email Processor

Update `src/services/processors/email-processor.ts:838-885`:

```typescript
private async upsertContact(
  userId: string,
  email: string,
  name: string | null,
  emailDate: string
): Promise<ContactForEnrichment | null> {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('upsert_contact_from_email', {
      p_user_id: userId,
      p_email: email.toLowerCase(),
      p_name: name,
      p_email_date: emailDate,
      p_is_sent: false,
    });

    if (error) {
      // CRITICAL: Log with enough detail to debug
      logger.error('Contact upsert failed', {
        userId: userId.substring(0, 8),
        email: email.substring(0, 20),
        errorCode: error.code,
        errorMessage: error.message,
        errorHint: error.hint,
        errorDetails: error.details,
      });
      return null;
    }

    // ... rest of function
  } catch (error) {
    // ... error handling
  }
}
```

### Effort: Small (1-2 hours)

---

## Gap 2: Scheduled Sync Implementation

### Options Comparison

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| **Supabase pg_cron** | Built-in, free, reliable | SQL-only, limited logic | Small |
| **Supabase Edge Function + Cron** | Full TypeScript, flexible | Requires Deno runtime | Medium |
| **Vercel Cron** | Integrated with Next.js | 1/day on free tier | Small |
| **External Cron (e.g., cron-job.org)** | Simple, free | External dependency | Small |

### Recommended: Supabase Edge Function + pg_cron

This gives us TypeScript flexibility with reliable scheduling.

### Implementation

#### Step 1: Create Edge Function

Create `supabase/functions/sync-emails/index.ts`:

```typescript
// supabase/functions/sync-emails/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify this is called by pg_cron or admin
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('CRON_SECRET');

    if (authHeader !== `Bearer ${expectedKey}`) {
      console.log('Unauthorized cron call attempt');
      return new Response('Unauthorized', { status: 401 });
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all accounts that need syncing
    const { data: accounts, error: accountsError } = await supabase
      .from('gmail_accounts')
      .select('id, user_id, email, last_sync_at')
      .eq('sync_enabled', true)
      .or(`last_sync_at.is.null,last_sync_at.lt.${new Date(Date.now() - 15 * 60 * 1000).toISOString()}`);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    console.log(`Found ${accounts?.length || 0} accounts to sync`);

    // Process each account
    const results = [];
    for (const account of accounts || []) {
      try {
        // Call the main app's sync endpoint
        const response = await fetch(`${Deno.env.get('APP_URL')}/api/emails/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Key': Deno.env.get('INTERNAL_SERVICE_KEY')!,
          },
          body: JSON.stringify({
            accountId: account.id,
            maxResults: 50,
            runAnalysis: true,
            analysisMaxEmails: 50,
          }),
        });

        const result = await response.json();
        results.push({
          accountId: account.id,
          email: account.email,
          success: response.ok,
          emailsCreated: result.totals?.totalCreated || 0,
        });
      } catch (error) {
        results.push({
          accountId: account.id,
          email: account.email,
          success: false,
          error: error.message,
        });
      }
    }

    // Log results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const emailsCreated = results.reduce((sum, r) => sum + (r.emailsCreated || 0), 0);

    console.log(`Sync complete: ${successful} succeeded, ${failed} failed, ${emailsCreated} new emails`);

    // Store sync run in database
    await supabase.from('scheduled_sync_runs').insert({
      accounts_processed: accounts?.length || 0,
      accounts_succeeded: successful,
      accounts_failed: failed,
      emails_created: emailsCreated,
      results: results,
    });

    return new Response(JSON.stringify({
      success: true,
      accountsProcessed: accounts?.length || 0,
      emailsCreated,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Scheduled sync failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

#### Step 2: Create Migration for Sync Tracking

Create `supabase/migrations/014_scheduled_sync.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEDULED SYNC INFRASTRUCTURE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Track scheduled sync runs
CREATE TABLE scheduled_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  accounts_processed INTEGER DEFAULT 0,
  accounts_succeeded INTEGER DEFAULT 0,
  accounts_failed INTEGER DEFAULT 0,
  emails_created INTEGER DEFAULT 0,
  results JSONB,
  error TEXT
);

-- Index for cleanup
CREATE INDEX idx_scheduled_sync_runs_started_at
  ON scheduled_sync_runs(started_at DESC);

-- Cleanup old runs (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_runs()
RETURNS void AS $$
BEGIN
  DELETE FROM scheduled_sync_runs
  WHERE started_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PG_CRON SCHEDULE (requires pg_cron extension)
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: Run this manually in Supabase SQL Editor after enabling pg_cron

-- Enable pg_cron extension (must be done by Supabase support or dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule sync every 15 minutes
-- SELECT cron.schedule(
--   'email-sync-job',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.settings.edge_function_url') || '/sync-emails',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'
--   );
--   $$
-- );

-- Schedule cleanup daily at 3am
-- SELECT cron.schedule(
--   'cleanup-sync-runs',
--   '0 3 * * *',
--   'SELECT cleanup_old_sync_runs()'
-- );
```

#### Step 3: Add Internal Service Authentication

Update `src/app/api/emails/sync/route.ts` to support service-to-service auth:

```typescript
// At the top of POST handler, add service key auth
const serviceKey = request.headers.get('X-Service-Key');
const expectedServiceKey = process.env.INTERNAL_SERVICE_KEY;

let user;
if (serviceKey && serviceKey === expectedServiceKey) {
  // Service-to-service call - get user from body
  const body = await request.json();
  if (!body.accountId) {
    return apiError('accountId required for service calls', 400);
  }

  // Fetch account to get user_id
  const { data: account } = await supabase
    .from('gmail_accounts')
    .select('user_id')
    .eq('id', body.accountId)
    .single();

  if (!account) {
    return apiError('Account not found', 404);
  }

  user = { id: account.user_id };
} else {
  // Normal user auth
  user = await requireAuth(supabase);
  if (user instanceof Response) return user;
}
```

#### Step 4: Environment Variables

Add to `.env.local`:

```bash
# Scheduled Sync
INTERNAL_SERVICE_KEY=generate-a-secure-random-key-here
CRON_SECRET=generate-another-secure-key-here
```

### Effort: Medium (4-6 hours)

---

## Gap 3: Gmail Push Notifications

### Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Gmail API     │────▶│ Google Cloud    │────▶│   Webhook       │
│   (watch)       │     │   Pub/Sub       │     │ /api/webhooks   │
└─────────────────┘     └─────────────────┘     │   /gmail        │
                                                └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Sync + Analyze │
                                                └─────────────────┘
```

### Prerequisites

1. **Google Cloud Project** with Pub/Sub API enabled
2. **Pub/Sub Topic** for Gmail notifications
3. **Push Subscription** pointing to your webhook
4. **Service Account** for Pub/Sub authentication

### Implementation

#### Step 1: Google Cloud Setup

```bash
# Create Pub/Sub topic
gcloud pubsub topics create gmail-notifications

# Create push subscription
gcloud pubsub subscriptions create gmail-push \
  --topic=gmail-notifications \
  --push-endpoint=https://your-app.com/api/webhooks/gmail \
  --push-auth-service-account=your-service-account@project.iam.gserviceaccount.com
```

#### Step 2: Create Gmail Watch Service

Create `src/lib/gmail/watch-service.ts`:

```typescript
/**
 * Gmail Watch Service
 *
 * Manages Gmail push notification subscriptions.
 * Each watch expires after 7 days and must be renewed.
 */

import { google } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { TokenManager } from './token-manager';

const logger = createLogger('GmailWatchService');

const PUBSUB_TOPIC = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`;

export interface WatchResponse {
  historyId: string;
  expiration: string; // Unix timestamp in milliseconds
}

export class GmailWatchService {
  /**
   * Start watching a Gmail account for changes.
   * Must be renewed every 7 days.
   */
  async startWatch(
    accessToken: string,
    accountId: string
  ): Promise<WatchResponse> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: PUBSUB_TOPIC,
          labelIds: ['INBOX'], // Only watch inbox for efficiency
          labelFilterBehavior: 'INCLUDE',
        },
      });

      const result = {
        historyId: response.data.historyId!,
        expiration: response.data.expiration!,
      };

      // Store watch info in database
      const supabase = await createServerClient();
      await supabase
        .from('gmail_accounts')
        .update({
          watch_expiration: new Date(parseInt(result.expiration)).toISOString(),
          watch_history_id: result.historyId,
        })
        .eq('id', accountId);

      logger.info('Gmail watch started', {
        accountId,
        historyId: result.historyId,
        expiresAt: new Date(parseInt(result.expiration)).toISOString(),
      });

      return result;
    } catch (error) {
      logger.error('Failed to start Gmail watch', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop watching a Gmail account.
   */
  async stopWatch(accessToken: string, accountId: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth });

    try {
      await gmail.users.stop({ userId: 'me' });

      const supabase = await createServerClient();
      await supabase
        .from('gmail_accounts')
        .update({
          watch_expiration: null,
          watch_history_id: null,
        })
        .eq('id', accountId);

      logger.info('Gmail watch stopped', { accountId });
    } catch (error) {
      logger.error('Failed to stop Gmail watch', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Renew all watches that expire within 24 hours.
   * Should be called daily via cron.
   */
  async renewExpiringWatches(): Promise<void> {
    const supabase = await createServerClient();
    const tokenManager = new TokenManager(supabase);

    // Find watches expiring in next 24 hours
    const expirationThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: accounts, error } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('sync_enabled', true)
      .lt('watch_expiration', expirationThreshold);

    if (error) {
      logger.error('Failed to fetch expiring watches', { error: error.message });
      return;
    }

    logger.info('Renewing expiring watches', { count: accounts?.length || 0 });

    for (const account of accounts || []) {
      try {
        const accessToken = await tokenManager.getValidToken(account);
        await this.startWatch(accessToken, account.id);
      } catch (error) {
        logger.error('Failed to renew watch', {
          accountId: account.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

export const gmailWatchService = new GmailWatchService();
```

#### Step 3: Create Webhook Endpoint

Create `src/app/api/webhooks/gmail/route.ts`:

```typescript
/**
 * Gmail Push Notification Webhook
 *
 * Receives push notifications from Google Cloud Pub/Sub when
 * Gmail changes occur. Triggers incremental sync for affected accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { GmailService, TokenManager } from '@/lib/gmail';
import { runAIAnalysis } from '@/lib/services/email-analysis';

const logger = createLogger('GmailWebhook');

interface PubSubMessage {
  message: {
    data: string; // Base64 encoded
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify this is from Google Cloud Pub/Sub
    // In production, verify the JWT token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header');
      // Still return 200 to prevent Pub/Sub retries
      return NextResponse.json({ received: true });
    }

    // TODO: Verify JWT token with Google's public keys
    // const token = authHeader.replace('Bearer ', '');
    // await verifyGoogleToken(token);

    // Parse Pub/Sub message
    const body: PubSubMessage = await request.json();

    if (!body.message?.data) {
      logger.warn('No message data in Pub/Sub notification');
      return NextResponse.json({ received: true });
    }

    // Decode base64 notification
    const notificationData = Buffer.from(body.message.data, 'base64').toString();
    const notification: GmailNotification = JSON.parse(notificationData);

    logger.info('Received Gmail notification', {
      email: notification.emailAddress,
      historyId: notification.historyId,
      messageId: body.message.messageId,
    });

    // Find the Gmail account
    const supabase = await createServerClient();
    const { data: account, error } = await supabase
      .from('gmail_accounts')
      .select('*, user_profiles!inner(id)')
      .eq('email', notification.emailAddress)
      .single();

    if (error || !account) {
      logger.warn('Gmail account not found', { email: notification.emailAddress });
      return NextResponse.json({ received: true });
    }

    // Skip if we've already processed this historyId
    if (account.last_history_id &&
        BigInt(notification.historyId) <= BigInt(account.last_history_id)) {
      logger.debug('Already processed this historyId', {
        current: account.last_history_id,
        received: notification.historyId,
      });
      return NextResponse.json({ received: true });
    }

    // Process the notification asynchronously
    // Return 200 immediately to prevent Pub/Sub timeout
    processNotification(account, notification).catch((err) => {
      logger.error('Async notification processing failed', {
        accountId: account.id,
        error: err.message,
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return 200 to prevent Pub/Sub retries for invalid messages
    return NextResponse.json({ received: true });
  }
}

/**
 * Process a Gmail notification asynchronously.
 * Fetches new messages and runs AI analysis.
 */
async function processNotification(
  account: any,
  notification: GmailNotification
): Promise<void> {
  const supabase = await createServerClient();
  const tokenManager = new TokenManager(supabase);

  logger.info('Processing Gmail notification', {
    accountId: account.id,
    historyId: notification.historyId,
  });

  try {
    // Get valid access token
    const accessToken = await tokenManager.getValidToken(account);
    const gmailService = new GmailService(accessToken, account.id);

    // Use history API for incremental sync
    const startHistoryId = account.last_history_id || account.watch_history_id;

    if (!startHistoryId) {
      logger.warn('No history ID for incremental sync, doing full sync', {
        accountId: account.id,
      });
      // Fall back to regular sync for first notification
      return;
    }

    const history = await gmailService.getHistory(startHistoryId);

    // Collect new message IDs
    const newMessageIds: string[] = [];
    for (const record of history.history || []) {
      if (record.messagesAdded) {
        for (const msg of record.messagesAdded) {
          if (msg.message?.id) {
            newMessageIds.push(msg.message.id);
          }
        }
      }
    }

    if (newMessageIds.length === 0) {
      logger.debug('No new messages in notification', { accountId: account.id });
      // Still update historyId
      await supabase
        .from('gmail_accounts')
        .update({ last_history_id: notification.historyId })
        .eq('id', account.id);
      return;
    }

    logger.info('Fetching new messages from notification', {
      accountId: account.id,
      messageCount: newMessageIds.length,
    });

    // Fetch and save new messages
    // ... (reuse existing sync logic)

    // Update history ID
    await supabase
      .from('gmail_accounts')
      .update({
        last_history_id: notification.historyId,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    // Run AI analysis on new emails
    if (newMessageIds.length > 0) {
      await runAIAnalysis(account.user_id, newMessageIds.length);
    }

    logger.success('Notification processed successfully', {
      accountId: account.id,
      newMessages: newMessageIds.length,
    });

  } catch (error) {
    logger.error('Notification processing failed', {
      accountId: account.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
```

#### Step 4: Add Database Columns for Watch State

Create `supabase/migrations/015_gmail_watch.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- GMAIL PUSH NOTIFICATION SUPPORT
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add watch state columns to gmail_accounts
ALTER TABLE gmail_accounts
ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS watch_history_id TEXT;

-- Index for finding expiring watches
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_watch_expiration
  ON gmail_accounts(watch_expiration)
  WHERE watch_expiration IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUSH NOTIFICATION LOG (for debugging)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gmail_push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  history_id TEXT NOT NULL,
  message_count INTEGER,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processing_time_ms INTEGER,
  error TEXT
);

-- Index for recent logs
CREATE INDEX idx_gmail_push_logs_processed_at
  ON gmail_push_logs(processed_at DESC);

-- Cleanup old logs (keep 3 days)
CREATE OR REPLACE FUNCTION cleanup_old_push_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM gmail_push_logs
  WHERE processed_at < NOW() - INTERVAL '3 days';
END;
$$ LANGUAGE plpgsql;
```

#### Step 5: Initialize Watch on Account Connection

Update the OAuth callback to start watching:

```typescript
// In src/app/api/auth/callback/route.ts
// After saving the Gmail account:

import { gmailWatchService } from '@/lib/gmail/watch-service';

// Start watching for push notifications
try {
  await gmailWatchService.startWatch(accessToken, accountId);
} catch (error) {
  logger.warn('Failed to start Gmail watch, will use polling', {
    accountId,
    error: error.message,
  });
}
```

### Effort: Large (8-12 hours)

---

## Implementation Order

### Phase 1: Quick Wins (Day 1)
1. Verify contact upsert function exists and works
2. Add better error logging to email processor
3. Test end-to-end contact creation

### Phase 2: Scheduled Sync (Day 2-3)
1. Create Edge Function for sync
2. Add scheduled_sync_runs table
3. Configure pg_cron scheduling
4. Add service-to-service authentication
5. Test with multiple accounts

### Phase 3: Push Notifications (Day 4-6)
1. Set up Google Cloud Pub/Sub
2. Create webhook endpoint
3. Implement watch service
4. Add database columns
5. Initialize watch on account connection
6. Set up watch renewal cron
7. End-to-end testing

---

## Environment Variables Required

```bash
# Existing
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=

# New for Scheduled Sync
INTERNAL_SERVICE_KEY=        # Service-to-service auth
CRON_SECRET=                 # pg_cron to Edge Function auth
APP_URL=                     # Public URL for callbacks

# New for Push Notifications
GOOGLE_CLOUD_PROJECT=        # GCP project ID
GOOGLE_APPLICATION_CREDENTIALS=  # Path to service account JSON
```

---

## Testing Checklist

### Contact Upsert
- [ ] New sender creates contact record
- [ ] Repeated sender increments email_count
- [ ] Name is preserved (not overwritten with null)
- [ ] first_seen_at stays at earliest email
- [ ] last_seen_at updates to latest email

### Scheduled Sync
- [ ] Cron job triggers every 15 minutes
- [ ] Only syncs accounts needing sync
- [ ] New emails are fetched and saved
- [ ] AI analysis runs on new emails
- [ ] Sync logs are created
- [ ] Failed syncs don't block others

### Push Notifications
- [ ] Watch is created on account connection
- [ ] Webhook receives notifications
- [ ] History API fetches only new messages
- [ ] AI analysis runs on new emails
- [ ] History ID is updated correctly
- [ ] Watch renewal works before expiration
- [ ] Graceful fallback to polling if push fails

---

## Monitoring & Alerts

### Metrics to Track
1. **Sync Success Rate** - % of successful syncs
2. **Sync Latency** - Time from email arrival to analysis
3. **AI Costs** - Tokens used per day
4. **Push vs Poll** - Which accounts use which method

### Alert Conditions
1. Sync failure rate > 10%
2. No syncs for 1 hour
3. AI costs exceed daily budget
4. Watch expiration not renewed

---

## Rollback Plan

If issues arise:

1. **Scheduled Sync Issues**: Disable pg_cron job
   ```sql
   SELECT cron.unschedule('email-sync-job');
   ```

2. **Push Notification Issues**: Stop all watches
   ```sql
   UPDATE gmail_accounts SET watch_expiration = NULL;
   ```

3. **Contact Upsert Issues**: Revert to direct insert
   ```typescript
   // Bypass RPC, use direct insert with ON CONFLICT
   ```
