/**
 * Application Configuration
 *
 * Centralized configuration for app-wide settings.
 * All magic numbers and configurable values should live here,
 * not scattered throughout the codebase.
 *
 * WHY CENTRALIZE CONFIG?
 * - Single source of truth for all settings
 * - Easy to adjust without code changes (via env vars)
 * - Clear documentation of what's configurable
 * - Type-safe access to configuration values
 */

import { z } from 'zod';

/**
 * Validate and parse environment variables with Zod.
 * This catches configuration errors at startup, not runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_BODY_CHARS: z.coerce.number().int().positive().default(16000),
  ENABLE_GMAIL_LABEL_SYNC: z.coerce.boolean().default(true),
});

/**
 * Parsed environment configuration.
 * Access via appConfig.env for type-safe env var access.
 */
const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  MAX_BODY_CHARS: process.env.MAX_BODY_CHARS,
  ENABLE_GMAIL_LABEL_SYNC: process.env.ENABLE_GMAIL_LABEL_SYNC,
});

/**
 * Application configuration object.
 * Import this anywhere you need configuration values.
 *
 * @example
 * ```typescript
 * import { appConfig } from '@/config/app';
 *
 * if (appConfig.features.gmailLabelSync) {
 *   await syncLabelsToGmail(email);
 * }
 * ```
 */
export const appConfig = {
  /** Environment variables (validated and typed) */
  env,

  /** Feature flags for gradual rollout */
  features: {
    /** Whether to sync IdeaBox categories as Gmail labels */
    gmailLabelSync: env.ENABLE_GMAIL_LABEL_SYNC,
  },

  /** Email processing configuration */
  email: {
    /**
     * Maximum characters of email body to send to AI.
     * Longer emails are truncated to control costs.
     * 16K chars ~ 4K tokens ~ $0.0006 per email with GPT-4.1-mini.
     */
    maxBodyChars: env.MAX_BODY_CHARS,

    /** Number of emails to fetch on initial onboarding sync */
    initialSyncCount: 50,

    /** Batch size for processing multiple emails */
    batchSize: 10,

    /** Delay between batches to respect rate limits (ms) */
    batchDelayMs: 100,
  },

  /** Pagination defaults */
  pagination: {
    /** Default items per page for lists */
    defaultPageSize: 50,

    /** Maximum items per page (prevents abuse) */
    maxPageSize: 100,
  },

  /** Retry configuration for API calls */
  retry: {
    /** Maximum retry attempts for transient failures */
    maxAttempts: 3,

    /** Base delay between retries in ms (doubles each attempt) */
    baseDelayMs: 1000,

    /** Maximum delay between retries in ms */
    maxDelayMs: 10000,
  },

  /** Log retention configuration */
  logs: {
    /** Days to retain sync and API usage logs */
    retentionDays: 30,
  },
} as const;

/**
 * Type for the app configuration.
 * Useful for functions that accept config as a parameter.
 */
export type AppConfig = typeof appConfig;
