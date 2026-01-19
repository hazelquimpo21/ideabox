/**
 * 🪵 Enhanced Logging Utility for IdeaBox
 *
 * Provides structured, emoji-prefixed logging throughout the application.
 * All logs include context (which module/service) and visual emoji indicators
 * for quick scanning and debugging.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY PINO?
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fast: Pino is 5x faster than Winston/Bunyan
 * - Structured: JSON output works great with log aggregators
 * - Simple: Minimal API surface, easy to use
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMOJI SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 * We use emojis as visual prefixes for quick log scanning:
 * - 🚀 Starting operations
 * - ✅ Successful completions
 * - ❌ Errors and failures
 * - ⚠️ Warnings
 * - 🔍 Debug information
 * - See LOG_EMOJIS constant for full list
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic logging:
 * ```typescript
 * import { createLogger } from '@/lib/utils/logger';
 *
 * const logger = createLogger('EmailProcessor');
 * logger.info('Processing started', { emailId: '123' });
 * logger.error('Processing failed', { error: err.message });
 * ```
 *
 * Domain-specific logging:
 * ```typescript
 * import { logEmail, logAI, logAuth } from '@/lib/utils/logger';
 *
 * logEmail.fetchStart({ accountId: '123', count: 50 });
 * logAI.analyzeComplete({ emailId: '456', category: 'action_required' });
 * logAuth.loginSuccess({ userId: 'abc' });
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOG LEVELS
 * ═══════════════════════════════════════════════════════════════════════════════
 * - debug: Detailed diagnostic info (not shown in production)
 * - info: Important events and state changes
 * - warn: Warning conditions that don't stop execution
 * - error: Errors that need attention
 *
 * @module lib/utils/logger
 * @version 2.0.0
 */

import pino from 'pino';

// ═══════════════════════════════════════════════════════════════════════════════
// EMOJI CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Emoji prefixes for different log types.
 * These provide visual scanning of logs in development.
 */
export const LOG_EMOJIS = {
  // Operation lifecycle
  START: '🚀',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',

  // Domain-specific
  API: '🌐',
  DATABASE: '💾',
  AI: '🤖',
  AUTH: '🔐',
  EMAIL: '📧',
  SYNC: '🔄',
  USER: '👤',
  CLIENT: '🏢',
  ACTION: '📋',

  // Performance & metrics
  PERFORMANCE: '⏱️',
  COST: '💰',
  TOKENS: '🎫',

  // Status indicators
  PENDING: '⏳',
  COMPLETE: '🏁',
  SKIP: '⏭️',
  RETRY: '🔁',
  CACHE_HIT: '💨',
  CACHE_MISS: '🐢',

  // Severity indicators
  CRITICAL: '🚨',
  BLOCKED: '🚫',
  TIMEOUT: '⏰',
  RATE_LIMIT: '🚦',
} as const;

/**
 * Type for emoji keys
 */
export type LogEmoji = keyof typeof LOG_EMOJIS;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the appropriate log level based on environment.
 * In production, we default to 'info' to reduce noise.
 * In development, 'debug' helps with troubleshooting.
 */
