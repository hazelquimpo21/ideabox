/**
 * Categorizer Analyzer
 *
 * Classifies emails by what ACTION is needed, not by who sent them.
 * This is the first analyzer in the processing pipeline.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CATEGORY PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * IMPORTANT: "client" is NOT a category. Client relationships are tracked
 * separately via the client_id foreign key. This design allows a client email
 * to be categorized as "action_required" rather than hidden in a "client" bucket.
 *
 * Categories are action-focused:
 * - action_required: User needs to respond, decide, or do something
 * - event: Calendar-worthy with date/time/location
 * - newsletter: Informational content, no action needed
 * - promo: Marketing/promotional content
 * - admin: Receipts, confirmations, automated notifications
 * - personal: Friends, family, non-work correspondence
 * - noise: Low value, safe to ignore
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { CategorizerAnalyzer } from '@/services/analyzers/categorizer';
 *
 * const categorizer = new CategorizerAnalyzer();
 *
 * const result = await categorizer.analyze({
 *   id: 'email-123',
 *   subject: 'Can you review this proposal?',
 *   senderEmail: 'client@example.com',
 *   senderName: 'Jane Smith',
 *   date: '2024-01-15T10:00:00Z',
 *   snippet: 'Please review the attached proposal...',
 *   bodyText: 'Hi, I hope this email finds you well...',
 * });
 *
 * if (result.success) {
 *   console.log(result.data.category);  // 'action_required'
 *   console.log(result.data.topics);    // ['proposal', 'review']
 *   console.log(result.confidence);     // 0.92
 * }
 * ```
 *
 * @module services/analyzers/categorizer
 * @version 1.0.0
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig, EMAIL_CATEGORIES } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  CategorizationData,
  CategorizationResult,
  EmailInput,
  UserContext,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'categorize_email';

/**
 * Description of what the function does.
 * This helps OpenAI understand when/how to use the function.
 */
const FUNCTION_DESCRIPTION =
  'Categorizes an email by what action (if any) is needed from the user';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for the categorizer.
 *
 * This prompt is carefully crafted to:
 * 1. Focus on ACTION needed, not sender identity
 * 2. Explicitly exclude "client" as a category
 * 3. Provide clear criteria for each category
 * 4. Request topic extraction for additional context
 * 5. Encourage honest confidence assessment
 */
