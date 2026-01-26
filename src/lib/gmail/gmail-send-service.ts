/**
 * Gmail Send Service
 *
 * Provides functionality for sending emails directly through users' Gmail accounts
 * using the Gmail API. This enables IdeaBox to send emails as the user, with messages
 * appearing in their Sent folder and coming from their actual Gmail address.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Send single emails with HTML/plain text body
 * - Send replies in existing threads
 * - Tracking pixel injection for open tracking
 * - RFC 2822 compliant MIME message building
 * - Support for CC, BCC, and Reply-To headers
 * - Structured error handling and logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * OAUTH SCOPE REQUIRED
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This service requires the `https://www.googleapis.com/auth/gmail.send` scope.
 * Users must grant this permission before sending emails.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { GmailSendService } from '@/lib/gmail/gmail-send-service';
 *
 * // Create service instance
 * const sendService = new GmailSendService(accessToken, accountId);
 *
 * // Send a simple email
 * const result = await sendService.sendEmail({
 *   to: 'recipient@example.com',
 *   toName: 'John Doe',
 *   subject: 'Hello from IdeaBox',
 *   bodyHtml: '<p>This is a test email.</p>',
 * });
 *
 * // Send a reply
 * const replyResult = await sendService.sendReply({
 *   to: 'recipient@example.com',
 *   subject: 'Re: Original Subject',
 *   bodyHtml: '<p>Thanks for your email!</p>',
 *   inReplyTo: 'original-message-id@mail.gmail.com',
 *   threadId: 'gmail-thread-id',
 * });
 *
 * // Inject tracking pixel
 * const htmlWithTracking = sendService.injectTrackingPixel(
 *   bodyHtml,
 *   trackingId
 * );
 * ```
 *
 * @module lib/gmail/gmail-send-service
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { google, gmail_v1 } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';
import {
  GmailAPIError,
  GmailRateLimitError,
  GmailAuthError,
} from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum retry attempts for send operations.
 */
const MAX_SEND_RETRIES = 3;

/**
 * Base delay for exponential backoff (milliseconds).
 */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Retry delays for send failures: 1 min, 5 min, 15 min.
 */
const RETRY_DELAYS_MS = [60000, 300000, 900000];

/**
 * Default rate limit retry delay (milliseconds).
 */
const DEFAULT_RATE_LIMIT_DELAY_MS = 60000; // 60 seconds

/**
 * App URL for tracking pixel (from environment).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('GmailSend');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for sending an email.
 */
export interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Recipient display name (optional) */
  toName?: string;
  /** Email subject */
  subject: string;
  /** HTML body content */
  bodyHtml: string;
  /** Plain text body content (optional, auto-generated if not provided) */
  bodyText?: string;
  /** CC recipients (email addresses) */
  cc?: string[];
  /** BCC recipients (email addresses) */
  bcc?: string[];
  /** Reply-To address */
  replyTo?: string;
  /** Sender display name (shown in From header) */
  fromName?: string;
  /** Message-ID this is replying to (for threading) */
  inReplyTo?: string;
  /** References header (for threading) */
  references?: string;
  /** Gmail thread ID (for replies) */
  threadId?: string;
  /** Tracking ID for open tracking pixel */
  trackingId?: string;
  /** Whether to inject tracking pixel (default: true if trackingId provided) */
  enableTracking?: boolean;
}

/**
 * Result of a send operation.
 */
