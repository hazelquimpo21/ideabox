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
 * PHASE 0: Context Loading
 *   - Fetch user context from cache/database
 *   - Upsert contact for sender
 *
 * PHASE 1: Core Analyzers (run in parallel)
 *   - Categorizer: Category, summary, quickAction, labels
 *   - ActionExtractor: Detailed action info
 *   - ClientTagger: Link to known client
 *   - DateExtractor: Extract timeline dates
 *
 * PHASE 2: Conditional Analyzers (run based on Phase 1 results)
 *   - EventDetector: Only when category === 'event'
 *   - ContactEnricher: Only when contact needs enrichment
 *
 * PHASE 3: Persistence
 *   - Save analysis to email_analyses table
 *   - Save extracted dates to extracted_dates table
 *   - Create action record if action detected
 *   - Update email category
 *   - Link email to client if matched
 *   - Update contact enrichment if extracted
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Individual analyzer failures don't stop the pipeline
 * - Partial results are saved (graceful degradation)
 * - Errors are logged and included in the result
 * - If ALL analyzers fail, the email is marked with an error
 * - Database errors are logged but don't fail the analysis
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
 * // Process with automatic context loading
 * const result = await processor.process(email, {
 *   userId: 'user-123',
 *   clients: await getActiveClients(userId),
 * });
 *
 * // Process with pre-loaded context (more efficient for batch)
 * const context = await getUserContext(userId);
 * const result = await processor.process(email, context);
 * ```
 *
 * @module services/processors/email-processor
 * @version 2.0.0
 * @since January 2026 - Added DateExtractor, ContactEnricher, user context integration
 */

import { createLogger, logAI } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { CategorizerAnalyzer } from '@/services/analyzers/categorizer';
import { ActionExtractorAnalyzer } from '@/services/analyzers/action-extractor';
import { ClientTaggerAnalyzer } from '@/services/analyzers/client-tagger';
import { EventDetectorAnalyzer } from '@/services/analyzers/event-detector';
import { DateExtractorAnalyzer } from '@/services/analyzers/date-extractor';
import {
  ContactEnricherAnalyzer,
  shouldEnrichContact,
} from '@/services/analyzers/contact-enricher';
import { ANALYZER_VERSION } from '@/services/analyzers/base-analyzer';
import { toEmailInput } from '@/services/analyzers/types';
import { getUserContext } from '@/services/user-context';
import type { Email } from '@/types/database';
import type {
  EmailInput,
  UserContext,
  CategorizationResult,
  ActionExtractionResult,
  ClientTaggingResult,
  EventDetectionResult,
  DateExtractionResult,
  ContactEnrichmentResult,
  AggregatedAnalysis,
  EmailProcessingResult,
  ExtractedDate,
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

  /**
   * Whether to run contact enrichment.
   * Default: true (but still subject to shouldEnrichContact check)
   */
  enableContactEnrichment?: boolean;

  /**
   * Whether to run date extraction.
   * Default: true
   */
  enableDateExtraction?: boolean;
}

/**
 * Default processing options.
 */
const DEFAULT_OPTIONS: ProcessOptions = {
  skipAnalyzed: true,
  saveToDatabase: true,
  createActions: true,
  enableContactEnrichment: true,
  enableDateExtraction: true,
};

/**
 * Contact record from database (minimal fields for enrichment check).
 */
interface ContactForEnrichment {
  id: string;
  email: string;
  email_count: number;
  extraction_confidence: number | null;
  last_extracted_at: string | null;
}

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
 *   console.log(`Category: ${result.analysis.categorization?.category}`);
 *   console.log(`Dates found: ${result.analysis.dateExtraction?.dates.length}`);
 * }
 * ```
 */
export class EmailProcessor {
  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYZER INSTANCES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Categorizer analyzer - determines category, summary, quickAction, labels */
  private categorizer: CategorizerAnalyzer;

  /** Action extractor analyzer - extracts detailed action info */
  private actionExtractor: ActionExtractorAnalyzer;