const SYSTEM_PROMPT = `You are an email categorization specialist. Categorize this email by WHAT ACTION IS NEEDED, not by who sent it.

IMPORTANT: Do NOT use "client" as a category. Client relationships are tracked separately.
A client email asking for something should be "action_required", not hidden in a client bucket.

Categories (choose ONE):
- action_required: User needs to respond, decide, review, or do something
- event: Contains a calendar-worthy event with date/time/location
- newsletter: Informational content, digest, regular publication (no action needed)
- promo: Marketing, promotional, sales content
- admin: Receipts, confirmations, automated notifications
- personal: Personal correspondence (friends, family, non-work)
- noise: Low value, safe to ignore (spam-adjacent, irrelevant)

DECISION GUIDANCE:
- If the email asks a question → action_required
- If the email requests feedback/review/approval → action_required
- If the email is purely FYI with no expected response → newsletter or admin
- If the email has a specific date/time for an event → event
- If the email is selling something → promo
- If unsure between categories, lean toward action_required (safer to surface)

Also extract 1-5 topic keywords that describe the email content (e.g., "billing", "meeting", "project-update", "feedback").

Be decisive but honest about confidence. If truly ambiguous, use confidence < 0.7.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * Using function calling ensures consistent, typed responses.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Primary category (required)
      category: {
        type: 'string',
        enum: EMAIL_CATEGORIES as unknown as string[],
        description: 'Primary category based on action needed (NOT who sent it)',
      },

      // Confidence score (required)
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in this categorization (0-1)',
      },

      // Reasoning (required for transparency)
      reasoning: {
        type: 'string',
        description: 'Brief explanation of why this category was chosen',
      },

      // Topic keywords (optional but helpful)
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key topics extracted from email: billing, meeting, feedback, etc.',
      },
    },
    required: ['category', 'confidence', 'reasoning'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIZER ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categorizer Analyzer
 *
 * Classifies emails into one of seven action-focused categories.
 * This analyzer runs first in the pipeline and helps determine
 * which other analyzers should process the email.
 *
 * Key design decisions:
 * - Action-focused categories (not sender-based)
 * - "client" is NOT a category (tracked separately)
 * - Conservative: when unsure, prefers action_required
 * - Extracts topics for filtering and search
 *
 * @example
 * ```typescript
 * const categorizer = new CategorizerAnalyzer();
 *
 * // Check if categorizer is enabled
 * if (!categorizer.isEnabled()) {
 *   console.log('Categorizer is disabled in config');
 *   return;
 * }
 *
 * // Analyze an email
 * const result = await categorizer.analyze(emailInput);
 *
 * if (result.success) {
 *   // Use the categorization
 *   console.log(`Category: ${result.data.category}`);
 *   console.log(`Confidence: ${result.confidence}`);
 *   console.log(`Topics: ${result.data.topics?.join(', ')}`);
 * } else {
 *   // Handle failure
 *   console.error(`Categorization failed: ${result.error}`);
 * }
 * ```
 */
export class CategorizerAnalyzer extends BaseAnalyzer<CategorizationData> {
  /**
   * Creates a new CategorizerAnalyzer instance.
   *
   * Uses the categorizer configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.2 for consistency)
   * - maxTokens: Maximum response tokens (300)
   */
  constructor() {
    super('Categorizer', analyzerConfig.categorizer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and returns its category.
   *
   * This is the main entry point for categorization.
   * Internally uses executeAnalysis() from BaseAnalyzer
   * which handles:
   * - Email formatting
   * - API calls with retry
   * - Error handling
   * - Logging
   *
   * @param email - Email data to categorize
   * @param _context - User context (not used by categorizer)
   * @returns Categorization result with category, confidence, reasoning, topics
   *
   * @example
   * ```typescript
   * const result = await categorizer.analyze({
   *   id: 'email-123',
   *   subject: 'Invoice #1234',
   *   senderEmail: 'billing@stripe.com',
   *   senderName: 'Stripe',
   *   date: '2024-01-15T10:00:00Z',
   *   snippet: 'Your payment was successful',
   *   bodyText: 'Receipt for your payment of $99.00...',
   * });
   *
   * // result.data.category === 'admin'
   * // result.data.topics === ['billing', 'payment', 'receipt']
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<CategorizationResult> {
    // Note: context is not used by categorizer (unlike client tagger)
    void context;

    // Use the base class executeAnalysis which handles all common logic:
    // - Logging
    // - API calls with retry
    // - Error handling
    // - Cost tracking
    return this.executeAnalysis(email);
  }

  /**
   * Returns the OpenAI function schema for categorization.
   *
   * The schema defines the structured output format:
   * - category: One of the EMAIL_CATEGORIES
   * - confidence: 0-1 confidence score
   * - reasoning: Why this category was chosen
   * - topics: Array of topic keywords
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for categorization.
   *
   * The prompt instructs the AI to:
   * - Categorize by ACTION needed, not sender
   * - Avoid using "client" as a category
   * - Be conservative (prefer action_required when unsure)
   * - Extract relevant topic keywords
   * - Be honest about confidence
   *
   * @param _context - User context (not used by categorizer)
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    // Note: context is not used by categorizer (unlike client tagger)
    void context;
    return SYSTEM_PROMPT;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default categorizer instance for convenience.
 *
 * Use this for simple cases where you don't need
 * custom configuration.
 *
 * @example
 * ```typescript
 * import { categorizer } from '@/services/analyzers/categorizer';
 *
 * const result = await categorizer.analyze(email);
 * ```
 */
export const categorizer = new CategorizerAnalyzer();