export interface SendResult {
  /** Whether the send was successful */
  success: boolean;
  /** Gmail message ID of the sent email */
  messageId?: string;
  /** Gmail thread ID */
  threadId?: string;
  /** Gmail's internal labels on the sent message */
  labelIds?: string[];
  /** Error message if send failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
}

/**
 * Error codes for send failures.
 */
export type SendErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'INVALID_RECIPIENT'
  | 'INVALID_SENDER'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'SCOPE_MISSING'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL SEND SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for sending emails via Gmail API.
 *
 * This class handles all the complexity of sending emails through Gmail:
 * - Building RFC 2822 compliant MIME messages
 * - Threading (In-Reply-To/References headers)
 * - Tracking pixel injection
 * - Error handling and retries
 *
 * @example
 * ```typescript
 * const sendService = new GmailSendService(accessToken);
 *
 * // Send email with tracking
 * const result = await sendService.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   bodyHtml: '<p>World!</p>',
 *   trackingId: 'uuid-tracking-id',
 * });
 *
 * if (result.success) {
 *   console.log('Sent! Message ID:', result.messageId);
 * }
 * ```
 */
export class GmailSendService {
  /** Gmail API client instance */
  private readonly gmail: gmail_v1.Gmail;

  /** Account ID for logging context */
  private readonly accountId?: string;

  /** User's email address (retrieved from profile) */
  private userEmail?: string;

  /**
   * Creates a new GmailSendService instance.
   *
   * @param accessToken - Valid OAuth access token with gmail.send scope
   * @param accountId - Optional account ID for logging
   */
  constructor(accessToken: string, accountId?: string) {
    // Create OAuth2 client with the access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    // Initialize Gmail API client
    this.gmail = google.gmail({ version: 'v1', auth });
    this.accountId = accountId;

    logger.debug('GmailSendService initialized', { accountId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sends an email via Gmail API.
   *
   * This method builds an RFC 2822 compliant MIME message and sends it
   * through the Gmail API. The email will appear in the user's Sent folder.
   *
   * @param options - Email options (to, subject, body, etc.)
   * @returns Send result with message ID or error
   *
   * @example
   * ```typescript
   * // Simple email
   * const result = await sendService.sendEmail({
   *   to: 'john@example.com',
   *   toName: 'John Doe',
   *   subject: 'Meeting Tomorrow',
   *   bodyHtml: '<p>Hi John, are we still on for tomorrow?</p>',
   * });
   *
   * // Email with tracking
   * const trackedResult = await sendService.sendEmail({
   *   to: 'john@example.com',
   *   subject: 'Newsletter',
   *   bodyHtml: '<p>Check out our latest updates!</p>',
   *   trackingId: 'newsletter-123',
   * });
   * ```
   */
  public async sendEmail(options: SendEmailOptions): Promise<SendResult> {
    logger.info('Sending email', {
      accountId: this.accountId,
      to: options.to,
      subject: options.subject?.substring(0, 50),
      hasTracking: !!options.trackingId,
      isReply: !!options.inReplyTo,
    });

    try {
      // Get sender email if not already cached
      if (!this.userEmail) {
        this.userEmail = await this.getUserEmail();
      }

      // Inject tracking pixel if enabled
      let bodyHtml = options.bodyHtml;
      if (options.trackingId && options.enableTracking !== false) {
        bodyHtml = this.injectTrackingPixel(bodyHtml, options.trackingId);
        logger.debug('Injected tracking pixel', {
          accountId: this.accountId,
          trackingId: options.trackingId,
        });
      }

      // Build the MIME message
      const mimeMessage = this.buildMimeMessage({
        ...options,
        bodyHtml,
        fromEmail: this.userEmail,
      });

      // Encode for Gmail API (URL-safe base64)
      const encodedMessage = this.encodeMessage(mimeMessage);

      // Send via Gmail API
      const response = await this.executeWithRetry(async () => {
        return this.gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
            threadId: options.threadId,
          },
        });
      });

      const result: SendResult = {
        success: true,
        messageId: response.data.id || undefined,
        threadId: response.data.threadId || undefined,
        labelIds: response.data.labelIds || undefined,
      };

      logger.info('Email sent successfully', {
        accountId: this.accountId,
        to: options.to,
        messageId: result.messageId,
        threadId: result.threadId,
      });

      return result;
    } catch (error) {
      const { message, code } = this.parseError(error);

      logger.error('Failed to send email', {
        accountId: this.accountId,
        to: options.to,
        error: message,
        errorCode: code,
      });

      return {
        success: false,
        error: message,
        errorCode: code,
      };
    }
  }

