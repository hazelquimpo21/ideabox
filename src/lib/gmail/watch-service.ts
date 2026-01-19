/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gmail Watch Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages Gmail push notification subscriptions via Google Cloud Pub/Sub.
 * When a watch is active, Gmail sends push notifications to our webhook
 * whenever new emails arrive, enabling near-real-time sync.
 *
 * KEY CONCEPTS:
 * - Watch: A subscription that tells Gmail to notify us of changes
 * - Watch expires after ~7 days and must be renewed before expiration
 * - Each notification includes a historyId for incremental sync
 *
 * REQUIREMENTS:
 * - Google Cloud Project with Pub/Sub API enabled
 * - Pub/Sub topic for Gmail notifications
 * - Push subscription pointing to /api/webhooks/gmail
 * - Service account with pubsub.publisher role
 *
 * USAGE:
 * ```typescript
 * import { gmailWatchService } from '@/lib/gmail/watch-service';
 *
 * // Start watching an account
 * const watch = await gmailWatchService.startWatch(accessToken, accountId);
 *
 * // Check expiration
 * const expiresAt = new Date(parseInt(watch.expiration));
 *
 * // Renew all expiring watches
 * await gmailWatchService.renewExpiringWatches();
 * ```
 *
 * @module lib/gmail/watch-service
 * @version 1.0.0
 */

import { google, gmail_v1 } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { TokenManager } from './token-manager';
import type { GmailAccount } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('GmailWatchService');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Google Cloud Pub/Sub topic for Gmail notifications.
 * Format: projects/{project-id}/topics/{topic-name}
 *
 * This must be configured in environment variables.
 */
function getPubSubTopic(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const topicName = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-notifications';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required for Gmail push notifications');
  }

  return `projects/${projectId}/topics/${topicName}`;
}

/**
 * Hours before expiration to trigger renewal.
 * Watches expire after ~7 days, we renew when 24 hours remain.
 */
const RENEWAL_THRESHOLD_HOURS = 24;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Response from Gmail watch API.
 */
export interface WatchResponse {
  /** Gmail history ID at time of watch creation */
  historyId: string;
  /** Expiration timestamp in milliseconds (Unix epoch) */
  expiration: string;
  /** Resource ID for the watch (used for stopping) */
  resourceId?: string;
}

/**
 * Result of watch operation.
 */
export interface WatchOperationResult {
  success: boolean;
  accountId: string;
  email: string;
  historyId?: string;
  expiration?: Date;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL WATCH SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for managing Gmail push notification watches.
 *
 * Watches are long-lived subscriptions that tell Gmail to notify our
 * webhook whenever changes occur in the user's mailbox.
 */
export class GmailWatchService {
  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Starts watching a Gmail account for changes.
   *
   * Creates a watch subscription that will send push notifications
   * to our Pub/Sub topic when emails arrive or are modified.
   *
   * @param accessToken - Valid OAuth access token for the account
   * @param accountId - Database ID of the Gmail account
   * @returns Watch response with historyId and expiration
   * @throws Error if watch creation fails
   *
   * @example
   * ```typescript
   * const watch = await watchService.startWatch(token, accountId);
   * console.log(`Watch expires at: ${new Date(parseInt(watch.expiration))}`);
   * ```
   */
  async startWatch(accessToken: string, accountId: string): Promise<WatchResponse> {
    const startTime = Date.now();

    logger.start('Starting Gmail watch', { accountId });

    try {
      // Create Gmail client
      const gmail = this.createGmailClient(accessToken);
      const pubsubTopic = getPubSubTopic();

      // Create watch request
      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: pubsubTopic,
          // Watch INBOX for efficiency (most relevant for notifications)
          labelIds: ['INBOX'],
          labelFilterBehavior: 'include',
        },
      });

      if (!response.data.historyId || !response.data.expiration) {
        throw new Error('Invalid watch response: missing historyId or expiration');
      }

      const result: WatchResponse = {
        historyId: response.data.historyId,
        expiration: response.data.expiration,
        resourceId: response.data.resourceId || undefined,
      };

