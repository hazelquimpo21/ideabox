/**
 * Email Processor Service
 *
 * Orchestrates all AI analyzers to process a single email.
 * This is the main entry point for AI-powered email analysis.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROCESSING PIPELINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Run all enabled analyzers in parallel:
 *    - Categorizer: What type of email? What action needed?
 *    - ActionExtractor: Extract specific action details
 *    - ClientTagger: Link to known client
 *
 * 2. Aggregate results from all analyzers
 *
 * 3. Save analysis to email_analyses table
 *
 * 4. Create action record if action detected
 *
 * 5. Update email category in emails table
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Individual analyzer failures don't stop the pipeline
 * - Partial results are saved (graceful degradation)
 * - Errors are logged and included in the result
 * - If ALL analyzers fail, the email is marked with an error
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { EmailProcessor } from '@/services/processors/email-processor';
 *
 * const processor = new EmailProcessor();
 *
 * // Process a single email
 * const result = await processor.process(email, {
 *   userId: 'user-123',
 *   clients: await getActiveClients(userId),
 * });
 *
 * if (result.success) {
 *   console.log(`Category: ${result.analysis.categorization?.category}`);
 *   console.log(`Has Action: ${result.analysis.actionExtraction?.hasAction}`);
 *   console.log(`Client: ${result.analysis.clientTagging?.clientName}`);
 * }
 * ```
 *
 * @module services/processors/email-processor
 * @version 1.0.0
 */

import { createLogger, logAI } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { CategorizerAnalyzer } from '@/services/analyzers/categorizer';
import { ActionExtractorAnalyzer } from '@/services/analyzers/action-extractor';
import { ClientTaggerAnalyzer } from '@/services/analyzers/client-tagger';
import { ANALYZER_VERSION } from '@/services/analyzers/base-analyzer';
import { toEmailInput } from '@/services/analyzers/types';
import type { Email } from '@/types/database';
import type {
  EmailInput,
  UserContext,
  CategorizationResult,
  ActionExtractionResult,
  ClientTaggingResult,
  AggregatedAnalysis,
  EmailProcessingResult,
} from '@/services/analyzers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailProcessor');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for email processing.
 */
export interface ProcessOptions {
  /**
   * Whether to skip already-analyzed emails.
   * Default: true (skip if analyzed_at is set)
   */
  skipAnalyzed?: boolean;

  /**
   * Whether to save results to database.
   * Default: true
   */
  saveToDatabase?: boolean;

  /**
   * Whether to create action records.
   * Default: true
   */
  createActions?: boolean;
}

/**
 * Default processing options.
 */