  /**
   * Sends a reply to an existing email thread.
   *
   * This is a convenience wrapper around sendEmail that ensures proper
   * threading by setting In-Reply-To and References headers.
   *
   * @param options - Send options with inReplyTo and threadId required
   * @returns Send result
   *
   * @example
   * ```typescript
   * // Reply to an email
   * const result = await sendService.sendReply({
   *   to: 'original-sender@example.com',
   *   subject: 'Re: Original Subject',
   *   bodyHtml: '<p>Thanks for your email!</p>',
   *   inReplyTo: '<original-message-id@mail.gmail.com>',
   *   references: '<original-message-id@mail.gmail.com>',
   *   threadId: 'abc123thread',
   * });
   * ```
   */
  public async sendReply(
    options: SendEmailOptions & { inReplyTo: string; threadId: string }
  ): Promise<SendResult> {
    logger.info('Sending reply', {
      accountId: this.accountId,
      to: options.to,
      threadId: options.threadId,
      inReplyTo: options.inReplyTo?.substring(0, 30),
    });

    // Ensure subject has Re: prefix for replies
    let subject = options.subject;
    if (!subject.toLowerCase().startsWith('re:')) {
      subject = `Re: ${subject}`;
    }

    return this.sendEmail({
      ...options,
      subject,
    });
  }

  /**
   * Injects a tracking pixel into HTML content.
   *
   * The tracking pixel is a transparent 1x1 image that loads from our
   * tracking endpoint. When the email is opened and images are loaded,
   * we record the open event.
   *
   * @param html - HTML body content
   * @param trackingId - Unique tracking ID for this email
   * @returns HTML with tracking pixel injected before </body>
   *
   * @example
   * ```typescript
   * const htmlWithTracking = sendService.injectTrackingPixel(
   *   '<html><body><p>Hello!</p></body></html>',
   *   'tracking-uuid-123'
   * );
   * // Result: ...Hello!</p><img src="..." /></body></html>
   * ```
   */
  public injectTrackingPixel(html: string, trackingId: string): string {
    const pixelUrl = `${APP_URL}/api/tracking/open/${trackingId}`;

    // Tracking pixel: transparent 1x1 image with inline styles to hide it
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block!important;width:1px!important;height:1px!important;border:0!important;margin:0!important;padding:0!important;" />`;

    // Insert before </body> if present, otherwise append to end
    if (html.toLowerCase().includes('</body>')) {
      return html.replace(
        /<\/body>/i,
        `${pixel}</body>`
      );
    }

    // No </body> tag - append to end
    return html + pixel;
  }

  /**
   * Gets the authenticated user's email address.
   *
   * This is used for the From header in outgoing emails.
   *
   * @returns User's email address
   * @throws GmailAPIError if profile fetch fails
   */
  public async getUserEmail(): Promise<string> {
    logger.debug('Fetching user email for From header', {
      accountId: this.accountId,
    });

    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me',
      });

      const email = response.data.emailAddress;
      if (!email) {
        throw new Error('No email address in profile response');
      }

      logger.debug('Got user email', {
        accountId: this.accountId,
        email,
      });

