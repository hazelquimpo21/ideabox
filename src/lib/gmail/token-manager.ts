/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Google OAuth Credentials type issues
/**
 * Gmail OAuth Token Manager
 *
 * Handles OAuth token refresh and validation for Gmail API access.
 * Ensures we always have valid access tokens for API requests.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Automatic token refresh when expired or about to expire
 * - Configurable expiry buffer (refresh before actual expiry)
 * - Retry logic with exponential backoff for refresh failures
 * - Database updates after successful refresh
 * - Structured error handling with typed errors
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { TokenManager } from '@/lib/gmail/token-manager';
 * import { createServerClient } from '@/lib/supabase/server';
 *
 * const supabase = createServerClient();
 * const tokenManager = new TokenManager(supabase);
 *
 * // Get a valid access token (refreshes if needed)
 * const accessToken = await tokenManager.getValidToken(gmailAccount);
 *
 * // Use the token for Gmail API requests
 * const gmail = google.gmail({ version: 'v1', auth: oauthClient });
 * ```
 *
 * @module lib/gmail/token-manager
 * @version 1.0.0
 */

import { google } from 'googleapis';
import { createLogger, logAuth } from '@/lib/utils/logger';
import { GmailAuthError } from './errors';
import type {
  GmailAccount,
  TokenRefreshResult,
  ITokenManager,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Buffer time before token expiry (in milliseconds).
 * We refresh tokens 5 minutes before they expire to avoid
 * race conditions during long-running operations.
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum retry attempts for token refresh.
 */
const MAX_REFRESH_RETRIES = 3;

/**
 * Base delay for exponential backoff (in milliseconds).
 * Retry delays: 1s, 2s, 4s
 */
const RETRY_BASE_DELAY_MS = 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TokenManager');

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages OAuth tokens for Gmail API access.
 *
 * This class ensures we always have valid access tokens by:
 * 1. Checking token expiry before each request
 * 2. Automatically refreshing expired tokens
 * 3. Updating the database with new tokens
 * 4. Handling refresh failures gracefully
 *
 * @example
 * ```typescript
 * const tokenManager = new TokenManager(supabase);
 *
 * // In your Gmail service
 * const accessToken = await tokenManager.getValidToken(account);
 *
 * // Token is guaranteed to be valid for at least 5 minutes
 * const gmail = createGmailClient(accessToken);
 * ```
 */
export class TokenManager implements ITokenManager {
  /** Supabase client for database operations */
  private readonly supabase: SupabaseClient;

  /** Google OAuth2 client for token refresh */
  private readonly oauth2Client: InstanceType<typeof google.auth.OAuth2>;

  /**
   * Creates a new TokenManager instance.
   *
   * @param supabase - Supabase client for database operations
   */
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;

    // Initialize OAuth2 client with credentials from environment
    // These are required for token refresh operations
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      // Redirect URI is not needed for refresh operations
      // but we include it for completeness
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets a valid access token for a Gmail account.
   *
   * This method checks if the current token is valid and refreshes
   * it if necessary. It's the main entry point for token management.
   *
   * @param account - Gmail account record from database
   * @returns Valid access token
   * @throws GmailAuthError if token refresh fails after retries
   *
   * @example
   * ```typescript
   * const account = await getGmailAccount(accountId);
   * const token = await tokenManager.getValidToken(account);
   *
   * // Use token for API requests
   * const gmail = google.gmail({ version: 'v1', auth: oauthClient });
   * oauthClient.setCredentials({ access_token: token });
   * ```
   */
  public async getValidToken(account: GmailAccount): Promise<string> {
    logger.debug('Getting valid token', {
      accountId: account.id,
      email: account.email,
    });

    // Check if the current token is still valid
    if (!this.isTokenExpired(account.token_expiry)) {
      logger.debug('Token is still valid', {
        accountId: account.id,
        expiresAt: account.token_expiry,
      });
      return account.access_token;
    }

    // Token is expired or about to expire - refresh it
    logger.info('Token expired, refreshing', {
      accountId: account.id,
      expiredAt: account.token_expiry,
    });

    const result = await this.refreshToken(account);

    if (!result.success || !result.accessToken) {
      throw new GmailAuthError(
        result.error || 'Token refresh failed',
        { accountId: account.id },
        false // Not refreshable - refresh already failed
      );
    }

    return result.accessToken;
  }

  /**
   * Forces a token refresh, regardless of expiry status.
   *
   * This method:
   * 1. Uses the refresh token to get a new access token from Google
   * 2. Updates the database with the new token and expiry
   * 3. Returns the result (success/failure with details)
   *
   * @param account - Gmail account record from database
   * @returns Result object with new token or error details
   *
   * @example
   * ```typescript
   * // Force refresh even if token isn't expired
   * const result = await tokenManager.refreshToken(account);
   *
   * if (result.success) {
   *   console.log('New token:', result.accessToken);
   * } else {
   *   console.error('Refresh failed:', result.error);
   * }
   * ```
   */
  public async refreshToken(account: GmailAccount): Promise<TokenRefreshResult> {
    logAuth.tokenExpired({ accountId: account.id });

    // Set the refresh token for the OAuth client
    this.oauth2Client.setCredentials({
      refresh_token: account.refresh_token,
    });

    // Attempt refresh with retry logic
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_REFRESH_RETRIES; attempt++) {
      try {
        logger.debug('Attempting token refresh', {
          accountId: account.id,
          attempt,
          maxAttempts: MAX_REFRESH_RETRIES,
        });

        // Request new access token from Google
        const { credentials } = await this.oauth2Client.refreshAccessToken();

        // Validate we received a new access token
        if (!credentials.access_token) {
          throw new Error('No access token in refresh response');
        }

        // Calculate expiry time
        // Google returns expiry_date (timestamp) or expires_in (seconds)
        let expiresAt: string;

        if (credentials.expiry_date) {
          expiresAt = new Date(credentials.expiry_date).toISOString();
        } else if (credentials.expires_in) {
          const expiryMs = Date.now() + credentials.expires_in * 1000;
          expiresAt = new Date(expiryMs).toISOString();
        } else {
          // Default to 1 hour from now if no expiry info
          expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        }

        // Update the database with new token
        const { error: updateError } = await this.supabase
          .from('gmail_accounts')
          .update({
            access_token: credentials.access_token,
            token_expiry: expiresAt,
            // Also update refresh token if a new one was provided
            ...(credentials.refresh_token && {
              refresh_token: credentials.refresh_token,
            }),
          })
          .eq('id', account.id);

        if (updateError) {
          // Log but don't fail - we still have the new token in memory
          logger.warn('Failed to update token in database', {
            accountId: account.id,
            error: updateError.message,
          });
        }

        logAuth.tokenRefreshed({ accountId: account.id });

        return {
          success: true,
          accessToken: credentials.access_token,
          expiresAt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Token refresh attempt failed', {
          accountId: account.id,
          attempt,
          error: lastError.message,
        });

        // Check if this is a non-retryable error
        // (e.g., invalid_grant means the refresh token is revoked)
        if (this.isNonRetryableError(lastError)) {
          logger.error('Non-retryable token error', {
            accountId: account.id,
            error: lastError.message,
          });
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < MAX_REFRESH_RETRIES) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('Waiting before retry', {
            accountId: account.id,
            delayMs,
          });
          await this.delay(delayMs);
        }
      }
    }

    // All attempts failed
    logAuth.loginError({
      accountId: account.id,
      error: lastError?.message || 'Unknown error',
    });

    return {
      success: false,
      error: lastError?.message || 'Token refresh failed after retries',
    };
  }

  /**
   * Checks if a token is expired or about to expire.
   *
   * We consider a token "expired" if it will expire within
   * TOKEN_EXPIRY_BUFFER_MS (default: 5 minutes). This gives us
   * time to refresh before actual expiry.
   *
   * @param expiresAt - Token expiry time (ISO 8601 string)
   * @param bufferMs - Buffer before expiry (default: 5 minutes)
   * @returns true if token is expired or will expire soon
   *
   * @example
   * ```typescript
   * // Check with default buffer (5 minutes)
   * if (tokenManager.isTokenExpired(account.token_expiry)) {
   *   // Token needs refresh
   * }
   *
   * // Check with custom buffer (10 minutes)
   * const TEN_MINUTES = 10 * 60 * 1000;
   * if (tokenManager.isTokenExpired(account.token_expiry, TEN_MINUTES)) {
   *   // Token expires in less than 10 minutes
   * }
   * ```
   */
  public isTokenExpired(
    expiresAt: string,
    bufferMs: number = TOKEN_EXPIRY_BUFFER_MS
  ): boolean {
    try {
      const expiryTime = new Date(expiresAt).getTime();
      const now = Date.now();

      // Token is expired if current time + buffer is past expiry
      return now + bufferMs >= expiryTime;
    } catch {
      // If we can't parse the expiry, assume it's expired
      logger.warn('Could not parse token expiry, assuming expired', {
        expiresAt,
      });
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Checks if an error is non-retryable.
   *
   * Certain OAuth errors should not be retried:
   * - invalid_grant: Refresh token is revoked/invalid
   * - invalid_client: Client credentials are wrong
   *
   * @param error - Error from token refresh
   * @returns true if the error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // These error codes indicate the refresh token is invalid
    // User needs to re-authenticate
    const nonRetryableErrors = [
      'invalid_grant',
      'invalid_client',
      'unauthorized_client',
      'access_denied',
    ];

    return nonRetryableErrors.some((code) => message.includes(code));
  }

  /**
   * Delays execution for a specified duration.
   *
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a TokenManager instance with the provided Supabase client.
 *
 * This is a convenience function for cases where you don't want
 * to instantiate the class directly.
 *
 * @param supabase - Supabase client
 * @returns TokenManager instance
 *
 * @example
 * ```typescript
 * const supabase = createServerClient();
 * const tokenManager = createTokenManager(supabase);
 * ```
 */
export function createTokenManager(supabase: SupabaseClient): TokenManager {
  return new TokenManager(supabase);
}