function getLogLevel(): string {
  const envLevel = process.env.LOG_LEVEL;
  if (envLevel) return envLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Configure pino transport based on environment.
 * In development, we use pino-pretty for human-readable output.
 * In production, we output raw JSON for log aggregation.
 */
function getTransport(): pino.TransportSingleOptions | undefined {
  if (process.env.NODE_ENV !== 'production') {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }
  return undefined;
}

/**
 * Base pino logger instance.
 * We don't export this directly - use createLogger() instead
 * to ensure all logs have proper context.
 */
const baseLogger = pino({
  level: getLogLevel(),
  transport: getTransport(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata that can be included with any log message.
 * Structured data makes logs searchable and filterable.
 */
export interface LogMetadata {
  /** Unique identifier for the email being processed */
  emailId?: string;
  /** User ID for user-specific operations */
  userId?: string;
  /** Gmail account ID for multi-account operations */
  accountId?: string;
  /** Client ID for client-related operations */
  clientId?: string;
  /** Action ID for action-related operations */
  actionId?: string;
  /** Error message for error logs */
  error?: string;
  /** Stack trace for debugging */
  stack?: string;
  /** Duration in milliseconds for performance logging */
  durationMs?: number;
  /** Token count for AI API calls (cost tracking) */
  tokensUsed?: number;
  /** Estimated cost in USD for AI API calls */
  estimatedCost?: number;
  /** Count of items processed */
  count?: number;
  /** Batch number for batch processing */
  batchNumber?: number;
  /** Total batches in operation */
  totalBatches?: number;
  /** Category assigned to email */
  category?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Model used for AI operations */
  model?: string;
  /** Any additional metadata */
  [key: string]: unknown;
}

/**
 * Logger interface returned by createLogger().
 * Each method accepts a message and optional structured metadata.
 */
export interface Logger {
  debug: (message: string, meta?: LogMetadata) => void;
  info: (message: string, meta?: LogMetadata) => void;
  warn: (message: string, meta?: LogMetadata) => void;
  error: (message: string, meta?: LogMetadata) => void;
}

/**
 * Enhanced logger with emoji-prefixed convenience methods.
 */
export interface EnhancedLogger extends Logger {
  /** Log operation start with 🚀 prefix */
  start: (message: string, meta?: LogMetadata) => void;
  /** Log successful completion with ✅ prefix */
  success: (message: string, meta?: LogMetadata) => void;
  /** Log with custom emoji prefix */
  withEmoji: (emoji: LogEmoji, message: string, meta?: LogMetadata) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a contextual logger for a specific module/service.
 *
 * The context string appears in every log message, making it easy
 * to filter logs by module when debugging.
 *
 * @param context - Name of the module/service (e.g., 'EmailProcessor', 'CategorizerAnalyzer')
 * @returns Enhanced logger instance with emoji support
 *
 * @example
 * ```typescript
 * const logger = createLogger('GmailSync');
 *
 * logger.start('Beginning email sync', { accountId: '123' });
 * // Output: 🚀 [GmailSync] Beginning email sync { accountId: '123' }
 *
 * logger.success('Sync completed', { count: 50, durationMs: 1234 });
 * // Output: ✅ [GmailSync] Sync completed { count: 50, durationMs: 1234 }
 *
 * logger.error('Sync failed', { error: 'Token expired' });
 * // Output: ❌ [GmailSync] Sync failed { error: 'Token expired' }
 * ```
 */
export function createLogger(context: string): EnhancedLogger {
  const formatMessage = (emoji: string, message: string) =>
    `${emoji} [${context}] ${message}`;

  return {
    debug: (message: string, meta?: LogMetadata) =>
      baseLogger.debug({ context, ...meta }, formatMessage(LOG_EMOJIS.DEBUG, message)),

    info: (message: string, meta?: LogMetadata) =>
      baseLogger.info({ context, ...meta }, formatMessage(LOG_EMOJIS.INFO, message)),

    warn: (message: string, meta?: LogMetadata) =>
      baseLogger.warn({ context, ...meta }, formatMessage(LOG_EMOJIS.WARNING, message)),

    error: (message: string, meta?: LogMetadata) =>
      baseLogger.error({ context, ...meta }, formatMessage(LOG_EMOJIS.ERROR, message)),

    start: (message: string, meta?: LogMetadata) =>
      baseLogger.info({ context, ...meta }, formatMessage(LOG_EMOJIS.START, message)),

    success: (message: string, meta?: LogMetadata) =>
      baseLogger.info({ context, ...meta }, formatMessage(LOG_EMOJIS.SUCCESS, message)),

    withEmoji: (emoji: LogEmoji, message: string, meta?: LogMetadata) =>
      baseLogger.info({ context, ...meta }, formatMessage(LOG_EMOJIS[emoji], message)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAIN-SPECIFIC LOGGERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email operation logging helpers.
 * Provides pre-configured log messages for common email operations.
 *
 * @example
 * ```typescript
 * logEmail.fetchStart({ accountId: '123', count: 50 });
 * logEmail.fetchComplete({ accountId: '123', count: 50, durationMs: 1500 });
 * logEmail.analyzeStart({ emailId: '456' });
 * logEmail.categorized({ emailId: '456', category: 'action_required', confidence: 0.95 });
 * ```
 */
export const logEmail = {
  fetchStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.EMAIL}${LOG_EMOJIS.START} Starting email fetch`
    ),

  fetchComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.EMAIL}${LOG_EMOJIS.SUCCESS} Email fetch complete`
    ),

  fetchError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.EMAIL}${LOG_EMOJIS.ERROR} Email fetch failed`
    ),

  analyzeStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.START} Starting email analysis`
    ),

  analyzeComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.SUCCESS} Email analysis complete`
    ),

  analyzeError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.ERROR} Email analysis failed`
    ),

  categorized: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.EMAIL}${LOG_EMOJIS.COMPLETE} Email categorized`
    ),

  skipped: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'Email', ...meta },
      `${LOG_EMOJIS.EMAIL}${LOG_EMOJIS.SKIP} Email skipped (already analyzed)`
    ),
};

/**
 * AI/ML operation logging helpers.
 * Tracks AI API calls, token usage, and costs.
 *
 * @example
 * ```typescript
 * logAI.callStart({ model: 'gpt-4.1-mini', emailId: '123' });
 * logAI.callComplete({ model: 'gpt-4.1-mini', tokensUsed: 500, estimatedCost: 0.0015 });
 * logAI.rateLimited({ model: 'gpt-4.1-mini', retryIn: 5000 });
 * ```
 */
export const logAI = {
  callStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.START} Starting AI call`
    ),

  callComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.SUCCESS} AI call complete`
    ),

  callError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.ERROR} AI call failed`
    ),

  rateLimited: (meta: LogMetadata) =>
    baseLogger.warn(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.RATE_LIMIT} Rate limited, will retry`
    ),

  retrying: (meta: LogMetadata) =>
    baseLogger.warn(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.RETRY} Retrying AI call`
    ),

  costTracked: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.COST} API cost logged`
    ),

  batchStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.START} Starting batch AI analysis`
    ),

  batchComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.COMPLETE} Batch AI analysis complete`
    ),

  batchError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.ERROR} Batch AI analysis failed`
    ),

  analyzeProgress: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.PENDING} Analysis progress update`
    ),

  categoryAssigned: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.AI}${LOG_EMOJIS.SUCCESS} Category assigned`
    ),

  actionExtracted: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.ACTION}${LOG_EMOJIS.SUCCESS} Action extracted from email`
    ),

  clientMatched: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'AI', ...meta },
      `${LOG_EMOJIS.CLIENT}${LOG_EMOJIS.SUCCESS} Client matched`
    ),
};

/**
 * Authentication logging helpers.
 * Tracks login, logout, and OAuth operations.
 *
 * @example
 * ```typescript
 * logAuth.loginStart({ provider: 'gmail' });
 * logAuth.loginSuccess({ userId: '123', email: 'user@example.com' });
 * logAuth.tokenRefreshed({ accountId: '456' });
 * ```
 */
export const logAuth = {
  loginStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.START} Login initiated`
    ),

  loginSuccess: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.SUCCESS} Login successful`
    ),

  loginError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.ERROR} Login failed`
    ),

  logoutSuccess: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.SUCCESS} Logout successful`
    ),

  tokenRefreshed: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.SYNC} Token refreshed`
    ),

  tokenExpired: (meta: LogMetadata) =>
    baseLogger.warn(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.WARNING} Token expired`
    ),

  unauthorized: (meta: LogMetadata) =>
    baseLogger.warn(
      { context: 'Auth', ...meta },
      `${LOG_EMOJIS.AUTH}${LOG_EMOJIS.BLOCKED} Unauthorized access attempt`
    ),
};

/**
 * Database operation logging helpers.
 * Tracks queries, inserts, updates, and performance.
 *
 * @example
 * ```typescript
 * logDB.queryStart({ table: 'emails', operation: 'select' });
 * logDB.queryComplete({ table: 'emails', count: 50, durationMs: 45 });
 * ```
 */
export const logDB = {
  queryStart: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.START} Query started`
    ),

  queryComplete: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.SUCCESS} Query complete`
    ),

  queryError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.ERROR} Query failed`
    ),

  insertComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.SUCCESS} Insert complete`
    ),

  updateComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.SUCCESS} Update complete`
    ),

  deleteComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Database', ...meta },
      `${LOG_EMOJIS.DATABASE}${LOG_EMOJIS.SUCCESS} Delete complete`
    ),
};

