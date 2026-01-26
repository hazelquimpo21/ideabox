/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEND SCHEDULED EMAILS - Supabase Edge Function
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Processes scheduled emails that are due for sending.
 * Runs every 1 minute via pg_cron.
 *
 * RESPONSIBILITIES:
 * 1. Query outbound_emails with status='scheduled' and scheduled_at <= now
 * 2. Check user quota before each send
 * 3. Get valid access token (refresh if needed)
 * 4. Send via Gmail API
 * 5. Update status to 'sent' or 'failed'
 * 6. Increment daily send quota
 *
 * CONFIGURATION:
 * Required environment variables:
 * - CRON_SECRET: Secret key for authenticating cron calls
 * - SUPABASE_URL: Auto-provided by Supabase
 * - SUPABASE_SERVICE_ROLE_KEY: Auto-provided by Supabase
 * - GOOGLE_CLIENT_ID: Google OAuth client ID
 * - GOOGLE_CLIENT_SECRET: Google OAuth client secret
 *
 * DEPLOYMENT:
 * supabase functions deploy send-scheduled-emails --no-verify-jwt
 *
 * pg_cron schedule (add to Supabase Dashboard > Database > Extensions > pg_cron):
 * SELECT cron.schedule(
 *   'send-scheduled-emails',
 *   '* * * * *',  -- Every minute
 *   $$SELECT net.http_post(
 *     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-scheduled-emails',
 *     headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
 *   )$$
 * );
 *
 * @module supabase/functions/send-scheduled-emails
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ScheduledEmail {
  id: string;
  user_id: string;
  gmail_account_id: string;
  to_email: string;
  to_name: string | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  reply_to: string | null;
  subject: string;
  body_html: string;
  body_text: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  tracking_id: string;
  tracking_enabled: boolean;
}

interface GmailAccount {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
}

