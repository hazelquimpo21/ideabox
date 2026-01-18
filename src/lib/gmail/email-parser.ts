/**
 * Gmail Email Parser
 *
 * Parses Gmail API message responses into our internal Email format.
 * Handles MIME parsing, header extraction, and body decoding.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Extracts headers (From, To, Subject, Date) from MIME structure
 * - Decodes base64url-encoded body content
 * - Handles multipart messages (text/plain + text/html)
 * - Truncates body to configurable max length (cost optimization)
 * - Graceful fallbacks for malformed emails
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { EmailParser } from '@/lib/gmail/email-parser';
 *
 * const parser = new EmailParser();
 *
 * // Parse a Gmail message
 * const parsed = parser.parse(gmailMessage, 16000);
 *
 * // Convert to database format
 * const insertData = parser.toInsertData(parsed, userId, accountId);
 * ```
 *
 * @module lib/gmail/email-parser
 * @version 1.0.0
 */

import { createLogger } from '@/lib/utils/logger';
import { GmailParseError } from './errors';
import type {
  GmailMessage,
  GmailMessagePart,
  GmailHeader,
  ParsedEmail,
  EmailInsertData,
  IEmailParser,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default maximum body characters to extract.
 * This is a cost optimization - longer bodies use more AI tokens.
 * 16K characters is a good balance between context and cost.
 */
const DEFAULT_MAX_BODY_CHARS = 16000;

/**
 * Gmail labels that indicate read/unread status.
 */
const UNREAD_LABEL = 'UNREAD';

/**
 * Gmail label that indicates starred status.
 */
const STARRED_LABEL = 'STARRED';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailParser');

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL PARSER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parses Gmail API messages into our internal Email format.
 *
 * This class handles the complexity of Gmail's MIME structure,
 * including nested multipart messages and various encodings.
 *
 * @example
 * ```typescript
 * const parser = new EmailParser();
 *
 * // Parse with default max body length
 * const parsed = parser.parse(message);
 *
 * // Parse with custom max body length
 * const parsedShort = parser.parse(message, 5000);
 *
 * // Convert to database insert format
 * const data = parser.toInsertData(parsed, 'user-123', 'account-456');
 * ```
 */
export class EmailParser implements IEmailParser {
  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parses a Gmail message into our internal format.
   *
   * This method extracts all relevant information from the Gmail API
   * message structure and normalizes it into a consistent format.
   *
   * @param message - Gmail API message response
   * @param maxBodyChars - Maximum body characters to extract (default: 16000)
   * @returns Parsed email ready for storage
   * @throws GmailParseError if critical fields cannot be extracted
   *
   * @example
   * ```typescript
   * const parsed = parser.parse(gmailMessage);
   * console.log(parsed.subject);     // "Meeting Tomorrow"
   * console.log(parsed.senderEmail); // "john@example.com"
   * console.log(parsed.bodyText);    // "Hi, let's meet at 3pm..."
   * ```
   */
  public parse(
    message: GmailMessage,
    maxBodyChars: number = DEFAULT_MAX_BODY_CHARS
  ): ParsedEmail {
    logger.debug('Parsing Gmail message', { messageId: message.id });

    // Validate required fields
    // Gmail messages should always have id and threadId
    if (!message.id || !message.threadId) {
      throw new GmailParseError(
        'Message missing required fields (id or threadId)',
        { messageId: message.id },
        'id'
      );
    }

    // Extract headers from the message payload
    const headers = message.payload?.headers || [];

    // Extract sender information
    // The "From" header format: "Display Name <email@example.com>" or just "email@example.com"
    const fromHeader = this.getHeader(headers, 'From');
    const { email: senderEmail, name: senderName } = this.parseEmailAddress(fromHeader);

    // Validate we have a sender email (critical field)
    if (!senderEmail) {
      throw new GmailParseError(
        'Could not extract sender email from message',
        { messageId: message.id },
        'sender_email'
      );
    }

    // Extract recipient (To header)
    const toHeader = this.getHeader(headers, 'To');
    const { email: recipientEmail } = this.parseEmailAddress(toHeader);

    // Extract subject (may be empty for some emails)
    const subject = this.getHeader(headers, 'Subject');

    // Extract date and convert to ISO format
    const dateHeader = this.getHeader(headers, 'Date');
    const date = this.parseDate(dateHeader, message.internalDate);

    // Extract body content (text and HTML)
    const { text: bodyText, html: bodyHtml } = this.extractBody(
      message.payload,
      maxBodyChars
    );

    // Extract Gmail labels
    const gmailLabels = message.labelIds || [];

    // Determine read/starred status from labels
    const isRead = !gmailLabels.includes(UNREAD_LABEL);
    const isStarred = gmailLabels.includes(STARRED_LABEL);

    const parsed: ParsedEmail = {
      gmailId: message.id,
      threadId: message.threadId,
      subject: subject || null,
      senderEmail,
      senderName: senderName || null,
      recipientEmail: recipientEmail || null,
      date,
      snippet: message.snippet || null,
      bodyText: bodyText || null,
      bodyHtml: bodyHtml || null,
      gmailLabels,
      isRead,
      isStarred,
    };

    logger.debug('Message parsed successfully', {
      messageId: message.id,
      hasBody: !!bodyText || !!bodyHtml,
      bodyLength: (bodyText?.length || 0) + (bodyHtml?.length || 0),
    });

    return parsed;
  }

  /**
   * Converts a parsed email to database insert format.
   *
   * This method adds user and account context to the parsed email,
   * creating the data structure needed for Supabase insertion.
   *
   * @param parsed - Parsed email from parse()
   * @param userId - User ID (from Supabase auth)
   * @param accountId - Gmail account ID
   * @returns Data ready for database insertion
   *
   * @example
   * ```typescript
   * const parsed = parser.parse(message);
   * const data = parser.toInsertData(parsed, 'user-123', 'account-456');
   *
   * await supabase.from('emails').insert(data);
   * ```
   */
  public toInsertData(
    parsed: ParsedEmail,
    userId: string,
    accountId: string
  ): EmailInsertData {
    return {
      user_id: userId,
      gmail_account_id: accountId,
      gmail_id: parsed.gmailId,
      thread_id: parsed.threadId,
      subject: parsed.subject,
      sender_email: parsed.senderEmail,
      sender_name: parsed.senderName,
      recipient_email: parsed.recipientEmail,
      date: parsed.date,
      snippet: parsed.snippet,
      body_text: parsed.bodyText,
      body_html: parsed.bodyHtml,
      gmail_labels: parsed.gmailLabels,
      is_read: parsed.isRead,
      is_starred: parsed.isStarred,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets a header value by name (case-insensitive).
   *
   * @param headers - Array of Gmail headers
   * @param name - Header name to find
   * @returns Header value or null if not found
   */
  private getHeader(headers: GmailHeader[], name: string): string | null {
    // Gmail headers are case-insensitive, so we normalize to lowercase
    const normalizedName = name.toLowerCase();
    const header = headers.find(
      (h) => h.name?.toLowerCase() === normalizedName
    );
    return header?.value || null;
  }

  /**
   * Parses an email address header into email and display name.
   *
   * Handles various formats:
   * - "Display Name <email@example.com>"
   * - "<email@example.com>"
   * - "email@example.com"
   * - "email@example.com (Display Name)"
   *
   * @param header - Raw header value
   * @returns Object with email and name (name may be null)
   */
  private parseEmailAddress(header: string | null): {
    email: string | null;
    name: string | null;
  } {
    // Handle null/empty header
    if (!header) {
      return { email: null, name: null };
    }

    // Trim whitespace
    const trimmed = header.trim();

    // Try to match "Display Name <email@example.com>" format
    // This regex handles quoted display names too: "John \"JD\" Doe" <john@example.com>
    const angleMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (angleMatch && angleMatch[1] && angleMatch[2]) {
      // Extract display name (remove surrounding quotes if present)
      let displayName = angleMatch[1].trim();
      if (displayName.startsWith('"') && displayName.endsWith('"')) {
        displayName = displayName.slice(1, -1);
      }
      return {
        email: angleMatch[2].trim().toLowerCase(),
        name: displayName || null,
      };
    }

    // Try to match just "<email@example.com>" format
    const justEmailMatch = trimmed.match(/^<([^>]+)>$/);
    if (justEmailMatch && justEmailMatch[1]) {
      return {
        email: justEmailMatch[1].trim().toLowerCase(),
        name: null,
      };
    }

    // Try to match "email@example.com (Display Name)" format
    const parenMatch = trimmed.match(/^([^\s]+)\s*\((.+)\)$/);
    if (parenMatch && parenMatch[1] && parenMatch[2]) {
      return {
        email: parenMatch[1].trim().toLowerCase(),
        name: parenMatch[2].trim(),
      };
    }

    // Assume the whole string is an email address
    // Basic validation: contains @ symbol
    if (trimmed.includes('@')) {
      return {
        email: trimmed.toLowerCase(),
        name: null,
      };
    }

    // Could not parse as email
    logger.warn('Could not parse email address', { header });
    return { email: null, name: null };
  }

  /**
   * Parses a date header into ISO 8601 format.
   *
   * Falls back to internalDate (Unix timestamp) if the Date header
   * cannot be parsed.
   *
   * @param dateHeader - Date header value
   * @param internalDate - Gmail internal date (milliseconds since epoch)
   * @returns ISO 8601 date string
   */
  private parseDate(
    dateHeader: string | null,
    internalDate?: string
  ): string {
    // Try to parse the Date header first
    if (dateHeader) {
      try {
        const parsed = new Date(dateHeader);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      } catch {
        // Fall through to internalDate
        logger.debug('Could not parse Date header, using internalDate', {
          dateHeader,
        });
      }
    }

    // Use internal date (milliseconds since epoch)
    if (internalDate) {
      try {
        const timestamp = parseInt(internalDate, 10);
        if (!isNaN(timestamp)) {
          return new Date(timestamp).toISOString();
        }
      } catch {
        // Fall through to current time
        logger.warn('Could not parse internalDate', { internalDate });
      }
    }

    // Last resort: use current time
    logger.warn('Using current time as email date');
    return new Date().toISOString();
  }

  /**
   * Extracts body content from a message part.
   *
   * Handles multipart messages by recursively searching for
   * text/plain and text/html parts.
   *
   * @param payload - Message payload (top-level part)
   * @param maxChars - Maximum characters to extract per content type
   * @returns Object with text and html body content
   */
  private extractBody(
    payload: GmailMessagePart | undefined,
    maxChars: number
  ): { text: string | null; html: string | null } {
    if (!payload) {
      return { text: null, html: null };
    }

    // Use object to allow mutation from nested function
    const result: { text: string | null; html: string | null } = {
      text: null,
      html: null,
    };

    // Recursive function to find body parts
    const findParts = (part: GmailMessagePart): void => {
      const mimeType = part.mimeType?.toLowerCase();

      // Check if this part has direct body data
      if (part.body?.data) {
        if (mimeType === 'text/plain' && !result.text) {
          result.text = this.decodeBase64Url(part.body.data);
        } else if (mimeType === 'text/html' && !result.html) {
          result.html = this.decodeBase64Url(part.body.data);
        }
      }

      // Recursively search nested parts
      if (part.parts) {
        for (const subPart of part.parts) {
          findParts(subPart);

          // Stop early if we have both text and html
          if (result.text && result.html) break;
        }
      }
    };

    // Start the search
    findParts(payload);

    // Truncate to max characters if needed
    if (result.text && result.text.length > maxChars) {
      const originalLength = result.text.length;
      result.text = result.text.substring(0, maxChars);
      logger.debug('Truncated text body', {
        originalLength,
        maxChars,
      });
    }

    // Note: We don't truncate HTML as it's stored in full for display
    // Only the text body is used for AI analysis (cost optimization)

    return result;
  }

  /**
   * Decodes base64url-encoded content to UTF-8 string.
   *
   * Gmail uses URL-safe base64 encoding which replaces + with - and / with _.
   *
   * @param data - Base64url-encoded string
   * @returns Decoded UTF-8 string or null on error
   */
  private decodeBase64Url(data: string): string | null {
    if (!data) return null;

    try {
      // Gmail uses URL-safe base64 encoding
      // Replace URL-safe characters with standard base64 characters
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');

      // Decode base64 to UTF-8 using Node.js Buffer
      // This runs server-side in Next.js API routes
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Failed to decode body content', { error: errorMessage });
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default parser instance for convenience.
 * Use this for simple cases; create a new instance for custom configuration.
 */
export const emailParser = new EmailParser();

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convenience function to parse a single message.
 *
 * @param message - Gmail API message
 * @param maxBodyChars - Maximum body characters (default: 16000)
 * @returns Parsed email
 */
export function parseGmailMessage(
  message: GmailMessage,
  maxBodyChars?: number
): ParsedEmail {
  return emailParser.parse(message, maxBodyChars);
}

/**
 * Batch parse multiple messages.
 *
 * @param messages - Array of Gmail API messages
 * @param maxBodyChars - Maximum body characters per message
 * @returns Array of parsed emails (failed parses return null)
 */
export function parseGmailMessages(
  messages: GmailMessage[],
  maxBodyChars?: number
): Array<ParsedEmail | null> {
  return messages.map((message) => {
    try {
      return emailParser.parse(message, maxBodyChars);
    } catch (error) {
      logger.warn('Failed to parse message', {
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  });
}
