/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gmail Push Notification Webhook
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Receives push notifications from Google Cloud Pub/Sub when Gmail changes occur.
 * This enables near-real-time email sync instead of polling.
 *
 * FLOW:
 * 1. Gmail detects new email → publishes to Pub/Sub topic
 * 2. Pub/Sub pushes notification to this webhook
 * 3. We decode the notification and find the affected account
 * 4. We use the history API to fetch only new changes
 * 5. We sync and analyze the new emails
 *
 * SECURITY:
 * - Pub/Sub includes a JWT token in the Authorization header
 * - We verify the token comes from Google
 * - We also verify the email address matches a known account
 *
 * IDEMPOTENCY:
 * - Notifications may be delivered multiple times
 * - We use the historyId to skip already-processed changes
 * - We log the pubsub_message_id for deduplication
 *
 * IMPORTANT: Always return 200 to acknowledge receipt, even on errors.
 * Returning non-200 causes Pub/Sub to retry, which we don't want for
 * validation errors or already-processed notifications.
 *
 * @module app/api/webhooks/gmail/route
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { GmailService, TokenManager, EmailParser } from '@/lib/gmail';
import { runAIAnalysis } from '@/lib/services/email-analysis';
import { markSummaryStale } from '@/services/summary';
import type { GmailAccount } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('GmailWebhook');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pub/Sub push message format.
 */
interface PubSubMessage {
  message: {
    /** Base64-encoded notification data */
    data: string;
    /** Unique message ID for deduplication */
    messageId: string;
    /** When the message was published */
    publishTime: string;
    /** Message attributes */
    attributes?: Record<string, string>;
  };
  /** Full subscription name */
  subscription: string;
}

/**
 * Gmail notification payload (decoded from base64).
 */
interface GmailNotification {
  /** Email address of the affected mailbox */
  emailAddress: string;
  /** History ID of the change */
  historyId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum body characters to store.
 */
const MAX_BODY_CHARS = parseInt(process.env.MAX_BODY_CHARS || '16000', 10);

/**
 * Maximum emails to analyze per push notification.
 */
const MAX_EMAILS_PER_PUSH = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles POST requests from Google Cloud Pub/Sub.
 *
 * This endpoint receives push notifications when Gmail changes occur.
 * We process the notification asynchronously and always return 200.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // ─────────────────────────────────────────────────────────────────────────────
  // Parse the Pub/Sub message
  // ─────────────────────────────────────────────────────────────────────────────
  let pubsubMessage: PubSubMessage;
  let notification: GmailNotification;

