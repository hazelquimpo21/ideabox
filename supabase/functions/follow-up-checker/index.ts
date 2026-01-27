/**
 * Follow-Up Checker Edge Function
 *
 * Checks for emails that meet follow-up conditions and creates automated
 * follow-up emails based on user-defined rules.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INVOCATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This function should be invoked by pg_cron every hour:
 *
 * ```sql
 * SELECT cron.schedule(
 *   'check-follow-ups',
 *   '0 * * * *',  -- Every hour at minute 0
 *   $$SELECT net.http_post(
 *     url := 'https://your-project.supabase.co/functions/v1/follow-up-checker',
 *     headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
 *   )$$
 * );
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FOLLOW-UP CONDITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Supported conditions:
 * - `no_reply`: Email was opened but no reply received (within delay days)
 * - `no_open`: Email was not opened (within delay days)
 * - `always`: Always send follow-up after delay days (regardless of open/reply)
 *
 * @module supabase/functions/follow-up-checker
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum follow-up emails to process per invocation.
 */
const MAX_FOLLOW_UPS_PER_RUN = 50;

/**
 * Timeout for sending a single follow-up email (milliseconds).
 */
const SEND_TIMEOUT_MS = 30000;

/**
 * Delay between follow-up emails to avoid rate limiting (milliseconds).
 */
const SEND_DELAY_MS = 2000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type FollowUpCondition = 'no_reply' | 'no_open' | 'always';

interface OutboundEmail {
  id: string;
  user_id: string;
  gmail_account_id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string;
  status: 'sent' | 'scheduled' | 'draft' | 'failed' | 'queued';
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  sent_at: string | null;
  open_count: number;
  has_reply: boolean;
  tracking_enabled: boolean;
  follow_up_enabled: boolean;
  follow_up_condition: FollowUpCondition | null;
  follow_up_delay_days: number | null;
  follow_up_template_id: string | null;
  follow_up_sent: boolean;
  follow_up_sent_at: string | null;
}

interface GmailAccount {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  has_send_scope: boolean;
}

interface Template {
  id: string;
  subject: string;
  body_html: string;
}

interface FollowUpCandidate {
  email: OutboundEmail;
  reason: string;
}

interface ProcessResult {
  emailId: string;
  toEmail: string;
  success: boolean;
  followUpEmailId?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[FollowUpChecker]';

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
  await supabase
    .from('gmail_accounts')
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', account.id);