  /** Client tagger analyzer - links emails to known clients */
  private clientTagger: ClientTaggerAnalyzer;

  /** Event detector analyzer - extracts rich event details (conditional) */
  private eventDetector: EventDetectorAnalyzer;

  /** Date extractor analyzer - extracts timeline dates (NEW Jan 2026) */
  private dateExtractor: DateExtractorAnalyzer;

  /** Contact enricher analyzer - enriches contact info (selective, NEW Jan 2026) */
  private contactEnricher: ContactEnricherAnalyzer;

  /**
   * Creates a new EmailProcessor instance.
   *
   * Initializes all analyzers. Each analyzer checks its own
   * enabled status from config when running.
   *
   * ANALYZER EXECUTION FLOW:
   * 1. Categorizer, ActionExtractor, ClientTagger, DateExtractor run in PARALLEL
   * 2. EventDetector runs AFTER categorizer IF category === 'event'
   * 3. ContactEnricher runs AFTER all if contact needs enrichment
   */
  constructor() {
    this.categorizer = new CategorizerAnalyzer();
    this.actionExtractor = new ActionExtractorAnalyzer();
    this.clientTagger = new ClientTaggerAnalyzer();
    this.eventDetector = new EventDetectorAnalyzer();
    this.dateExtractor = new DateExtractorAnalyzer();
    this.contactEnricher = new ContactEnricherAnalyzer();

    logger.debug('EmailProcessor initialized', {
      categorizerEnabled: this.categorizer.isEnabled(),
      actionExtractorEnabled: this.actionExtractor.isEnabled(),
      clientTaggerEnabled: this.clientTagger.isEnabled(),
      eventDetectorEnabled: this.eventDetector.isEnabled(),
      dateExtractorEnabled: this.dateExtractor.isEnabled(),
      contactEnricherEnabled: this.contactEnricher.isEnabled(),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Processes a single email through all analyzers.
   *
   * This is the main entry point for email analysis.
   * It orchestrates:
   * 1. User context loading (if not provided)
   * 2. Contact upsert for sender
   * 3. Core analyzers in parallel
   * 4. Conditional analyzers based on results
   * 5. Database persistence
   *
   * @param email - Email to process (full Email type or EmailInput)
   * @param context - User context with clients for client matching
   * @param options - Processing options
   * @returns Processing result with aggregated analysis
   *
   * @example
   * ```typescript
   * // Process with automatic context loading
   * const result = await processor.process(email, { userId: user.id });
   *
   * // Process with pre-loaded context (more efficient for batch)
   * const context = await getUserContext(userId);
   * context.clients = await getActiveClients(userId);
   * const result = await processor.process(email, context);
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
      sender: emailInput.senderEmail,
      hasClients: (context.clients?.length ?? 0) > 0,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Early exit: Check if already analyzed
    // ─────────────────────────────────────────────────────────────────────────
    if (opts.skipAnalyzed && 'analyzed_at' in email && email.analyzed_at) {
      logger.info('Skipping already-analyzed email', { emailId: emailInput.id });
      return this.createSkippedResult(emailInput.id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 0: Load user context if minimal
    // ─────────────────────────────────────────────────────────────────────────
    let enrichedContext = context;

    // If context only has userId, load full context from service
    if (!context.onboardingCompleted && !context.role && !context.vipEmails) {
      logger.debug('Loading full user context', {
        userId: context.userId.substring(0, 8),
      });
      enrichedContext = await getUserContext(context.userId);
      // Preserve clients from original context
      enrichedContext.clients = context.clients;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 0b: Upsert contact for sender
    // ─────────────────────────────────────────────────────────────────────────
    let contact: ContactForEnrichment | null = null;
    if (opts.saveToDatabase) {
      contact = await this.upsertContact(
        context.userId,
        emailInput.senderEmail,
        emailInput.senderName,
        emailInput.date
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Run core analyzers in parallel
    // ═══════════════════════════════════════════════════════════════════════════
    const [categorizationResult, actionResult, clientResult, dateResult] =
      await this.runCoreAnalyzers(emailInput, enrichedContext, opts);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Run conditional analyzers based on Phase 1 results
    // ═══════════════════════════════════════════════════════════════════════════
    let eventResult: EventDetectionResult | undefined;
    let contactEnrichmentResult: ContactEnrichmentResult | undefined;

    // EventDetector: Only run if email has the 'has_event' label
    // REFACTORED (Jan 2026): Now uses label instead of category since
    // events can appear in any life-bucket category (local, family_kids_school, etc.)
    const hasEventLabel = categorizationResult.success &&
      categorizationResult.data.labels?.includes('has_event');

    if (hasEventLabel && this.eventDetector.isEnabled()) {
      logger.debug('Running EventDetector (has_event label detected)', {
        emailId: emailInput.id,
        category: categorizationResult.data.category,
      });
      eventResult = await this.runEventDetector(emailInput, enrichedContext);
    }

    // ContactEnricher: Only run if contact needs enrichment
    if (
      opts.enableContactEnrichment &&
      contact &&
      shouldEnrichContact(contact) &&
      this.contactEnricher.isEnabled()
    ) {
      logger.debug('Running ContactEnricher (contact needs enrichment)', {
        emailId: emailInput.id,
        contactEmail: contact.email,
        emailCount: contact.email_count,
      });
      contactEnrichmentResult = await this.runContactEnricher(
        emailInput,
        enrichedContext
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: Aggregate results and persist
    // ═══════════════════════════════════════════════════════════════════════════
    const aggregatedAnalysis = this.aggregateResults(
      categorizationResult,
      actionResult,
      clientResult,
      dateResult,
      eventResult,
      contactEnrichmentResult
    );

    // Collect errors from all analyzers
    const errors = this.collectErrors(
      categorizationResult,
      actionResult,
      clientResult,
      dateResult,
      eventResult,
      contactEnrichmentResult
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
        dateExtraction: dateResult,
        eventDetection: eventResult,
        contactEnrichment: contactEnrichmentResult,
      },
      errors,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Save to database if enabled
    // ─────────────────────────────────────────────────────────────────────────
    if (opts.saveToDatabase && success) {
      try {
        // Save analysis to email_analyses table
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

        // Update email with analysis fields (category, summary, quick_action, labels, topics)
        if (categorizationResult.success) {
          await this.updateEmailAnalysisFields(
            emailInput.id,
            categorizationResult.data
          );
        }

        // Link email to client if matched
        if (clientResult.data.clientMatch && clientResult.data.clientId) {
          await this.linkEmailToClient(
            emailInput.id,
            clientResult.data.clientId
          );
        }

        // Save extracted dates
        if (
          dateResult &&
          dateResult.success &&
          dateResult.data.hasDates &&
          dateResult.data.dates.length > 0
        ) {
          await this.saveExtractedDates(
            context.userId,
            emailInput.id,
            contact?.id ?? null,
            dateResult.data.dates
          );
        }

        // Update contact enrichment
        if (
          contactEnrichmentResult &&
          contactEnrichmentResult.success &&
          contactEnrichmentResult.data.hasEnrichment &&
          contact
        ) {
          await this.updateContactEnrichment(
            contact.id,
            contactEnrichmentResult.data
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
    } else if (opts.saveToDatabase && !success) {
      // ─────────────────────────────────────────────────────────────────────────
      // Mark email as failed (per DECISIONS.md: "Do NOT retry on next sync")
      // ─────────────────────────────────────────────────────────────────────────
      try {
        const supabase = await createServerClient();
        const errorSummary = errors
          .map((e) => `${e.analyzer}: ${e.error}`)
          .join('; ')
          .substring(0, 500); // Truncate to fit in column

        const { error: updateError } = await supabase
          .from('emails')
          .update({
            analysis_error: errorSummary || 'All analyzers failed',
          })
          .eq('id', emailInput.id);

        if (updateError) {
          logger.warn('Failed to mark email as analysis_error', {
            emailId: emailInput.id,
            error: updateError.message,
          });
        } else {
          logger.info('Marked email as analysis failed (will not retry)', {
            emailId: emailInput.id,
            errorSummary,
          });
        }
      } catch (error) {
        logger.warn('Failed to mark email as analysis_error', {
          emailId: emailInput.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Log completion
    // ─────────────────────────────────────────────────────────────────────────
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
      labels: aggregatedAnalysis.categorization?.labels?.slice(0, 3),
      hasAction: aggregatedAnalysis.actionExtraction?.hasAction,
      clientMatch: aggregatedAnalysis.clientTagging?.clientMatch,
      datesFound: aggregatedAnalysis.dateExtraction?.dates?.length ?? 0,
      hasEvent: aggregatedAnalysis.eventDetection?.hasEvent ?? false,
      contactEnriched: contactEnrichmentResult?.data?.hasEnrichment ?? false,
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
   * Core analyzers run on EVERY email:
   * - Categorizer: Determines category, summary, quickAction, labels
   * - ActionExtractor: Extracts detailed action info
   * - ClientTagger: Links to known clients
   * - DateExtractor: Extracts timeline dates (NEW Jan 2026)
   *
   * Uses Promise.allSettled to ensure all analyzers run even if some fail.
   *
   * @param email - Email to analyze
   * @param context - User context
   * @param opts - Processing options
   * @returns Tuple of [categorization, action, client, date] results
   */
  private async runCoreAnalyzers(
    email: EmailInput,
    context: UserContext,
    opts: ProcessOptions
  ): Promise<
    [
      CategorizationResult,
      ActionExtractionResult,
      ClientTaggingResult,
      DateExtractionResult
    ]
  > {
    logger.debug('Running core analyzers in parallel', {
      emailId: email.id,
      analyzers: [
        'Categorizer',
        'ActionExtractor',
        'ClientTagger',
        opts.enableDateExtraction ? 'DateExtractor' : '(DateExtractor disabled)',
      ],
    });

    // Build array of analyzer promises
    const analyzerPromises: Promise<unknown>[] = [
      this.categorizer.analyze(email, context),
      this.actionExtractor.analyze(email, context),
      this.clientTagger.analyze(email, context),
    ];

    // Add DateExtractor if enabled
    if (opts.enableDateExtraction && this.dateExtractor.isEnabled()) {
      analyzerPromises.push(this.dateExtractor.analyze(email, context));
    } else {
      // Push a placeholder promise that resolves to a "skipped" result
      analyzerPromises.push(
        Promise.resolve({
          success: true,
          data: { hasDates: false, dates: [], confidence: 0 },
          confidence: 0,
          tokensUsed: 0,
          processingTimeMs: 0,
        } as DateExtractionResult)
      );
    }

    // Run all core analyzers in parallel
    const results = await Promise.allSettled(analyzerPromises);

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
    const dateResult = this.extractResult<DateExtractionResult>(
      results[3],
      'DateExtractor'
    );

    return [categorizationResult, actionResult, clientResult, dateResult];
  }

  /**
   * Runs the EventDetector analyzer.
   *
   * This is a CONDITIONAL analyzer - only runs when:
   * 1. Categorizer returns category === 'event'
   * 2. EventDetector is enabled in config
   *
   * Running conditionally saves tokens since events are ~5-10% of emails.
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
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
   * Runs the ContactEnricher analyzer.
   *
   * This is a SELECTIVE analyzer - only runs when:
   * 1. shouldEnrichContact() returns true
   * 2. ContactEnricher is enabled in config
   *
   * Running selectively saves tokens (~95% of contacts don't need enrichment).
   */
  private async runContactEnricher(
    email: EmailInput,
    context: UserContext
  ): Promise<ContactEnrichmentResult> {
    logger.debug('Running ContactEnricher (selective analyzer)', {
      emailId: email.id,
      senderEmail: email.senderEmail,
    });

    try {
      return await this.contactEnricher.analyze(email, context);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('ContactEnricher threw exception', {
        emailId: email.id,
        error: errorMessage,
      });

      return {
        success: false,
        data: {} as ContactEnrichmentResult['data'],
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
   */
  private aggregateResults(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult,
    date: DateExtractionResult,
    event?: EventDetectionResult,
    contactEnrichment?: ContactEnrichmentResult
  ): AggregatedAnalysis {
    // Calculate totals
    const totalTokensUsed =
      categorization.tokensUsed +
      action.tokensUsed +
      client.tokensUsed +
      date.tokensUsed +
      (event?.tokensUsed ?? 0) +
      (contactEnrichment?.tokensUsed ?? 0);

    const totalProcessingTimeMs =
      categorization.processingTimeMs +
      action.processingTimeMs +
      client.processingTimeMs +
      date.processingTimeMs +
      (event?.processingTimeMs ?? 0) +
      (contactEnrichment?.processingTimeMs ?? 0);

    return {
      // Include data from successful analyzers only
      categorization: categorization.success ? categorization.data : undefined,
      actionExtraction: action.success ? action.data : undefined,
      clientTagging: client.success ? client.data : undefined,
      dateExtraction: date.success ? date.data : undefined,

      // Conditional analyzers
      eventDetection: event?.success ? event.data : undefined,
      contactEnrichment: contactEnrichment?.success
        ? contactEnrichment.data
        : undefined,

      // Totals
      totalTokensUsed,
      totalProcessingTimeMs,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  /**
   * Collects errors from all analyzers.
   */
  private collectErrors(
    categorization: CategorizationResult,
    action: ActionExtractionResult,
    client: ClientTaggingResult,
    date: DateExtractionResult,
    event?: EventDetectionResult,
    contactEnrichment?: ContactEnrichmentResult
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
    if (!date.success && date.error) {
      errors.push({ analyzer: 'DateExtractor', error: date.error });
    }
    if (event && !event.success && event.error) {
      errors.push({ analyzer: 'EventDetector', error: event.error });
    }
    if (contactEnrichment && !contactEnrichment.success && contactEnrichment.error) {
      errors.push({ analyzer: 'ContactEnricher', error: contactEnrichment.error });
    }

    return errors;
  }

  /**
   * Creates a result for skipped (already analyzed) emails.
   */
  private createSkippedResult(emailId: string): EmailProcessingResult {
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
   * Upserts a contact for the email sender.
   *
   * This ensures every sender has a contact record for tracking
   * communication patterns and potential enrichment.
   *
   * @param userId - User ID
   * @param email - Sender email address
   * @param name - Sender name (may be null)
   * @param emailDate - Email date for first/last seen tracking
   * @returns Contact record or null if upsert failed
   */
  private async upsertContact(
    userId: string,
    email: string,
    name: string | null,
    emailDate: string
  ): Promise<ContactForEnrichment | null> {
    // ─────────────────────────────────────────────────────────────────────────────
    // Input validation
    // ─────────────────────────────────────────────────────────────────────────────
    if (!email || !email.includes('@')) {
      logger.debug('Skipping contact upsert: invalid email', {
        email: email?.substring(0, 30),
      });
      return null;
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const supabase = await createServerClient();

      // ─────────────────────────────────────────────────────────────────────────────
      // Call the database function for atomic upsert
      // This function (upsert_contact_from_email) is defined in migration 012
      // and uses SECURITY DEFINER to bypass RLS
      // ─────────────────────────────────────────────────────────────────────────────
      logger.debug('Upserting contact', {
        userId: userId.substring(0, 8) + '...',
        email: normalizedEmail.substring(0, 30),
        hasName: !!name,
      });

      const { data, error } = await supabase.rpc('upsert_contact_from_email', {
        p_user_id: userId,
        p_email: normalizedEmail,
        p_name: name ?? null, // Ensure null not undefined
        p_email_date: emailDate,
        p_is_sent: false, // This is a received email
      });

      if (error) {
        // Enhanced error logging for debugging
        logger.warn('Failed to upsert contact via RPC', {
          email: normalizedEmail.substring(0, 30),
          errorCode: error.code,
          errorMessage: error.message,
          errorHint: error.hint,
          errorDetails: error.details,
          // Common error codes:
          // PGRST202: Function not found (migration not run)
          // 23503: Foreign key violation (user doesn't exist)
          // 42501: RLS policy violation (shouldn't happen with SECURITY DEFINER)
        });

        // If the function doesn't exist, log a critical error
        if (error.code === 'PGRST202' || error.message?.includes('function')) {
          logger.error('CRITICAL: upsert_contact_from_email function not found. Run migration 012_contacts.sql', {
            errorCode: error.code,
          });
        }

        return null;
      }

      // data should be the contact UUID returned by the function
      if (!data) {
        logger.warn('Contact upsert returned null data', {
          email: normalizedEmail.substring(0, 30),
        });
        return null;
      }

      // ─────────────────────────────────────────────────────────────────────────────
      // Fetch the contact for enrichment check
      // ─────────────────────────────────────────────────────────────────────────────
      const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('id, email, email_count, extraction_confidence, last_extracted_at')
        .eq('id', data)
        .single();

      if (fetchError) {
        logger.warn('Failed to fetch upserted contact', {
          contactId: data,
          errorCode: fetchError.code,
          errorMessage: fetchError.message,
        });
        return null;
      }

      logger.debug('Contact upserted successfully', {
        contactId: contact.id,
        email: contact.email.substring(0, 30),
        emailCount: contact.email_count,
      });

      return contact as ContactForEnrichment;

    } catch (error) {
      // Catch any unexpected errors (network issues, etc.)
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;

      logger.error('Unexpected error upserting contact', {
        email: normalizedEmail.substring(0, 30),
        error: message,
        stack: stack?.substring(0, 200),
      });

      return null;
    }
  }

  /**
   * Saves analysis results to the email_analyses table.
   */
  private async saveAnalysis(
    emailId: string,
    userId: string,
    analysis: AggregatedAnalysis
  ): Promise<void> {
    const supabase = await createServerClient();

    // Build the analysis record matching the database schema
    const record = {
      email_id: emailId,
      user_id: userId,

      // Categorization (ENHANCED: now includes summary, quick_action, labels)
      categorization: analysis.categorization
        ? {
            category: analysis.categorization.category,
            confidence: analysis.categorization.confidence,
            reasoning: analysis.categorization.reasoning,
            topics: analysis.categorization.topics,
            summary: analysis.categorization.summary,
            quick_action: analysis.categorization.quickAction,
            labels: analysis.categorization.labels,
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

      // Event detection
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

      // Metadata
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
   * Saves extracted dates to the extracted_dates table.
   *
   * @param userId - User ID
   * @param emailId - Email ID
   * @param contactId - Contact ID (may be null)
   * @param dates - Array of extracted dates
   */
  private async saveExtractedDates(
    userId: string,
    emailId: string,
    contactId: string | null,
    dates: ExtractedDate[]
  ): Promise<void> {
    if (dates.length === 0) return;

    try {
      const supabase = await createServerClient();

      // Map extracted dates to database format
      const records = dates.map((d) => ({
        user_id: userId,
        email_id: emailId,
        contact_id: contactId,
        date_type: d.dateType,
        date: d.date,
        time: d.time ?? null,
        end_date: d.endDate ?? null,
        end_time: d.endTime ?? null,
        title: d.title,
        description: d.description ?? null,
        source_snippet: d.sourceSnippet ?? null,
        related_entity: d.relatedEntity ?? null,
        is_recurring: d.isRecurring,
        recurrence_pattern: d.recurrencePattern ?? null,
        confidence: d.confidence,
        priority_score: this.calculateDatePriorityScore(d),
      }));

      // Use upsert with the deduplication index to prevent duplicates
      const { error } = await supabase.from('extracted_dates').upsert(records, {
        onConflict: 'email_id,date_type,date,title',
        ignoreDuplicates: true,
      });

      if (error) {
        logger.warn('Failed to save extracted dates', {
          emailId,
          datesCount: dates.length,
          error: error.message,
        });
      } else {
        logger.debug('Extracted dates saved', {
          emailId,
          datesCount: dates.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error saving extracted dates', {
        emailId,
        error: message,
      });
    }
  }

  /**
   * Calculates priority score for an extracted date.
   *
   * Higher scores for:
   * - Deadlines and payment dues
   * - Dates closer to today
   * - Higher confidence extractions
   */
  private calculateDatePriorityScore(date: ExtractedDate): number {
    let score = 5; // Base score

    // Type-based scoring
    const typeScores: Record<string, number> = {
      deadline: 8,
      payment_due: 8,
      expiration: 7,
      appointment: 6,
      event: 5,
      birthday: 5,
      follow_up: 4,
      reminder: 4,
      anniversary: 4,
      recurring: 3,
      other: 3,
    };
    score = typeScores[date.dateType] ?? 5;

    // Confidence adjustment
    score = Math.round(score * date.confidence);

    // Clamp to 1-10 range
    return Math.max(1, Math.min(10, score));
  }

  /**
   * Updates contact enrichment data.
   *
   * @param contactId - Contact ID
   * @param enrichment - Enrichment data from ContactEnricher
   */
  private async updateContactEnrichment(
    contactId: string,
    enrichment: ContactEnrichmentResult['data']
  ): Promise<void> {
    try {
      const supabase = await createServerClient();

      const updates: Record<string, unknown> = {
        extraction_confidence: enrichment.confidence,
        last_extracted_at: new Date().toISOString(),
        extraction_source: enrichment.source,
        needs_enrichment: false, // Mark as enriched
        updated_at: new Date().toISOString(),
      };

      // Only update fields that have values
      if (enrichment.company) updates.company = enrichment.company;
      if (enrichment.jobTitle) updates.job_title = enrichment.jobTitle;
      if (enrichment.phone) updates.phone = enrichment.phone;
      if (enrichment.linkedinUrl) updates.linkedin_url = enrichment.linkedinUrl;
      if (enrichment.relationshipType) {
        updates.relationship_type = enrichment.relationshipType;
      }
      if (enrichment.birthday) {
        // Parse MM-DD format to a date (using 1900 as placeholder year)
        const [month, day] = enrichment.birthday.split('-');
        updates.birthday = `1900-${month}-${day}`;
        updates.birthday_year_known = false;
      }

      const { error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', contactId);

      if (error) {
        logger.warn('Failed to update contact enrichment', {
          contactId,
          error: error.message,
        });
      } else {
        logger.debug('Contact enrichment saved', {
          contactId,
          fieldsUpdated: Object.keys(updates).length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error updating contact enrichment', {
        contactId,
        error: message,
      });
    }
  }

  /**
   * Creates an action record from extracted action data.
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
      action_type: action.actionType,
      title: action.actionTitle ?? 'Action Required',
      description: action.actionDescription ?? null,
      urgency_score: action.urgencyScore,
      deadline: action.deadline ?? null,
      estimated_minutes: action.estimatedMinutes ?? null,
      status: 'pending' as const,
    };

    const { error } = await supabase.from('actions').insert(record);

    if (error) {
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
   * Updates the email's analysis fields for fast list display.
   *
   * This denormalizes key analysis results onto the emails table so that
   * list views can display summary, quick_action, etc. without joining
   * to email_analyses.
   *
   * Fields updated:
   * - category: Primary action-focused category
   * - summary: One-sentence assistant-style summary
   * - quick_action: Suggested triage action
   * - labels: Secondary classification labels
   * - topics: AI-extracted topic keywords
   */
  private async updateEmailAnalysisFields(
    emailId: string,
    categorization: CategorizationResult['data']
  ): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('emails')
      .update({
        category: categorization.category,
        summary: categorization.summary || null,
        quick_action: categorization.quickAction || null,
        labels: categorization.labels || null,
        topics: categorization.topics || null,
      })
      .eq('id', emailId);

    if (error) {
      logger.warn('Failed to update email analysis fields', {
        emailId,
        category: categorization.category,
        error: error.message,
      });
    }
  }

  /**
   * Links an email to a client.
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
