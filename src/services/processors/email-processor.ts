/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues
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
import { EventDetectorAnalyzer } from '@/services/analyzers/event-detector';
import { ANALYZER_VERSION } from '@/services/analyzers/base-analyzer';
import { toEmailInput } from '@/services/analyzers/types';
import type { Email } from '@/types/database';
import type {
  EmailInput,
  UserContext,
  CategorizationResult,
  ActionExtractionResult,
  ClientTaggingResult,
  EventDetectionResult,
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

  /** Event detector analyzer instance (runs conditionally for events) */
  private eventDetector: EventDetectorAnalyzer;

  /**
   * Creates a new EmailProcessor instance.
   *
   * Initializes all analyzers. Each analyzer checks its own
   * enabled status from config when running.
   *
   * ANALYZER EXECUTION FLOW:
   * 1. Categorizer, ActionExtractor, ClientTagger run in PARALLEL (always)
   * 2. EventDetector runs AFTER categorizer IF category === 'event'
   */
  constructor() {
    this.categorizer = new CategorizerAnalyzer();
    this.actionExtractor = new ActionExtractorAnalyzer();
    this.clientTagger = new ClientTaggerAnalyzer();
    this.eventDetector = new EventDetectorAnalyzer();

    logger.debug('EmailProcessor initialized', {
      categorizerEnabled: this.categorizer.isEnabled(),
      actionExtractorEnabled: this.actionExtractor.isEnabled(),
      clientTaggerEnabled: this.clientTagger.isEnabled(),
      eventDetectorEnabled: this.eventDetector.isEnabled(),
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

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Run core analyzers in parallel
    // ═══════════════════════════════════════════════════════════════════════
    const [categorizationResult, actionResult, clientResult] =
      await this.runCoreAnalyzers(emailInput, context);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Run conditional analyzers based on categorization
    // ═══════════════════════════════════════════════════════════════════════
    let eventResult: EventDetectionResult | undefined;

    // Run EventDetector ONLY if category is 'event'
    // This saves tokens by not running expensive event extraction on non-events
    if (
      categorizationResult.success &&
      categorizationResult.data.category === 'event' &&
      this.eventDetector.isEnabled()
    ) {
      logger.debug('Running conditional EventDetector (category is event)', {
        emailId: emailInput.id,
      });

      eventResult = await this.runEventDetector(emailInput, context);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Aggregate results from all analyzers
    // ═══════════════════════════════════════════════════════════════════════
    const aggregatedAnalysis = this.aggregateResults(
      categorizationResult,
      actionResult,
      clientResult,
      eventResult
    );

    // Collect errors from all analyzers
    const errors = this.collectErrors(
      categorizationResult,
      actionResult,
      clientResult,
      eventResult
    );

    // Determine success (at least one core analyzer succeeded)
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
        eventDetection: eventResult,
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
      summary: aggregatedAnalysis.categorization?.summary?.substring(0, 50),
      quickAction: aggregatedAnalysis.categorization?.quickAction,
      hasAction: aggregatedAnalysis.actionExtraction?.hasAction,
      clientMatch: aggregatedAnalysis.clientTagging?.clientMatch,
      hasEvent: aggregatedAnalysis.eventDetection?.hasEvent ?? false,
      eventTitle: aggregatedAnalysis.eventDetection?.eventTitle?.substring(0, 30),
      tokensUsed: aggregatedAnalysis.totalTokensUsed,
      totalTimeMs: totalTime,
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - ANALYZER EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Runs all core analyzers in parallel.
   *
   * These analyzers run on EVERY email:
   * - Categorizer: Determines category, summary, quickAction
   * - ActionExtractor: Extracts detailed action info
   * - ClientTagger: Links to known clients
   *
   * Uses Promise.allSettled to ensure all analyzers run even if some fail.
   *
   * @param email - Email to analyze
   * @param context - User context
   * @returns Tuple of [categorization, action, client] results
   */
  private async runCoreAnalyzers(
    email: EmailInput,
    context: UserContext
  ): Promise<[CategorizationResult, ActionExtractionResult, ClientTaggingResult]> {
    logger.debug('Running core analyzers in parallel', {
      emailId: email.id,
      analyzers: ['Categorizer', 'ActionExtractor', 'ClientTagger'],
    });

    // Run all core analyzers in parallel
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
   * Runs the EventDetector analyzer.
   *
   * This is a CONDITIONAL analyzer - it only runs when:
   * 1. Categorizer returns category === 'event'
   * 2. EventDetector is enabled in config
   *
   * Running conditionally saves tokens since events are ~5-10% of emails.
   *
   * @param email - Email to analyze
   * @param context - User context
   * @returns Event detection result
   */
  private async runEventDetector(
    email: EmailInput,
    context: UserContext
  ): Promise<EventDetectionResult> {
    logger.debug('Running EventDetector (conditional analyzer)', {
      emailId: email.id,
    });

    try {
      return await this.eventDetector.analyze(email, context);
    } catch (error) {
      // If EventDetector throws (shouldn't happen, but be safe), return failed result
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('EventDetector threw exception', {
        emailId: email.id,
        error: errorMessage,
      });

      return {
        success: false,
        data: {} as EventDetectionResult['data'],
        confidence: 0,
        tokensUsed: 0,
        processingTimeMs: 0,
        error: errorMessage,
      };
    }
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
   * @param event - Event detection result (optional, only present for event emails)
   * @returns Aggregated analysis
   */
  private aggregateResults(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult,
    event?: EventDetectionResult
  ): AggregatedAnalysis {
    // Calculate totals (include event tokens if present)
    const totalTokensUsed =
      categorization.tokensUsed +
      action.tokensUsed +
      client.tokensUsed +
      (event?.tokensUsed ?? 0);

    const totalProcessingTimeMs =
      categorization.processingTimeMs +
      action.processingTimeMs +
      client.processingTimeMs +
      (event?.processingTimeMs ?? 0);

    return {
      // Include data from successful analyzers only
      categorization: categorization.success ? categorization.data : undefined,
      actionExtraction: action.success ? action.data : undefined,
      clientTagging: client.success ? client.data : undefined,

      // Event detection (only present when category === 'event')
      eventDetection: event?.success ? event.data : undefined,

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
   * @param event - Event detection result (optional)
   * @returns Array of errors
   */
  private collectErrors(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult,
    event?: EventDetectionResult
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
    // Event detector errors (only present if it ran)
    if (event && !event.success && event.error) {
      errors.push({ analyzer: 'EventDetector', error: event.error });
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

    // Build the analysis record matching the database schema
    // The DB uses JSONB columns for analyzer outputs (see migration 004)
    const record = {
      email_id: emailId,
      user_id: userId,

      // ═══════════════════════════════════════════════════════════════════════
      // Analyzer outputs as JSONB objects
      // ═══════════════════════════════════════════════════════════════════════

      // Categorization (ENHANCED: now includes summary and quick_action)
      categorization: analysis.categorization
        ? {
            category: analysis.categorization.category,
            confidence: analysis.categorization.confidence,
            reasoning: analysis.categorization.reasoning,
            topics: analysis.categorization.topics,
            // NEW FIELDS (Jan 2026)
            summary: analysis.categorization.summary,
            quick_action: analysis.categorization.quickAction,
          }
        : null,

      // Action extraction
      action_extraction: analysis.actionExtraction
        ? {
            has_action: analysis.actionExtraction.hasAction,
            action_type: analysis.actionExtraction.actionType,
            title: analysis.actionExtraction.actionTitle,
            description: analysis.actionExtraction.actionDescription,
            urgency_score: analysis.actionExtraction.urgencyScore,
            deadline: analysis.actionExtraction.deadline,
          }
        : null,

      // Client tagging
      client_tagging: analysis.clientTagging
        ? {
            client_match: analysis.clientTagging.clientMatch,
            client_id: analysis.clientTagging.clientId,
            client_name: analysis.clientTagging.clientName,
            confidence: analysis.clientTagging.matchConfidence,
            relationship_signal: analysis.clientTagging.relationshipSignal,
          }
        : null,

      // Event detection (NEW: only present when category === 'event')
      event_detection: analysis.eventDetection
        ? {
            has_event: analysis.eventDetection.hasEvent,
            event_title: analysis.eventDetection.eventTitle,
            event_date: analysis.eventDetection.eventDate,
            event_time: analysis.eventDetection.eventTime,
            event_end_time: analysis.eventDetection.eventEndTime,
            location_type: analysis.eventDetection.locationType,
            location: analysis.eventDetection.location,
            registration_deadline: analysis.eventDetection.registrationDeadline,
            rsvp_required: analysis.eventDetection.rsvpRequired,
            rsvp_url: analysis.eventDetection.rsvpUrl,
            organizer: analysis.eventDetection.organizer,
            cost: analysis.eventDetection.cost,
            additional_details: analysis.eventDetection.additionalDetails,
            confidence: analysis.eventDetection.confidence,
          }
        : null,

      // ═══════════════════════════════════════════════════════════════════════
      // Metadata columns
      // ═══════════════════════════════════════════════════════════════════════
      tokens_used: analysis.totalTokensUsed,
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
