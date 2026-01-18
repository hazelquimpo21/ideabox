/**
 * Batch Processor Service
 *
 * Processes multiple emails efficiently with batching and rate limiting.
 * Designed for handling 200-300 emails/day while respecting API limits.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BATCH PROCESSING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Processes emails in configurable batch sizes (default: 10)
 * - Runs emails within a batch in parallel for speed
 * - Adds small delays between batches to avoid rate limits
 * - Tracks progress and provides detailed statistics
 * - Gracefully handles partial failures
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE CHARACTERISTICS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * With default settings (batch size 10, 100ms delay):
 * - 10 emails: ~5-10 seconds
 * - 50 emails: ~30-60 seconds
 * - 200 emails: ~2-4 minutes
 *
 * API calls per email: 3 (one per analyzer)
 * Estimated cost: ~$0.0006 per email (~$0.12/day for 200 emails)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { BatchProcessor } from '@/services/processors/batch-processor';
 *
 * const processor = new BatchProcessor();
 *
 * // Process unanalyzed emails
 * const emails = await getUnanalyzedEmails(userId);
 * const result = await processor.processBatch(emails, userContext, {
 *   batchSize: 10,
 *   delayBetweenBatchesMs: 100,
 *   onProgress: (completed, total) => {
 *     console.log(`Progress: ${completed}/${total}`);
 *   },
 * });
 *
 * console.log(`Processed ${result.successCount}/${result.totalEmails}`);
 * ```
 *
 * @module services/processors/batch-processor
 * @version 1.0.0
 */

import { createLogger, logAI } from '@/lib/utils/logger';
import { EmailProcessor, type ProcessOptions } from './email-processor';
import type { Email } from '@/types/database';
import type {
  EmailInput,
  UserContext,
  EmailProcessingResult,
} from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('BatchProcessor');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for batch processing.
 */
export interface BatchOptions extends ProcessOptions {
  /**
   * Number of emails to process in parallel per batch.
   * Higher = faster but more API pressure.
   * Default: 10
   */
  batchSize?: number;

  /**
   * Delay between batches in milliseconds.
   * Helps avoid rate limits.
   * Default: 100ms
   */
  delayBetweenBatchesMs?: number;

  /**
   * Maximum emails to process (for testing/limiting).
   * Default: no limit
   */
  maxEmails?: number;

  /**
   * Progress callback called after each batch.
   * @param completed - Number of emails completed
   * @param total - Total number of emails
   */
  onProgress?: (completed: number, total: number) => void;

  /**
   * Error callback called for each failed email.
   * @param emailId - ID of the failed email
   * @param error - Error message
   */
  onError?: (emailId: string, error: string) => void;
}

/**
 * Result from batch processing.
 */
export interface BatchResult {
  /** Total emails in the batch */
  totalEmails: number;

  /** Number successfully processed */
  successCount: number;

  /** Number that failed */
  failureCount: number;

  /** Number skipped (already analyzed) */
  skippedCount: number;

  /** Total processing time in ms */
  totalTimeMs: number;

  /** Average time per email in ms */
  avgTimePerEmailMs: number;

  /** Total tokens used across all emails */
  totalTokensUsed: number;

  /** Estimated total cost in USD */
  estimatedCost: number;

  /** Individual results by email ID */
  results: Map<string, EmailProcessingResult>;

  /** Errors encountered */
  errors: Array<{ emailId: string; error: string }>;
}

/**
 * Default batch options.
 */
const DEFAULT_BATCH_OPTIONS: Required<
  Omit<BatchOptions, 'onProgress' | 'onError'>
