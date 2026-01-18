/**
 * Custom Error Classes for Gmail Integration
 *
 * Provides structured, typed errors for Gmail API operations.
 * These errors include context information for better debugging
 * and error handling throughout the application.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HIERARCHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GmailError (base)
 * ├── GmailAuthError      - OAuth/authentication failures
 * ├── GmailAPIError       - API request failures
 * ├── GmailRateLimitError - Rate limit exceeded (extends GmailAPIError)
 * ├── GmailParseError     - Email parsing failures
 * └── GmailSyncError      - Sync operation failures
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Throwing typed errors
 * throw new GmailAuthError('Token expired', { accountId: '123' });
 *
 * // Catching and handling
 * try {
 *   await gmailService.fetchMessages();
 * } catch (error) {
 *   if (error instanceof GmailRateLimitError) {
 *     // Wait and retry
 *     await delay(error.retryAfterMs);
 *   } else if (error instanceof GmailAuthError) {
 *     // Refresh token
 *     await tokenManager.refreshToken(accountId);
 *   }
 * }
 * ```
 *
 * @module lib/gmail/errors
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CONTEXT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context information for Gmail errors.
 * This structured data helps with debugging and error reporting.
 */
export interface GmailErrorContext {
  /** Gmail account ID for multi-account scenarios */
  accountId?: string;
  /** User ID for user-specific operations */
  userId?: string;
  /** Gmail message ID for message-specific errors */
  messageId?: string;
  /** Gmail thread ID for thread-specific errors */
  threadId?: string;
  /** HTTP status code from Gmail API */
  statusCode?: number;
  /** Gmail API error code (e.g., 'QUOTA_EXCEEDED') */
  errorCode?: string;
  /** Original error that caused this error */
  originalError?: Error;
  /** Additional metadata for debugging */
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base error class for all Gmail-related errors.
 *
 * All Gmail errors extend this class to provide:
 * - Typed error identification (via instanceof)
 * - Structured context information
 * - JSON-serializable data for logging
 *
 * @example
 * ```typescript
 * try {
 *   await gmailService.fetchMessages();
 * } catch (error) {
 *   if (error instanceof GmailError) {
 *     logger.error('Gmail operation failed', {
 *       errorType: error.name,
 *       context: error.context,
 *     });
 *   }
 * }
 * ```
 */
export class GmailError extends Error {
  /** Structured context for debugging */
  public readonly context: GmailErrorContext;

  /** Timestamp when the error occurred */
  public readonly timestamp: string;

  /**
   * Creates a new GmailError.
   *
   * @param message - Human-readable error message
   * @param context - Structured context information
   */
  constructor(message: string, context: GmailErrorContext = {}) {
    super(message);

    // Set the error name for identification
    this.name = 'GmailError';

    // Maintains proper stack trace in V8 environments (Node.js, Chrome)
    // Use type assertion since captureStackTrace is V8-specific
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (error: Error, constructor: new (...args: unknown[]) => unknown) => void;
    };
    if (typeof ErrorWithCapture.captureStackTrace === 'function') {
      ErrorWithCapture.captureStackTrace(this, this.constructor as new (...args: unknown[]) => unknown);
    }

    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Converts the error to a JSON-serializable object.
   * Useful for logging and error reporting.
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when Gmail authentication fails.
 *
 * This includes:
 * - Expired access tokens
 * - Invalid refresh tokens
 * - Missing OAuth credentials
 * - Revoked permissions
 *
 * @example
 * ```typescript
 * // Token expired during API call
 * throw new GmailAuthError('Access token expired', {
 *   accountId: account.id,
 *   errorCode: 'TOKEN_EXPIRED',
 * });
 *
 * // Handling auth errors
 * if (error instanceof GmailAuthError) {
 *   if (error.isRefreshable) {
 *     await tokenManager.refreshToken(error.context.accountId);
 *   } else {
 *     // User needs to re-authenticate
 *     redirect('/settings?reauth=true');
 *   }
 * }
 * ```
 */
export class GmailAuthError extends GmailError {
  /** Whether the error can be resolved by refreshing the token */
  public readonly isRefreshable: boolean;

