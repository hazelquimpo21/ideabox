/**
 * TypeScript Types for Gmail Integration
 *
 * Defines all types used in Gmail API operations, email parsing,
 * and sync workflows. These types ensure type safety throughout
 * the Gmail integration layer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TYPE CATEGORIES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. API Types - Gmail API request/response shapes
 * 2. Parsed Types - Our internal email representation
 * 3. Sync Types - Sync operation configuration and results
 * 4. Token Types - OAuth token management
 *
 * @module lib/gmail/types
 * @version 1.0.0
 */

import type { Email, GmailAccount } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL API TYPES
// These types represent the Gmail API response structures
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gmail message header from the API.
 * Headers contain metadata like From, To, Subject, Date.
 */
export interface GmailHeader {
  /** Header name (e.g., 'From', 'Subject', 'Date') */
  name: string;
  /** Header value */
  value: string;
}

/**
 * Gmail message part (for MIME multipart messages).
 * Messages can have nested parts for attachments, HTML/text alternatives.
 */
export interface GmailMessagePart {
  /** Part ID within the message */
  partId?: string;
  /** MIME type (e.g., 'text/plain', 'text/html', 'multipart/alternative') */
  mimeType?: string;
  /** Part filename (for attachments) */
  filename?: string;
  /** Part headers */
  headers?: GmailHeader[];
  /** Part body */
  body?: {
    /** Attachment ID for large attachments */
    attachmentId?: string;
    /** Size in bytes */
    size?: number;
    /** Base64-encoded data (URL-safe encoding) */
    data?: string;
  };
  /** Nested parts for multipart messages */
  parts?: GmailMessagePart[];
}

/**
 * Gmail message from the API (simplified).
 * This represents the shape returned by messages.get().
 */
export interface GmailMessage {
  /** Unique message ID */
  id: string;
  /** Thread ID this message belongs to */
  threadId: string;
  /** Gmail label IDs (e.g., 'INBOX', 'UNREAD', 'STARRED') */
  labelIds?: string[];
  /** Short snippet of the message content */
  snippet?: string;
  /** History ID for incremental sync */
  historyId?: string;
  /** Internal timestamp (milliseconds since epoch) */
  internalDate?: string;
  /** Message payload (headers and body) */
  payload?: GmailMessagePart;
  /** Size estimate in bytes */
  sizeEstimate?: number;
  /** Raw message data (when format=raw) */
  raw?: string;
}

/**
 * Gmail messages.list response.
 */
export interface GmailMessagesListResponse {
  /** Array of message metadata (id and threadId only) */
  messages?: Array<{ id: string; threadId: string }>;
  /** Token for fetching the next page */
  nextPageToken?: string;
  /** Estimated total results */
  resultSizeEstimate?: number;
}

/**
 * Gmail history record for incremental sync.
 */
export interface GmailHistoryRecord {
  /** History ID */
  id: string;
  /** Messages added */
  messagesAdded?: Array<{
    message: GmailMessage;
  }>;
  /** Messages deleted */
  messagesDeleted?: Array<{
    message: { id: string; threadId: string };
  }>;
  /** Labels added to messages */
  labelsAdded?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
    labelIds: string[];
  }>;
  /** Labels removed from messages */
  labelsRemoved?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
    labelIds: string[];
  }>;
}

/**
 * Gmail history.list response.
 */
export interface GmailHistoryResponse {
  /** Array of history records */
  history?: GmailHistoryRecord[];
  /** Token for fetching the next page */
  nextPageToken?: string;
  /** Latest history ID */
  historyId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSED EMAIL TYPES
// These types represent our internal email representation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parsed email ready for database storage.
 * This is the result of parsing a GmailMessage.
 */
export interface ParsedEmail {
  /** Gmail message ID */
  gmailId: string;
  /** Gmail thread ID */
  threadId: string;
  /** Email subject */
  subject: string | null;
  /** Sender email address */
  senderEmail: string;
  /** Sender display name */
  senderName: string | null;
  /** Recipient email address */
  recipientEmail: string | null;
  /** Email date (ISO 8601) */
  date: string;
  /** Gmail snippet (short preview) */
  snippet: string | null;
  /** Plain text body (truncated to MAX_BODY_CHARS) */
  bodyText: string | null;
  /** HTML body (stored in full for display) */
  bodyHtml: string | null;
  /** Original Gmail label IDs */
  gmailLabels: string[];
  /** Whether the email is read */
  isRead: boolean;
  /** Whether the email is starred */
  isStarred: boolean;
}

/**
 * Email insert data for Supabase.
 * Combines parsed email with user/account context.
 */
export interface EmailInsertData {
  /** User ID (from auth) */
  user_id: string;
  /** Gmail account ID */
  gmail_account_id: string;
  /** Gmail message ID */
  gmail_id: string;
  /** Gmail thread ID */
  thread_id: string;
  /** Email subject */
  subject: string | null;
  /** Sender email address */
  sender_email: string;
  /** Sender display name */
  sender_name: string | null;
  /** Recipient email address */
  recipient_email: string | null;
  /** Email date (ISO 8601) */
  date: string;
  /** Gmail snippet */
  snippet: string | null;
  /** Plain text body */
  body_text: string | null;
  /** HTML body */
  body_html: string | null;
  /** Gmail label IDs */
  gmail_labels: string[];
  /** Whether the email is read */
  is_read: boolean;
  /** Whether the email is starred */
  is_starred: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for email sync operations.
 */
export interface SyncConfig {
  /**
   * Maximum number of messages to fetch per sync.
   * Gmail API limit: 500 per request.
   * @default 100
   */
  maxResults?: number;

