/**
 * AI Analyzer Configuration
 *
 * Configuration for all AI analyzers used in email processing.
 * Each analyzer can be independently enabled/disabled and tuned.
 *
 * WHY CONFIGURE ANALYZERS?
 * - Easy A/B testing of different settings
 * - Disable specific analyzers without code changes
 * - Fine-tune temperature/tokens per analyzer type
 * - Cost control through model selection
 *
 * MODEL DECISION:
 * We use GPT-4.1-mini exclusively (no fallback).
 * See docs/DECISIONS.md for cost analysis and rationale.
 */

/**
 * Available AI models.
 * Currently only GPT-4.1-mini is used (single model strategy).
 */
export type AIModel = 'gpt-4.1-mini';

/**
 * Configuration for a single analyzer.
 */
export interface AnalyzerConfig {
  /** Whether this analyzer is enabled */
  enabled: boolean;

  /** AI model to use (currently always gpt-4.1-mini) */
  model: AIModel;

  /**
   * Temperature for AI responses (0-1).
   * Lower = more deterministic, higher = more creative.
   * For classification tasks, we use low temperatures (0.2-0.3).
   */
  temperature: number;

  /**
   * Maximum tokens in AI response.
   * Keep low for structured outputs to control costs.
   */
  maxTokens: number;
}

/**
 * Email categories that the categorizer can assign.
 * These are action-focused: what does the user need to DO with this email?
 *
 * NOTE: "client" is NOT a category. Client relationships are tracked
 * via the client_id foreign key, allowing a client email to be
 * categorized as "action_required" rather than hidden in a "client" bucket.
 */
export const EMAIL_CATEGORIES = [
  'action_required', // Needs response, decision, or action from user
  'event',           // Calendar-worthy: invitation, announcement with date/time
  'newsletter',      // Informational content, digest, regular publication
  'promo',           // Marketing, promotional, sales content
  'admin',           // Receipts, confirmations, notifications, automated
  'personal',        // Personal correspondence (friends, family)
  'noise',           // Low-value, safe to ignore or bulk archive
] as const;

export type EmailCategory = typeof EMAIL_CATEGORIES[number];

/**
 * Action types that the action extractor can identify.
 * These describe WHAT KIND of action is needed.
 */
export const ACTION_TYPES = [
  'respond',   // Need to reply to this email
  'review',    // Need to review attached/linked content
  'create',    // Need to create something (document, code, etc.)
  'schedule',  // Need to schedule a meeting or event
  'decide',    // Need to make a decision
  'none',      // No action required
] as const;

export type ActionType = typeof ACTION_TYPES[number];

/**
 * Analyzer configurations.
 * Each analyzer has its own tuned settings.
 */
export const analyzerConfig = {
  /**
   * Categorizer: Classifies emails by action needed.
   * Low temperature for consistent classification.
   */
  categorizer: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for deterministic classification
    maxTokens: 300,   // Category + reasoning + topics doesn't need much
  } satisfies AnalyzerConfig,

  /**
   * Action Extractor: Identifies if/what action is needed.
   * Slightly higher temperature for nuanced action descriptions.
   */
  actionExtractor: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.3, // Slightly higher for action descriptions
    maxTokens: 500,   // Needs room for action title + description
  } satisfies AnalyzerConfig,

  /**
   * Client Tagger: Links emails to known clients.
   * Low temperature for accurate matching.
   */
  clientTagger: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate matching
    maxTokens: 300,   // Client name + project + confidence
  } satisfies AnalyzerConfig,
} as const;

/**
 * Type for the analyzer configuration object.
 */
export type AnalyzerConfigMap = typeof analyzerConfig;

/**
 * GPT-4.1-mini pricing for cost calculations.
 * Prices are per token.
 *
 * Current pricing (as of Jan 2026):
 * - Input:  $0.15 per 1M tokens
 * - Output: $0.60 per 1M tokens
 */
export const MODEL_PRICING = {
  'gpt-4.1-mini': {
    input: 0.15 / 1_000_000,  // $0.00000015 per token
    output: 0.60 / 1_000_000, // $0.0000006 per token
  },
} as const;

/**
 * Calculate estimated cost for an API call.
 *
 * @param model - The model used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const cost = calculateCost('gpt-4.1-mini', 500, 100);
 * // cost = 0.000135 (input) + 0.00006 (output) = $0.000195
 * ```
 */
export function calculateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