  constructor(
    message: string,
    context: GmailErrorContext = {},
    isRefreshable = true
  ) {
    super(message, context);
    this.name = 'GmailAuthError';
    this.isRefreshable = isRefreshable;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a Gmail API request fails.
 *
 * This includes:
 * - HTTP errors (4xx, 5xx)
 * - Network failures
 * - Invalid requests
 * - Server errors
 *
 * @example
 * ```typescript
 * // Handle API errors with status code
 * if (error instanceof GmailAPIError) {
 *   switch (error.statusCode) {
 *     case 400:
 *       console.error('Invalid request:', error.message);
 *       break;
 *     case 404:
 *       console.warn('Message not found');
 *       break;
 *     case 500:
 *       // Retry with backoff
 *       await retryWithBackoff(() => operation());
 *       break;
 *   }
 * }
 * ```
 */
export class GmailAPIError extends GmailError {
  /** HTTP status code from the API response */
  public readonly statusCode: number;

  /** Whether this error is retryable */
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    statusCode: number,
    context: GmailErrorContext = {}
  ) {
    super(message, { ...context, statusCode });
    this.name = 'GmailAPIError';
    this.statusCode = statusCode;

    // Determine if this error is retryable based on status code
    // 5xx errors and some 4xx errors (429 rate limit) are retryable
    this.isRetryable = statusCode >= 500 || statusCode === 429;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMIT ERROR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when Gmail API rate limit is exceeded.
 *
 * Gmail API has various quotas:
 * - Daily quota per user
 * - Rate limit per second
 * - Batch request limits
 *
 * This error provides retry timing information.
 *
 * @example
 * ```typescript
 * try {
 *   await gmailService.fetchMessages();
 * } catch (error) {
 *   if (error instanceof GmailRateLimitError) {
 *     logger.warn('Rate limited, waiting...', {
 *       retryAfterMs: error.retryAfterMs,
 *     });
 *     await delay(error.retryAfterMs);
 *     // Retry the operation
 *   }
 * }
 * ```
 */
export class GmailRateLimitError extends GmailAPIError {
  /** Milliseconds to wait before retrying */
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, context: GmailErrorContext = {}) {
    super(message, 429, context);
    this.name = 'GmailRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE ERROR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when parsing a Gmail message fails.
 *
 * This can happen when:
 * - Message has unexpected format
 * - Required headers are missing
 * - Body encoding is corrupted
 * - MIME structure is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const email = parseGmailMessage(message);
 * } catch (error) {
 *   if (error instanceof GmailParseError) {
 *     logger.warn('Failed to parse email, skipping', {
 *       messageId: error.context.messageId,
 *       field: error.failedField,
 *     });
 *     // Continue processing other messages
 *   }
 * }
 * ```
 */
export class GmailParseError extends GmailError {
  /** The specific field that failed to parse */
  public readonly failedField?: string;

  constructor(
    message: string,
    context: GmailErrorContext = {},
    failedField?: string
  ) {
    super(message, context);
    this.name = 'GmailParseError';
    this.failedField = failedField;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC ERROR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when email sync operation fails.
 *
 * This is a high-level error that wraps lower-level errors
 * (auth, API, parse) with sync-specific context.
 *
 * @example
 * ```typescript
 * try {
 *   await syncAllAccounts();
 * } catch (error) {
 *   if (error instanceof GmailSyncError) {
 *     // Log sync failure with full context
 *     await logSyncFailure({
 *       accountId: error.context.accountId,
 *       emailsFetched: error.emailsFetched,
 *       failedAt: error.failedAt,
 *       cause: error.context.originalError,
 *     });
 *   }
 * }
 * ```
 */
export class GmailSyncError extends GmailError {
  /** Number of emails successfully fetched before failure */
  public readonly emailsFetched: number;

  /** Stage at which the sync failed */
  public readonly failedAt: 'fetch' | 'parse' | 'save' | 'analyze';

  constructor(
    message: string,
    context: GmailErrorContext = {},
    emailsFetched = 0,
    failedAt: 'fetch' | 'parse' | 'save' | 'analyze' = 'fetch'
  ) {
    super(message, context);
    this.name = 'GmailSyncError';
    this.emailsFetched = emailsFetched;
    this.failedAt = failedAt;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type guard to check if an error is a Gmail error.
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error) {
 *   if (isGmailError(error)) {
 *     // TypeScript knows error is GmailError
 *     console.log(error.context);
 *   }
 * }
 * ```
 */
export function isGmailError(error: unknown): error is GmailError {
  return error instanceof GmailError;
}

/**
 * Creates a GmailError from an unknown error.
 *
 * This utility ensures we always have a typed GmailError,
 * even when catching unknown errors.
 *
 * @example
 * ```typescript
 * try {
 *   await gmailService.fetchMessages();
 * } catch (error) {
 *   const gmailError = toGmailError(error, { accountId: '123' });
 *   logger.error('Operation failed', gmailError.toJSON());
 * }
 * ```
 */
export function toGmailError(
  error: unknown,
  context: GmailErrorContext = {}
): GmailError {
  // If already a Gmail error, return it with merged context
  if (error instanceof GmailError) {
    return new GmailError(error.message, { ...error.context, ...context });
  }

  // If it's a standard Error, wrap it
  if (error instanceof Error) {
    return new GmailError(error.message, {
      ...context,
      originalError: error,
    });
  }

  // For unknown types, create a generic error
  return new GmailError(
    typeof error === 'string' ? error : 'Unknown Gmail error',
    context
  );
}
