/**
 * Sender Type Detector Service
 *
 * Detects whether an email sender is a direct contact, broadcast/newsletter sender,
 * cold outreach, or opportunity list. This helps distinguish real contacts from
 * subscriptions in the contacts list.
 *
 * Detection uses multiple signals in priority order:
 * 1. Email headers (List-Unsubscribe, ESP headers) - highest confidence
 * 2. Email address patterns (noreply@, @substack.com) - high confidence
 * 3. Email content signals (view in browser, unsubscribe links) - medium confidence
 * 4. AI analysis (for ambiguous cases) - variable confidence
 *
 * @module services/sync/sender-type-detector
 * @since January 2026
 */

import { createLogger } from '@/lib/utils/logger';
import type {
  SenderType,
  BroadcastSubtype,
  SenderTypeSource,
} from '@/services/analyzers/types';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('SenderTypeDetector');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result from sender type detection.
 */
export interface SenderTypeDetectionResult {
  /** Detected sender type */
  senderType: SenderType;

  /** Subtype for broadcast senders */
  broadcastSubtype?: BroadcastSubtype;

  /** Confidence in the detection (0-1) */
  confidence: number;

  /** How the type was detected */
  source: SenderTypeSource;

  /** Human-readable explanation of why this type was detected */
  reasoning: string;

  /** Signals that contributed to the detection */
  signals: string[];
}

/**
 * Email data needed for sender type detection.
 */
export interface EmailForSenderTypeDetection {
  /** Sender email address */
  senderEmail: string;

  /** Sender display name */
  senderName?: string | null;

  /** Email subject */
  subject?: string | null;

  /** Plain text body */
  bodyText?: string | null;

  /** Raw email headers (if available) */
  headers?: Record<string, string>;

  /** Gmail labels */
  gmailLabels?: string[];
}

// =============================================================================
// CONSTANTS - KNOWN PATTERNS
// =============================================================================

/**
 * Known newsletter/broadcast platform domains.
 * Emails from these domains are almost certainly broadcasts.
 */
const BROADCAST_DOMAINS: Record<string, BroadcastSubtype> = {
  // Newsletter platforms
  'substack.com': 'newsletter_author',
  'substackmail.com': 'newsletter_author',
  'beehiiv.com': 'newsletter_author',
  'buttondown.email': 'newsletter_author',
  'convertkit.com': 'newsletter_author',
  'convertkit-mail.com': 'newsletter_author',
  'revue.co': 'newsletter_author',
  'ghost.io': 'newsletter_author',
  'mailchimp.com': 'company_newsletter',
  'mail.mailchimp.com': 'company_newsletter',
  'sendgrid.net': 'company_newsletter',
  'mailgun.org': 'company_newsletter',
  'constantcontact.com': 'company_newsletter',
  'hubspot.com': 'company_newsletter',
  'hubspotemail.net': 'company_newsletter',
  'klaviyo.com': 'company_newsletter',

  // Social/digest platforms
  'linkedin.com': 'digest_service',
  'facebookmail.com': 'digest_service',
  'twitter.com': 'digest_service',
  'x.com': 'digest_service',
  'github.com': 'digest_service',
  'medium.com': 'digest_service',
  'reddit.com': 'digest_service',
  'quora.com': 'digest_service',

  // Notification services (transactional)
  'notifications.google.com': 'transactional',
  'googlemail.com': 'transactional',
  'amazonses.com': 'transactional',
  'postmarkapp.com': 'transactional',
  'mandrillapp.com': 'transactional',
};

/**
 * Email address prefixes that indicate broadcast/transactional emails.
 */
const BROADCAST_PREFIXES: Record<string, BroadcastSubtype> = {
  // Transactional
  'noreply': 'transactional',
  'no-reply': 'transactional',
  'donotreply': 'transactional',
  'do-not-reply': 'transactional',
  'notifications': 'transactional',
  'notification': 'transactional',
  'alerts': 'transactional',
  'alert': 'transactional',
  'mailer-daemon': 'transactional',
  'postmaster': 'transactional',
  'bounce': 'transactional',
  'auto': 'transactional',
  'automated': 'transactional',

  // Newsletter patterns
  'newsletter': 'company_newsletter',
  'newsletters': 'company_newsletter',
  'news': 'company_newsletter',
  'digest': 'digest_service',
  'weekly': 'company_newsletter',
  'daily': 'company_newsletter',
  'monthly': 'company_newsletter',
  'updates': 'company_newsletter',
  'update': 'company_newsletter',
  'announce': 'company_newsletter',
  'announcements': 'company_newsletter',
  'bulletin': 'company_newsletter',

  // Marketing (lower confidence)
  'marketing': 'company_newsletter',
  'promo': 'company_newsletter',
  'promotions': 'company_newsletter',
  'offers': 'company_newsletter',
  'deals': 'company_newsletter',
  'sales': 'company_newsletter',
};

