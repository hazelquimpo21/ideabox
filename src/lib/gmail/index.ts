/**
 * Gmail Integration Module
 *
 * Central export point for all Gmail-related functionality.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MODULE OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module provides everything needed to integrate with Gmail:
 *
 * - **GmailService**: High-level API for fetching emails
 * - **TokenManager**: OAuth token refresh and validation
 * - **EmailParser**: Convert Gmail messages to our format
 * - **Error classes**: Typed errors for proper error handling
 * - **Types**: TypeScript types for all operations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import {
 *   GmailService,
 *   TokenManager,
 *   EmailParser,
 *   GmailAuthError,
 *   isGmailError,
 * } from '@/lib/gmail';
 *
 * // Setup
 * const tokenManager = new TokenManager(supabase);
 * const accessToken = await tokenManager.getValidToken(account);
 * const gmailService = new GmailService(accessToken);
 * const parser = new EmailParser();
 *
 * // Fetch and parse emails
 * try {
 *   const list = await gmailService.listMessages({ maxResults: 50 });
 *   const messages = await gmailService.getMessages(
 *     list.messages?.map(m => m.id) || []
 *   );
 *
 *   for (const message of messages) {
 *     const parsed = parser.parse(message);
 *     const insertData = parser.toInsertData(parsed, userId, accountId);
 *     await supabase.from('emails').insert(insertData);
 *   }
 * } catch (error) {
 *   if (error instanceof GmailAuthError) {
 *     // Handle auth error - maybe refresh token
 *   }
 * }
 * ```
 *
 * @module lib/gmail
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { GmailService, createGmailService } from './gmail-service';
export { TokenManager, createTokenManager } from './token-manager';
export {
  EmailParser,
  emailParser,
  parseGmailMessage,
  parseGmailMessages,
} from './email-parser';

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  GmailError,
  GmailAuthError,
  GmailAPIError,
  GmailRateLimitError,
  GmailParseError,
  GmailSyncError,
  isGmailError,
  toGmailError,
} from './errors';

export type { GmailErrorContext } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  // Gmail API types
  GmailHeader,
  GmailMessagePart,
  GmailMessage,
  GmailMessagesListResponse,
  GmailHistoryRecord,
  GmailHistoryResponse,

  // Parsed email types
  ParsedEmail,
  EmailInsertData,

  // Sync types
  SyncConfig,
  SyncResult,
  AccountSyncStatus,

  // Token types
  TokenData,
  TokenRefreshResult,

  // Service interfaces (for testing/mocking)
  IGmailService,
  ITokenManager,
  IEmailParser,

  // Database types (re-exported)
  Email,
  GmailAccount,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export { DEFAULT_SYNC_CONFIG, GMAIL_LABELS } from './types';
export type { GmailLabelId } from './types';
