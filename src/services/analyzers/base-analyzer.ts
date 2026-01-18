/**
 * Base Analyzer Abstract Class
 *
 * Provides common functionality for all AI analyzers.
 * Concrete analyzers extend this class and implement the analyze method.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Consistent logging across all analyzers
 * - Email content formatting for AI prompts
 * - Retry logic with exponential backoff
 * - Cost tracking and token usage logging
 * - Error handling with graceful degradation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * class MyAnalyzer extends BaseAnalyzer<MyData> {
 *   constructor() {
 *     super('MyAnalyzer', analyzerConfig.myAnalyzer);
 *   }
 *
 *   async analyze(email: EmailInput, context?: UserContext): Promise<AnalyzerResult<MyData>> {
 *     // Implementation
 *   }
 *
 *   getFunctionSchema(): FunctionSchema {
 *     return { ... };
 *   }
 * }
 * ```
 *
 * @module services/analyzers/base-analyzer
 * @version 1.0.0
 */

import { createLogger, logAI, type EnhancedLogger } from '@/lib/utils/logger';
import {
  analyzeWithFunction,
  withRetry,
  truncateBody,
  type FunctionSchema,
} from '@/lib/ai/openai-client';
import type {
  AnalyzerConfig,
  AnalyzerResult,
  EmailInput,
  UserContext,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default maximum body characters for AI analysis.
 * This is a cost optimization - longer bodies use more tokens.
 */
const DEFAULT_MAX_BODY_CHARS = 16000;

/**
 * Analyzer version for tracking changes.
 * Increment when analyzer prompts or logic change.
 */
export const ANALYZER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class for all AI analyzers.
 *
 * This class provides:
 * - Consistent configuration handling
 * - Logging infrastructure
 * - Email formatting for AI prompts
 * - Common error handling patterns
 *
 * Concrete analyzers must implement:
 * - `analyze()` - The main analysis method
 * - `getFunctionSchema()` - OpenAI function schema for structured output
 * - `getSystemPrompt()` - System prompt for the AI
 *
 * @template T - The type of data returned by this analyzer
 *
 * @example
 * ```typescript
 * class CategorizerAnalyzer extends BaseAnalyzer<CategorizationData> {
 *   constructor() {
 *     super('Categorizer', analyzerConfig.categorizer);
 *   }
 *
 *   async analyze(email: EmailInput): Promise<CategorizationResult> {
 *     return this.executeAnalysis(email);
 *   }
 *
 *   // ... implement abstract methods
 * }
 * ```
 */
export abstract class BaseAnalyzer<T> {
  /** Human-readable name of this analyzer */
  public readonly name: string;

  /** Configuration for this analyzer */
  protected readonly config: AnalyzerConfig;

  /** Logger instance for this analyzer */
  protected readonly logger: EnhancedLogger;

  /**
   * Creates a new analyzer instance.
   *
   * @param name - Human-readable name (e.g., 'Categorizer', 'ActionExtractor')
   * @param config - Analyzer configuration
   */
  constructor(name: string, config: AnalyzerConfig) {
    this.name = name;
    this.config = config;
    this.logger = createLogger(name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and returns structured results.
   *
   * This is the main entry point for each analyzer.
   * Implementations should handle errors gracefully and return
   * a result with success=false rather than throwing.
   *
   * @param email - Email data to analyze
   * @param context - Optional user context (for client tagger, etc.)
   * @returns Analysis result
   */
  abstract analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<AnalyzerResult<T>>;

  /**
   * Returns the OpenAI function schema for this analyzer.
   *
   * The schema defines the structured output format that
   * OpenAI will use when responding.
   *
   * @returns Function schema for OpenAI function calling
   */
  abstract getFunctionSchema(): FunctionSchema;

  /**
   * Returns the system prompt for this analyzer.
   *
   * The system prompt provides instructions to the AI about
   * how to analyze the email and what output to produce.
   *
   * @param context - Optional user context for dynamic prompts
   * @returns System prompt string
   */
  abstract getSystemPrompt(context?: UserContext): string;

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTECTED METHODS (for use by subclasses)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Executes the AI analysis with retry logic.
   *
   * This method handles:
   * - Email content formatting
   * - API call with retries
   * - Result parsing
   * - Error handling
   * - Logging
   *
   * Subclasses should call this from their analyze() method.
   *
   * @param email - Email to analyze
   * @param context - Optional user context
   * @returns Analysis result
   *
   * @example
   * ```typescript
   * async analyze(email: EmailInput): Promise<AnalyzerResult<MyData>> {
   *   return this.executeAnalysis(email);
   * }
   * ```
   */
  protected async executeAnalysis(
    email: EmailInput,
    context?: UserContext
  ): Promise<AnalyzerResult<T>> {
    const startTime = Date.now();

    // Log analysis start
    this.logger.start('Starting analysis', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
    });

    // Check if analyzer is enabled
    if (!this.config.enabled) {
      this.logger.info('Analyzer disabled, skipping', { emailId: email.id });
      return {
        success: false,
        data: {} as T,
        confidence: 0,
        tokensUsed: 0,
        processingTimeMs: Date.now() - startTime,
        error: 'Analyzer is disabled',
      };
    }

    try {
      // Format email content for the AI
      const userContent = this.formatEmailForAnalysis(email);

      // Get system prompt (may be dynamic based on context)
      const systemPrompt = this.getSystemPrompt(context);

      // Get function schema
      const functionSchema = this.getFunctionSchema();

      // Log AI call start
      logAI.callStart({
        model: this.config.model,
        emailId: email.id,
      });

      // Execute API call with retry
      const result = await withRetry(() =>
        analyzeWithFunction<T>(
          systemPrompt,
          userContent,
          functionSchema,
          {
            model: this.config.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          }
        )
      );

      // Log AI call completion
      logAI.callComplete({
        model: this.config.model,
        emailId: email.id,
        tokensUsed: result.tokensTotal,
        estimatedCost: result.estimatedCost,
        durationMs: result.durationMs,
      });

      // Extract confidence from data if present
      const confidence = this.extractConfidence(result.data);

      // Build success result
      const analysisResult: AnalyzerResult<T> = {
        success: true,
        data: result.data,
        confidence,
        tokensUsed: result.tokensTotal,
        processingTimeMs: Date.now() - startTime,
      };

      this.logger.success('Analysis complete', {
        emailId: email.id,
        confidence,
        tokensUsed: result.tokensTotal,
        durationMs: analysisResult.processingTimeMs,
      });

      return analysisResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log AI call failure
      logAI.callError({
        emailId: email.id,
        error: errorMessage,
      });

      this.logger.error('Analysis failed', {
        emailId: email.id,
        error: errorMessage,
      });

      // Return failure result (don't throw)
      return {
        success: false,
        data: {} as T,
        confidence: 0,
        tokensUsed: 0,
        processingTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Formats email data into a string for the AI prompt.
   *
   * This creates a consistent format that all analyzers use,
   * including truncation of long bodies for cost control.
   *
   * @param email - Email data to format
   * @returns Formatted email string for AI
   */
  protected formatEmailForAnalysis(email: EmailInput): string {
    const maxBodyChars = this.config.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;

    // Build the email representation
    const parts: string[] = [];

    // Header information
    parts.push(`From: ${email.senderName || ''} <${email.senderEmail}>`);
    parts.push(`Date: ${email.date}`);
    parts.push(`Subject: ${email.subject || '(no subject)'}`);

    // Gmail labels if available (useful context)
    if (email.gmailLabels && email.gmailLabels.length > 0) {
      parts.push(`Labels: ${email.gmailLabels.join(', ')}`);
    }

    // Body content
    parts.push('');
    parts.push('--- Email Body ---');

    if (email.bodyText) {
      // Truncate body if needed
      const truncatedBody = truncateBody(email.bodyText, maxBodyChars);
      parts.push(truncatedBody);
    } else if (email.snippet) {
      // Fall back to snippet if no body
      parts.push(`[Snippet only]: ${email.snippet}`);
    } else {
      parts.push('[No body content available]');
    }

    return parts.join('\n');
  }

  /**
   * Extracts confidence score from analysis data.
   *
   * Looks for a 'confidence' field in the data object.
   * Returns 0.5 if not found.
   *
   * @param data - Analysis data
   * @returns Confidence score (0-1)
   */
  protected extractConfidence(data: T): number {
    // Type-safe check for confidence property
    if (
      data &&
      typeof data === 'object' &&
      'confidence' in data &&
      typeof (data as Record<string, unknown>).confidence === 'number'
    ) {
      return (data as Record<string, unknown>).confidence as number;
    }
    return 0.5; // Default confidence if not present
  }

  /**
   * Checks if this analyzer is enabled.
   *
   * @returns true if the analyzer is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }
}