const DEFAULT_OPTIONS: ProcessOptions = {
  skipAnalyzed: true,
  saveToDatabase: true,
  createActions: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL PROCESSOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Email Processor
 *
 * Orchestrates all AI analyzers to fully process an email.
 * Handles running analyzers in parallel, aggregating results,
 * and persisting analysis to the database.
 *
 * @example
 * ```typescript
 * const processor = new EmailProcessor();
 *
 * // Process with full context
 * const result = await processor.process(email, userContext);
 *
 * // Check results
 * if (result.success) {
 *   console.log(`Tokens used: ${result.analysis.totalTokensUsed}`);
 *   console.log(`Time: ${result.analysis.totalProcessingTimeMs}ms`);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export class EmailProcessor {
  /** Categorizer analyzer instance */
  private categorizer: CategorizerAnalyzer;

  /** Action extractor analyzer instance */
  private actionExtractor: ActionExtractorAnalyzer;

  /** Client tagger analyzer instance */
  private clientTagger: ClientTaggerAnalyzer;

  /**
   * Creates a new EmailProcessor instance.
   *
   * Initializes all analyzers. Each analyzer checks its own
   * enabled status from config when running.
   */
  constructor() {
    this.categorizer = new CategorizerAnalyzer();
    this.actionExtractor = new ActionExtractorAnalyzer();
    this.clientTagger = new ClientTaggerAnalyzer();

    logger.debug('EmailProcessor initialized', {
      categorizerEnabled: this.categorizer.isEnabled(),
      actionExtractorEnabled: this.actionExtractor.isEnabled(),
      clientTaggerEnabled: this.clientTagger.isEnabled(),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Processes a single email through all analyzers.
   *
   * This is the main entry point for email analysis.
   * It runs all enabled analyzers in parallel, aggregates results,
   * and optionally saves to database.
   *
   * @param email - Email to process (full Email type or EmailInput)
   * @param context - User context with clients for client matching
   * @param options - Processing options
   * @returns Processing result with aggregated analysis
   *
   * @example
   * ```typescript
   * // Process a fresh email
   * const result = await processor.process(email, context);
   *
   * // Process without saving (for testing)
   * const testResult = await processor.process(email, context, {
   *   saveToDatabase: false,
   *   createActions: false,
   * });
   * ```
   */
  async process(
    email: Email | EmailInput,
    context: UserContext,
    options: ProcessOptions = {}
  ): Promise<EmailProcessingResult> {
    // Merge options with defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Convert to EmailInput if full Email passed
    const emailInput = 'gmail_id' in email ? toEmailInput(email) : email;

    logger.start('Processing email', {
      emailId: emailInput.id,
      subject: emailInput.subject?.substring(0, 50),
      hasClients: (context.clients?.length ?? 0) > 0,
    });

    // Check if already analyzed
    if (opts.skipAnalyzed && 'analyzed_at' in email && email.analyzed_at) {
      logger.info('Skipping already-analyzed email', { emailId: emailInput.id });
      return this.createSkippedResult(emailInput.id);
    }

    // Run all analyzers in parallel
    const [categorizationResult, actionResult, clientResult] =
      await this.runAnalyzers(emailInput, context);

    // Aggregate results
    const aggregatedAnalysis = this.aggregateResults(
      categorizationResult,
      actionResult,
      clientResult
    );

    // Collect errors
    const errors = this.collectErrors(
      categorizationResult,
      actionResult,
      clientResult
    );

    // Determine success (at least one analyzer succeeded)
    const success =
      categorizationResult.success ||
      actionResult.success ||
      clientResult.success;

    // Build the result
    const result: EmailProcessingResult = {
      success,
      analysis: aggregatedAnalysis,
      results: {
        categorization: categorizationResult,
        actionExtraction: actionResult,
        clientTagging: clientResult,
      },
      errors,
    };

    // Save to database if enabled
    if (opts.saveToDatabase && success) {
      try {
        await this.saveAnalysis(
          emailInput.id,
          context.userId,
          aggregatedAnalysis
        );

        // Create action if detected and enabled
        if (opts.createActions && actionResult.data.hasAction) {
          await this.createAction(
            emailInput.id,
            context.userId,
            actionResult.data
          );
        }

        // Update email category
        if (categorizationResult.success) {
          await this.updateEmailCategory(
            emailInput.id,
            categorizationResult.data.category
          );
        }

        // Update client link if matched
        if (clientResult.data.clientMatch && clientResult.data.clientId) {
          await this.linkEmailToClient(
            emailInput.id,
            clientResult.data.clientId
          );
        }
      } catch (error) {
        // Database errors shouldn't fail the whole process
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to save analysis', {
          emailId: emailInput.id,
          error: errorMessage,
        });
        errors.push({ analyzer: 'database', error: errorMessage });
      }
    }

    // Log completion
    const totalTime = Date.now() - startTime;
    logAI.batchComplete({
      totalEmails: 1,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      totalDurationMs: totalTime,
    });

    logger.success('Email processing complete', {
      emailId: emailInput.id,
      success,
      category: aggregatedAnalysis.categorization?.category,
      hasAction: aggregatedAnalysis.actionExtraction?.hasAction,
      clientMatch: aggregatedAnalysis.clientTagging?.clientMatch,
      tokensUsed: aggregatedAnalysis.totalTokensUsed,
      totalTimeMs: totalTime,
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - ANALYZER EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Runs all enabled analyzers in parallel.
   *
   * Uses Promise.allSettled to ensure all analyzers run
   * even if some fail. Returns results for all analyzers.
   *
   * @param email - Email to analyze
   * @param context - User context
   * @returns Tuple of [categorization, action, client] results
   */
  private async runAnalyzers(
    email: EmailInput,
    context: UserContext
  ): Promise<[CategorizationResult, ActionExtractionResult, ClientTaggingResult]> {
    // Run all analyzers in parallel
    // Note: Each analyzer handles its own enabled check
    const results = await Promise.allSettled([
      this.categorizer.analyze(email, context),
      this.actionExtractor.analyze(email, context),
      this.clientTagger.analyze(email, context),
    ]);

    // Extract results, using failed results for rejected promises
    const categorizationResult = this.extractResult<CategorizationResult>(
      results[0],
      'Categorizer'
    );
    const actionResult = this.extractResult<ActionExtractionResult>(
      results[1],
      'ActionExtractor'
    );
    const clientResult = this.extractResult<ClientTaggingResult>(
      results[2],
      'ClientTagger'
    );

    return [categorizationResult, actionResult, clientResult];
  }

  /**
   * Extracts a result from a Promise.allSettled outcome.
   *
   * If the promise was rejected, creates a failed result.
   *
   * @param outcome - PromiseSettledResult from allSettled
   * @param analyzerName - Name of the analyzer (for logging)
   * @returns The result (success or failed)
   */
  private extractResult<T>(
    outcome: PromiseSettledResult<T>,
    analyzerName: string
  ): T {
    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }

    // Promise was rejected - create a failed result
    const error =
      outcome.reason instanceof Error
        ? outcome.reason.message
        : 'Unknown error';

    logger.error(`${analyzerName} threw an exception`, { error });

    // Return a failed result that matches the expected interface
    return {
      success: false,
      data: {} as unknown,
      confidence: 0,
      tokensUsed: 0,
      processingTimeMs: 0,
      error,
    } as T;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - RESULT AGGREGATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Aggregates results from all analyzers into a single object.
   *
   * @param categorization - Categorization result
   * @param action - Action extraction result
   * @param client - Client tagging result
   * @returns Aggregated analysis
   */
  private aggregateResults(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult
  ): AggregatedAnalysis {
    // Calculate totals
    const totalTokensUsed =
      categorization.tokensUsed + action.tokensUsed + client.tokensUsed;

    const totalProcessingTimeMs =
      categorization.processingTimeMs +
      action.processingTimeMs +
      client.processingTimeMs;

    return {
      // Include data from successful analyzers only
      categorization: categorization.success ? categorization.data : undefined,
      actionExtraction: action.success ? action.data : undefined,
      clientTagging: client.success ? client.data : undefined,

      // Totals
      totalTokensUsed,
      totalProcessingTimeMs,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  /**
   * Collects errors from all analyzers.
   *
   * @param categorization - Categorization result
   * @param action - Action extraction result
   * @param client - Client tagging result
   * @returns Array of errors
   */
  private collectErrors(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult
  ): Array<{ analyzer: string; error: string }> {
    const errors: Array<{ analyzer: string; error: string }> = [];

    if (!categorization.success && categorization.error) {
      errors.push({ analyzer: 'Categorizer', error: categorization.error });
    }
    if (!action.success && action.error) {
      errors.push({ analyzer: 'ActionExtractor', error: action.error });
    }
    if (!client.success && client.error) {
      errors.push({ analyzer: 'ClientTagger', error: client.error });
    }

    return errors;
  }

  /**
   * Creates a result for skipped (already analyzed) emails.
   *
   * @param emailId - Email ID (kept for potential future logging)
   */
  private createSkippedResult(emailId: string): EmailProcessingResult {
    // Note: emailId is available for future logging if needed
    void emailId;
    return {
      success: true,
      analysis: {
        totalTokensUsed: 0,
        totalProcessingTimeMs: 0,
        analyzerVersion: ANALYZER_VERSION,
      },
      results: {},
      errors: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - DATABASE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Saves analysis results to the email_analyses table.
   *
   * @param emailId - Email ID
   * @param userId - User ID
   * @param analysis - Aggregated analysis data
   */
  private async saveAnalysis(
    emailId: string,
    userId: string,
    analysis: AggregatedAnalysis
  ): Promise<void> {
    const supabase = await createServerClient();

    // Build the analysis record
    const record = {
      email_id: emailId,
      user_id: userId,

      // Categorization
      category: analysis.categorization?.category ?? null,
      category_confidence: analysis.categorization?.confidence ?? null,
      topics: analysis.categorization?.topics ?? null,

      // Action
      has_action: analysis.actionExtraction?.hasAction ?? false,
      action_type: analysis.actionExtraction?.actionType ?? null,
      action_title: analysis.actionExtraction?.actionTitle ?? null,
      urgency_score: analysis.actionExtraction?.urgencyScore ?? null,

      // Client
      client_id: analysis.clientTagging?.clientId ?? null,
      client_confidence: analysis.clientTagging?.matchConfidence ?? null,
      relationship_signal: analysis.clientTagging?.relationshipSignal ?? null,

      // Metadata
      total_tokens: analysis.totalTokensUsed,
      processing_time_ms: analysis.totalProcessingTimeMs,
      analyzer_version: analysis.analyzerVersion,
    };

    const { error } = await supabase.from('email_analyses').upsert(record, {
      onConflict: 'email_id',
    });

    if (error) {
      throw new Error(`Failed to save analysis: ${error.message}`);
    }

    // Update email's analyzed_at timestamp
    const { error: updateError } = await supabase
      .from('emails')
      .update({ analyzed_at: new Date().toISOString() })
      .eq('id', emailId);

    if (updateError) {
      logger.warn('Failed to update analyzed_at', {
        emailId,
        error: updateError.message,
      });
    }
  }

  /**
   * Creates an action record from extracted action data.
   *
   * @param emailId - Email ID
   * @param userId - User ID
   * @param action - Action extraction data
   */
  private async createAction(
    emailId: string,
    userId: string,
    action: ActionExtractionResult['data']
  ): Promise<void> {
    if (!action.hasAction || action.actionType === 'none') {
      return;
    }

    const supabase = await createServerClient();

    const record = {
      email_id: emailId,
      user_id: userId,
      type: action.actionType,
      title: action.actionTitle ?? 'Action Required',
      description: action.actionDescription ?? null,
      urgency_score: action.urgencyScore,
      due_date: action.deadline ?? null,
      estimated_minutes: action.estimatedMinutes ?? null,
      status: 'pending' as const,
      source: 'ai' as const,
    };

    const { error } = await supabase.from('actions').insert(record);

    if (error) {
      // Don't fail - just log the error
      logger.error('Failed to create action', {
        emailId,
        error: error.message,
      });
    } else {
      logger.info('Created action from email', {
        emailId,
        actionType: action.actionType,
        urgency: action.urgencyScore,
      });
    }
  }

  /**
   * Updates the email's category field.
   *
   * @param emailId - Email ID
   * @param category - Category to set
   */
  private async updateEmailCategory(
    emailId: string,
    category: string
  ): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('emails')
      .update({ category })
      .eq('id', emailId);

    if (error) {
      logger.warn('Failed to update email category', {
        emailId,
        category,
        error: error.message,
      });
    }
  }

  /**
   * Links an email to a client.
   *
   * @param emailId - Email ID
   * @param clientId - Client ID to link
   */
  private async linkEmailToClient(
    emailId: string,
    clientId: string
  ): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('emails')
      .update({ client_id: clientId })
      .eq('id', emailId);

    if (error) {
      logger.warn('Failed to link email to client', {
        emailId,
        clientId,
        error: error.message,
      });
    } else {
      logger.debug('Linked email to client', { emailId, clientId });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default email processor instance for convenience.
 *
 * @example
 * ```typescript
 * import { emailProcessor } from '@/services/processors/email-processor';
 *
 * const result = await emailProcessor.process(email, context);
 * ```
 */
export const emailProcessor = new EmailProcessor();
