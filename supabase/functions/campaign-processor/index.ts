/**
 * Campaign Processor Edge Function
 *
 * Processes mail merge email campaigns with throttling to prevent rate limiting.
 * Sends one email every 25 seconds per campaign.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INVOCATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This function should be invoked by pg_cron every minute:
 *
 * ```sql
 * SELECT cron.schedule(
 *   'process-campaigns',
 *   '* * * * *',  -- Every minute
 *   $$SELECT net.http_post(
 *     url := 'https://your-project.supabase.co/functions/v1/campaign-processor',
 *     headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
 *   )$$
 * );
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THROTTLING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Each campaign can send 1 email per 25 seconds
 * - With 1-minute cron intervals, each invocation can send up to 2 emails per campaign
 * - Multiple active campaigns are processed in parallel
 * - Respects daily quota limits
 *
 * @module supabase/functions/campaign-processor
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimum delay between emails in a campaign (milliseconds).
 * Set to 25 seconds to avoid Gmail rate limiting.
 */
const THROTTLE_DELAY_MS = 25000;

/**
 * Maximum emails to send per campaign per invocation.
 * With 25s delay, 2 emails takes ~50s (fits in 60s cron interval).
 */
const MAX_EMAILS_PER_CAMPAIGN = 2;

/**
 * Timeout for sending a single email (milliseconds).
 */
const SEND_TIMEOUT_MS = 30000;

/**
 * Maximum retry attempts for failed campaign emails.
 */
const MAX_RETRIES = 3;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Campaign {
  id: string;
  user_id: string;
  gmail_account_id: string;
  template_id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  last_sent_at: string | null;
  tracking_enabled: boolean;
  created_at: string;
}

interface CampaignRecipient {
  id: string;
  campaign_id: string;
  email: string;
  name: string | null;
  merge_data: Record<string, string>;
  status: 'pending' | 'sent' | 'failed';
  outbound_email_id: string | null;
  error_message: string | null;
  retry_count: number;
}

interface Template {
  id: string;
  subject: string;
  body_html: string;
}

interface GmailAccount {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  has_send_scope: boolean;
}

