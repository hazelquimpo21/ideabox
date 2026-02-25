/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RENEW WATCHES - Supabase Edge Function
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Triggered by pg_cron every 6 hours to renew expiring Gmail push notification
 * watches and set up watches for newly connected accounts.
 *
 * Calls the main app's /api/gmail/watch endpoint which runs:
 * 1. renewExpiringWatches() — Renews watches expiring within 24 hours
 * 2. setupMissingWatches() — Creates watches for accounts without one
 *
 * AUTHENTICATION:
 * - Requires Bearer token matching CRON_SECRET environment variable
 *
 * CONFIGURATION:
 * Required environment variables (set in Supabase Dashboard > Edge Functions):
 * - CRON_SECRET: Secret key for authenticating cron calls
 * - APP_URL: Public URL of the Next.js app (e.g., https://ideabox.app)
 * - INTERNAL_SERVICE_KEY: Key for service-to-service auth with Next.js
 *
 * DEPLOYMENT:
 * supabase functions deploy renew-watches --no-verify-jwt
 *
 * TESTING:
 * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/renew-watches \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET" \
 *   -H "Content-Type: application/json"
 *
 * @module supabase/functions/renew-watches
 * @version 1.0.0
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

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

const WATCH_TIMEOUT_MS = 120000; // 2 minutes total timeout

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
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

  // Handle CORS preflight
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
    log('warn', 'Unauthorized watch renewal request');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Validate environment
  // ─────────────────────────────────────────────────────────────────────────────
  const appUrl = Deno.env.get('APP_URL');
  const internalServiceKey = Deno.env.get('INTERNAL_SERVICE_KEY');

  if (!appUrl || !internalServiceKey) {
    log('error', 'Missing APP_URL or INTERNAL_SERVICE_KEY');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Call the watch management endpoint
  // ─────────────────────────────────────────────────────────────────────────────
  log('info', 'Starting watch renewal');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WATCH_TIMEOUT_MS);

    const response = await fetch(`${appUrl}/api/gmail/watch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': internalServiceKey,
      },
      body: JSON.stringify({
        trigger_source: 'cron',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Watch renewal failed with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const durationMs = Date.now() - startTime;

    log('info', 'Watch renewal completed', {
      renewed: result.renewed,
      setupNew: result.setupNew,
      failed: result.failed,
      durationMs,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        durationMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    log('error', 'Watch renewal failed', { error: errorMessage, durationMs });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