/**
 * Sync operation logging helpers.
 * Tracks email sync jobs and background processes.
 *
 * @example
 * ```typescript
 * logSync.jobStart({ jobId: 'sync-123', accountCount: 3 });
 * logSync.accountStart({ accountId: '456', email: 'user@gmail.com' });
 * logSync.jobComplete({ jobId: 'sync-123', emailsFetched: 150, durationMs: 45000 });
 * ```
 */
export const logSync = {
  jobStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.START} Sync job started`
    ),

  jobComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.SUCCESS} Sync job complete`
    ),

  jobError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.ERROR} Sync job failed`
    ),

  accountStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.START} Account sync started`
    ),

  accountComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.SUCCESS} Account sync complete`
    ),

  accountError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.ERROR} Account sync failed`
    ),

  batchStart: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.START} Batch processing started`
    ),

  batchComplete: (meta: LogMetadata) =>
    baseLogger.debug(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.SUCCESS} Batch processing complete`
    ),

  syncStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.START} Sync started`
    ),

  syncComplete: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.SUCCESS} Sync complete`
    ),

  syncError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'Sync', ...meta },
      `${LOG_EMOJIS.SYNC}${LOG_EMOJIS.ERROR} Sync failed`
    ),
};

/**
 * API route logging helpers.
 * Tracks incoming requests and responses.
 *
 * @example
 * ```typescript
 * logAPI.requestStart({ method: 'GET', path: '/api/emails', userId: '123' });
 * logAPI.responseSuccess({ method: 'GET', path: '/api/emails', status: 200, durationMs: 150 });
 * ```
 */