  /**
   * Whether to do a full sync (ignore historyId) or incremental.
   * Full sync should be used for initial setup or recovery.
   * @default false
   */
  fullSync?: boolean;

  /**
   * Query to filter messages (Gmail search syntax).
   * Examples: 'is:unread', 'after:2024/01/01', 'from:client@example.com'
   * @default undefined (no filter)
   */
  query?: string;

  /**
   * Label IDs to filter by.
   * @default ['INBOX']
   */
  labelIds?: string[];

  /**
   * Maximum body characters to store (cost optimization).
   * Longer bodies are truncated for AI analysis.
   * @default 16000
   */
  maxBodyChars?: number;

  /**
   * Whether to skip already synced messages.
   * @default true
   */
  skipExisting?: boolean;
}

/**
 * Default sync configuration values.
 */
export const DEFAULT_SYNC_CONFIG: Required<SyncConfig> = {
  maxResults: 100,
  fullSync: false,
  query: '',
  labelIds: ['INBOX'],
  maxBodyChars: 16000,
  skipExisting: true,
};

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Whether the sync was successful */
  success: boolean;
  /** Number of messages fetched from Gmail */
  messagesFetched: number;
  /** Number of new messages saved to database */
  messagesCreated: number;
  /** Number of messages skipped (already existed) */
  messagesSkipped: number;
  /** Number of messages that failed to process */
  messagesFailed: number;
  /** New history ID for next incremental sync */
  historyId?: string;
  /** Duration of the sync in milliseconds */
  durationMs: number;
  /** Any errors encountered (non-fatal) */
  errors: Array<{
    messageId: string;
    error: string;
  }>;
}

/**
 * Account sync status for UI display.
 */
export interface AccountSyncStatus {
  /** Gmail account ID */
  accountId: string;
  /** Account email */
  email: string;
  /** Whether sync is currently running */
  isSyncing: boolean;
  /** Last sync time (ISO 8601) */
  lastSyncAt: string | null;
  /** Last sync result */
  lastSyncResult?: SyncResult;
  /** Error message if last sync failed */
  lastError?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OAuth token data structure.
 */
export interface TokenData {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** Token expiry time (ISO 8601) */
  expiresAt: string;
  /** Token scope */
  scope?: string;
}

/**
 * Result of a token refresh operation.
 */
export interface TokenRefreshResult {
  /** Whether the refresh was successful */
  success: boolean;
  /** New access token (if successful) */
  accessToken?: string;
  /** New expiry time (if successful) */
  expiresAt?: string;
  /** Error message (if failed) */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Interface for Gmail service implementations.
 * Allows for easy mocking in tests.
 */
export interface IGmailService {
  /**
   * Lists messages in the user's mailbox.
   */
  listMessages(config?: Partial<SyncConfig>): Promise<GmailMessagesListResponse>;

  /**
   * Gets a single message by ID.
   */
  getMessage(messageId: string): Promise<GmailMessage>;

  /**
   * Gets multiple messages by ID.
   */
  getMessages(messageIds: string[]): Promise<GmailMessage[]>;

  /**
   * Gets incremental history since a history ID.
   */
  getHistory(startHistoryId: string): Promise<GmailHistoryResponse>;
}

/**
 * Interface for token manager implementations.
 */
export interface ITokenManager {
  /**
   * Gets a valid access token, refreshing if necessary.
   */
  getValidToken(account: GmailAccount): Promise<string>;

  /**
   * Forces a token refresh.
   */
  refreshToken(account: GmailAccount): Promise<TokenRefreshResult>;

  /**
   * Checks if a token is expired or about to expire.
   */
  isTokenExpired(expiresAt: string, bufferMs?: number): boolean;
}

/**
 * Interface for email parser implementations.
 */
export interface IEmailParser {
  /**
   * Parses a Gmail message into our internal format.
   */
  parse(message: GmailMessage, maxBodyChars?: number): ParsedEmail;

  /**
   * Converts a parsed email to database insert format.
   */
  toInsertData(
    parsed: ParsedEmail,
    userId: string,
    accountId: string
  ): EmailInsertData;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gmail label names mapping.
 * Maps label IDs to human-readable names.
 */
export const GMAIL_LABELS = {
  INBOX: 'INBOX',
  UNREAD: 'UNREAD',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
  SENT: 'SENT',
  DRAFT: 'DRAFT',
  SPAM: 'SPAM',
  TRASH: 'TRASH',
  CATEGORY_PERSONAL: 'CATEGORY_PERSONAL',
  CATEGORY_SOCIAL: 'CATEGORY_SOCIAL',
  CATEGORY_PROMOTIONS: 'CATEGORY_PROMOTIONS',
  CATEGORY_UPDATES: 'CATEGORY_UPDATES',
  CATEGORY_FORUMS: 'CATEGORY_FORUMS',
} as const;

/**
 * Type for Gmail label IDs.
 */
export type GmailLabelId = (typeof GMAIL_LABELS)[keyof typeof GMAIL_LABELS];

/**
 * Re-export database types for convenience.
 */
export type { Email, GmailAccount };
