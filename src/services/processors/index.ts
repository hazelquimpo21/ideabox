/**
 * Email Processors Module
 *
 * Re-exports all processor classes for convenient importing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE PROCESSORS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. EmailProcessor - Processes a single email through all analyzers
 * 2. BatchProcessor - Processes multiple emails with batching
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Import processors
 * import { EmailProcessor, BatchProcessor } from '@/services/processors';
 *
 * // Import singleton instances
 * import { emailProcessor, batchProcessor } from '@/services/processors';
 *
 * // Import types
 * import type { ProcessOptions, BatchOptions, BatchResult } from '@/services/processors';
 *
 * // Process a single email
 * const result = await emailProcessor.process(email, context);
 *
 * // Process multiple emails
 * const batchResult = await batchProcessor.processBatch(emails, context, {
 *   batchSize: 10,
 *   onProgress: (done, total) => console.log(`${done}/${total}`),
 * });
 * ```
 *
 * @module services/processors
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

export {
  EmailProcessor,
  emailProcessor,
  type ProcessOptions,
} from './email-processor';

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

export {
  BatchProcessor,
  batchProcessor,
  type BatchOptions,
  type BatchResult,
} from './batch-processor';
