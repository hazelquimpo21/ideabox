/**
 * Historical Email Sync Service
 *
 * Syncs email metadata from historical periods without AI analysis.
 * Used to populate contact communication history for CRM features.
 *
 * Key features:
 * - Metadata-only storage (no body_text, no body_html)
 * - Zero AI costs (no OpenAI calls)
 * - Updates contact stats (email_count, first_seen_at, etc.)
 * - Resumable (saves page token for interrupted syncs)
 * - Rate-limited and batched for Gmail API efficiency
 *
 * @module services/sync/historical-sync-service
 * @see docs/HISTORICAL_SYNC_PLAN.md
 */

import { google, gmail_v1 } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { TokenManager } from '@/lib/gmail';
import {
  HISTORICAL_SYNC_CONFIG,
  HISTORICAL_SYNC_MESSAGES,
  type HistoricalSyncConfig,
  type HistoricalSyncProgress,
  type HistoricalSyncResult,
  type HistoricalSyncStatus,
  type AccountHistoricalSyncStatus,
} from '@/config/historical-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface GmailAccount {
  id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  historical_sync_status: HistoricalSyncStatus;
  historical_sync_page_token: string | null;
  historical_sync_email_count: number;
  historical_sync_contacts_updated: number;
}

interface EmailMetadata {
  gmailId: string;
  threadId: string;
  subject: string | null;
  senderEmail: string;
  senderName: string | null;
  recipientEmail: string | null;
  date: Date;
  snippet: string | null;
  gmailLabels: string[];
  isSent: boolean;
}

type ProgressCallback = (progress: HistoricalSyncProgress) => void;

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('HistoricalSyncService');

// =============================================================================
// HISTORICAL SYNC SERVICE
// =============================================================================

/**
 * Service for syncing historical email metadata.
 *
 * This service fetches email metadata from Gmail without the body content,
 * stores it in the database with sync_type='metadata', and updates
 * contact statistics for CRM features.
 *
 * @example
 * ```typescript
 * const service = new HistoricalSyncService(supabase, userId);
 *
 * // Sync all accounts
 * const result = await service.syncAll({
 *   monthsBack: 12,
 *   onProgress: (progress) => console.log(progress),
 * });
 *
 * // Or sync specific account
 * const result = await service.syncAccount(accountId, { monthsBack: 6 });
 * ```
 */
export class HistoricalSyncService {
  private readonly supabase: SupabaseClient;
  private readonly userId: string;
  private readonly config: HistoricalSyncConfig;
  private readonly tokenManager: TokenManager;

  // Tracking
  private emailsProcessed = 0;
  private contactsUpdated = new Set<string>();
  private oldestEmailDate: Date | null = null;
  private aborted = false;