/**
 * Email Service Providers (ESPs) - presence in headers indicates broadcast.
 */
const ESP_HEADER_PATTERNS = [
  'mailchimp',
  'sendgrid',
  'mailgun',
  'mandrill',
  'postmark',
  'amazonses',
  'ses.amazonaws',
  'constantcontact',
  'hubspot',
  'klaviyo',
  'convertkit',
  'substack',
  'beehiiv',
  'buttondown',
  'campaignmonitor',
  'getresponse',
  'activecampaign',
  'drip',
  'moosend',
  'sendinblue',
  'brevo',
];

/**
 * Content patterns that indicate broadcast emails.
 */
const BROADCAST_CONTENT_PATTERNS = [
  // View in browser
  /view\s+(this\s+)?in\s+(your\s+)?browser/i,
  /view\s+(this\s+)?(email\s+)?online/i,
  /having\s+trouble\s+viewing/i,
  /can'?t\s+see\s+this\s+email/i,
  /email\s+not\s+displaying/i,

  // Unsubscribe patterns
  /unsubscribe/i,
  /manage\s+(your\s+)?preferences/i,
  /update\s+(your\s+)?preferences/i,
  /email\s+preferences/i,
  /opt[\s-]?out/i,
  /stop\s+receiving/i,

  // Newsletter patterns
  /you('re|\s+are)\s+receiving\s+this/i,
  /you\s+signed\s+up/i,
  /you\s+subscribed/i,
  /this\s+email\s+was\s+sent\s+to/i,
  /sent\s+to\s+\{\{/i, // Template merge tags
  /\{\{email\}\}/i,
  /\{\{first_?name\}\}/i,

  // Footer patterns
  /copyright\s+\d{4}/i,
  /all\s+rights\s+reserved/i,
  /privacy\s+policy/i,
];

/**
 * Cold outreach patterns in content.
 */
const COLD_OUTREACH_PATTERNS = [
  // Sales patterns
  /i('d)?\s+(like|love|want)\s+to\s+(schedule|book|set\s+up)\s+a\s+(call|meeting|demo)/i,
  /let'?s?\s+(schedule|book|set\s+up)\s+a\s+(quick\s+)?(call|chat|meeting)/i,
  /do\s+you\s+have\s+(15|20|30)\s+minutes/i,
  /quick\s+question/i,
  /reaching\s+out\s+because/i,
  /saw\s+(your|that\s+you)/i,
  /i\s+came\s+across/i,
  /i\s+noticed/i,

  // Recruiter patterns
  /exciting\s+opportunity/i,
  /perfect\s+(fit|candidate|match)/i,
  /your\s+(background|experience|profile)/i,
  /i('m)?\s+a\s+recruiter/i,
  /talent\s+(acquisition|team)/i,
  /hiring\s+(manager|team)/i,

  // PR/Partnership patterns
  /partnership\s+opportunity/i,
  /collaboration\s+opportunity/i,
  /would\s+you\s+be\s+interested\s+in/i,
  /thought\s+you('d)?\s+be\s+interested/i,
  /guest\s+post/i,
  /link\s+exchange/i,
];

/**
 * Opportunity list patterns (HARO, etc.).
 */
const OPPORTUNITY_PATTERNS = [
  /haro/i,
  /help\s+a\s+reporter/i,
  /journalist\s+(query|request)/i,
  /media\s+query/i,
  /looking\s+for\s+(sources|experts)/i,
  /deadline:/i,
  /requirements:/i,
  /submit\s+your/i,
  /call\s+for\s+(entries|submissions|proposals)/i,
  /rfp/i,
  /request\s+for\s+proposal/i,
];

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Service for detecting sender type from email data.
 *
 * @example
 * ```typescript
 * const detector = new SenderTypeDetector();
 *
 * // Detect from email data
 * const result = detector.detect({
 *   senderEmail: 'newsletter@substack.com',
 *   subject: 'Weekly Update',
 *   bodyText: 'Click here to unsubscribe...',
 *   headers: { 'List-Unsubscribe': '<mailto:...>' }
 * });
 *
 * console.log(result.senderType); // 'broadcast'
 * console.log(result.broadcastSubtype); // 'newsletter_author'
 * console.log(result.confidence); // 0.95
 * ```
 */
export class SenderTypeDetector {
  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Detect sender type from email data.
   *
   * Uses multiple signals in priority order:
   * 1. Headers (List-Unsubscribe, ESP detection)
   * 2. Email address patterns
   * 3. Content analysis
   *
   * @param email - Email data to analyze
   * @returns Detection result with type, confidence, and reasoning
   */
  detect(email: EmailForSenderTypeDetection): SenderTypeDetectionResult {
    const signals: string[] = [];

    logger.debug('Detecting sender type', {
      senderEmail: email.senderEmail,
      hasHeaders: !!email.headers,
      hasBody: !!email.bodyText,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Priority 1: Header-based detection (highest confidence)
    // ─────────────────────────────────────────────────────────────────────────
    const headerResult = this.detectFromHeaders(email.headers, signals);
    if (headerResult) {
      logger.info('Sender type detected from headers', {
        senderEmail: email.senderEmail,
        senderType: headerResult.senderType,
        confidence: headerResult.confidence,
      });
      return headerResult;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Priority 2: Email address pattern detection
    // ─────────────────────────────────────────────────────────────────────────
    const patternResult = this.detectFromEmailPattern(email.senderEmail, signals);
    if (patternResult && patternResult.senderType !== 'unknown') {
      logger.info('Sender type detected from email pattern', {
        senderEmail: email.senderEmail,
        senderType: patternResult.senderType,
        confidence: patternResult.confidence,
      });
      return patternResult;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Priority 3: Content-based detection
    // ─────────────────────────────────────────────────────────────────────────
    const contentResult = this.detectFromContent(email, signals);
    if (contentResult && contentResult.senderType !== 'unknown') {
      logger.info('Sender type detected from content', {
        senderEmail: email.senderEmail,
        senderType: contentResult.senderType,
        confidence: contentResult.confidence,
      });
      return contentResult;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // No strong signals - return unknown
    // ─────────────────────────────────────────────────────────────────────────
    logger.debug('No strong sender type signals found', {
      senderEmail: email.senderEmail,
      signalsFound: signals,
    });

    return {
      senderType: 'unknown',
      confidence: 0,
      source: 'email_pattern',
      reasoning: 'No clear signals to determine sender type. Will need AI analysis or user behavior.',
      signals,
    };
  }

  /**
   * Quick detection from email address only (for bulk operations).
   * Less accurate but much faster than full detection.
   *
   * @param senderEmail - Email address to check
   * @returns Detection result or null if no pattern match
   */
  detectFromEmailOnly(senderEmail: string): SenderTypeDetectionResult | null {
    const signals: string[] = [];
    const result = this.detectFromEmailPattern(senderEmail, signals);

    if (result && result.senderType !== 'unknown') {
      return result;
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Detection Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Detect sender type from email headers.
   * This is the most reliable signal.
   */
  private detectFromHeaders(
    headers: Record<string, string> | undefined,
    signals: string[]
  ): SenderTypeDetectionResult | null {
    if (!headers) {
      return null;
    }

    // Check for List-Unsubscribe header (strongest broadcast signal)
    if (headers['List-Unsubscribe'] || headers['list-unsubscribe']) {
      signals.push('List-Unsubscribe header present');

      return {
        senderType: 'broadcast',
        broadcastSubtype: 'company_newsletter', // Default, may be refined
        confidence: 0.95,
        source: 'header',
        reasoning: 'Email has List-Unsubscribe header, indicating a mailing list or newsletter.',
        signals,
      };
    }

    // Check for List-Id header
    if (headers['List-Id'] || headers['list-id']) {
      signals.push('List-Id header present');

      return {
        senderType: 'broadcast',
        broadcastSubtype: 'company_newsletter',
        confidence: 0.90,
        source: 'header',
        reasoning: 'Email has List-Id header, indicating a mailing list.',
        signals,
      };
    }

    // Check Received headers for ESP patterns
    const receivedHeader = headers['Received'] || headers['received'] || '';
    const xMailer = headers['X-Mailer'] || headers['x-mailer'] || '';
    const messageId = headers['Message-Id'] || headers['message-id'] || '';
    const headersString = `${receivedHeader} ${xMailer} ${messageId}`.toLowerCase();

    for (const espPattern of ESP_HEADER_PATTERNS) {
      if (headersString.includes(espPattern)) {
        signals.push(`ESP detected in headers: ${espPattern}`);

        return {
          senderType: 'broadcast',
          broadcastSubtype: 'company_newsletter',
          confidence: 0.85,
          source: 'header',
          reasoning: `Email sent via email service provider (${espPattern}), indicating bulk/marketing email.`,
          signals,
        };
      }
    }

    return null;
  }

  /**
   * Detect sender type from email address patterns.
   */
  private detectFromEmailPattern(
    senderEmail: string,
    signals: string[]
  ): SenderTypeDetectionResult {
    const lowerEmail = senderEmail.toLowerCase();
    const domain = this.extractDomain(lowerEmail);
    const localPart = this.extractLocalPart(lowerEmail);

    // Check known broadcast domains
    if (domain && BROADCAST_DOMAINS[domain]) {
      const subtype = BROADCAST_DOMAINS[domain];
      signals.push(`Known broadcast domain: ${domain}`);

      return {
        senderType: 'broadcast',
        broadcastSubtype: subtype,
        confidence: 0.95,
        source: 'email_pattern',
        reasoning: `Sender domain ${domain} is a known ${subtype.replace('_', ' ')} platform.`,
        signals,
      };
    }

    // Check broadcast prefixes
    if (localPart) {
      for (const [prefix, subtype] of Object.entries(BROADCAST_PREFIXES)) {
        if (localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '-') || localPart.startsWith(prefix + '_')) {
          signals.push(`Broadcast email prefix: ${prefix}`);

          // Transactional prefixes have higher confidence
          const confidence = subtype === 'transactional' ? 0.90 : 0.80;

          return {
            senderType: 'broadcast',
            broadcastSubtype: subtype,
            confidence,
            source: 'email_pattern',
            reasoning: `Email prefix "${localPart}" indicates ${subtype.replace('_', ' ')} sender.`,
            signals,
          };
        }
      }
    }

    return {
      senderType: 'unknown',
      confidence: 0,
      source: 'email_pattern',
      reasoning: 'Email address pattern does not match known broadcast patterns.',
      signals,
    };
  }

  /**
   * Detect sender type from email content.
   */
  private detectFromContent(
    email: EmailForSenderTypeDetection,
    signals: string[]
  ): SenderTypeDetectionResult | null {
    const content = `${email.subject || ''} ${email.bodyText || ''}`;

    if (!content.trim()) {
      return null;
    }

    // Count broadcast content patterns
    let broadcastScore = 0;
    const broadcastMatches: string[] = [];

    for (const pattern of BROADCAST_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        broadcastScore++;
        broadcastMatches.push(pattern.source);
      }
    }

    // If multiple broadcast patterns found, it's likely a broadcast
    if (broadcastScore >= 2) {
      signals.push(...broadcastMatches.slice(0, 3).map((p) => `Content pattern: ${p}`));

      return {
        senderType: 'broadcast',
        broadcastSubtype: 'company_newsletter',
        confidence: Math.min(0.60 + broadcastScore * 0.1, 0.85),
        source: 'email_pattern', // Content analysis is still pattern-based
        reasoning: `Email contains ${broadcastScore} newsletter/broadcast indicators (unsubscribe links, view in browser, etc.).`,
        signals,
      };
    }

    // Check for cold outreach patterns
    let coldOutreachScore = 0;
    const coldOutreachMatches: string[] = [];

    for (const pattern of COLD_OUTREACH_PATTERNS) {
      if (pattern.test(content)) {
        coldOutreachScore++;
        coldOutreachMatches.push(pattern.source);
      }
    }

    if (coldOutreachScore >= 2) {
      signals.push(...coldOutreachMatches.slice(0, 3).map((p) => `Cold outreach pattern: ${p}`));

      return {
        senderType: 'cold_outreach',
        confidence: Math.min(0.50 + coldOutreachScore * 0.1, 0.75),
        source: 'email_pattern',
        reasoning: `Email contains ${coldOutreachScore} cold outreach indicators (sales pitch, scheduling request, etc.).`,
        signals,
      };
    }

    // Check for opportunity list patterns
    for (const pattern of OPPORTUNITY_PATTERNS) {
      if (pattern.test(content)) {
        signals.push(`Opportunity pattern: ${pattern.source}`);

        return {
          senderType: 'opportunity',
          confidence: 0.70,
          source: 'email_pattern',
          reasoning: 'Email appears to be from an opportunity/query list (HARO, journalist query, etc.).',
          signals,
        };
      }
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Extract domain from email address.
   */
  private extractDomain(email: string): string | null {
    const match = email.match(/@([^@]+)$/);
    return match ? match[1] : null;
  }

  /**
   * Extract local part (before @) from email address.
   */
  private extractLocalPart(email: string): string | null {
    const match = email.match(/^([^@]+)@/);
    return match ? match[1] : null;
  }
}

// =============================================================================
// SINGLETON & FACTORY
// =============================================================================

/**
 * Default sender type detector instance.
 */
export const senderTypeDetector = new SenderTypeDetector();

/**
 * Create a new SenderTypeDetector instance.
 */
export function createSenderTypeDetector(): SenderTypeDetector {
  return new SenderTypeDetector();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SenderTypeDetector;
