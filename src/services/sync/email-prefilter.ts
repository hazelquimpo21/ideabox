/**
 * Email Pre-Filter Service
 *
 * Determines which emails should be sent to AI analysis vs. auto-categorized.
 * This is a critical token optimization - we can save 20-30% of AI costs by
 * intelligently skipping obvious cases.
 *
 * Pre-filter rules (in order of priority):
 * 1. Skip spam/trash labeled emails
 * 2. Skip known no-reply/automated senders
 * 3. Auto-categorize by known domain patterns
 * 4. Auto-categorize by email prefix patterns
 * 5. Use learned sender patterns (user-specific)
 *
 * @module services/sync/email-prefilter
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import { createLogger } from '@/lib/utils/logger';
import {
  SKIP_SENDER_PATTERNS,
  AUTO_CATEGORIZE_DOMAINS,
  AUTO_CATEGORIZE_PREFIXES,
  INITIAL_SYNC_CONFIG,
} from '@/config/initial-sync';
import type {
  EmailCategory,
  PreFilterResult,
  EmailForAnalysis,
  SenderPattern,
} from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('EmailPreFilter');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Statistics from a pre-filter batch operation.
 */
export interface PreFilterStats {
  /** Total emails processed */
  total: number;
  /** Emails that will be sent to AI */
  toAnalyze: number;
  /** Emails skipped (spam, no-reply, etc.) */
  skipped: number;
  /** Emails auto-categorized without AI */
  autoCategorized: number;
  /** Breakdown by skip reason */
  skipReasons: Record<string, number>;
  /** Breakdown by auto-category */
  autoCategories: Record<EmailCategory, number>;
}

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Service for pre-filtering emails before AI analysis.
 *
 * @example
 * ```typescript
 * const prefilter = new EmailPreFilterService();
 *
 * // Filter a single email
 * const result = prefilter.filter(email);
 * if (!result.shouldAnalyze) {
 *   // Skip AI, use result.autoCategory
 * }
 *
 * // Filter a batch with stats
 * const { filtered, stats } = prefilter.filterBatch(emails);
 * console.log(`Skipped ${stats.skipped} emails, saving tokens!`);
 * ```
 */
