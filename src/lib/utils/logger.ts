/**
 * Centralized Logging Utility for IdeaBox
 *
 * This module provides structured logging throughout the application.
 * All logs include context (which module/service), making debugging easier.
 *
 * WHY PINO?
 * - Fast: Pino is 5x faster than Winston/Bunyan
 * - Structured: JSON output works great with log aggregators
 * - Simple: Minimal API surface, easy to use
 *
 * USAGE:
 * ```typescript
 * import { createLogger } from '@/lib/utils/logger';
 *
 * const logger = createLogger('EmailProcessor');
 * logger.info('Processing started', { emailId: '123', userId: 'abc' });
 * logger.error('Processing failed', { error: err.message });
 * ```
 *
 * LOG LEVELS:
 * - debug: Detailed diagnostic info (not shown in production)
 * - info: Important events and state changes
 * - warn: Warning conditions that don't stop execution
 * - error: Errors that need attention
 */

import pino from 'pino';

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
  // Only use pino-pretty in development for readable console output
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
  // Production: raw JSON for log aggregators (CloudWatch, Datadog, etc.)
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
 * Creates a contextual logger for a specific module/service.
 *
 * The context string appears in every log message, making it easy
 * to filter logs by module when debugging.
 *
 * @param context - Name of the module/service (e.g., 'EmailProcessor', 'CategorizerAnalyzer')
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('GmailSync');
 *
 * logger.info('Starting sync', { accountId: '123' });
 * // Output: [GmailSync] Starting sync { accountId: '123' }
 *
 * logger.error('Sync failed', { error: 'Token expired', accountId: '123' });
 * // Output: [GmailSync] Sync failed { error: 'Token expired', accountId: '123' }
 * ```
 */
export function createLogger(context: string): Logger {
  return {
    debug: (message: string, meta?: LogMetadata) =>
      baseLogger.debug({ context, ...meta }, message),

    info: (message: string, meta?: LogMetadata) =>
      baseLogger.info({ context, ...meta }, message),

    warn: (message: string, meta?: LogMetadata) =>
      baseLogger.warn({ context, ...meta }, message),

    error: (message: string, meta?: LogMetadata) =>
      baseLogger.error({ context, ...meta }, message),
  };
}

/**
 * Default logger for quick one-off logging.
 * Prefer createLogger() for service/module code.
 */
export const logger = createLogger('App');
