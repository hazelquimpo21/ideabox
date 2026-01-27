/**
 * Email Sending API Route
 *
 * Handles sending emails directly through users' Gmail accounts.
 * Supports immediate sending and scheduled sending.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/emails/send
 *   - Send email immediately or schedule for later
 *   - Supports replies (with threading)
 *   - Supports tracking pixel injection
 *   - Respects daily quota (400 emails/day)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUEST BODY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "accountId": "gmail-account-uuid",
 *   "to": "recipient@example.com",
 *   "toName": "John Doe",
 *   "subject": "Hello",
 *   "bodyHtml": "<p>Email content</p>",
 *   "bodyText": "Email content (optional)",
 *   "cc": ["cc@example.com"],
 *   "bcc": ["bcc@example.com"],
 *   "replyTo": "reply@example.com",
 *   "scheduledAt": "2026-01-27T10:00:00Z",
 *   "inReplyTo": "<message-id@mail.gmail.com>",
 *   "threadId": "gmail-thread-id",
 *   "trackingEnabled": true,
 *   "followUp": {
 *     "enabled": true,
 *     "condition": "no_reply",
 *     "delayHours": 48
 *   }
 * }
 * ```
 *
 * @module app/api/emails/send/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import {
  GmailSendService,
  createGmailSendService,
} from '@/lib/gmail/gmail-send-service';
import { TokenManager, createTokenManager } from '@/lib/gmail/token-manager';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailSendAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Follow-up configuration schema.
 */
const followUpSchema = z.object({
  enabled: z.boolean(),
  condition: z.enum(['no_open', 'no_reply', 'both']).optional(),
  delayHours: z.number().min(1).max(168).optional(), // 1 hour to 7 days
}).optional();

/**
 * Send email request body schema.
 */
const sendEmailSchema = z.object({
  // Required: Gmail account to send from
  accountId: z.string().uuid(),

  // Required: Recipient
  to: z.string().email(),
  toName: z.string().optional(),

  // Required: Content
  subject: z.string().min(1).max(998), // RFC 2822 limit
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),

  // Optional: Additional recipients
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  replyTo: z.string().email().optional(),

  // Optional: Scheduling
  scheduledAt: z.string().datetime().optional(),

  // Optional: Threading (for replies)
  inReplyTo: z.string().optional(),
  threadId: z.string().optional(),
  references: z.string().optional(),

  // Optional: Tracking
  trackingEnabled: z.boolean().default(true),

  // Optional: Template reference
  templateId: z.string().uuid().optional(),

  // Optional: Follow-up
  followUp: followUpSchema,
});

type SendEmailRequest = z.infer<typeof sendEmailSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/emails/send
 *
 * Sends an email immediately or schedules it for later.
 */