export class EmailPreFilterService {
  private userPatterns: SenderPattern[];
  private skipAIThreshold: number;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new pre-filter service.
   *
   * @param userPatterns - User-specific learned sender patterns
   * @param config - Optional config overrides
   */
  constructor(
    userPatterns: SenderPattern[] = [],
    config?: { skipAIThreshold?: number }
  ) {
    this.userPatterns = userPatterns;
    this.skipAIThreshold = config?.skipAIThreshold ?? INITIAL_SYNC_CONFIG.skipAIThreshold;

    logger.debug('EmailPreFilterService initialized', {
      userPatternCount: userPatterns.length,
      skipAIThreshold: this.skipAIThreshold,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Filter a single email to determine if it needs AI analysis.
   *
   * @param email - The email to filter
   * @returns PreFilterResult with decision and reasoning
   */
  filter(email: EmailForAnalysis): PreFilterResult {
    logger.debug('Filtering email', {
      emailId: email.id,
      subject: email.subject?.slice(0, 50),
      sender: email.senderEmail,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Rule 1: Skip Gmail spam/trash
    // ─────────────────────────────────────────────────────────────────────────
    if (this.hasExcludedLabel(email.gmailLabels)) {
      logger.debug('Skipping email: excluded Gmail label', { emailId: email.id });
      return {
        shouldAnalyze: false,
        skipReason: 'Gmail label (SPAM/TRASH)',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule 2: Skip known automated senders
    // ─────────────────────────────────────────────────────────────────────────
    const skipPattern = this.matchesSkipPattern(email.senderEmail);
    if (skipPattern) {
      logger.debug('Skipping email: automated sender pattern', {
        emailId: email.id,
        pattern: skipPattern,
      });
      return {
        shouldAnalyze: false,
        skipReason: `Automated sender (${skipPattern})`,
        autoCategory: 'admin', // Most automated emails are admin
        autoConfidence: 0.8,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule 3: Auto-categorize by domain
    // ─────────────────────────────────────────────────────────────────────────
    const domainCategory = this.getCategoryByDomain(email.senderEmail);
    if (domainCategory) {
      logger.debug('Auto-categorizing by domain', {
        emailId: email.id,
        domain: this.extractDomain(email.senderEmail),
        category: domainCategory,
      });
      return {
        shouldAnalyze: false,
        skipReason: `Known domain pattern`,
        autoCategory: domainCategory,
        autoConfidence: 0.9,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule 4: Auto-categorize by email prefix
    // ─────────────────────────────────────────────────────────────────────────
    const prefixCategory = this.getCategoryByPrefix(email.senderEmail);
    if (prefixCategory) {
      logger.debug('Auto-categorizing by prefix', {
        emailId: email.id,
        prefix: this.extractLocalPart(email.senderEmail),
        category: prefixCategory,
      });
      return {
        shouldAnalyze: false,
        skipReason: `Email prefix pattern`,
        autoCategory: prefixCategory,
        autoConfidence: 0.85,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule 5: Check user-specific learned patterns
    // ─────────────────────────────────────────────────────────────────────────
    const userPattern = this.matchUserPattern(email.senderEmail);
    if (userPattern && userPattern.confidence >= this.skipAIThreshold) {
      logger.debug('Auto-categorizing by user pattern', {
        emailId: email.id,
        pattern: userPattern.pattern,
        category: userPattern.category,
        confidence: userPattern.confidence,
      });
      return {
        shouldAnalyze: false,
        skipReason: `Learned pattern (${userPattern.sampleSize} samples)`,
        autoCategory: userPattern.category,
        autoConfidence: userPattern.confidence,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Default: Send to AI analysis
    // ─────────────────────────────────────────────────────────────────────────
    logger.debug('Email will be analyzed by AI', { emailId: email.id });
    return {
      shouldAnalyze: true,
    };
  }

  /**
   * Filter a batch of emails and return statistics.
   *
   * @param emails - Array of emails to filter
   * @returns Object with filtered emails and statistics
   */
  filterBatch(emails: EmailForAnalysis[]): {
    /** Emails that need AI analysis */
    toAnalyze: EmailForAnalysis[];
    /** Emails that were auto-categorized */
    autoCategorized: Array<{
      email: EmailForAnalysis;
      result: PreFilterResult;
    }>;
    /** Emails that were skipped entirely */
    skipped: Array<{
      email: EmailForAnalysis;
      result: PreFilterResult;
    }>;
    /** Statistics about the filtering */
    stats: PreFilterStats;
  } {
    logger.info('Pre-filtering email batch', { count: emails.length });
    const startTime = Date.now();

    const toAnalyze: EmailForAnalysis[] = [];
    const autoCategorized: Array<{ email: EmailForAnalysis; result: PreFilterResult }> = [];
    const skipped: Array<{ email: EmailForAnalysis; result: PreFilterResult }> = [];

    const skipReasons: Record<string, number> = {};
    const autoCategories: Partial<Record<EmailCategory, number>> = {};

    for (const email of emails) {
      const result = this.filter(email);

      if (result.shouldAnalyze) {
        toAnalyze.push(email);
      } else if (result.autoCategory) {
        autoCategorized.push({ email, result });
        autoCategories[result.autoCategory] =
          (autoCategories[result.autoCategory] || 0) + 1;
      } else {
        skipped.push({ email, result });
      }

      // Track skip reasons
      if (!result.shouldAnalyze && result.skipReason) {
        skipReasons[result.skipReason] = (skipReasons[result.skipReason] || 0) + 1;
      }
    }

    const stats: PreFilterStats = {
      total: emails.length,
      toAnalyze: toAnalyze.length,
      skipped: skipped.length,
      autoCategorized: autoCategorized.length,
      skipReasons,
      autoCategories: autoCategories as Record<EmailCategory, number>,
    };

    const processingTime = Date.now() - startTime;

    logger.info('Pre-filter batch complete', {
      ...stats,
      processingTimeMs: processingTime,
      tokenSavingsEstimate: `~${Math.round(
        ((stats.skipped + stats.autoCategorized) / stats.total) * 100
      )}%`,
    });

    return { toAnalyze, autoCategorized, skipped, stats };
  }

  /**
   * Update the user patterns for this service instance.
   * Call this after learning new patterns from AI analysis.
   *
   * @param patterns - New user patterns to use
   */
  updateUserPatterns(patterns: SenderPattern[]): void {
    this.userPatterns = patterns;
    logger.debug('User patterns updated', { count: patterns.length });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check if email has excluded Gmail labels (SPAM, TRASH, etc.)
   */
  private hasExcludedLabel(labels: string[]): boolean {
    const excludedLabels = INITIAL_SYNC_CONFIG.excludeLabels;
    return labels.some((label) =>
      excludedLabels.includes(label.toUpperCase())
    );
  }

  /**
   * Check if sender matches any skip patterns (no-reply, etc.)
   * @returns The matched pattern string, or null if no match
   */
  private matchesSkipPattern(senderEmail: string): string | null {
    const lowerEmail = senderEmail.toLowerCase();

    for (const pattern of SKIP_SENDER_PATTERNS) {
      if (pattern.test(lowerEmail)) {
        return pattern.source;
      }
    }

    return null;
  }

  /**
   * Get category by sender domain if it's in our known list.
   */
  private getCategoryByDomain(senderEmail: string): EmailCategory | null {
    const domain = this.extractDomain(senderEmail);
    if (!domain) return null;

    // Check exact domain match
    if (AUTO_CATEGORIZE_DOMAINS[domain]) {
      return AUTO_CATEGORIZE_DOMAINS[domain];
    }

    // Check parent domain (e.g., marketing.amazon.com → amazon.com)
    const parts = domain.split('.');
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join('.');
      if (AUTO_CATEGORIZE_DOMAINS[parentDomain]) {
        return AUTO_CATEGORIZE_DOMAINS[parentDomain];
      }
    }

    return null;
  }

  /**
   * Get category by email prefix (local part before @).
   */
  private getCategoryByPrefix(senderEmail: string): EmailCategory | null {
    const localPart = this.extractLocalPart(senderEmail);
    if (!localPart) return null;

    // Check exact match
    if (AUTO_CATEGORIZE_PREFIXES[localPart]) {
      return AUTO_CATEGORIZE_PREFIXES[localPart];
    }

    // Check if localPart starts with any known prefix
    for (const [prefix, category] of Object.entries(AUTO_CATEGORIZE_PREFIXES)) {
      if (localPart.startsWith(prefix)) {
        return category;
      }
    }

    return null;
  }

  /**
   * Match against user-specific learned patterns.
   */
  private matchUserPattern(senderEmail: string): SenderPattern | null {
    const lowerEmail = senderEmail.toLowerCase();
    const domain = this.extractDomain(senderEmail);

    for (const pattern of this.userPatterns) {
      if (pattern.isDomain) {
        // Domain pattern: match the sender's domain
        if (domain === pattern.pattern) {
          return pattern;
        }
      } else {
        // Exact email pattern
        if (lowerEmail === pattern.pattern) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * Extract domain from email address.
   * @example "user@example.com" → "example.com"
   */
  private extractDomain(email: string): string | null {
    const match = email.toLowerCase().match(/@([^@]+)$/);
    return match ? match[1] : null;
  }

  /**
   * Extract local part from email address.
   * @example "newsletter@example.com" → "newsletter"
   */
  private extractLocalPart(email: string): string | null {
    const match = email.toLowerCase().match(/^([^@]+)@/);
    return match ? match[1] : null;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new EmailPreFilterService instance.
 * Convenience function for dependency injection.
 *
 * @param userPatterns - User-specific learned patterns
 * @returns New EmailPreFilterService instance
 */
export function createEmailPreFilter(
  userPatterns: SenderPattern[] = []
): EmailPreFilterService {
  return new EmailPreFilterService(userPatterns);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default EmailPreFilterService;
