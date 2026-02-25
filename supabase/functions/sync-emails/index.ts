/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCHEDULED EMAIL SYNC - Supabase Edge Function
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This Edge Function is triggered by pg_cron every 15 minutes to sync emails
 * for all active Gmail accounts. It:
 *
 * 1. Finds all accounts that need syncing (haven't synced in 15+ minutes)
 * 2. Calls the main app's /api/emails/sync endpoint for each account
 * 3. Tracks results in the scheduled_sync_runs table
 *
 * AUTHENTICATION:
 * - Requires Bearer token matching CRON_SECRET environment variable
 * - Can also be triggered manually with the same token
 *
 * CONFIGURATION:
 * Required environment variables (set in Supabase Dashboard > Edge Functions):
 * - CRON_SECRET: Secret key for authenticating cron calls
 * - APP_URL: Public URL of the Next.js app (e.g., https://ideabox.app)
 * - INTERNAL_SERVICE_KEY: Key for service-to-service auth with Next.js
 * - SUPABASE_URL: Auto-provided by Supabase
 * - SUPABASE_SERVICE_ROLE_KEY: Auto-provided by Supabase
 *
 * DEPLOYMENT:
 * supabase functions deploy sync-emails --no-verify-jwt
 *
 * TESTING:
 * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/sync-emails \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET" \
 *   -H "Content-Type: application/json"
 *
 * @module supabase/functions/sync-emails
 * @version 1.0.0
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AccountToSync {
  account_id: string;
  user_id: string;
  email: string;
  minutes_since_sync: number;
  needs_backfill: boolean;
}

interface SyncResult {
  accountId: string;
  email: string;
  success: boolean;
  emailsFetched?: number;
  emailsCreated?: number;
  emailsAnalyzed?: number;
  error?: string;
  durationMs?: number;
}

interface RequestBody {
  trigger_source?: 'cron' | 'manual' | 'webhook';
  account_id?: string; // Optional: sync specific account only
  force?: boolean; // Optional: sync even if recently synced
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORS HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const SYNC_INTERVAL_MINUTES = 15; // Minimum minutes between syncs per account
const MAX_ACCOUNTS_PER_RUN = 50; // Maximum accounts to sync in one run
const SYNC_TIMEOUT_MS = 60000; // Timeout per account sync (60 seconds)
const BACKFILL_TIMEOUT_MS = 180000; // Longer timeout for backfill (3 minutes)
const BACKFILL_MAX_RESULTS = 500; // Max emails per backfill call (Gmail API limit)
const BACKFILL_MAX_CALLS = 2; // Up to 2 calls = 1000 emails max
const BACKFILL_DAYS_BACK = 20; // Backfill last 20 days

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logData = { timestamp, level, message, ...data };
  console.log(JSON.stringify(logData));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  const startTime = Date.now();
  let syncRunId: string | null = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Handle CORS preflight
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Authenticate request
  // ─────────────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!expectedSecret) {
    log('error', 'CRON_SECRET environment variable not set');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    log('warn', 'Unauthorized sync request', {
      hasAuth: !!authHeader,
      authPrefix: authHeader?.substring(0, 10),
    });
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Parse request body
  // ─────────────────────────────────────────────────────────────────────────────
  let body: RequestBody = { trigger_source: 'cron' };
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // Empty body is fine, use defaults
  }

  log('info', 'Starting scheduled email sync', {
    trigger_source: body.trigger_source,
    specific_account: body.account_id,
    force: body.force,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialize Supabase client
  // ─────────────────────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL');
  const internalServiceKey = Deno.env.get('INTERNAL_SERVICE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    log('error', 'Missing Supabase configuration');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!appUrl || !internalServiceKey) {
    log('error', 'Missing APP_URL or INTERNAL_SERVICE_KEY');
    return new Response(
      JSON.stringify({ error: 'Server configuration error: APP_URL or INTERNAL_SERVICE_KEY not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Create sync run record
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: syncRun, error: syncRunError } = await supabase
      .from('scheduled_sync_runs')
      .insert({
        trigger_source: body.trigger_source || 'cron',
        status: 'running',
      })
      .select('id')
      .single();

    if (syncRunError) {
      log('warn', 'Failed to create sync run record', { error: syncRunError.message });
    } else {
      syncRunId = syncRun.id;
      log('debug', 'Created sync run record', { syncRunId });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Get accounts that need syncing
    // ─────────────────────────────────────────────────────────────────────────────
    let accountsQuery = supabase
      .from('accounts_needing_sync')
      .select('account_id, user_id, email, minutes_since_sync, needs_backfill')
      .limit(MAX_ACCOUNTS_PER_RUN);

    // Filter by specific account if requested
    if (body.account_id) {
      accountsQuery = accountsQuery.eq('account_id', body.account_id);
    } else if (!body.force) {
      // Only get accounts that haven't synced recently (unless forced)
      accountsQuery = accountsQuery.gte('minutes_since_sync', SYNC_INTERVAL_MINUTES);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) {
      log('error', 'Failed to fetch accounts to sync', { error: accountsError.message });
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    const accountsToSync = (accounts || []) as AccountToSync[];
    log('info', 'Found accounts to sync', {
      count: accountsToSync.length,
      accounts: accountsToSync.map(a => ({ email: a.email, minutesSinceSync: Math.round(a.minutes_since_sync) })),
    });

    if (accountsToSync.length === 0) {
      log('info', 'No accounts need syncing');

      // Update sync run record
      if (syncRunId) {
        await supabase
          .from('scheduled_sync_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            accounts_processed: 0,
            accounts_skipped: 0,
          })
          .eq('id', syncRunId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No accounts need syncing',
          accountsProcessed: 0,
          durationMs: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Sync each account
    // ─────────────────────────────────────────────────────────────────────────────
    const results: SyncResult[] = [];
    let accountsSucceeded = 0;
    let accountsFailed = 0;
    let totalEmailsCreated = 0;
    let totalEmailsAnalyzed = 0;

    for (const account of accountsToSync) {
      const accountStartTime = Date.now();

      try {
        const isBackfill = account.needs_backfill;

        log('debug', 'Syncing account', {
          email: account.email,
          accountId: account.account_id,
          mode: isBackfill ? 'backfill' : 'incremental',
        });

        let cumulativeFetched = 0;
        let cumulativeCreated = 0;
        let cumulativeAnalyzed = 0;

        if (isBackfill) {
          // ── BACKFILL MODE ──────────────────────────────────────────────
          // Fetch last 20 days of emails, up to 1K total (2 calls x 500)
          const afterDate = new Date();
          afterDate.setDate(afterDate.getDate() - BACKFILL_DAYS_BACK);
          const afterQuery = `after:${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;

          log('info', 'Starting backfill for account', {
            email: account.email,
            daysBack: BACKFILL_DAYS_BACK,
            query: afterQuery,
          });

          for (let call = 0; call < BACKFILL_MAX_CALLS; call++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), BACKFILL_TIMEOUT_MS);

            const syncResponse = await fetch(`${appUrl}/api/emails/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Service-Key': internalServiceKey,
              },
              body: JSON.stringify({
                accountId: account.account_id,
                maxResults: BACKFILL_MAX_RESULTS,
                query: afterQuery,
                runAnalysis: true,
                analysisMaxEmails: 200,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!syncResponse.ok) {
              const errorText = await syncResponse.text();
              throw new Error(`Backfill call ${call + 1} failed with status ${syncResponse.status}: ${errorText}`);
            }

            const syncResult = await syncResponse.json();
            const fetched = syncResult.totals?.totalFetched || 0;
            cumulativeFetched += fetched;
            cumulativeCreated += syncResult.totals?.totalCreated || 0;
            cumulativeAnalyzed += syncResult.analysis?.successCount || 0;

            log('info', `Backfill call ${call + 1} completed`, {
              email: account.email,
              fetched,
              cumulativeFetched,
              cumulativeCreated,
            });

            // Stop if we got fewer than max (no more emails to fetch)
            if (fetched < BACKFILL_MAX_RESULTS) break;
          }

          // Mark backfill as complete
          const { error: markError } = await supabase.rpc('mark_backfill_complete', {
            p_account_id: account.account_id,
          });

          if (markError) {
            log('warn', 'Failed to mark backfill complete', {
              accountId: account.account_id,
              error: markError.message,
            });
          }

          log('info', 'Backfill completed for account', {
            email: account.email,
            totalFetched: cumulativeFetched,
            totalCreated: cumulativeCreated,
            totalAnalyzed: cumulativeAnalyzed,
          });

        } else {
          // ── REGULAR INCREMENTAL SYNC ───────────────────────────────────
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

          const syncResponse = await fetch(`${appUrl}/api/emails/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Service-Key': internalServiceKey,
            },
            body: JSON.stringify({
              accountId: account.account_id,
              maxResults: 50,
              runAnalysis: true,
              analysisMaxEmails: 50,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!syncResponse.ok) {
            const errorText = await syncResponse.text();
            throw new Error(`Sync failed with status ${syncResponse.status}: ${errorText}`);
          }

          const syncResult = await syncResponse.json();
          cumulativeFetched = syncResult.totals?.totalFetched || 0;
          cumulativeCreated = syncResult.totals?.totalCreated || 0;
          cumulativeAnalyzed = syncResult.analysis?.successCount || 0;
        }

        const accountDuration = Date.now() - accountStartTime;

        results.push({
          accountId: account.account_id,
          email: account.email,
          success: true,
          emailsFetched: cumulativeFetched,
          emailsCreated: cumulativeCreated,
          emailsAnalyzed: cumulativeAnalyzed,
          durationMs: accountDuration,
        });

        accountsSucceeded++;
        totalEmailsCreated += cumulativeCreated;
        totalEmailsAnalyzed += cumulativeAnalyzed;

        log('info', 'Account sync completed', {
          email: account.email,
          mode: account.needs_backfill ? 'backfill' : 'incremental',
          emailsCreated: cumulativeCreated,
          emailsAnalyzed: cumulativeAnalyzed,
          durationMs: accountDuration,
        });

      } catch (error) {
        const accountDuration = Date.now() - accountStartTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        results.push({
          accountId: account.account_id,
          email: account.email,
          success: false,
          error: errorMessage,
          durationMs: accountDuration,
        });

        accountsFailed++;

        log('error', 'Account sync failed', {
          email: account.email,
          mode: account.needs_backfill ? 'backfill' : 'incremental',
          error: errorMessage,
          durationMs: accountDuration,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Update sync run record with results
    // ─────────────────────────────────────────────────────────────────────────────
    const totalDuration = Date.now() - startTime;
    const finalStatus = accountsFailed === 0 ? 'completed' :
                        accountsSucceeded === 0 ? 'failed' : 'partial';

    if (syncRunId) {
      const { error: updateError } = await supabase
        .from('scheduled_sync_runs')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          duration_ms: totalDuration,
          accounts_processed: accountsToSync.length,
          accounts_succeeded: accountsSucceeded,
          accounts_failed: accountsFailed,
          emails_created: totalEmailsCreated,
          emails_analyzed: totalEmailsAnalyzed,
          results: results,
        })
        .eq('id', syncRunId);

      if (updateError) {
        log('warn', 'Failed to update sync run record', { error: updateError.message });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Return response
    // ─────────────────────────────────────────────────────────────────────────────
    log('info', 'Scheduled sync completed', {
      status: finalStatus,
      accountsProcessed: accountsToSync.length,
      accountsSucceeded,
      accountsFailed,
      emailsCreated: totalEmailsCreated,
      emailsAnalyzed: totalEmailsAnalyzed,
      durationMs: totalDuration,
    });

    return new Response(
      JSON.stringify({
        success: accountsFailed === 0,
        status: finalStatus,
        syncRunId,
        accountsProcessed: accountsToSync.length,
        accountsSucceeded,
        accountsFailed,
        emailsCreated: totalEmailsCreated,
        emailsAnalyzed: totalEmailsAnalyzed,
        durationMs: totalDuration,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const totalDuration = Date.now() - startTime;

    log('error', 'Scheduled sync failed', { error: errorMessage, durationMs: totalDuration });

    // Update sync run record with failure
    if (syncRunId) {
      await supabase
        .from('scheduled_sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: totalDuration,
          error: errorMessage,
        })
        .eq('id', syncRunId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs: totalDuration,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