export const logAPI = {
  requestStart: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'API', ...meta },
      `${LOG_EMOJIS.API}${LOG_EMOJIS.START} Request received`
    ),

  responseSuccess: (meta: LogMetadata) =>
    baseLogger.info(
      { context: 'API', ...meta },
      `${LOG_EMOJIS.API}${LOG_EMOJIS.SUCCESS} Response sent`
    ),

  responseError: (meta: LogMetadata) =>
    baseLogger.error(
      { context: 'API', ...meta },
      `${LOG_EMOJIS.API}${LOG_EMOJIS.ERROR} Request failed`
    ),

  validationError: (meta: LogMetadata) =>
    baseLogger.warn(
      { context: 'API', ...meta },
      `${LOG_EMOJIS.API}${LOG_EMOJIS.WARNING} Validation failed`
    ),
};

/**
 * Performance logging helper.
 * Creates a timer for measuring operation duration.
 *
 * @example
 * ```typescript
 * const timer = logPerformance('EmailProcessor.processBatch');
 * await processBatch(emails);
 * timer.end({ count: emails.length }); // Logs duration automatically
 * ```
 */
export function logPerformance(operation: string) {
  const startTime = performance.now();

  return {
    end: (meta?: LogMetadata) => {
      const durationMs = Math.round(performance.now() - startTime);
      baseLogger.info(
        { context: 'Performance', operation, durationMs, ...meta },
        `${LOG_EMOJIS.PERFORMANCE} ${operation} completed in ${durationMs}ms`
      );
      return durationMs;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default logger for quick one-off logging.
 * Prefer createLogger() for service/module code.
 */
export const logger = createLogger('App');