interface ProcessResult {
  campaignId: string;
  campaignName: string;
  emailsSent: number;
  emailsFailed: number;
  completed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[CampaignProcessor]';

function logInfo(message: string, data?: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${message}`, data ? JSON.stringify(data) : '');
}

function logError(message: string, error?: unknown): void {
  console.error(`${LOG_PREFIX} ERROR: ${message}`, error);
}

function logWarn(message: string, data?: Record<string, unknown>): void {
  console.warn(`${LOG_PREFIX} WARN: ${message}`, data ? JSON.stringify(data) : '');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL TOKEN REFRESH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Refreshes Gmail access token if expired.
 *
 * @param account - Gmail account with potentially expired token
 * @param supabase - Supabase client for updating tokens
 * @returns Fresh access token
 */
async function ensureFreshToken(
  account: GmailAccount,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();

  // Add 5-minute buffer for token refresh
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    logInfo('Token still valid', { accountId: account.id.substring(0, 8) });
    return account.access_token;
  }

  logInfo('Refreshing expired token', { accountId: account.id.substring(0, 8) });

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokens = await response.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Update tokens in database
  const { error: updateError } = await supabase
    .from('gmail_accounts')
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', account.id);

  if (updateError) {
    logWarn('Failed to update tokens in database', { error: updateError.message });
  }

  logInfo('Token refreshed successfully', { accountId: account.id.substring(0, 8) });
  return tokens.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIL MERGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Applies merge fields to template content.
 *
 * @param template - Template string with {{placeholders}}
 * @param data - Merge data object
 * @returns Merged content string
 */
function applyMergeFields(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    return data[field] ?? match; // Keep placeholder if no data
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SENDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds RFC 2822 MIME message for Gmail API.
 */
function buildMimeMessage(options: {
  to: string;
  toName?: string;
  from: string;
  subject: string;
  htmlBody: string;
  trackingId?: string;
  trackingBaseUrl?: string;
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const toHeader = options.toName
    ? `"${options.toName.replace(/"/g, '\\"')}" <${options.to}>`
    : options.to;

  // Inject tracking pixel if enabled
  let htmlBody = options.htmlBody;
  if (options.trackingId && options.trackingBaseUrl) {
    const trackingPixel = `<img src="${options.trackingBaseUrl}/api/tracking/open/${options.trackingId}" width="1" height="1" style="display:none" alt="" />`;
    htmlBody = htmlBody.replace('</body>', `${trackingPixel}</body>`);

    // If no </body> tag, append to end
    if (!htmlBody.includes(trackingPixel)) {
      htmlBody += trackingPixel;
    }
  }

  const messageParts = [
    `From: ${options.from}`,
    `To: ${toHeader}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(options.subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    // Plain text version (strip HTML tags)
    htmlBody.replace(/<[^>]+>/g, '').substring(0, 1000),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  return messageParts.join('\r\n');
}

/**
 * Sends an email via Gmail API.
 */
async function sendViaGmail(
  accessToken: string,
  mimeMessage: string
): Promise<{ messageId: string; threadId: string }> {
  // URL-safe base64 encoding
  const encodedMessage = btoa(unescape(encodeURIComponent(mimeMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gmail API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    return {
      messageId: result.id,
      threadId: result.threadId,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Processes a single campaign, sending emails with throttling.
 */
async function processCampaign(
  campaign: Campaign,
  supabase: ReturnType<typeof createClient>,
  appUrl: string
): Promise<ProcessResult> {
  const result: ProcessResult = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    emailsSent: 0,
    emailsFailed: 0,
    completed: false,
  };

  logInfo('Processing campaign', {
    campaignId: campaign.id.substring(0, 8),
    name: campaign.name,
    sent: campaign.sent_count,
    total: campaign.total_recipients,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch campaign dependencies
  // ─────────────────────────────────────────────────────────────────────────────

  // Get Gmail account
  const { data: account, error: accountError } = await supabase
    .from('gmail_accounts')
    .select('id, email, access_token, refresh_token, token_expires_at, has_send_scope')
    .eq('id', campaign.gmail_account_id)
    .single();

  if (accountError || !account) {
    logError('Failed to fetch Gmail account', accountError);
    return result;
  }

  if (!account.has_send_scope) {
    logWarn('Gmail account missing send scope', { accountId: account.id.substring(0, 8) });
    return result;
  }

  // Get template
  const { data: template, error: templateError } = await supabase
    .from('email_templates')
    .select('id, subject, body_html')
    .eq('id', campaign.template_id)
    .single();

  if (templateError || !template) {
    logError('Failed to fetch template', templateError);
    return result;
  }

  // Get pending recipients (limited)
  const { data: recipients, error: recipientsError } = await supabase
    .from('email_campaign_recipients')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(MAX_EMAILS_PER_CAMPAIGN);

  if (recipientsError) {
    logError('Failed to fetch recipients', recipientsError);
    return result;
  }

  if (!recipients || recipients.length === 0) {
    logInfo('No pending recipients', { campaignId: campaign.id.substring(0, 8) });

    // Check if campaign is complete
    const { count: pendingCount } = await supabase
      .from('email_campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending');

    if (pendingCount === 0) {
      // Mark campaign as completed
      await supabase
        .from('email_campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);

      result.completed = true;
      logInfo('Campaign completed', { campaignId: campaign.id.substring(0, 8) });
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Refresh token if needed
  // ─────────────────────────────────────────────────────────────────────────────

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(account as GmailAccount, supabase);
  } catch (error) {
    logError('Token refresh failed', error);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Check daily quota
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: quotaData } = await supabase.rpc('get_remaining_quota', {
    p_user_id: campaign.user_id,
  });

  const remainingQuota = quotaData ?? 0;

  if (remainingQuota <= 0) {
    logWarn('Daily quota exhausted', {
      userId: campaign.user_id.substring(0, 8),
      campaignId: campaign.id.substring(0, 8),
    });
    return result;
  }

  // Limit to remaining quota
  const recipientsToProcess = recipients.slice(0, Math.min(recipients.length, remainingQuota));

  // ─────────────────────────────────────────────────────────────────────────────
  // Send emails with throttling
  // ─────────────────────────────────────────────────────────────────────────────

  for (let i = 0; i < recipientsToProcess.length; i++) {
    const recipient = recipientsToProcess[i] as CampaignRecipient;

    // Apply throttle delay (except for first email)
    if (i > 0) {
      logInfo('Throttling before next email', { delayMs: THROTTLE_DELAY_MS });
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_DELAY_MS));
    }

    try {
      // Merge template with recipient data
      const mergeData = {
        first_name: recipient.name?.split(' ')[0] || '',
        name: recipient.name || '',
        email: recipient.email,
        ...recipient.merge_data,
      };

      const subject = applyMergeFields(template.subject, mergeData);
      const bodyHtml = applyMergeFields(template.body_html, mergeData);

      // Create outbound email record
      const { data: outboundEmail, error: createError } = await supabase
        .from('outbound_emails')
        .insert({
          user_id: campaign.user_id,
          gmail_account_id: campaign.gmail_account_id,
          campaign_id: campaign.id,
          to_email: recipient.email,
          to_name: recipient.name,
          subject,
          body_html: bodyHtml,
          status: 'queued',
          tracking_enabled: campaign.tracking_enabled,
        })
        .select('id')
        .single();

      if (createError || !outboundEmail) {
        throw new Error(`Failed to create outbound email: ${createError?.message}`);
      }

      // Build and send email
      const trackingId = campaign.tracking_enabled ? outboundEmail.id : undefined;
      const mimeMessage = buildMimeMessage({
        to: recipient.email,
        toName: recipient.name || undefined,
        from: account.email,
        subject,
        htmlBody: bodyHtml,
        trackingId,
        trackingBaseUrl: appUrl,
      });

      const { messageId, threadId } = await sendViaGmail(accessToken, mimeMessage);

      // Update outbound email with success
      await supabase
        .from('outbound_emails')
        .update({
          status: 'sent',
          gmail_message_id: messageId,
          gmail_thread_id: threadId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', outboundEmail.id);

      // Update recipient status
      await supabase
        .from('email_campaign_recipients')
        .update({
          status: 'sent',
          outbound_email_id: outboundEmail.id,
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipient.id);

      // Increment quota
      await supabase.rpc('increment_send_count', { p_user_id: campaign.user_id });

      result.emailsSent++;

      logInfo('Campaign email sent', {
        campaignId: campaign.id.substring(0, 8),
        recipientEmail: recipient.email,
        messageId: messageId.substring(0, 12),
      });
    } catch (error) {
      result.emailsFailed++;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('Failed to send campaign email', {
        campaignId: campaign.id.substring(0, 8),
        recipient: recipient.email,
        error: errorMessage,
      });

      // Update recipient with failure
      await supabase
        .from('email_campaign_recipients')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: recipient.retry_count + 1,
        })
        .eq('id', recipient.id);

      // Reset status to pending if retries remaining
      if (recipient.retry_count + 1 < MAX_RETRIES) {
        await supabase
          .from('email_campaign_recipients')
          .update({ status: 'pending' })
          .eq('id', recipient.id);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update campaign stats
  // ─────────────────────────────────────────────────────────────────────────────

  const { error: updateError } = await supabase
    .from('email_campaigns')
    .update({
      sent_count: campaign.sent_count + result.emailsSent,
      failed_count: campaign.failed_count + result.emailsFailed,
      last_sent_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  if (updateError) {
    logWarn('Failed to update campaign stats', { error: updateError.message });
  }

  logInfo('Campaign batch processed', {
    campaignId: campaign.id.substring(0, 8),
    sent: result.emailsSent,
    failed: result.emailsFailed,
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  const startTime = Date.now();
  logInfo('Campaign processor invoked');

  // ─────────────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    logError('Missing or invalid authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialize Supabase client
  // ─────────────────────────────────────────────────────────────────────────────

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL') || 'https://ideabox.app';

  if (!supabaseUrl || !supabaseKey) {
    logError('Missing Supabase environment variables');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch active campaigns
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: campaigns, error: campaignsError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (campaignsError) {
    logError('Failed to fetch campaigns', campaignsError);
    return new Response(JSON.stringify({ error: 'Failed to fetch campaigns' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!campaigns || campaigns.length === 0) {
    logInfo('No active campaigns to process');
    return new Response(
      JSON.stringify({
        success: true,
        message: 'No active campaigns',
        processed: 0,
        duration: Date.now() - startTime,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  logInfo('Found active campaigns', { count: campaigns.length });

  // ─────────────────────────────────────────────────────────────────────────────
  // Process campaigns sequentially (to respect throttling per campaign)
  // ─────────────────────────────────────────────────────────────────────────────

  const results: ProcessResult[] = [];

  for (const campaign of campaigns) {
    try {
      const result = await processCampaign(campaign as Campaign, supabase, appUrl);
      results.push(result);
    } catch (error) {
      logError('Unexpected error processing campaign', {
        campaignId: campaign.id,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        emailsSent: 0,
        emailsFailed: 0,
        completed: false,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return results
  // ─────────────────────────────────────────────────────────────────────────────

  const totalSent = results.reduce((sum, r) => sum + r.emailsSent, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.emailsFailed, 0);
  const completedCampaigns = results.filter((r) => r.completed).length;
  const duration = Date.now() - startTime;

  logInfo('Campaign processor completed', {
    campaignsProcessed: campaigns.length,
    totalSent,
    totalFailed,
    completedCampaigns,
    durationMs: duration,
  });

  return new Response(
    JSON.stringify({
      success: true,
      campaignsProcessed: campaigns.length,
      totalEmailsSent: totalSent,
      totalEmailsFailed: totalFailed,
      completedCampaigns,
      results,
      duration,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
