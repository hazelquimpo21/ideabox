/**
 * Sender Patterns Service
 *
 * Learns and manages sender → category patterns from analyzed emails.
 * These patterns allow us to skip AI analysis for future emails from
 * known senders, significantly reducing token costs.
 *
 * Learning strategy:
 * 1. After AI analyzes an email, record sender + category
 * 2. When we have 3+ emails from same sender with same category (>80%), create pattern
 * 3. Store patterns in user_profiles.sender_patterns (JSONB)
 * 4. Use patterns in pre-filter to skip AI for high-confidence matches
 *
 * @module services/sync/sender-patterns
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import type { EmailCategory, SenderPattern } from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('SenderPatterns');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for pattern learning.
 */
const PATTERN_CONFIG = {
  /** Minimum emails needed to create a pattern */
  minSampleSize: 3,

  /** Minimum percentage of emails in same category to create pattern */
  minConsistency: 0.8,

  /** Confidence boost per additional sample (up to max) */
  confidenceBoostPerSample: 0.02,

  /** Maximum confidence achievable */
  maxConfidence: 0.98,

  /** Maximum patterns to store per user */
  maxPatternsPerUser: 500,

  /** Prefer domain patterns over exact email patterns */
  preferDomainPatterns: true,
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * A learning observation: one email's sender and assigned category.
 */
export interface LearningObservation {
  senderEmail: string;
  category: EmailCategory;
  confidence: number;
}

/**
 * Aggregated observations for a sender.
 */
interface SenderObservations {
  senderEmail: string;
  domain: string;
  categoryCounts: Partial<Record<EmailCategory, number>>;
  totalCount: number;
}

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Service for learning and managing sender patterns.
 *
 * @example
 * ```typescript
 * const patternService = new SenderPatternService(userId);
 *
 * // Learn from analyzed emails
 * await patternService.learnFromObservations([
 *   { senderEmail: 'newsletter@morningbrew.com', category: 'newsletter', confidence: 0.95 },
 *   { senderEmail: 'newsletter@morningbrew.com', category: 'newsletter', confidence: 0.92 },
 *   { senderEmail: 'newsletter@morningbrew.com', category: 'newsletter', confidence: 0.94 },
 * ]);
 *
 * // Get patterns for pre-filtering
 * const patterns = await patternService.getPatterns();
 * ```
 */
export class SenderPatternService {
  private userId: string;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new sender pattern service for a user.
   *
   * @param userId - The user ID to manage patterns for
   */
  constructor(userId: string) {
    this.userId = userId;
    logger.debug('SenderPatternService initialized', { userId });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get all sender patterns for this user.
   *
   * @returns Array of sender patterns
   */
  async getPatterns(): Promise<SenderPattern[]> {
    logger.debug('Fetching sender patterns', { userId: this.userId });

    try {
      const supabase = await createServerClient();

      const { data, error } = await supabase
        .from('user_profiles')
        .select('sender_patterns')
        .eq('id', this.userId)
        .single();

      if (error) {
        logger.error('Failed to fetch sender patterns', {
          userId: this.userId,
          error: error.message,
        });
        return [];
      }

      const patterns = (data?.sender_patterns as SenderPattern[]) || [];
      logger.debug('Fetched sender patterns', {
        userId: this.userId,
        patternCount: patterns.length,
      });

      return patterns;
    } catch (err) {
      logger.error('Exception fetching sender patterns', {
        userId: this.userId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Learn patterns from a batch of analyzed emails.
   * Aggregates observations and creates/updates patterns.
   *
   * @param observations - Array of email analysis results
   * @returns Number of new patterns created
   */
  async learnFromObservations(observations: LearningObservation[]): Promise<number> {
    if (observations.length === 0) {
      logger.debug('No observations to learn from');
      return 0;
    }

    logger.info('Learning from observations', {
      userId: this.userId,
      observationCount: observations.length,
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Step 1: Aggregate observations by sender
      // ─────────────────────────────────────────────────────────────────────────
      const senderAggregates = this.aggregateObservations(observations);

      // ─────────────────────────────────────────────────────────────────────────
      // Step 2: Get existing patterns
      // ─────────────────────────────────────────────────────────────────────────
      const existingPatterns = await this.getPatterns();
      const patternMap = new Map<string, SenderPattern>();
      for (const pattern of existingPatterns) {
        patternMap.set(pattern.pattern, pattern);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 3: Create or update patterns
      // ─────────────────────────────────────────────────────────────────────────
      let newPatternsCreated = 0;

      for (const aggregate of senderAggregates.values()) {
        const patternResult = this.createPatternFromAggregate(aggregate);

        if (!patternResult) {
          continue; // Not enough data or not consistent enough
        }

        const existingPattern = patternMap.get(patternResult.pattern);

        if (existingPattern) {
          // Update existing pattern
          const updatedPattern = this.mergePatterns(existingPattern, patternResult);
          patternMap.set(updatedPattern.pattern, updatedPattern);
          logger.debug('Updated existing pattern', {
            pattern: updatedPattern.pattern,
            newSampleSize: updatedPattern.sampleSize,
          });
        } else {
          // Create new pattern
          patternMap.set(patternResult.pattern, patternResult);
          newPatternsCreated++;
          logger.debug('Created new pattern', {
            pattern: patternResult.pattern,
            category: patternResult.category,
            confidence: patternResult.confidence,
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 4: Save patterns (limit to max)
      // ─────────────────────────────────────────────────────────────────────────
      const allPatterns = Array.from(patternMap.values());
      const patternsToSave = this.prunePatterns(allPatterns);

      await this.savePatterns(patternsToSave);

      logger.info('Pattern learning complete', {
        userId: this.userId,
        newPatternsCreated,
        totalPatterns: patternsToSave.length,
      });

      return newPatternsCreated;
    } catch (err) {
      logger.error('Exception during pattern learning', {
        userId: this.userId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Clear all learned patterns for this user.
   * Useful for testing or user-requested reset.
   */
  async clearPatterns(): Promise<void> {
    logger.info('Clearing all sender patterns', { userId: this.userId });

    try {
      await this.savePatterns([]);
      logger.info('Patterns cleared successfully', { userId: this.userId });
    } catch (err) {
      logger.error('Failed to clear patterns', {
        userId: this.userId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Aggregate observations by sender email/domain.
   */
  private aggregateObservations(
    observations: LearningObservation[]
  ): Map<string, SenderObservations> {
    const aggregates = new Map<string, SenderObservations>();

    for (const obs of observations) {
      const domain = this.extractDomain(obs.senderEmail);
      if (!domain) continue;

      // Use domain as key if preferring domain patterns, else exact email
      const key = PATTERN_CONFIG.preferDomainPatterns ? domain : obs.senderEmail.toLowerCase();

      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          senderEmail: obs.senderEmail.toLowerCase(),
          domain,
          categoryCounts: {},
          totalCount: 0,
        };
        aggregates.set(key, aggregate);
      }

      aggregate.categoryCounts[obs.category] =
        (aggregate.categoryCounts[obs.category] || 0) + 1;
      aggregate.totalCount++;
    }

    return aggregates;
  }

  /**
   * Create a pattern from an aggregate if it meets thresholds.
   */
  private createPatternFromAggregate(
    aggregate: SenderObservations
  ): SenderPattern | null {
    // Check minimum sample size
    if (aggregate.totalCount < PATTERN_CONFIG.minSampleSize) {
      return null;
    }

    // Find the dominant category
    let dominantCategory: EmailCategory | null = null;
    let dominantCount = 0;

    for (const [category, count] of Object.entries(aggregate.categoryCounts)) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantCategory = category as EmailCategory;
      }
    }

    if (!dominantCategory) {
      return null;
    }

    // Check consistency threshold
    const consistency = dominantCount / aggregate.totalCount;
    if (consistency < PATTERN_CONFIG.minConsistency) {
      return null;
    }

    // Calculate confidence
    const baseConfidence = consistency;
    const sampleBoost = Math.min(
      (aggregate.totalCount - PATTERN_CONFIG.minSampleSize) *
        PATTERN_CONFIG.confidenceBoostPerSample,
      PATTERN_CONFIG.maxConfidence - baseConfidence
    );
    const confidence = Math.min(
      baseConfidence + sampleBoost,
      PATTERN_CONFIG.maxConfidence
    );

    // Create the pattern
    const pattern: SenderPattern = {
      pattern: PATTERN_CONFIG.preferDomainPatterns
        ? aggregate.domain
        : aggregate.senderEmail,
      isDomain: PATTERN_CONFIG.preferDomainPatterns,
      category: dominantCategory,
      confidence,
      sampleSize: aggregate.totalCount,
      updatedAt: new Date().toISOString(),
    };

    return pattern;
  }

  /**
   * Merge an existing pattern with new observations.
   */
  private mergePatterns(
    existing: SenderPattern,
    newPattern: SenderPattern
  ): SenderPattern {
    // If categories differ, prefer the one with higher confidence
    if (existing.category !== newPattern.category) {
      if (newPattern.confidence > existing.confidence) {
        return newPattern;
      }
      return existing;
    }

    // Same category: increase confidence and sample size
    const totalSamples = existing.sampleSize + newPattern.sampleSize;
    const newConfidence = Math.min(
      existing.confidence + PATTERN_CONFIG.confidenceBoostPerSample,
      PATTERN_CONFIG.maxConfidence
    );

    return {
      ...existing,
      confidence: newConfidence,
      sampleSize: totalSamples,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Prune patterns to stay under the limit.
   * Keeps highest confidence patterns.
   */
  private prunePatterns(patterns: SenderPattern[]): SenderPattern[] {
    if (patterns.length <= PATTERN_CONFIG.maxPatternsPerUser) {
      return patterns;
    }

    // Sort by confidence descending, then by sample size
    const sorted = [...patterns].sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.sampleSize - a.sampleSize;
    });

    const pruned = sorted.slice(0, PATTERN_CONFIG.maxPatternsPerUser);

    logger.debug('Pruned patterns', {
      before: patterns.length,
      after: pruned.length,
    });

    return pruned;
  }

  /**
   * Save patterns to the database.
   */
  private async savePatterns(patterns: SenderPattern[]): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('user_profiles')
      .update({ sender_patterns: patterns })
      .eq('id', this.userId);

    if (error) {
      logger.error('Failed to save sender patterns', {
        userId: this.userId,
        error: error.message,
      });
      throw new Error(`Failed to save sender patterns: ${error.message}`);
    }

    logger.debug('Saved sender patterns', {
      userId: this.userId,
      patternCount: patterns.length,
    });
  }

  /**
   * Extract domain from email address.
   */
  private extractDomain(email: string): string | null {
    const match = email.toLowerCase().match(/@([^@]+)$/);
    return match ? match[1] : null;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new SenderPatternService instance.
 *
 * @param userId - User ID to manage patterns for
 * @returns New SenderPatternService instance
 */
export function createSenderPatternService(userId: string): SenderPatternService {
  return new SenderPatternService(userId);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SenderPatternService;