  constructor(
    supabase: SupabaseClient,
    userId: string,
    config: Partial<HistoricalSyncConfig> = {}
  ) {
    this.supabase = supabase;
    this.userId = userId;
    this.config = { ...HISTORICAL_SYNC_CONFIG, ...config };
    this.tokenManager = new TokenManager(supabase);
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  /**
   * Sync historical emails from all connected Gmail accounts.
   */
  async syncAll(options: {
    monthsBack?: number;
    onProgress?: ProgressCallback;
  } = {}): Promise<HistoricalSyncResult[]> {
    const { monthsBack = this.config.defaultMonthsBack, onProgress } = options;

    logger.info('Starting historical sync for all accounts', {
      userId: this.userId.substring(0, 8),
      monthsBack,
    });

    // Get all connected Gmail accounts
    const { data: accounts, error } = await this.supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', this.userId)
      .eq('sync_enabled', true);

    if (error) {
      logger.error('Failed to fetch Gmail accounts', { error: error.message });
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }

    if (!accounts || accounts.length === 0) {
      logger.warn('No Gmail accounts found for user');
      return [];
    }

    const results: HistoricalSyncResult[] = [];

    for (const account of accounts) {
      try {
        const result = await this.syncAccount(account.id, {
          monthsBack,
          onProgress,
        });
        results.push(result);
      } catch (err) {
        logger.error('Failed to sync account', {
          accountId: account.id.substring(0, 8),
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        results.push({
          success: false,
          emailsSynced: 0,
          contactsUpdated: 0,
          oldestEmailDate: null,
          durationMs: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Sync historical emails from a specific Gmail account.
   */
  async syncAccount(
    accountId: string,
    options: {
      monthsBack?: number;
      onProgress?: ProgressCallback;
      resume?: boolean;
    } = {}
  ): Promise<HistoricalSyncResult> {
    const {
      monthsBack = this.config.defaultMonthsBack,
      onProgress,
      resume = true,
    } = options;

    const startTime = Date.now();

    // Reset tracking
    this.emailsProcessed = 0;
    this.contactsUpdated.clear();
    this.oldestEmailDate = null;
    this.aborted = false;

    // Get account details
    const { data: account, error: accountError } = await this.supabase
      .from('gmail_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', this.userId)
      .single();

    if (accountError || !account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    logger.info('Starting historical sync for account', {
      accountId: accountId.substring(0, 8),
      email: account.email,
      monthsBack,
      resume,
      existingStatus: account.historical_sync_status,
    });

    // Check if already completed
    if (account.historical_sync_status === 'completed' && !resume) {
      logger.info('Account already synced, skipping', {
        accountId: accountId.substring(0, 8),
      });
      return {
        success: true,
        emailsSynced: account.historical_sync_email_count || 0,
        contactsUpdated: account.historical_sync_contacts_updated || 0,
        oldestEmailDate: account.historical_sync_oldest_date,
        durationMs: 0,
      };
    }

    // Update status to in_progress
    await this.updateAccountProgress(accountId, {
      status: 'in_progress',
      error: null,
    });

    try {
      // Get valid access token
      const accessToken = await this.tokenManager.getValidToken(account as GmailAccount);

      // Create Gmail client
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth });

      // Calculate date range
      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - 30); // Start 30 days ago (recent emails already synced)

      const afterDate = new Date();
      afterDate.setMonth(afterDate.getMonth() - monthsBack);

      // Build query
      const query = this.buildQuery(beforeDate, afterDate);

      // Get starting page token (for resume)
      let pageToken: string | undefined = undefined;
      if (resume && account.historical_sync_page_token) {
        pageToken = account.historical_sync_page_token;
        this.emailsProcessed = account.historical_sync_email_count || 0;
        logger.info('Resuming from previous sync', {
          pageToken: pageToken.substring(0, 20),
          emailsProcessed: this.emailsProcessed,
        });
      }

      // Notify progress
      onProgress?.({
        status: 'in_progress',
        emailsProcessed: this.emailsProcessed,
        emailsTotal: null,
        contactsUpdated: this.contactsUpdated.size,
        oldestEmailDate: this.oldestEmailDate?.toISOString() || null,
        currentAccountEmail: account.email,
        pageToken: pageToken || null,
        startedAt: new Date().toISOString(),
        error: null,
      });

      // Fetch and process emails in batches
      let hasMore = true;
      let totalEstimate: number | null = null;

      while (hasMore && !this.aborted) {
        // List message IDs
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: this.config.listBatchSize,
          q: query,
          pageToken,
        });

        const messageIds = listResponse.data.messages?.map((m) => m.id!) || [];

        if (!totalEstimate && listResponse.data.resultSizeEstimate) {
          totalEstimate = listResponse.data.resultSizeEstimate;
        }

        if (messageIds.length === 0) {
          hasMore = false;
          break;
        }

        // Fetch metadata for this batch
        await this.processMessageBatch(
          gmail,
          messageIds,
          accountId,
          account.email,
          onProgress,
          totalEstimate
        );

        // Save progress
        pageToken = listResponse.data.nextPageToken || undefined;
        await this.updateAccountProgress(accountId, {
          emailCount: this.emailsProcessed,
          contactsUpdated: this.contactsUpdated.size,
          oldestDate: this.oldestEmailDate,
          pageToken: pageToken || null,
        });

        hasMore = !!pageToken;

        // Notify progress
        onProgress?.({
          status: 'in_progress',
          emailsProcessed: this.emailsProcessed,
          emailsTotal: totalEstimate,
          contactsUpdated: this.contactsUpdated.size,
          oldestEmailDate: this.oldestEmailDate?.toISOString() || null,
          currentAccountEmail: account.email,
          pageToken: pageToken || null,
          startedAt: new Date().toISOString(),
          error: null,
        });

        // Rate limiting delay
        if (hasMore) {
          await this.delay(this.config.batchDelayMs);
        }
      }

      // Mark as completed
      await this.updateAccountProgress(accountId, {
        status: 'completed',
        emailCount: this.emailsProcessed,
        contactsUpdated: this.contactsUpdated.size,
        oldestDate: this.oldestEmailDate,
        pageToken: null, // Clear page token on completion
      });

      const durationMs = Date.now() - startTime;

      logger.info('Historical sync completed', {
        accountId: accountId.substring(0, 8),
        emailsSynced: this.emailsProcessed,
        contactsUpdated: this.contactsUpdated.size,
        oldestEmailDate: this.oldestEmailDate?.toISOString(),
        durationMs,
      });

      return {
        success: true,
        emailsSynced: this.emailsProcessed,
        contactsUpdated: this.contactsUpdated.size,
        oldestEmailDate: this.oldestEmailDate?.toISOString() || null,
        durationMs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Update status to failed
      await this.updateAccountProgress(accountId, {
        status: 'failed',
        error: errorMessage,
      });

      logger.error('Historical sync failed', {
        accountId: accountId.substring(0, 8),
        error: errorMessage,
        emailsProcessed: this.emailsProcessed,
      });

      return {
        success: false,
        emailsSynced: this.emailsProcessed,
        contactsUpdated: this.contactsUpdated.size,
        oldestEmailDate: this.oldestEmailDate?.toISOString() || null,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Get historical sync status for all user accounts.
   */
  async getStatus(): Promise<AccountHistoricalSyncStatus[]> {
    const { data, error } = await this.supabase.rpc('get_historical_sync_status', {
      p_user_id: this.userId,
    });

    if (error) {
      logger.error('Failed to get sync status', { error: error.message });
      throw new Error(`Failed to get status: ${error.message}`);
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      accountId: row.account_id as string,
      accountEmail: row.account_email as string,
      status: row.status as HistoricalSyncStatus,
      emailCount: row.email_count as number,
      contactsUpdated: row.contacts_updated as number,
      oldestDate: row.oldest_date as string | null,
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
      hasPageToken: row.has_page_token as boolean,
      error: row.error as string | null,
    }));
  }

  /**
   * Abort the current sync operation.
   */
  abort(): void {
    this.aborted = true;
    logger.info('Historical sync aborted by user');
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Build Gmail query for historical emails.
   */
  private buildQuery(beforeDate: Date, afterDate: Date): string {
    const before = this.formatDateForGmail(beforeDate);
    const after = this.formatDateForGmail(afterDate);
    return `before:${before} after:${after} ${this.config.excludeQuery}`;
  }

  /**
   * Format date for Gmail query (YYYY/MM/DD).
   */
  private formatDateForGmail(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Process a batch of message IDs.
   */
  private async processMessageBatch(
    gmail: gmail_v1.Gmail,
    messageIds: string[],
    accountId: string,
    accountEmail: string,
    onProgress?: ProgressCallback,
    totalEstimate?: number | null
  ): Promise<void> {
    // Fetch metadata in smaller batches
    for (let i = 0; i < messageIds.length; i += this.config.getBatchSize) {
      if (this.aborted) break;

      const batch = messageIds.slice(i, i + this.config.getBatchSize);

      // Fetch metadata for batch in parallel
      const metadataResults = await Promise.allSettled(
        batch.map((id) => this.fetchMessageMetadata(gmail, id))
      );

      // Process successful fetches
      for (const result of metadataResults) {
        if (result.status === 'fulfilled' && result.value) {
          await this.insertMetadataEmail(result.value, accountId, accountEmail);
        }
      }

      // Update progress periodically
      if (this.emailsProcessed % this.config.saveProgressEvery === 0) {
        onProgress?.({
          status: 'in_progress',
          emailsProcessed: this.emailsProcessed,
          emailsTotal: totalEstimate || null,
          contactsUpdated: this.contactsUpdated.size,
          oldestEmailDate: this.oldestEmailDate?.toISOString() || null,
          currentAccountEmail: accountEmail,
          pageToken: null,
          startedAt: new Date().toISOString(),
          error: null,
        });
      }

      // Small delay between sub-batches
      if (i + this.config.getBatchSize < messageIds.length) {
        await this.delay(50);
      }
    }
  }

  /**
   * Fetch metadata for a single message.
   */
  private async fetchMessageMetadata(
    gmail: gmail_v1.Gmail,
    messageId: string
  ): Promise<EmailMetadata | null> {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata', // Only fetch headers, not body
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const message = response.data;
      if (!message.id || !message.threadId) {
        return null;
      }

      // Parse headers
      const headers = message.payload?.headers || [];
      const getHeader = (name: string): string | null => {
        const header = headers.find(
          (h) => h.name?.toLowerCase() === name.toLowerCase()
        );
        return header?.value || null;
      };

      // Parse sender
      const fromHeader = getHeader('From');
      const { email: senderEmail, name: senderName } = this.parseEmailAddress(
        fromHeader || ''
      );

      if (!senderEmail) {
        return null; // Skip emails without valid sender
      }

      // Parse recipient
      const toHeader = getHeader('To');
      const { email: recipientEmail } = this.parseEmailAddress(toHeader || '');

      // Parse date
      const dateHeader = getHeader('Date');
      const date = dateHeader ? new Date(dateHeader) : new Date();

      // Check if sent by user
      const isSent =
        message.labelIds?.includes('SENT') ||
        senderEmail.toLowerCase() === this.normalizeEmail(recipientEmail || '');

      return {
        gmailId: message.id,
        threadId: message.threadId,
        subject: getHeader('Subject'),
        senderEmail,
        senderName,
        recipientEmail,
        date,
        snippet: message.snippet || null,
        gmailLabels: message.labelIds || [],
        isSent,
      };
    } catch (err) {
      logger.debug('Failed to fetch message metadata', {
        messageId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Parse email address string into email and name parts.
   */
  private parseEmailAddress(raw: string): { email: string; name: string | null } {
    if (!raw) {
      return { email: '', name: null };
    }

    // Match patterns like "John Doe <john@example.com>" or just "john@example.com"
    const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);

    if (match) {
      const name = match[1]?.trim() || null;
      const email = match[2]?.trim().toLowerCase() || '';
      return { email, name };
    }

    // Fallback: treat the whole thing as an email if it contains @
    if (raw.includes('@')) {
      return { email: raw.trim().toLowerCase(), name: null };
    }

    return { email: '', name: null };
  }

  /**
   * Normalize email address for comparison.
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Insert metadata-only email and update contact stats.
   */
  private async insertMetadataEmail(
    metadata: EmailMetadata,
    accountId: string,
    accountEmail: string
  ): Promise<void> {
    try {
      // Use the database function for atomic insert + contact update
      const { data, error } = await this.supabase.rpc('insert_metadata_email', {
        p_user_id: this.userId,
        p_gmail_account_id: accountId,
        p_gmail_id: metadata.gmailId,
        p_thread_id: metadata.threadId,
        p_sender_email: metadata.senderEmail,
        p_sender_name: metadata.senderName,
        p_recipient_email: metadata.recipientEmail,
        p_subject: metadata.subject,
        p_snippet: metadata.snippet,
        p_date: metadata.date.toISOString(),
        p_gmail_labels: metadata.gmailLabels,
        p_is_sent: metadata.isSent,
      });

      if (error) {
        // Ignore duplicate key errors (email already exists)
        if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
          logger.debug('Failed to insert metadata email', {
            gmailId: metadata.gmailId,
            error: error.message,
          });
        }
        return;
      }

      // Track progress
      if (data) {
        // Email was inserted (not a duplicate)
        this.emailsProcessed++;
        this.contactsUpdated.add(metadata.senderEmail);

        // Track oldest email
        if (!this.oldestEmailDate || metadata.date < this.oldestEmailDate) {
          this.oldestEmailDate = metadata.date;
        }
      }
    } catch (err) {
      logger.debug('Error inserting metadata email', {
        gmailId: metadata.gmailId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Update account historical sync progress.
   */
  private async updateAccountProgress(
    accountId: string,
    progress: {
      status?: HistoricalSyncStatus;
      emailCount?: number;
      contactsUpdated?: number;
      oldestDate?: Date | null;
      pageToken?: string | null;
      error?: string | null;
    }
  ): Promise<void> {
    try {
      await this.supabase.rpc('update_historical_sync_progress', {
        p_account_id: accountId,
        p_status: progress.status || 'in_progress',
        p_email_count: progress.emailCount,
        p_contacts_updated: progress.contactsUpdated,
        p_oldest_date: progress.oldestDate?.toISOString() || null,
        p_page_token: progress.pageToken,
        p_error: progress.error,
      });
    } catch (err) {
      logger.warn('Failed to update sync progress', {
        accountId: accountId.substring(0, 8),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Delay execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a HistoricalSyncService instance.
 *
 * @example
 * ```typescript
 * const service = createHistoricalSyncService(supabase, userId);
 * const result = await service.syncAll({ monthsBack: 12 });
 * ```
 */
export function createHistoricalSyncService(
  supabase: SupabaseClient,
  userId: string,
  config?: Partial<HistoricalSyncConfig>
): HistoricalSyncService {
  return new HistoricalSyncService(supabase, userId, config);
}
