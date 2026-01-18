/**
 * Gmail API Service
 *
 * Provides a high-level interface for Gmail API operations.
 * Handles authentication, pagination, rate limiting, and error handling.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Fetches messages with automatic pagination
 * - Handles OAuth token refresh automatically
 * - Supports incremental sync via history API
 * - Rate limit handling with exponential backoff
 * - Batch message fetching for efficiency
 * - Structured logging throughout
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { GmailService } from '@/lib/gmail/gmail-service';
 * import { TokenManager } from '@/lib/gmail/token-manager';
 *
 * // Create service for a Gmail account
 * const tokenManager = new TokenManager(supabase);
 * const accessToken = await tokenManager.getValidToken(account);
 * const gmailService = new GmailService(accessToken);
 *
 * // List messages
 * const messages = await gmailService.listMessages({ maxResults: 50 });
 *
 * // Get a single message
 * const message = await gmailService.getMessage('messageId123');
 * ```
 *
 * @module lib/gmail/gmail-service
 * @version 1.0.0
 */

import { google, gmail_v1 } from 'googleapis';
import { createLogger, logEmail } from '@/lib/utils/logger';
import {
  GmailAPIError,
  GmailRateLimitError,
  GmailAuthError,
} from './errors';
import type {
  GmailMessage,
  GmailMessagesListResponse,
  GmailHistoryResponse,
  SyncConfig,
  IGmailService,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum retry attempts for API calls.
 */
const MAX_API_RETRIES = 3;

/**
 * Base delay for exponential backoff (milliseconds).
 */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Default rate limit retry delay (milliseconds).
 * Used when Retry-After header is not provided.
 */
const DEFAULT_RATE_LIMIT_DELAY_MS = 10000; // 10 seconds

/**
 * Batch size for fetching multiple messages.
 * Gmail API allows up to 100 requests per batch.
 */
const MESSAGE_BATCH_SIZE = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('GmailService');

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * High-level Gmail API service.
 *
 * This class provides a clean interface for Gmail operations,
 * handling all the complexity of the Gmail API:
 * - OAuth authentication
 * - Pagination
 * - Rate limiting
 * - Error handling
 * - Retries
 *
 * @example
 * ```typescript
 * // Basic usage
 * const service = new GmailService(accessToken);
 * const messages = await service.listMessages({ maxResults: 100 });
 *
 * // With history for incremental sync
 * const history = await service.getHistory(lastHistoryId);
 * ```
 */
export class GmailService implements IGmailService {
  /** Gmail API client instance */
  private readonly gmail: gmail_v1.Gmail;

  /** Account ID for logging context */
  private readonly accountId?: string;

  /**
   * Creates a new GmailService instance.
   *
   * @param accessToken - Valid OAuth access token
   * @param accountId - Optional account ID for logging
   */
  constructor(accessToken: string, accountId?: string) {
    // Create OAuth2 client with the access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    // Initialize Gmail API client
    this.gmail = google.gmail({ version: 'v1', auth });
    this.accountId = accountId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lists messages in the user's mailbox.
   *
   * This method fetches message metadata (id and threadId) from Gmail.
   * Use getMessage() to fetch the full message content.
   *
   * @param config - Sync configuration options
   * @returns List response with message IDs and pagination token
   * @throws GmailAPIError if the request fails after retries
   *
   * @example
   * ```typescript
   * // List recent inbox messages
   * const response = await service.listMessages({
   *   maxResults: 50,
   *   labelIds: ['INBOX'],
   * });
   *
   * console.log(`Found ${response.messages?.length} messages`);
   *
   * // Fetch next page
   * if (response.nextPageToken) {
   *   // Use pageToken in next request
   * }
   * ```
   */
  public async listMessages(
    config: Partial<SyncConfig> = {}
  ): Promise<GmailMessagesListResponse> {
    const {
      maxResults = 100,
      query = '',
      labelIds = ['INBOX'],
    } = config;

    logEmail.fetchStart({
      accountId: this.accountId,
      count: maxResults,
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.gmail.users.messages.list({
          userId: 'me',
          maxResults,
          q: query || undefined,
          labelIds: labelIds.length > 0 ? labelIds : undefined,
        });
      });

      const messageCount = response.data.messages?.length || 0;

      logEmail.fetchComplete({
        accountId: this.accountId,
        count: messageCount,
      });

      return {
        messages: response.data.messages?.map((m: { id?: string | null; threadId?: string | null }) => ({
          id: m.id!,
          threadId: m.threadId!,
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || undefined,
      };
    } catch (error) {
      logEmail.fetchError({
        accountId: this.accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error);
    }
  }

  /**
   * Gets a single message by ID.
   *
   * Fetches the full message content including headers and body.
   *
   * @param messageId - Gmail message ID
   * @returns Full message data
   * @throws GmailAPIError if the request fails
   *
   * @example
   * ```typescript
   * const message = await service.getMessage('abc123');
   * console.log(message.snippet);    // Email preview
   * console.log(message.payload);    // Full MIME structure
   * ```
   */
  public async getMessage(messageId: string): Promise<GmailMessage> {
    logger.debug('Fetching message', {
      accountId: this.accountId,
      messageId,
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full', // Get full MIME structure
        });
      });

      // Map response to our type
      // Gmail API types don't guarantee non-null values
      const data = response.data;

      return {
        id: data.id!,
        threadId: data.threadId!,
        labelIds: data.labelIds || undefined,
        snippet: data.snippet || undefined,
        historyId: data.historyId || undefined,
        internalDate: data.internalDate || undefined,
        // payload contains headers and body - cast to our type
        payload: data.payload as GmailMessage['payload'],
        sizeEstimate: data.sizeEstimate || undefined,
      };
    } catch (error) {
      logger.error('Failed to fetch message', {
        accountId: this.accountId,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, { messageId });
    }
  }

  /**
   * Gets multiple messages by ID.
   *
   * Fetches messages in parallel batches for efficiency.
   * Failed individual fetches are logged but don't fail the batch.
   *
   * @param messageIds - Array of Gmail message IDs
   * @returns Array of messages (some may be missing if fetch failed)
   *
   * @example
   * ```typescript
   * // List messages first
   * const list = await service.listMessages({ maxResults: 50 });
   * const ids = list.messages?.map(m => m.id) || [];
   *
   * // Then fetch full content
   * const messages = await service.getMessages(ids);
   * console.log(`Fetched ${messages.length} of ${ids.length} messages`);
   * ```
   */
  public async getMessages(messageIds: string[]): Promise<GmailMessage[]> {
    if (messageIds.length === 0) {
      return [];
    }

    logger.info('Fetching multiple messages', {
      accountId: this.accountId,
      count: messageIds.length,
    });

    const messages: GmailMessage[] = [];
    const errors: Array<{ messageId: string; error: string }> = [];

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < messageIds.length; i += MESSAGE_BATCH_SIZE) {
      const batch = messageIds.slice(i, i + MESSAGE_BATCH_SIZE);

      logger.debug('Processing message batch', {
        accountId: this.accountId,
        batchNumber: Math.floor(i / MESSAGE_BATCH_SIZE) + 1,
        batchSize: batch.length,
      });

      // Fetch batch in parallel
      const results = await Promise.allSettled(
        batch.map((id) => this.getMessage(id))
      );

      // Collect successes and failures
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          messages.push(result.value);
        } else {
          const messageId = batch[index] ?? 'unknown';
          errors.push({
            messageId,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      // Add a small delay between batches to be nice to the API
      if (i + MESSAGE_BATCH_SIZE < messageIds.length) {
        await this.delay(100);
      }
    }

    // Log any errors encountered
    if (errors.length > 0) {
      logger.warn('Some messages failed to fetch', {
        accountId: this.accountId,
        successCount: messages.length,
        failureCount: errors.length,
        errors: errors.slice(0, 5), // Log first 5 errors
      });
    }

    logger.info('Batch message fetch complete', {
      accountId: this.accountId,
      requested: messageIds.length,
      fetched: messages.length,
      failed: errors.length,
    });

    return messages;
  }

  /**
   * Gets incremental history since a history ID.
   *
   * Use this for efficient incremental sync - only get changes
   * since the last sync instead of re-fetching all messages.
   *
   * @param startHistoryId - History ID from previous sync
   * @returns History changes (added, deleted, label changes)
   * @throws GmailAPIError if the request fails
   *
   * @example
   * ```typescript
   * // First sync stores historyId
   * const firstSync = await service.listMessages();
   * // ... save messages and historyId ...
   *
   * // Later, get only changes
   * const history = await service.getHistory(savedHistoryId);
   *
   * for (const record of history.history || []) {
   *   // Process added/deleted messages
   *   if (record.messagesAdded) {
   *     // Fetch and save new messages
   *   }
   * }
   * ```
   */
  public async getHistory(startHistoryId: string): Promise<GmailHistoryResponse> {
    logger.debug('Fetching history', {
      accountId: this.accountId,
      startHistoryId,
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          // Get all types of history events
          historyTypes: [
            'messageAdded',
            'messageDeleted',
            'labelAdded',
            'labelRemoved',
          ],
        });
      });

      const historyCount = response.data.history?.length || 0;

      logger.debug('History fetch complete', {
        accountId: this.accountId,
        historyRecords: historyCount,
        newHistoryId: response.data.historyId,
      });

      // Map to our type - the Gmail API types are very permissive
      return {
        history: response.data.history as GmailHistoryResponse['history'],
        nextPageToken: response.data.nextPageToken || undefined,
        historyId: response.data.historyId || undefined,
      };
    } catch (error) {
      // History API returns 404 if historyId is too old
      // This means we need to do a full sync
      if (error instanceof GmailAPIError && error.statusCode === 404) {
        logger.warn('History ID expired, full sync required', {
          accountId: this.accountId,
          startHistoryId,
        });
        // Return empty history to signal full sync needed
        return { history: undefined };
      }

      logger.error('Failed to fetch history', {
        accountId: this.accountId,
        startHistoryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Executes an API call with retry logic.
   *
   * Retries on transient errors (rate limits, server errors)
   * using exponential backoff.
   *
   * @param operation - Async function to execute
   * @returns Operation result
   * @throws After max retries or on non-retryable error
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_API_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a retryable error
        const gmailError = this.handleError(lastError);

        // Don't retry auth errors - token might need refresh
        if (gmailError instanceof GmailAuthError) {
          throw gmailError;
        }

        // Handle rate limiting specially
        if (gmailError instanceof GmailRateLimitError) {
          logger.warn('Rate limited, waiting', {
            accountId: this.accountId,
            retryAfterMs: gmailError.retryAfterMs,
            attempt,
          });
          await this.delay(gmailError.retryAfterMs);
          continue;
        }

        // For other API errors, check if retryable
        if (gmailError instanceof GmailAPIError && gmailError.isRetryable) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn('Retrying API call', {
            accountId: this.accountId,
            attempt,
            delayMs,
            error: lastError.message,
          });
          await this.delay(delayMs);
          continue;
        }

        // Non-retryable error - throw immediately
        throw gmailError;
      }
    }

    // All retries exhausted
    throw this.handleError(lastError);
  }

  /**
   * Converts an error to the appropriate GmailError type.
   *
   * Inspects the error to determine the correct error class:
   * - 401/403 → GmailAuthError
   * - 429 → GmailRateLimitError
   * - 4xx/5xx → GmailAPIError
   *
   * @param error - Original error
   * @param context - Additional context for the error
   * @returns Typed Gmail error
   */
  private handleError(
    error: unknown,
    context: Record<string, unknown> = {}
  ): GmailAPIError | GmailAuthError | GmailRateLimitError {
    // Already a Gmail error - return as-is
    if (error instanceof GmailAPIError) {
      return error;
    }

    // Extract status code from Google API error
    // Google API errors have a response object with status
    const statusCode = this.extractStatusCode(error);
    const message = error instanceof Error ? error.message : 'Unknown Gmail error';

    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
      return new GmailAuthError(
        'Gmail authentication failed',
        {
          accountId: this.accountId,
          statusCode,
          ...context,
        },
        statusCode === 401 // 401 might be refreshable, 403 is not
      );
    }

    // Rate limit errors
    if (statusCode === 429) {
      // Try to extract retry-after from the error
      const retryAfterMs = this.extractRetryAfter(error);
      return new GmailRateLimitError(
        'Gmail rate limit exceeded',
        retryAfterMs,
        { accountId: this.accountId, ...context }
      );
    }

    // Other API errors
    return new GmailAPIError(
      message,
      statusCode || 500,
      { accountId: this.accountId, ...context }
    );
  }

  /**
   * Extracts HTTP status code from a Google API error.
   *
   * @param error - Error to inspect
   * @returns Status code or undefined
   */
  private extractStatusCode(error: unknown): number | undefined {
    // Google API errors have a code property
    if (error && typeof error === 'object') {
      // Direct code property
      if ('code' in error && typeof error.code === 'number') {
        return error.code;
      }

      // Nested in response
      if ('response' in error) {
        const response = (error as { response?: { status?: number } }).response;
        if (response?.status) {
          return response.status;
        }
      }

      // GaxiosError format
      if ('status' in error && typeof error.status === 'number') {
        return error.status;
      }
    }

    return undefined;
  }

  /**
   * Extracts retry-after delay from a rate limit error.
   *
   * @param error - Error to inspect
   * @returns Delay in milliseconds
   */
  private extractRetryAfter(error: unknown): number {
    // Try to extract from Retry-After header
    if (error && typeof error === 'object' && 'response' in error) {
      const response = error as {
        response?: { headers?: { 'retry-after'?: string } };
      };
      const retryAfter = response.response?.headers?.['retry-after'];

      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }

    // Default delay if we can't extract
    return DEFAULT_RATE_LIMIT_DELAY_MS;
  }

  /**
   * Delays execution for a specified duration.
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a GmailService instance with the provided access token.
 *
 * @param accessToken - Valid OAuth access token
 * @param accountId - Optional account ID for logging
 * @returns GmailService instance
 *
 * @example
 * ```typescript
 * const service = createGmailService(accessToken, account.id);
 * const messages = await service.listMessages();
 * ```
 */
export function createGmailService(
  accessToken: string,
  accountId?: string
): GmailService {
  return new GmailService(accessToken, accountId);
}