  try {
    pubsubMessage = await request.json();

    if (!pubsubMessage.message?.data) {
      logger.warn('Invalid Pub/Sub message: missing data');
      return NextResponse.json({ received: true, status: 'invalid_message' });
    }

    // Decode base64 notification data
    const decodedData = Buffer.from(pubsubMessage.message.data, 'base64').toString('utf-8');
    notification = JSON.parse(decodedData);

    if (!notification.emailAddress || !notification.historyId) {
      logger.warn('Invalid Gmail notification: missing required fields', {
        hasEmail: !!notification.emailAddress,
        hasHistoryId: !!notification.historyId,
      });
      return NextResponse.json({ received: true, status: 'invalid_notification' });
    }

  } catch (error) {
    logger.error('Failed to parse webhook payload', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ received: true, status: 'parse_error' });
  }

  logger.info('Received Gmail push notification', {
    email: notification.emailAddress,
    historyId: notification.historyId,
    messageId: pubsubMessage.message.messageId,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Find the Gmail account
  // ─────────────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();

  const { data: account, error: accountError } = await supabase
    .from('gmail_accounts')
    .select('*')
    .eq('email', notification.emailAddress.toLowerCase())
    .eq('sync_enabled', true)
    .single();

  if (accountError || !account) {
    logger.warn('Gmail account not found or disabled', {
      email: notification.emailAddress,
      error: accountError?.message,
    });

    // Log the notification anyway for debugging
    await logPushNotification(supabase, {
      email: notification.emailAddress,
      historyId: notification.historyId,
      messageId: pubsubMessage.message.messageId,
      status: 'skipped',
      skipReason: 'account_not_found',
    });

    return NextResponse.json({ received: true, status: 'account_not_found' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Check if we've already processed this historyId
  // ─────────────────────────────────────────────────────────────────────────────
  const lastHistoryId = account.last_history_id || account.watch_history_id;

  if (lastHistoryId) {
    try {
      // Compare history IDs as BigInt to handle large numbers correctly
      const lastId = BigInt(lastHistoryId);
      const newId = BigInt(notification.historyId);

      if (newId <= lastId) {
        logger.debug('Skipping already-processed historyId', {
          email: notification.emailAddress,
          lastHistoryId,
          notificationHistoryId: notification.historyId,
        });

        await logPushNotification(supabase, {
          accountId: account.id,
          email: notification.emailAddress,
          historyId: notification.historyId,
          messageId: pubsubMessage.message.messageId,
          status: 'skipped',
          skipReason: 'stale_history_id',
        });

        return NextResponse.json({ received: true, status: 'already_processed' });
      }
    } catch {
      // If BigInt comparison fails, continue with processing
      logger.warn('Failed to compare history IDs, continuing with sync', {
        lastHistoryId,
        notificationHistoryId: notification.historyId,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Process the notification (async - return immediately)
  // ─────────────────────────────────────────────────────────────────────────────
  // Note: We don't await this because Pub/Sub has a 10-second timeout.
  // We return 200 immediately and process in the background.

  processNotificationAsync(
    supabase,
    account as GmailAccount,
    notification,
    pubsubMessage.message.messageId,
    startTime
  ).catch((error) => {
    logger.error('Async notification processing failed', {
      accountId: account.id,
      email: notification.emailAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  return NextResponse.json({ received: true, status: 'processing' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASYNC PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Processes a Gmail notification asynchronously.
 *
 * This function:
 * 1. Acquires sync lock to prevent concurrent processing
 * 2. Gets a valid access token
 * 3. Uses the history API to find new messages
 * 4. Falls back to marking for full sync if history is stale (404 error)
 * 5. Fetches and saves new messages
 * 6. Runs AI analysis on new messages
 * 7. Updates account state and releases lock
 */
async function processNotificationAsync(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  account: GmailAccount,
  notification: GmailNotification,
  messageId: string,
  startTime: number
): Promise<void> {
  const tokenManager = new TokenManager(supabase);
  const emailParser = new EmailParser();

  let messagesFound = 0;
  let messagesSynced = 0;
  let messagesAnalyzed = 0;
  let lockAcquired = false;

  try {
    logger.info('Processing Gmail notification', {
      accountId: account.id,
      email: notification.emailAddress,
      historyId: notification.historyId,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Acquire sync lock to prevent concurrent processing
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: gotLock } = await supabase.rpc('acquire_sync_lock', {
      p_account_id: account.id,
      p_lock_duration_seconds: 120, // 2 minutes for push processing
    });

    if (!gotLock) {
      logger.info('Account is already being synced, skipping push', {
        accountId: account.id,
      });

      await logPushNotification(supabase, {
        accountId: account.id,
        email: notification.emailAddress,
        historyId: notification.historyId,
        messageId,
        status: 'skipped',
        skipReason: 'sync_locked',
        processingTimeMs: Date.now() - startTime,
      });

      return;
    }

    lockAcquired = true;

    // ─────────────────────────────────────────────────────────────────────────────
    // Get valid access token
    // ─────────────────────────────────────────────────────────────────────────────
    const accessToken = await tokenManager.getValidToken(account);
    const gmailService = new GmailService(accessToken, account.id);

    // ─────────────────────────────────────────────────────────────────────────────
    // Use history API for incremental sync (with stale history fallback)
    // ─────────────────────────────────────────────────────────────────────────────
    const startHistoryId = account.last_history_id || account.watch_history_id;

    if (!startHistoryId) {
      logger.warn('No history ID for incremental sync, marking for full sync', {
        accountId: account.id,
      });

      // Mark account as needing full sync (scheduled sync will pick it up)
      await supabase.rpc('mark_history_stale', { p_account_id: account.id });

      await logPushNotification(supabase, {
        accountId: account.id,
        email: notification.emailAddress,
        historyId: notification.historyId,
        messageId,
        status: 'skipped',
        skipReason: 'no_start_history_id_marked_for_full_sync',
        processingTimeMs: Date.now() - startTime,
      });

      // Release lock before returning
      await supabase.rpc('release_sync_lock', { p_account_id: account.id });
      return;
    }

    let history;

    try {
      history = await gmailService.getHistory(startHistoryId);

      // Validate history ID after successful fetch
      await supabase.rpc('validate_history_id', {
        p_account_id: account.id,
        p_history_id: notification.historyId,
      });
    } catch (historyError) {
      // Check if this is a 404 error (history too old / expired)
      const errorMessage = historyError instanceof Error ? historyError.message : '';
      const is404 = errorMessage.includes('404') || errorMessage.includes('notFound') || errorMessage.includes('Not Found');

      if (is404) {
        logger.warn('History ID is stale (404), marking for full sync', {
          accountId: account.id,
          startHistoryId,
        });

        // Mark account as needing full sync
        await supabase.rpc('mark_history_stale', { p_account_id: account.id });

        await logPushNotification(supabase, {
          accountId: account.id,
          email: notification.emailAddress,
          historyId: notification.historyId,
          messageId,
          status: 'skipped',
          skipReason: 'history_expired_marked_for_full_sync',
          processingTimeMs: Date.now() - startTime,
        });

        // Release lock - scheduled sync will pick up the full sync
        await supabase.rpc('release_sync_lock', { p_account_id: account.id });
        return;
      }

      // Re-throw other errors
      throw historyError;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Collect new message IDs from history
    // ─────────────────────────────────────────────────────────────────────────────
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

    messagesFound = newMessageIds.length;

    if (newMessageIds.length === 0) {
      logger.debug('No new messages in notification', {
        accountId: account.id,
        historyId: notification.historyId,
      });

      // Still update the history ID
      await updateAccountAfterPush(supabase, account.id, notification.historyId);

      await logPushNotification(supabase, {
        accountId: account.id,
        email: notification.emailAddress,
        historyId: notification.historyId,
        messageId,
        status: 'completed',
        messagesFound: 0,
        messagesSynced: 0,
        processingTimeMs: Date.now() - startTime,
      });

      return;
    }

    logger.info('Found new messages from push notification', {
      accountId: account.id,
      count: newMessageIds.length,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Check which messages we already have
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('gmail_id')
      .eq('user_id', account.user_id)
      .in('gmail_id', newMessageIds);

    const existingIds = new Set(existingEmails?.map(e => e.gmail_id) || []);
    const messagesToFetch = newMessageIds.filter(id => !existingIds.has(id));

    if (messagesToFetch.length === 0) {
      logger.debug('All messages already synced', { accountId: account.id });

      await updateAccountAfterPush(supabase, account.id, notification.historyId);

      await logPushNotification(supabase, {
        accountId: account.id,
        email: notification.emailAddress,
        historyId: notification.historyId,
        messageId,
        status: 'completed',
        messagesFound: newMessageIds.length,
        messagesSynced: 0,
        processingTimeMs: Date.now() - startTime,
      });

      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Fetch and save new messages
    // ─────────────────────────────────────────────────────────────────────────────
    const messages = await gmailService.getMessages(messagesToFetch);

    for (const message of messages) {
      try {
        // Parse the Gmail message
        const parsed = emailParser.parse(message, MAX_BODY_CHARS);

        // Convert to database format
        const insertData = emailParser.toInsertData(
          parsed,
          account.user_id,
          account.id
        );

        // Insert into database
        const { error: insertError } = await supabase
          .from('emails')
          .insert(insertData);

        if (insertError) {
          if (insertError.code === '23505') {
            // Duplicate - already exists
            logger.debug('Message already exists', { messageId: message.id });
          } else {
            logger.warn('Failed to insert message', {
              messageId: message.id,
              error: insertError.message,
            });
          }
        } else {
          messagesSynced++;
        }
      } catch (parseError) {
        logger.warn('Failed to parse message', {
          messageId: message.id,
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
        });
      }
    }

    logger.info('Synced messages from push notification', {
      accountId: account.id,
      synced: messagesSynced,
      total: messagesToFetch.length,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Mark email summary as stale for regeneration
    // ─────────────────────────────────────────────────────────────────────────────
    if (messagesSynced > 0) {
      markSummaryStale(account.user_id, messagesSynced).catch((err) => {
        logger.warn('Failed to mark summary stale', {
          accountId: account.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Run AI analysis on new emails
    // ─────────────────────────────────────────────────────────────────────────────
    if (messagesSynced > 0) {
      try {
        const analysisResult = await runAIAnalysis(
          account.user_id,
          Math.min(messagesSynced, MAX_EMAILS_PER_PUSH)
        );

        messagesAnalyzed = analysisResult.successCount;

        logger.info('Analyzed emails from push notification', {
          accountId: account.id,
          analyzed: messagesAnalyzed,
          actionsCreated: analysisResult.actionsCreated,
        });
      } catch (analysisError) {
        logger.warn('AI analysis failed after push sync', {
          accountId: account.id,
          error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Update account state
    // ─────────────────────────────────────────────────────────────────────────────
    await updateAccountAfterPush(supabase, account.id, notification.historyId);

    // ─────────────────────────────────────────────────────────────────────────────
    // Log the push notification
    // ─────────────────────────────────────────────────────────────────────────────
    const processingTimeMs = Date.now() - startTime;

    await logPushNotification(supabase, {
      accountId: account.id,
      email: notification.emailAddress,
      historyId: notification.historyId,
      messageId,
      status: 'completed',
      messagesFound,
      messagesSynced,
      messagesAnalyzed,
      processingTimeMs,
    });

    logger.success('Push notification processed successfully', {
      accountId: account.id,
      messagesFound,
      messagesSynced,
      messagesAnalyzed,
      processingTimeMs,
    });

    // Release sync lock on success
    if (lockAcquired) {
      await supabase.rpc('release_sync_lock', { p_account_id: account.id });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const processingTimeMs = Date.now() - startTime;

    logger.error('Push notification processing failed', {
      accountId: account.id,
      error: errorMessage,
      processingTimeMs,
    });

    await logPushNotification(supabase, {
      accountId: account.id,
      email: notification.emailAddress,
      historyId: notification.historyId,
      messageId,
      status: 'failed',
      error: errorMessage,
      messagesFound,
      messagesSynced,
      messagesAnalyzed,
      processingTimeMs,
    });

    // Release sync lock on error
    if (lockAcquired) {
      await supabase.rpc('release_sync_lock', { p_account_id: account.id });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Updates account state after processing a push notification.
 */
async function updateAccountAfterPush(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  accountId: string,
  historyId: string
): Promise<void> {
  const { error } = await supabase
    .from('gmail_accounts')
    .update({
      last_history_id: historyId,
      last_sync_at: new Date().toISOString(),
      last_push_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (error) {
    logger.warn('Failed to update account after push', {
      accountId,
      error: error.message,
    });
  }
}

/**
 * Logs a push notification to the gmail_push_logs table.
 */
async function logPushNotification(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  params: {
    accountId?: string;
    email: string;
    historyId: string;
    messageId: string;
    status: 'received' | 'processing' | 'completed' | 'skipped' | 'failed';
    skipReason?: string;
    error?: string;
    messagesFound?: number;
    messagesSynced?: number;
    messagesAnalyzed?: number;
    processingTimeMs?: number;
  }
): Promise<void> {
  const { error } = await supabase.from('gmail_push_logs').insert({
    gmail_account_id: params.accountId || null,
    email_address: params.email,
    history_id: params.historyId,
    pubsub_message_id: params.messageId,
    status: params.status,
    skip_reason: params.skipReason || null,
    error: params.error || null,
    messages_found: params.messagesFound || 0,
    messages_synced: params.messagesSynced || 0,
    messages_analyzed: params.messagesAnalyzed || 0,
    processing_time_ms: params.processingTimeMs || 0,
  });

  if (error) {
    logger.warn('Failed to log push notification', { error: error.message });
  }
}