      // Update database with watch state
      const supabase = await createServerClient();
      const expirationDate = new Date(parseInt(result.expiration));

      const { error: updateError } = await supabase.rpc('update_gmail_watch', {
        p_account_id: accountId,
        p_history_id: result.historyId,
        p_expiration: expirationDate.toISOString(),
        p_resource_id: result.resourceId || null,
      });

      if (updateError) {
        logger.warn('Failed to update watch state in database', {
          accountId,
          error: updateError.message,
        });
        // Don't throw - watch was created successfully
      }

      const durationMs = Date.now() - startTime;
      logger.success('Gmail watch started', {
        accountId,
        historyId: result.historyId,
        expiresAt: expirationDate.toISOString(),
        expiresInHours: Math.round((expirationDate.getTime() - Date.now()) / 3600000),
        durationMs,
      });

      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to start Gmail watch', {
        accountId,
        error: errorMessage,
        durationMs,
      });

      throw error;
    }
  }

  /**
   * Stops watching a Gmail account.
   *
   * Removes the watch subscription. Gmail will stop sending
   * push notifications for this account.
   *
   * @param accessToken - Valid OAuth access token for the account
   * @param accountId - Database ID of the Gmail account
   *
   * @example
   * ```typescript
   * await watchService.stopWatch(token, accountId);
   * ```
   */
  async stopWatch(accessToken: string, accountId: string): Promise<void> {
    logger.start('Stopping Gmail watch', { accountId });

    try {
      // Create Gmail client
      const gmail = this.createGmailClient(accessToken);

      // Stop the watch
      await gmail.users.stop({ userId: 'me' });

      // Clear watch state in database
      const supabase = await createServerClient();
      const { error: updateError } = await supabase.rpc('clear_gmail_watch', {
        p_account_id: accountId,
      });

      if (updateError) {
        logger.warn('Failed to clear watch state in database', {
          accountId,
          error: updateError.message,
        });
      }

      logger.success('Gmail watch stopped', { accountId });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 404 is expected if watch already expired
      if (errorMessage.includes('404')) {
        logger.info('Watch already stopped or expired', { accountId });

        // Still clear database state
        const supabase = await createServerClient();
        await supabase.rpc('clear_gmail_watch', { p_account_id: accountId });
        return;
      }

      logger.error('Failed to stop Gmail watch', {
        accountId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Renews all watches that are expiring soon.
   *
   * Finds all accounts with watches expiring within the threshold
   * (default 24 hours) and renews them.
   *
   * Should be called periodically (e.g., every 6 hours via cron).
   *
   * @returns Array of renewal results
   *
   * @example
   * ```typescript
   * const results = await watchService.renewExpiringWatches();
   * console.log(`Renewed ${results.filter(r => r.success).length} watches`);
   * ```
   */
  async renewExpiringWatches(): Promise<WatchOperationResult[]> {
    logger.start('Renewing expiring Gmail watches');

    const supabase = await createServerClient();
    const tokenManager = new TokenManager(supabase);

    // Find watches expiring within threshold
    const { data: expiringAccounts, error: fetchError } = await supabase.rpc(
      'get_expiring_watches',
      { p_hours_ahead: RENEWAL_THRESHOLD_HOURS }
    );

    if (fetchError) {
      logger.error('Failed to fetch expiring watches', { error: fetchError.message });
      throw new Error(`Failed to fetch expiring watches: ${fetchError.message}`);
    }

    const accounts = (expiringAccounts || []) as Array<{
      account_id: string;
      user_id: string;
      email: string;
      hours_until_expiry: number;
    }>;

    logger.info('Found expiring watches', {
      count: accounts.length,
      accounts: accounts.map(a => ({
        email: a.email,
        hoursUntilExpiry: Math.round(a.hours_until_expiry),
      })),
    });

    if (accounts.length === 0) {
      logger.info('No watches need renewal');
      return [];
    }

    // Renew each watch
    const results: WatchOperationResult[] = [];

    for (const account of accounts) {
      try {
        // Get the full account record for token refresh
        const { data: fullAccount, error: accountError } = await supabase
          .from('gmail_accounts')
          .select('*')
          .eq('id', account.account_id)
          .single();

        if (accountError || !fullAccount) {
          results.push({
            success: false,
            accountId: account.account_id,
            email: account.email,
            error: 'Account not found',
          });
          continue;
        }

        // Get valid access token
        const accessToken = await tokenManager.getValidToken(fullAccount as GmailAccount);

        // Renew watch
        const watch = await this.startWatch(accessToken, account.account_id);

        results.push({
          success: true,
          accountId: account.account_id,
          email: account.email,
          historyId: watch.historyId,
          expiration: new Date(parseInt(watch.expiration)),
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error('Failed to renew watch', {
          accountId: account.account_id,
          email: account.email,
          error: errorMessage,
        });

        results.push({
          success: false,
          accountId: account.account_id,
          email: account.email,
          error: errorMessage,
        });
      }
    }

    // Log summary
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.success('Watch renewal complete', {
      total: results.length,
      succeeded,
      failed,
    });

    return results;
  }

  /**
   * Sets up watches for all accounts that don't have one.
   *
   * Finds accounts with push_enabled=true but no active watch,
   * and creates watches for them.
   *
   * Should be called on startup or when new accounts are connected.
   *
   * @returns Array of setup results
   */
  async setupMissingWatches(): Promise<WatchOperationResult[]> {
    logger.start('Setting up missing Gmail watches');

    const supabase = await createServerClient();
    const tokenManager = new TokenManager(supabase);

    // Find accounts needing watch setup
    const { data: accountsNeedingWatch, error: fetchError } = await supabase.rpc(
      'get_accounts_needing_watch'
    );

    if (fetchError) {
      logger.error('Failed to fetch accounts needing watch', { error: fetchError.message });
      throw new Error(`Failed to fetch accounts: ${fetchError.message}`);
    }

    const accounts = (accountsNeedingWatch || []) as Array<{
      account_id: string;
      user_id: string;
      email: string;
    }>;

    logger.info('Found accounts needing watch setup', {
      count: accounts.length,
    });

    if (accounts.length === 0) {
      return [];
    }

    // Set up watch for each account
    const results: WatchOperationResult[] = [];

    for (const account of accounts) {
      try {
        // Get the full account record
        const { data: fullAccount, error: accountError } = await supabase
          .from('gmail_accounts')
          .select('*')
          .eq('id', account.account_id)
          .single();

        if (accountError || !fullAccount) {
          results.push({
            success: false,
            accountId: account.account_id,
            email: account.email,
            error: 'Account not found',
          });
          continue;
        }

        // Get valid access token
        const accessToken = await tokenManager.getValidToken(fullAccount as GmailAccount);

        // Create watch
        const watch = await this.startWatch(accessToken, account.account_id);

        results.push({
          success: true,
          accountId: account.account_id,
          email: account.email,
          historyId: watch.historyId,
          expiration: new Date(parseInt(watch.expiration)),
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error('Failed to setup watch', {
          accountId: account.account_id,
          email: account.email,
          error: errorMessage,
        });

        results.push({
          success: false,
          accountId: account.account_id,
          email: account.email,
          error: errorMessage,
        });
      }
    }

    // Log summary
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.success('Watch setup complete', {
      total: results.length,
      succeeded,
      failed,
    });

    return results;
  }

  /**
   * Checks if push notifications are properly configured.
   *
   * Validates that all required environment variables are set.
   *
   * @returns True if push notifications can be used
   */
  isPushEnabled(): boolean {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const webhookUrl = process.env.GMAIL_WEBHOOK_URL || process.env.NEXT_PUBLIC_APP_URL;

    return !!(projectId && webhookUrl);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a Gmail API client with the given access token.
   */
  private createGmailClient(accessToken: string): gmail_v1.Gmail {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default Gmail watch service instance.
 *
 * @example
 * ```typescript
 * import { gmailWatchService } from '@/lib/gmail/watch-service';
 *
 * await gmailWatchService.startWatch(token, accountId);
 * ```
 */
export const gmailWatchService = new GmailWatchService();