      return email;
    } catch (error) {
      logger.error('Failed to get user email', {
        accountId: this.accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - MESSAGE BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds an RFC 2822 compliant MIME message.
   *
   * Creates a multipart/alternative message with both plain text and HTML
   * versions of the content. Includes all necessary headers for proper
   * email delivery and threading.
   *
   * @param options - Email options with fromEmail added
   * @returns Complete MIME message string
   */
  private buildMimeMessage(
    options: SendEmailOptions & { fromEmail: string }
  ): string {
    const {
      to,
      toName,
      subject,
      bodyHtml,
      bodyText,
      cc,
      bcc,
      replyTo,
      fromName,
      fromEmail,
      inReplyTo,
      references,
    } = options;

    // Generate message boundary for multipart
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Build headers
    const headers: string[] = [];

    // From header
    if (fromName) {
      headers.push(`From: "${this.encodeHeaderValue(fromName)}" <${fromEmail}>`);
    } else {
      headers.push(`From: ${fromEmail}`);
    }

    // To header
    if (toName) {
      headers.push(`To: "${this.encodeHeaderValue(toName)}" <${to}>`);
    } else {
      headers.push(`To: ${to}`);
    }

    // CC header (if present)
    if (cc && cc.length > 0) {
      headers.push(`Cc: ${cc.join(', ')}`);
    }

    // BCC header (if present)
    if (bcc && bcc.length > 0) {
      headers.push(`Bcc: ${bcc.join(', ')}`);
    }

    // Reply-To header (if different from From)
    if (replyTo) {
      headers.push(`Reply-To: ${replyTo}`);
    }

    // Subject header (RFC 2047 encoded if needed)
    headers.push(`Subject: ${this.encodeSubject(subject)}`);

    // Date header
    headers.push(`Date: ${new Date().toUTCString()}`);

    // Message-ID header
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@ideabox.app>`;
    headers.push(`Message-ID: ${messageId}`);

    // Threading headers for replies
    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`);
    }
    if (references) {
      headers.push(`References: ${references}`);
    } else if (inReplyTo) {
      // If no references but we have in-reply-to, use that
      headers.push(`References: ${inReplyTo}`);
    }

    // MIME headers
    headers.push('MIME-Version: 1.0');
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    // Generate plain text from HTML if not provided
    const plainText = bodyText || this.htmlToPlainText(bodyHtml);

    // Build message body
    const messageParts: string[] = [];

    // Plain text part
    messageParts.push(`--${boundary}`);
    messageParts.push('Content-Type: text/plain; charset="UTF-8"');
    messageParts.push('Content-Transfer-Encoding: quoted-printable');
    messageParts.push('');
    messageParts.push(this.toQuotedPrintable(plainText));

    // HTML part
    messageParts.push(`--${boundary}`);
    messageParts.push('Content-Type: text/html; charset="UTF-8"');
    messageParts.push('Content-Transfer-Encoding: quoted-printable');
    messageParts.push('');
    messageParts.push(this.toQuotedPrintable(bodyHtml));

    // End boundary
    messageParts.push(`--${boundary}--`);

    // Combine headers and body
    return headers.join('\r\n') + '\r\n\r\n' + messageParts.join('\r\n');
  }

  /**
   * Encodes a MIME message for the Gmail API.
   *
   * Gmail API requires messages to be base64 URL-safe encoded.
   *
   * @param message - MIME message string
   * @returns URL-safe base64 encoded message
   */
  private encodeMessage(message: string): string {
    // Convert to base64 and make URL-safe
    const base64 = Buffer.from(message).toString('base64');
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Encodes a header value for RFC 2047 (MIME encoded-word).
   *
   * Used for names that may contain special characters.
   *
   * @param value - Header value to encode
   * @returns Encoded value (or original if ASCII-only)
   */
  private encodeHeaderValue(value: string): string {
    // Check if encoding is needed (non-ASCII characters)
    if (/^[\x00-\x7F]*$/.test(value)) {
      // Escape double quotes in ASCII values
      return value.replace(/"/g, '\\"');
    }

    // Use RFC 2047 encoding for non-ASCII
    const encoded = Buffer.from(value).toString('base64');
    return `=?UTF-8?B?${encoded}?=`;
  }

  /**
   * Encodes email subject for RFC 2047 if needed.
   *
   * @param subject - Email subject
   * @returns Encoded subject
   */
  private encodeSubject(subject: string): string {
    // Check if encoding is needed
    if (/^[\x00-\x7F]*$/.test(subject)) {
      return subject;
    }

    // Use RFC 2047 encoding
    const encoded = Buffer.from(subject).toString('base64');
    return `=?UTF-8?B?${encoded}?=`;
  }

  /**
   * Converts a string to quoted-printable encoding.
   *
   * Used for email body content to handle special characters.
   *
   * @param text - Text to encode
   * @returns Quoted-printable encoded text
   */
  private toQuotedPrintable(text: string): string {
    return text
      // Encode non-ASCII and special characters
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0);
        // Keep safe ASCII characters as-is
        if (
          (code >= 33 && code <= 60) ||  // ! to <
          (code >= 62 && code <= 126) || // > to ~
          code === 9 ||                   // Tab
          code === 32                     // Space
        ) {
          return char;
        }
        // Encode line breaks
        if (code === 10) return '\r\n';
        if (code === 13) return '';
        // Encode everything else
        return '=' + code.toString(16).toUpperCase().padStart(2, '0');
      })
      .join('')
      // Soft line breaks at 76 characters
      .replace(/(.{73})/g, '$1=\r\n');
  }

  /**
   * Converts HTML to plain text.
   *
   * Simple conversion for the text/plain MIME part.
   *
   * @param html - HTML content
   * @returns Plain text version
   */
  private htmlToPlainText(html: string): string {
    return html
      // Remove style and script tags with content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Convert common block elements to newlines
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      // Convert links to text with URL
      .replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '$2 ($1)')
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - ERROR HANDLING & RETRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Executes an API call with retry logic.
   *
   * @param operation - Async function to execute
   * @returns Operation result
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const gmailError = this.handleError(lastError);

        // Don't retry auth errors
        if (gmailError instanceof GmailAuthError) {
          throw gmailError;
        }

        // Handle rate limiting
        if (gmailError instanceof GmailRateLimitError) {
          logger.warn('Rate limited, waiting before retry', {
            accountId: this.accountId,
            retryAfterMs: gmailError.retryAfterMs,
            attempt,
          });
          await this.delay(gmailError.retryAfterMs);
          continue;
        }

        // Retry on retryable errors
        if (gmailError instanceof GmailAPIError && gmailError.isRetryable) {
          const delayMs = RETRY_DELAYS_MS[attempt - 1] || RETRY_BASE_DELAY_MS;
          logger.warn('Retrying send operation', {
            accountId: this.accountId,
            attempt,
            delayMs,
            error: lastError.message,
          });
          await this.delay(delayMs);
          continue;
        }

        // Non-retryable error
        throw gmailError;
      }
    }

    throw this.handleError(lastError);
  }

  /**
   * Converts an error to the appropriate Gmail error type.
   *
   * @param error - Original error
   * @returns Typed Gmail error
   */
  private handleError(
    error: unknown
  ): GmailAPIError | GmailAuthError | GmailRateLimitError {
    if (error instanceof GmailAPIError) {
      return error;
    }

    const statusCode = this.extractStatusCode(error);
    const message = error instanceof Error ? error.message : 'Unknown Gmail error';

    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
      // Check if it's a scope issue
      const isScopeError = message.toLowerCase().includes('scope') ||
        message.toLowerCase().includes('insufficient permission');

      return new GmailAuthError(
        isScopeError
          ? 'Gmail send scope not granted. User must authorize gmail.send permission.'
          : 'Gmail authentication failed',
        { accountId: this.accountId, statusCode },
        statusCode === 401
      );
    }

    // Rate limit errors
    if (statusCode === 429) {
      const retryAfterMs = this.extractRetryAfter(error);
      return new GmailRateLimitError(
        'Gmail rate limit exceeded',
        retryAfterMs,
        { accountId: this.accountId }
      );
    }

    return new GmailAPIError(message, statusCode || 500, {
      accountId: this.accountId,
    });
  }

  /**
   * Parses an error into a message and error code.
   *
   * @param error - Error to parse
   * @returns Object with message and error code
   */
  private parseError(error: unknown): { message: string; code: SendErrorCode } {
    const statusCode = this.extractStatusCode(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lowerMessage = message.toLowerCase();

    // Determine error code
    let code: SendErrorCode = 'UNKNOWN_ERROR';

    if (statusCode === 401 || statusCode === 403) {
      if (lowerMessage.includes('scope') || lowerMessage.includes('permission')) {
        code = 'SCOPE_MISSING';
      } else {
        code = 'AUTH_FAILED';
      }
    } else if (statusCode === 429) {
      code = 'RATE_LIMITED';
    } else if (lowerMessage.includes('quota')) {
      code = 'QUOTA_EXCEEDED';
    } else if (lowerMessage.includes('invalid') && lowerMessage.includes('recipient')) {
      code = 'INVALID_RECIPIENT';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('timeout')) {
      code = 'NETWORK_ERROR';
    }

    return { message, code };
  }

  /**
   * Extracts HTTP status code from a Google API error.
   *
   * @param error - Error to inspect
   * @returns Status code or undefined
   */
  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      if ('code' in error && typeof error.code === 'number') {
        return error.code;
      }
      if ('response' in error) {
        const response = (error as { response?: { status?: number } }).response;
        if (response?.status) {
          return response.status;
        }
      }
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
 * Creates a GmailSendService instance.
 *
 * @param accessToken - Valid OAuth access token with gmail.send scope
 * @param accountId - Optional account ID for logging
 * @returns GmailSendService instance
 *
 * @example
 * ```typescript
 * const sendService = createGmailSendService(accessToken, account.id);
 * const result = await sendService.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   bodyHtml: '<p>World!</p>',
 * });
 * ```
 */
export function createGmailSendService(
  accessToken: string,
  accountId?: string
): GmailSendService {
  return new GmailSendService(accessToken, accountId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Merges a template string with recipient data.
 *
 * Replaces {{field_name}} placeholders with actual values.
 *
 * @param template - Template string with {{placeholders}}
 * @param data - Key-value pairs for replacement
 * @returns Merged string with placeholders replaced
 *
 * @example
 * ```typescript
 * const merged = mergeTemplate(
 *   'Hello {{first_name}}, welcome to {{company}}!',
 *   { first_name: 'John', company: 'Acme Inc' }
 * );
 * // Result: 'Hello John, welcome to Acme Inc!'
 * ```
 */
export function mergeTemplate(
  template: string,
  data: Record<string, string | undefined>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => data[key] ?? match
  );
}

/**
 * Extracts merge field names from a template.
 *
 * @param template - Template string with {{placeholders}}
 * @returns Array of unique field names found
 *
 * @example
 * ```typescript
 * const fields = extractMergeFields(
 *   'Hi {{first_name}}, your company {{company}} is great!'
 * );
 * // Result: ['first_name', 'company']
 * ```
 */
export function extractMergeFields(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const fields = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      fields.add(match[1]);
    }
  }

  return Array.from(fields);
}

/**
 * Validates that all required merge fields have values.
 *
 * @param template - Template string with {{placeholders}}
 * @param data - Data to merge
 * @returns Object with isValid flag and missing fields
 *
 * @example
 * ```typescript
 * const result = validateMergeData(
 *   'Hi {{first_name}} from {{company}}',
 *   { first_name: 'John' }
 * );
 * // Result: { isValid: false, missingFields: ['company'] }
 * ```
 */
export function validateMergeData(
  template: string,
  data: Record<string, string | undefined>
): { isValid: boolean; missingFields: string[] } {
  const requiredFields = extractMergeFields(template);
  const missingFields = requiredFields.filter(
    (field) => !data[field] || data[field]?.trim() === ''
  );

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