  return tokens.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SENDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds RFC 2822 MIME message for a follow-up reply.
 */
function buildFollowUpMimeMessage(options: {
  to: string;
  toName?: string;
  from: string;
  subject: string;
  htmlBody: string;
  inReplyTo: string;
  references: string;
  trackingId?: string;
  trackingBaseUrl?: string;
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const toHeader = options.toName
    ? `"${options.toName.replace(/"/g, '\\"')}" <${options.to}>`
    : options.to;

  // Ensure subject has "Re:" prefix for replies
  const subject = options.subject.startsWith('Re:')
    ? options.subject
    : `Re: ${options.subject}`;

  // Inject tracking pixel if enabled
  let htmlBody = options.htmlBody;
  if (options.trackingId && options.trackingBaseUrl) {
    const trackingPixel = `<img src="${options.trackingBaseUrl}/api/tracking/open/${options.trackingId}" width="1" height="1" style="display:none" alt="" />`;
    htmlBody = htmlBody.replace('</body>', `${trackingPixel}</body>`);
    if (!htmlBody.includes(trackingPixel)) {
      htmlBody += trackingPixel;
    }
  }

  const messageParts = [
    `From: ${options.from}`,
    `To: ${toHeader}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `In-Reply-To: ${options.inReplyTo}`,
    `References: ${options.references}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
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
 * Sends a follow-up email as a reply to the original thread.
 */
async function sendFollowUp(
  accessToken: string,
  mimeMessage: string,
  threadId: string
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
      body: JSON.stringify({
        raw: encodedMessage,
        threadId, // Keeps in same thread
      }),
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
// FOLLOW-UP LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if an email meets its follow-up condition.
 */
function checkFollowUpCondition(email: OutboundEmail): { shouldFollow: boolean; reason: string } {
  if (!email.sent_at) {
    return { shouldFollow: false, reason: 'Email not sent yet' };
  }

  const sentAt = new Date(email.sent_at);
  const now = new Date();
  const daysSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
  const delayDays = email.follow_up_delay_days || 3;

  // Check if enough time has passed
  if (daysSinceSent < delayDays) {
    return {
      shouldFollow: false,
      reason: `Only ${daysSinceSent.toFixed(1)} days since sent (need ${delayDays})`,
    };
  }

  const condition = email.follow_up_condition || 'no_reply';

  switch (condition) {
    case 'no_reply':
      // Follow up if opened but no reply
      if (email.has_reply) {
        return { shouldFollow: false, reason: 'Already has reply' };
      }
      if (email.open_count === 0 && email.tracking_enabled) {
        return { shouldFollow: false, reason: 'Not opened yet (waiting for open)' };
      }
      return { shouldFollow: true, reason: 'Opened but no reply' };

    case 'no_open':
      // Follow up if not opened
      if (email.open_count > 0) {
        return { shouldFollow: false, reason: 'Already opened' };
      }
      if (email.has_reply) {
        return { shouldFollow: false, reason: 'Already has reply' };
      }
      return { shouldFollow: true, reason: 'Not opened after delay' };

    case 'always':
      // Always follow up after delay (unless already replied)
      if (email.has_reply) {
        return { shouldFollow: false, reason: 'Already has reply' };
      }
      return { shouldFollow: true, reason: 'Scheduled follow-up' };

    default:
      return { shouldFollow: false, reason: `Unknown condition: ${condition}` };
  }
}

/**
 * Generates follow-up email content.
 * Uses template if specified, otherwise generates a gentle nudge.
 */
async function getFollowUpContent(
  email: OutboundEmail,
  template: Template | null
): Promise<{ subject: string; bodyHtml: string }> {
  if (template) {
    // Apply basic merge fields from original email
    const mergeData: Record<string, string> = {
      first_name: email.to_name?.split(' ')[0] || '',
      name: email.to_name || '',
      email: email.to_email,
      original_subject: email.subject,
    };

    let subject = template.subject;
    let bodyHtml = template.body_html;

    Object.entries(mergeData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      bodyHtml = bodyHtml.replace(regex, value);
    });

    return { subject, bodyHtml };
  }

  // Default follow-up content
  const firstName = email.to_name?.split(' ')[0] || 'there';
  return {
    subject: email.subject, // Keep original subject for thread
    bodyHtml: `
      <p>Hi ${firstName},</p>
      <p>I wanted to follow up on my previous email. Did you have a chance to review it?</p>
      <p>Let me know if you have any questions or would like to discuss further.</p>
      <p>Best regards</p>
    `,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

async function processFollowUps(
  supabase: ReturnType<typeof createClient>,
  appUrl: string
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch emails eligible for follow-up
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: emails, error: fetchError } = await supabase
    .from('outbound_emails')
    .select(`
      *,
      gmail_accounts!inner (
        id,
        email,
        access_token,
        refresh_token,
        token_expires_at,
        has_send_scope
      )
    `)
    .eq('status', 'sent')
    .eq('follow_up_enabled', true)
    .eq('follow_up_sent', false)
    .order('sent_at', { ascending: true })
    .limit(MAX_FOLLOW_UPS_PER_RUN);

  if (fetchError) {
    logError('Failed to fetch emails for follow-up', fetchError);
    return results;
  }

  if (!emails || emails.length === 0) {
    logInfo('No emails eligible for follow-up check');
    return results;
  }

  logInfo('Checking emails for follow-up', { count: emails.length });

  // ─────────────────────────────────────────────────────────────────────────────
  // Evaluate each email against its follow-up condition
  // ─────────────────────────────────────────────────────────────────────────────

  const candidates: FollowUpCandidate[] = [];

  for (const emailRow of emails) {
    const email = emailRow as OutboundEmail & { gmail_accounts: GmailAccount };
    const { shouldFollow, reason } = checkFollowUpCondition(email);

    if (shouldFollow) {
      candidates.push({ email, reason });
      logInfo('Email qualifies for follow-up', {
        emailId: email.id.substring(0, 8),
        toEmail: email.to_email,
        reason,
      });
    } else {
      logInfo('Email does not qualify for follow-up', {
        emailId: email.id.substring(0, 8),
        reason,
      });
    }
  }

  if (candidates.length === 0) {
    logInfo('No emails met follow-up conditions');
    return results;
  }

  logInfo('Processing follow-up candidates', { count: candidates.length });

  // ─────────────────────────────────────────────────────────────────────────────
  // Send follow-up emails
  // ─────────────────────────────────────────────────────────────────────────────

  // Group by Gmail account for token efficiency
  const accountTokens = new Map<string, string>();

  for (let i = 0; i < candidates.length; i++) {
    const { email, reason } = candidates[i];
    const account = (email as unknown as { gmail_accounts: GmailAccount }).gmail_accounts;

    // Add delay between sends
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }

    try {
      // Check quota
      const { data: quotaData } = await supabase.rpc('get_remaining_quota', {
        p_user_id: email.user_id,
      });

      if ((quotaData ?? 0) <= 0) {
        logWarn('Daily quota exhausted for user', { userId: email.user_id.substring(0, 8) });
        results.push({
          emailId: email.id,
          toEmail: email.to_email,
          success: false,
          error: 'Daily quota exhausted',
        });
        continue;
      }

      // Ensure fresh token
      let accessToken = accountTokens.get(account.id);
      if (!accessToken) {
        accessToken = await ensureFreshToken(account, supabase);
        accountTokens.set(account.id, accessToken);
      }

      // Get follow-up template if specified
      let template: Template | null = null;
      if (email.follow_up_template_id) {
        const { data: templateData } = await supabase
          .from('email_templates')
          .select('id, subject, body_html')
          .eq('id', email.follow_up_template_id)
          .single();
        template = templateData as Template | null;
      }

      // Generate follow-up content
      const { subject, bodyHtml } = await getFollowUpContent(email, template);

      // Create follow-up outbound email record
      const { data: followUpEmail, error: createError } = await supabase
        .from('outbound_emails')
        .insert({
          user_id: email.user_id,
          gmail_account_id: email.gmail_account_id,
          parent_email_id: email.id,
          to_email: email.to_email,
          to_name: email.to_name,
          subject,
          body_html: bodyHtml,
          status: 'queued',
          tracking_enabled: email.tracking_enabled,
          is_follow_up: true,
        })
        .select('id')
        .single();

      if (createError || !followUpEmail) {
        throw new Error(`Failed to create follow-up record: ${createError?.message}`);
      }

      // Build and send follow-up email
      const trackingId = email.tracking_enabled ? followUpEmail.id : undefined;

      if (!email.gmail_message_id || !email.gmail_thread_id) {
        throw new Error('Original email missing Gmail IDs for threading');
      }

      const mimeMessage = buildFollowUpMimeMessage({
        to: email.to_email,
        toName: email.to_name || undefined,
        from: account.email,
        subject,
        htmlBody: bodyHtml,
        inReplyTo: `<${email.gmail_message_id}@mail.gmail.com>`,
        references: `<${email.gmail_message_id}@mail.gmail.com>`,
        trackingId,
        trackingBaseUrl: appUrl,
      });

      const { messageId, threadId } = await sendFollowUp(
        accessToken,
        mimeMessage,
        email.gmail_thread_id
      );

      // Update follow-up email record
      await supabase
        .from('outbound_emails')
        .update({
          status: 'sent',
          gmail_message_id: messageId,
          gmail_thread_id: threadId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', followUpEmail.id);

      // Mark original email as follow-up sent
      await supabase
        .from('outbound_emails')
        .update({
          follow_up_sent: true,
          follow_up_sent_at: new Date().toISOString(),
        })
        .eq('id', email.id);

      // Increment quota
      await supabase.rpc('increment_send_count', { p_user_id: email.user_id });

      results.push({
        emailId: email.id,
        toEmail: email.to_email,
        success: true,
        followUpEmailId: followUpEmail.id,
      });

      logInfo('Follow-up sent successfully', {
        originalEmailId: email.id.substring(0, 8),
        followUpEmailId: followUpEmail.id.substring(0, 8),
        toEmail: email.to_email,
        reason,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      results.push({
        emailId: email.id,
        toEmail: email.to_email,
        success: false,
        error: errorMessage,
      });

      logError('Failed to send follow-up', {
        emailId: email.id.substring(0, 8),
        error: errorMessage,
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  const startTime = Date.now();
  logInfo('Follow-up checker invoked');

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
  // Process follow-ups
  // ─────────────────────────────────────────────────────────────────────────────

  const results = await processFollowUps(supabase, appUrl);

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;
  const duration = Date.now() - startTime;

  logInfo('Follow-up checker completed', {
    checked: results.length,
    sent: successCount,
    failed: failureCount,
    durationMs: duration,
  });

  return new Response(
    JSON.stringify({
      success: true,
      followUpsSent: successCount,
      followUpsFailed: failureCount,
      results,
      duration,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