interface SendResult {
  emailId: string;
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
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

const MAX_EMAILS_PER_RUN = 20; // Max emails to process per invocation
const SEND_TIMEOUT_MS = 30000; // 30 second timeout per email

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logData = { timestamp, level, message, ...data };
  console.log(JSON.stringify(logData));
}

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Refreshes an OAuth access token using the refresh token.
 */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: string } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      log('error', 'Token refresh failed', { status: response.status });
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error) {
    log('error', 'Token refresh exception', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Builds an RFC 2822 MIME message for Gmail API.
 */
function buildMimeMessage(email: ScheduledEmail, fromEmail: string, appUrl: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const headers: string[] = [];

  // From header
  headers.push(`From: ${fromEmail}`);

  // To header
  if (email.to_name) {
    headers.push(`To: "${email.to_name}" <${email.to_email}>`);
  } else {
    headers.push(`To: ${email.to_email}`);
  }

  // CC header
  if (email.cc_emails && email.cc_emails.length > 0) {
    headers.push(`Cc: ${email.cc_emails.join(', ')}`);
  }

  // BCC header
  if (email.bcc_emails && email.bcc_emails.length > 0) {
    headers.push(`Bcc: ${email.bcc_emails.join(', ')}`);
  }

  // Reply-To header
  if (email.reply_to) {
    headers.push(`Reply-To: ${email.reply_to}`);
  }

  // Subject
  headers.push(`Subject: ${email.subject}`);

  // Date
  headers.push(`Date: ${new Date().toUTCString()}`);

  // Message-ID
  headers.push(`Message-ID: <${Date.now()}.${Math.random().toString(36).substring(2)}@ideabox.app>`);

  // Threading headers
  if (email.in_reply_to) {
    headers.push(`In-Reply-To: ${email.in_reply_to}`);
    headers.push(`References: ${email.references_header || email.in_reply_to}`);
  }

  // MIME headers
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  // Inject tracking pixel if enabled
  let bodyHtml = email.body_html;
  if (email.tracking_enabled && email.tracking_id) {
    const pixelUrl = `${appUrl}/api/tracking/open/${email.tracking_id}`;
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block!important;width:1px!important;height:1px!important;" />`;
    if (bodyHtml.toLowerCase().includes('</body>')) {
      bodyHtml = bodyHtml.replace(/<\/body>/i, `${pixel}</body>`);
    } else {
      bodyHtml = bodyHtml + pixel;
    }
  }

  // Generate plain text from HTML
  const plainText = email.body_text || bodyHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  // Build message body
  const messageParts: string[] = [];
  messageParts.push(`--${boundary}`);
  messageParts.push('Content-Type: text/plain; charset="UTF-8"');
  messageParts.push('');
  messageParts.push(plainText);
  messageParts.push(`--${boundary}`);
  messageParts.push('Content-Type: text/html; charset="UTF-8"');
  messageParts.push('');
  messageParts.push(bodyHtml);
  messageParts.push(`--${boundary}--`);

  return headers.join('\r\n') + '\r\n\r\n' + messageParts.join('\r\n');
}

/**
 * Encodes a message for Gmail API (URL-safe base64).
 */
function encodeMessage(message: string): string {
  const base64 = btoa(unescape(encodeURIComponent(message)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sends an email via Gmail API.
 */
async function sendViaGmail(
  accessToken: string,
  encodedMessage: string,
  threadId?: string
): Promise<{ messageId: string; threadId: string } | null> {
  try {
    const requestBody: { raw: string; threadId?: string } = { raw: encodedMessage };
    if (threadId) {
      requestBody.threadId = threadId;
    }

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'Gmail API send failed', {
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    return {
      messageId: data.id,
      threadId: data.threadId,
    };
  } catch (error) {
    log('error', 'Gmail API exception', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
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

  // Authenticate request
  const authHeader = req.headers.get('Authorization');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    log('warn', 'Unauthorized request to send-scheduled-emails');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  log('info', 'Starting send-scheduled-emails job');

  // Get configuration
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const appUrl = Deno.env.get('APP_URL') || 'https://ideabox.app';

  if (!supabaseUrl || !supabaseServiceKey || !googleClientId || !googleClientSecret) {
    log('error', 'Missing required environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Get scheduled emails that are due
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: emails, error: fetchError } = await supabase
      .rpc('get_scheduled_emails_to_send', { p_limit: MAX_EMAILS_PER_RUN });

    if (fetchError) {
      log('error', 'Failed to fetch scheduled emails', { error: fetchError.message });
      throw new Error(`Failed to fetch emails: ${fetchError.message}`);
    }

    const scheduledEmails = (emails || []) as ScheduledEmail[];
    log('info', 'Found scheduled emails to send', { count: scheduledEmails.length });

    if (scheduledEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No scheduled emails to send',
          processed: 0,
          durationMs: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Process each email
    // ─────────────────────────────────────────────────────────────────────────────
    const results: SendResult[] = [];
    let succeeded = 0;
    let failed = 0;

    // Cache for account tokens (avoid re-fetching for same account)
    const accountCache = new Map<string, GmailAccount>();

    for (const email of scheduledEmails) {
      const emailStartTime = Date.now();

      try {
        // Mark as sending
        await supabase
          .from('outbound_emails')
          .update({ status: 'sending' })
          .eq('id', email.id);

        // Get Gmail account (from cache or database)
        let account = accountCache.get(email.gmail_account_id);
        if (!account) {
          const { data: accountData, error: accountError } = await supabase
            .from('gmail_accounts')
            .select('id, email, access_token, refresh_token, token_expiry')
            .eq('id', email.gmail_account_id)
            .single();

          if (accountError || !accountData) {
            throw new Error('Gmail account not found');
          }
          account = accountData as GmailAccount;
          accountCache.set(email.gmail_account_id, account);
        }

        // Check if token needs refresh
        let accessToken = account.access_token;
        const tokenExpiry = new Date(account.token_expiry);
        const now = new Date();
        const bufferMs = 5 * 60 * 1000; // 5 minute buffer

        if (tokenExpiry.getTime() - now.getTime() < bufferMs) {
          log('debug', 'Refreshing token', { accountId: account.id });

          const refreshResult = await refreshAccessToken(
            account.refresh_token,
            googleClientId,
            googleClientSecret
          );

          if (!refreshResult) {
            throw new Error('Token refresh failed');
          }

          accessToken = refreshResult.accessToken;

          // Update token in database
          await supabase
            .from('gmail_accounts')
            .update({
              access_token: refreshResult.accessToken,
              token_expiry: refreshResult.expiresAt,
            })
            .eq('id', account.id);

          // Update cache
          account.access_token = refreshResult.accessToken;
          account.token_expiry = refreshResult.expiresAt;
        }

        // Build and send the message
        const mimeMessage = buildMimeMessage(email, account.email, appUrl);
        const encodedMessage = encodeMessage(mimeMessage);

        const gmailThreadId = email.in_reply_to
          ? await getThreadIdForReply(supabase, email.in_reply_to)
          : undefined;

        const sendResult = await sendViaGmail(accessToken, encodedMessage, gmailThreadId);

        if (!sendResult) {
          throw new Error('Gmail API send failed');
        }

        // Update outbound email with success
        await supabase
          .from('outbound_emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            gmail_message_id: sendResult.messageId,
            gmail_thread_id: sendResult.threadId,
          })
          .eq('id', email.id);

        // Increment send quota
        await supabase.rpc('increment_send_count', { p_user_id: email.user_id });

        results.push({
          emailId: email.id,
          success: true,
          messageId: sendResult.messageId,
          threadId: sendResult.threadId,
        });
        succeeded++;

        log('info', 'Email sent successfully', {
          emailId: email.id,
          to: email.to_email,
          messageId: sendResult.messageId,
          durationMs: Date.now() - emailStartTime,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update outbound email with failure
        const { data: currentEmail } = await supabase
          .from('outbound_emails')
          .select('retry_count, max_retries')
          .eq('id', email.id)
          .single();

        const retryCount = (currentEmail?.retry_count || 0) + 1;
        const maxRetries = currentEmail?.max_retries || 3;
        const shouldRetry = retryCount < maxRetries;

        await supabase
          .from('outbound_emails')
          .update({
            status: shouldRetry ? 'scheduled' : 'failed',
            error_message: errorMessage,
            error_code: 'SEND_FAILED',
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            // If retrying, schedule for 5 minutes from now
            scheduled_at: shouldRetry
              ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
              : undefined,
          })
          .eq('id', email.id);

        results.push({
          emailId: email.id,
          success: false,
          error: errorMessage,
        });
        failed++;

        log('error', 'Email send failed', {
          emailId: email.id,
          to: email.to_email,
          error: errorMessage,
          retryCount,
          willRetry: shouldRetry,
          durationMs: Date.now() - emailStartTime,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Return response
    // ─────────────────────────────────────────────────────────────────────────────
    const totalDuration = Date.now() - startTime;

    log('info', 'send-scheduled-emails job completed', {
      processed: scheduledEmails.length,
      succeeded,
      failed,
      durationMs: totalDuration,
    });

    return new Response(
      JSON.stringify({
        success: failed === 0,
        processed: scheduledEmails.length,
        succeeded,
        failed,
        results,
        durationMs: totalDuration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'send-scheduled-emails job failed', { error: errorMessage });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Helper to get thread ID from an in-reply-to message ID.
 * Searches outbound_emails for the original message.
 */
async function getThreadIdForReply(
  supabase: ReturnType<typeof createClient>,
  inReplyTo: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('outbound_emails')
    .select('gmail_thread_id')
    .eq('gmail_message_id', inReplyTo)
    .single();

  return data?.gmail_thread_id || undefined;
}