> = {
  batchSize: 10,
  delayBetweenBatchesMs: 100,
  maxEmails: Infinity,
  skipAnalyzed: true,
  saveToDatabase: true,
  createActions: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Batch Processor
 *
 * Efficiently processes multiple emails with batching,
 * parallelization, and rate limiting.
 *
 * @example
 * ```typescript
 * const processor = new BatchProcessor();
 *
 * // Process with progress tracking
 * const result = await processor.processBatch(emails, context, {
 *   batchSize: 5,  // Smaller batches
 *   onProgress: (done, total) => {
 *     updateProgressBar(done / total * 100);
 *   },
 * });
 *
 * // Handle failures
 * for (const error of result.errors) {
 *   console.error(`Email ${error.emailId}: ${error.error}`);
 * }
 * ```
 */
export class BatchProcessor {
  /** Email processor instance */
  private emailProcessor: EmailProcessor;

  /**
   * Creates a new BatchProcessor instance.
   */
  constructor() {
    this.emailProcessor = new EmailProcessor();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Processes a batch of emails.
   *
   * Emails are processed in chunks (default: 10 at a time).
   * Within each chunk, emails are processed in parallel.
   * A small delay is added between chunks to avoid rate limits.
   *
   * @param emails - Emails to process
   * @param context - User context with clients
   * @param options - Batch processing options
   * @returns Batch result with statistics
   *
   * @example
   * ```typescript
   * // Basic usage
   * const result = await processor.processBatch(emails, context);
   *
   * // With all options
   * const result = await processor.processBatch(emails, context, {
   *   batchSize: 5,
   *   delayBetweenBatchesMs: 200,
   *   maxEmails: 100,
   *   onProgress: (done, total) => console.log(`${done}/${total}`),
   *   onError: (id, err) => console.error(`${id}: ${err}`),
   * });
   * ```
   */
  async processBatch(
    emails: Array<Email | EmailInput>,
    context: UserContext,
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    // Merge options with defaults
    const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
    const startTime = Date.now();

    // Apply max emails limit
    const emailsToProcess = emails.slice(0, opts.maxEmails);
    const totalEmails = emailsToProcess.length;

    logger.start('Starting batch processing', {
      totalEmails,
      batchSize: opts.batchSize,
      delayMs: opts.delayBetweenBatchesMs,
    });

    // Initialize result tracking
    const results = new Map<string, EmailProcessingResult>();
    const errors: Array<{ emailId: string; error: string }> = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let totalTokensUsed = 0;

    // Process in batches
    for (let i = 0; i < totalEmails; i += opts.batchSize) {
      const batchNumber = Math.floor(i / opts.batchSize) + 1;
      const batch = emailsToProcess.slice(i, i + opts.batchSize);

      logger.debug('Processing batch', {
        batchNumber,
        batchSize: batch.length,
        progress: `${i}/${totalEmails}`,
      });

      // Process all emails in batch in parallel
      const batchResults = await Promise.all(
        batch.map((email) => this.processEmail(email, context, opts))
      );

      // Collect results
      for (let j = 0; j < batchResults.length; j++) {
        const email = batch[j];
        const result = batchResults[j];
        const emailId = 'id' in email ? email.id : email.id;

        results.set(emailId, result);
        totalTokensUsed += result.analysis.totalTokensUsed;

        if (result.success) {
          // Check if it was skipped (already analyzed)
          if (result.analysis.totalTokensUsed === 0) {
            skippedCount++;
          } else {
            successCount++;
          }
        } else {
          failureCount++;
          // Collect errors
          for (const error of result.errors) {
            errors.push({ emailId, error: error.error });
            opts.onError?.(emailId, error.error);
          }
        }
      }

      // Call progress callback
      const completed = Math.min(i + opts.batchSize, totalEmails);
      opts.onProgress?.(completed, totalEmails);

      // Delay between batches (except for last batch)
      if (i + opts.batchSize < totalEmails) {
        await this.delay(opts.delayBetweenBatchesMs);
      }
    }

    // Calculate final statistics
    const totalTimeMs = Date.now() - startTime;
    const avgTimePerEmailMs =
      totalEmails > 0 ? Math.round(totalTimeMs / totalEmails) : 0;

    // Estimate cost (rough calculation based on GPT-4.1-mini pricing)
    // ~500 tokens per email * $0.0000006 per output token
    const estimatedCost = totalTokensUsed * 0.0000006;

    // Log completion
    logAI.batchComplete({
      totalEmails,
      successCount,
      failureCount,
      totalDurationMs: totalTimeMs,
    });

    logger.success('Batch processing complete', {
      totalEmails,
      successCount,
      failureCount,
      skippedCount,
      totalTimeMs,
      avgTimePerEmailMs,
      totalTokensUsed,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    });

    return {
      totalEmails,
      successCount,
      failureCount,
      skippedCount,
      totalTimeMs,
      avgTimePerEmailMs,
      totalTokensUsed,
      estimatedCost,
      results,
      errors,
    };
  }

  /**
   * Processes emails one at a time (no parallelism).
   *
   * Useful for debugging or when you want to be extra
   * conservative with rate limits.
   *
   * @param emails - Emails to process
   * @param context - User context
   * @param options - Processing options
   * @returns Batch result
   */
  async processSequentially(
    emails: Array<Email | EmailInput>,
    context: UserContext,
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    // Use batch size of 1 for sequential processing
    return this.processBatch(emails, context, {
      ...options,
      batchSize: 1,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Processes a single email with error handling.
   *
   * Wraps the EmailProcessor.process call with try/catch
   * to ensure errors don't crash the whole batch.
   *
   * @param email - Email to process
   * @param context - User context
   * @param options - Process options
   * @returns Processing result (never throws)
   */
  private async processEmail(
    email: Email | EmailInput,
    context: UserContext,
    options: ProcessOptions
  ): Promise<EmailProcessingResult> {
    try {
      return await this.emailProcessor.process(email, context, options);
    } catch (error) {
      // Catch any unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const emailId = 'id' in email ? email.id : email.id;

      logger.error('Unexpected error processing email', {
        emailId,
        error: errorMessage,
      });

      // Return a failed result
      return {
        success: false,
        analysis: {
          totalTokensUsed: 0,
          totalProcessingTimeMs: 0,
          analyzerVersion: '1.0.0',
        },
        results: {},
        errors: [{ analyzer: 'EmailProcessor', error: errorMessage }],
      };
    }
  }

  /**
   * Delays execution for the specified time.
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default batch processor instance for convenience.
 *
 * @example
 * ```typescript
 * import { batchProcessor } from '@/services/processors/batch-processor';
 *
 * const result = await batchProcessor.processBatch(emails, context);
 * ```
 */
export const batchProcessor = new BatchProcessor();