export async function POST(request: NextRequest) {
  logger.start('Processing send email request');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    logger.debug('User authenticated', { userId: user.id.substring(0, 8) });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────

    let body: SendEmailRequest;
    try {
      const rawBody = await request.json();
      body = sendEmailSchema.parse(rawBody);
    } catch (error) {
      logger.warn('Invalid request body', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    logger.info('Send request validated', {
      userId: user.id.substring(0, 8),
      to: body.to,
      hasSchedule: !!body.scheduledAt,
      isReply: !!body.inReplyTo,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Verify Gmail account belongs to user and has send scope
    // ─────────────────────────────────────────────────────────────────────────

    const { data: account, error: accountError } = await supabase
      .from('gmail_accounts')
      .select('id, email, access_token, refresh_token, token_expiry, has_send_scope')
      .eq('id', body.accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      logger.warn('Gmail account not found or not owned by user', {
        userId: user.id.substring(0, 8),
        accountId: body.accountId.substring(0, 8),
      });
      return createApiError('Gmail account not found', 404, 'ACCOUNT_NOT_FOUND');
    }

    // Check if send scope is granted
    if (!account.has_send_scope) {
      logger.info('Send scope not granted, user needs to authorize', {
        userId: user.id.substring(0, 8),
        accountId: body.accountId.substring(0, 8),
      });
      return createApiError(
        'Send permission not granted. Please authorize email sending.',
        403,
        'SEND_SCOPE_REQUIRED'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Check daily send quota
    // ─────────────────────────────────────────────────────────────────────────

    const { data: canSend } = await supabase.rpc('can_send_email', {
      p_user_id: user.id,
    });

    if (!canSend) {
      logger.warn('Daily send quota exceeded', {
        userId: user.id.substring(0, 8),
      });
      return createApiError(
        'Daily email limit reached (400 emails). Try again tomorrow.',
        429,
        'QUOTA_EXCEEDED'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Create outbound email record
    // ─────────────────────────────────────────────────────────────────────────

    const isScheduled = !!body.scheduledAt;
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    // If scheduled time is in the past, send immediately
    const shouldSendNow = !scheduledAt || scheduledAt <= new Date();

    const { data: outboundEmail, error: insertError } = await supabase
      .from('outbound_emails')
      .insert({
        user_id: user.id,
        gmail_account_id: body.accountId,
        to_email: body.to,
        to_name: body.toName || null,
        cc_emails: body.cc || null,
        bcc_emails: body.bcc || null,
        reply_to: body.replyTo || null,
        subject: body.subject,
        body_html: body.bodyHtml,
        body_text: body.bodyText || null,
        in_reply_to: body.inReplyTo || null,
        references_header: body.references || null,
        status: shouldSendNow ? 'queued' : 'scheduled',
        scheduled_at: scheduledAt?.toISOString() || null,
        tracking_enabled: body.trackingEnabled,
        template_id: body.templateId || null,
        follow_up_enabled: body.followUp?.enabled || false,
        follow_up_condition: body.followUp?.condition || null,
        follow_up_delay_hours: body.followUp?.delayHours || 48,
      })
      .select('id, tracking_id')
      .single();

    if (insertError || !outboundEmail) {
      logger.error('Failed to create outbound email record', {
        error: insertError?.message,
      });
      return createApiError('Failed to queue email', 500, 'DATABASE_ERROR');
    }

    logger.info('Created outbound email record', {
      emailId: outboundEmail.id.substring(0, 8),
      status: shouldSendNow ? 'queued' : 'scheduled',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: If immediate send, send now
    // ─────────────────────────────────────────────────────────────────────────

    if (shouldSendNow) {
      try {
        // Get valid access token
        const tokenManager = createTokenManager(supabase);
        const accessToken = await tokenManager.getValidToken(account as Parameters<typeof tokenManager.getValidToken>[0]);

        // Create send service
        const sendService = createGmailSendService(accessToken, body.accountId);

        // Send the email
        const sendResult = await sendService.sendEmail({
          to: body.to,
          toName: body.toName,
          subject: body.subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          cc: body.cc,
          bcc: body.bcc,
          replyTo: body.replyTo,
          inReplyTo: body.inReplyTo,
          references: body.references,
          threadId: body.threadId,
          trackingId: body.trackingEnabled ? outboundEmail.tracking_id : undefined,
          enableTracking: body.trackingEnabled,
        });

        if (!sendResult.success) {
          // Update outbound email with error
          await supabase
            .from('outbound_emails')
            .update({
              status: 'failed',
              error_message: sendResult.error,
              error_code: sendResult.errorCode,
            })
            .eq('id', outboundEmail.id);

          logger.error('Failed to send email', {
            emailId: outboundEmail.id.substring(0, 8),
            error: sendResult.error,
            errorCode: sendResult.errorCode,
          });

          return createApiError(
            sendResult.error || 'Failed to send email',
            500,
            sendResult.errorCode || 'SEND_FAILED'
          );
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
          .eq('id', outboundEmail.id);

        // Increment send quota
        await supabase.rpc('increment_send_count', { p_user_id: user.id });

        // Increment template usage if applicable
        if (body.templateId) {
          await supabase.rpc('increment_template_usage', {
            p_template_id: body.templateId,
          });
        }

        logger.success('Email sent successfully', {
          emailId: outboundEmail.id.substring(0, 8),
          gmailMessageId: sendResult.messageId,
          to: body.to,
        });

        return createApiSuccess({
          id: outboundEmail.id,
          status: 'sent',
          messageId: sendResult.messageId,
          threadId: sendResult.threadId,
        });
      } catch (sendError) {
        // Update outbound email with error
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';

        await supabase
          .from('outbound_emails')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: 1,
            last_retry_at: new Date().toISOString(),
          })
          .eq('id', outboundEmail.id);

        logger.error('Exception during email send', {
          emailId: outboundEmail.id.substring(0, 8),
          error: errorMessage,
        });

        return createApiError(errorMessage, 500, 'SEND_EXCEPTION');
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Return scheduled email response
    // ─────────────────────────────────────────────────────────────────────────

    logger.success('Email scheduled', {
      emailId: outboundEmail.id.substring(0, 8),
      scheduledAt: scheduledAt?.toISOString(),
    });

    return createApiSuccess({
      id: outboundEmail.id,
      status: 'scheduled',
      scheduledAt: scheduledAt?.toISOString(),
    });
  } catch (error) {
    logger.error('Unexpected error in send email API', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
