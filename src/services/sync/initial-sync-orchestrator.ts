/**
 * Initial Sync Orchestrator
 *
 * The main coordinator for the initial email batch analysis.
 * Orchestrates the entire flow:
 * 1. Fetch emails from Gmail
 * 2. Pre-filter (skip spam, auto-categorize obvious ones)
 * 3. Run AI analysis on remaining emails
 * 4. Build discovery response with summaries
 * 5. Learn sender patterns for future optimization
 *
 * This service is called when a user completes onboarding and clicks "Finish Setup".
 *
 * @module services/sync/initial-sync-orchestrator
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import { createLogger, logSync } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import { INITIAL_SYNC_CONFIG, SYNC_STEP_MESSAGES } from '@/config/initial-sync';
import { EmailPreFilterService } from './email-prefilter';
import { SenderPatternService, type LearningObservation } from './sender-patterns';
import { DiscoveryBuilderService, type AnalyzedEmail } from './discovery-builder';
import { EmailProcessor } from '@/services/processors/email-processor';
import { BatchProcessor } from '@/services/processors/batch-processor';
import type {
  InitialSyncResponse,
  InitialSyncConfig,
  SyncStats,
  AnalysisFailure,
  EmailForAnalysis,
  SyncStatus,
  SyncDiscoveries,
  StoredSyncProgress,
  EmailCategory,
  SenderPattern,
} from '@/types/discovery';
import type { Email, Client } from '@/types/database';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('InitialSyncOrchestrator');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the initial sync orchestrator.
 */
export interface InitialSyncOrchestratorConfig extends Partial<InitialSyncConfig> {
  /** User ID performing the sync */
  userId: string;
  /** Gmail account ID to sync */
  gmailAccountId: string;
}

/**
 * Progress callback function type.
 */
type ProgressCallback = (
  progress: number,
  step: string,
  discoveries: SyncDiscoveries
) => Promise<void>;

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Orchestrates the entire initial sync process.
 *
 * @example
 * ```typescript
 * const orchestrator = new InitialSyncOrchestrator({
 *   userId: 'user-123',
 *   gmailAccountId: 'account-456',
 * });
 *
 * const result = await orchestrator.execute();
 *
 * if (result.success) {
 *   // Redirect to /discover with result
 * }
 * ```
 */
export class InitialSyncOrchestrator {
  private config: InitialSyncConfig;
  private userId: string;
  private gmailAccountId: string;

  // Services
  private preFilter: EmailPreFilterService;
  private patternService: SenderPatternService;
  private discoveryBuilder: DiscoveryBuilderService;
  private emailProcessor: EmailProcessor;
  private batchProcessor: BatchProcessor;

  // Progress tracking
  private currentProgress = 0;
  private currentStep = SYNC_STEP_MESSAGES.starting;
  private discoveries: SyncDiscoveries = {
    actionItems: 0,
    events: 0,
    clientsDetected: [],
  };

  // Accumulator for analyzed emails
  private analyzedEmails: AnalyzedEmail[] = [];
  private failures: AnalysisFailure[] = [];
  private learningObservations: LearningObservation[] = [];

  // Stats tracking
  private stats: SyncStats = {
    totalFetched: 0,
    preFiltered: 0,
    analyzed: 0,
    failed: 0,
    totalTokensUsed: 0,
    estimatedCost: 0,
    processingTimeMs: 0,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new InitialSyncOrchestrator.
   *
   * @param orchConfig - Configuration with userId and gmailAccountId
   */
  constructor(orchConfig: InitialSyncOrchestratorConfig) {
    this.userId = orchConfig.userId;
    this.gmailAccountId = orchConfig.gmailAccountId;

    // Merge config with defaults
    this.config = {
      ...INITIAL_SYNC_CONFIG,
      ...orchConfig,
    };

    // Initialize services
    this.preFilter = new EmailPreFilterService();
    this.patternService = new SenderPatternService(this.userId);
    this.discoveryBuilder = new DiscoveryBuilderService();
    this.emailProcessor = new EmailProcessor();
    this.batchProcessor = new BatchProcessor();

    logger.debug('InitialSyncOrchestrator initialized', {
      userId: this.userId,
      gmailAccountId: this.gmailAccountId,
      maxEmails: this.config.maxEmails,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Execute the initial sync process.
   *
   * This is the main entry point. It:
   * 1. Fetches emails from the database (assumes they're already synced from Gmail)
   * 2. Pre-filters emails
   * 3. Runs AI analysis
   * 4. Builds the discovery response
   *
   * @param onProgress - Optional callback for progress updates
   * @returns The complete InitialSyncResponse
   */
  async execute(onProgress?: ProgressCallback): Promise<InitialSyncResponse> {
    const startTime = Date.now();

    logger.info('Starting initial sync', {
      userId: this.userId,
      gmailAccountId: this.gmailAccountId,
      maxEmails: this.config.maxEmails,
    });

    logSync.syncStart({
      accountId: this.gmailAccountId,
      syncType: 'initial',
    });

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Step 1: Update progress - Starting
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(5, SYNC_STEP_MESSAGES.connecting, onProgress);

      // ─────────────────────────────────────────────────────────────────────────
      // Step 2: Get user's clients for context
      // ─────────────────────────────────────────────────────────────────────────
      const clients = await this.fetchUserClients();

      // ─────────────────────────────────────────────────────────────────────────
      // Step 3: Load existing sender patterns for pre-filtering
      // ─────────────────────────────────────────────────────────────────────────
      const existingPatterns = await this.patternService.getPatterns();
      this.preFilter = new EmailPreFilterService(existingPatterns);

      // ─────────────────────────────────────────────────────────────────────────
      // Step 4: Fetch emails from database
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(10, SYNC_STEP_MESSAGES.fetching, onProgress);
      const emails = await this.fetchEmailsFromDatabase();
      this.stats.totalFetched = emails.length;

      if (emails.length === 0) {
        logger.warn('No emails found for initial sync', {
          userId: this.userId,
          gmailAccountId: this.gmailAccountId,
        });
        // Return empty but successful response
        return this.buildEmptyResponse(startTime);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 5: Pre-filter emails
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(15, SYNC_STEP_MESSAGES.preFiltering, onProgress);
      const { toAnalyze, autoCategorized, stats: preFilterStats } =
        this.preFilter.filterBatch(emails);

      this.stats.preFiltered = preFilterStats.skipped + preFilterStats.autoCategorized;

      // Process auto-categorized emails (no AI needed)
      for (const { email, result } of autoCategorized) {
        if (result.autoCategory) {
          this.addAnalyzedEmail(email, {
            category: result.autoCategory,
            confidence: result.autoConfidence || 0.9,
            tokensUsed: 0, // No AI used
          });

          // Save auto-categorization to database
          await this.saveAutoCategory(email.id, result.autoCategory);
        }
      }

      logger.info('Pre-filtering complete', {
        total: emails.length,
        toAnalyze: toAnalyze.length,
        autoCategorized: autoCategorized.length,
        skipped: preFilterStats.skipped,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Step 6: Run AI analysis on remaining emails
      // ─────────────────────────────────────────────────────────────────────────
      if (toAnalyze.length > 0) {
        await this.analyzeEmails(toAnalyze, clients, onProgress);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 7: Learn sender patterns from analysis
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(90, SYNC_STEP_MESSAGES.detectingClients, onProgress);

      if (this.learningObservations.length > 0) {
        const newPatterns = await this.patternService.learnFromObservations(
          this.learningObservations
        );
        logger.info('Learned sender patterns', { newPatterns });
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Step 8: Build discovery response
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(95, SYNC_STEP_MESSAGES.buildingSummary, onProgress);

      // Finalize stats
      this.stats.processingTimeMs = Date.now() - startTime;
      this.stats.analyzed = this.analyzedEmails.length;
      this.stats.failed = this.failures.length;

      // Estimate cost (GPT-4.1-mini pricing)
      const costPerInputToken = 0.00000015;
      const costPerOutputToken = 0.0000006;
      this.stats.estimatedCost =
        this.stats.totalTokensUsed * (costPerInputToken + costPerOutputToken);

      const knownClients = clients.map((c) => ({ id: c.id, name: c.name }));

      const response = this.discoveryBuilder.build({
        analyzedEmails: this.analyzedEmails,
        failures: this.failures,
        stats: this.stats,
        knownClients,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Step 9: Mark onboarding complete and save final progress
      // ─────────────────────────────────────────────────────────────────────────
      await this.updateProgress(100, SYNC_STEP_MESSAGES.complete, onProgress);
      await this.markOnboardingComplete(response);

      logSync.syncComplete({
        accountId: this.gmailAccountId,
        emailsProcessed: this.stats.analyzed,
        durationMs: this.stats.processingTimeMs,
      });

      logger.info('Initial sync complete', {
        userId: this.userId,
        stats: this.stats,
        categoryCount: response.categories.length,
        clientInsightCount: response.clientInsights.length,
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Initial sync failed', {
        userId: this.userId,
        error: errorMessage,
      });

      logSync.syncError({
        accountId: this.gmailAccountId,
        error: errorMessage,
      });

      // Save failed status
      await this.saveSyncProgress({
        status: 'failed',
        progress: this.currentProgress,
        currentStep: SYNC_STEP_MESSAGES.failed,
        discoveries: this.discoveries,
        startedAt: new Date(Date.now() - (Date.now() - this.stats.processingTimeMs)).toISOString(),
        updatedAt: new Date().toISOString(),
        error: errorMessage,
      });

      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods - Data Fetching
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fetch user's clients for context in analysis.
   */
  private async fetchUserClients(): Promise<Client[]> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'active');

    if (error) {
      logger.warn('Failed to fetch clients', { error: error.message });
      return [];
    }

    return (data || []) as Client[];
  }

  /**
   * Fetch emails from database for analysis.
   * Assumes emails are already synced from Gmail.
   *
   * UPDATED (Feb 2026): Added is_archived filter to exclude archived emails
   * from discovery counts. This ensures the counts shown on category cards
   * match the emails shown in the modal/detail views (which also filter
   * by is_archived = false).
   */
  private async fetchEmailsFromDatabase(): Promise<EmailForAnalysis[]> {
    const supabase = await createServerClient();

    // Exclude emails that previously failed analysis (per DECISIONS.md: "Do NOT retry on next sync")
    // Exclude archived emails so discovery counts match modal/detail views
    const { data, error } = await supabase
      .from('emails')
      .select('id, gmail_id, subject, sender_email, sender_name, snippet, body_text, gmail_labels, is_read, date')
      .eq('user_id', this.userId)
      .eq('gmail_account_id', this.gmailAccountId)
      .eq('is_archived', false) // Exclude archived - keeps counts consistent with UI views
      .is('analyzed_at', null) // Only unanalyzed emails
      .is('analysis_error', null) // Exclude emails that previously failed analysis
      .order('date', { ascending: false })
      .limit(this.config.maxEmails);

    if (error) {
      logger.error('Failed to fetch emails', { error: error.message });
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }

    // Transform to EmailForAnalysis type
    return (data || []).map((email) => ({
      id: email.id,
      gmailId: email.gmail_id,
      subject: email.subject || '',
      senderEmail: email.sender_email,
      senderName: email.sender_name || undefined,
      snippet: email.snippet || '',
      bodyText: email.body_text || undefined,
      gmailLabels: email.gmail_labels || [],
      isRead: email.is_read || false,
      date: email.date,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods - Analysis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Run AI analysis on emails in batches.
   */
  private async analyzeEmails(
    emails: EmailForAnalysis[],
    clients: Client[],
    onProgress?: ProgressCallback
  ): Promise<void> {
    const totalToAnalyze = emails.length;
    const batchSize = this.config.batchSize;
    let processed = 0;

    logger.info('Starting AI analysis', {
      emailCount: totalToAnalyze,
      batchSize,
    });

    // Process in batches
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      // Update progress
      const baseProgress = 20; // Pre-filter done
      const analysisProgress = 70; // Analysis range (20-90)
      const progress =
        baseProgress + Math.round((processed / totalToAnalyze) * analysisProgress);

      await this.updateProgress(
        progress,
        SYNC_STEP_MESSAGES.analyzing(processed, totalToAnalyze),
        onProgress
      );

      // Process batch
      await this.processBatch(batch, clients);

      processed += batch.length;
    }

    logger.info('AI analysis complete', {
      analyzed: this.stats.analyzed,
      failed: this.failures.length,
      tokensUsed: this.stats.totalTokensUsed,
    });
  }

  /**
   * Process a batch of emails through AI analyzers.
   */
  private async processBatch(
    emails: EmailForAnalysis[],
    clients: Client[]
  ): Promise<void> {
    const userContext = {
      userId: this.userId,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company || undefined,
        emailDomains: c.email_domains || [],
        keywords: c.keywords || [],
      })),
    };

    // Convert to Email-like objects for the processor
    const emailInputs = emails.map((e) => ({
      id: e.id,
      gmail_id: e.gmailId,
      subject: e.subject,
      sender_email: e.senderEmail,
      sender_name: e.senderName,
      snippet: e.snippet,
      body_text: e.bodyText,
      gmail_labels: e.gmailLabels,
      is_read: e.isRead,
      date: e.date,
    })) as Email[];

    // Process emails in parallel using batch processor
    const results = await Promise.allSettled(
      emailInputs.map((email) =>
        this.emailProcessor.process(email, userContext, {
          skipAnalyzed: false, // We already filtered
          saveToDatabase: true,
          createActions: true,
        })
      )
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const originalEmail = emails[i];

      if (result.status === 'fulfilled' && result.value.success) {
        const analysis = result.value.analysis;
        const categorization = analysis.categorization;
        const actionExtraction = analysis.actionExtraction;
        const clientTagging = analysis.clientTagging;

        // Add to analyzed emails
        // REFACTORED (Jan 2026): 'noise' fallback → 'newsletters_general'
        this.addAnalyzedEmail(originalEmail, {
          category: (categorization?.category as EmailCategory) || 'newsletters_general',
          confidence: categorization?.confidence || 0.5,
          hasAction: actionExtraction?.hasAction,
          actionUrgency: actionExtraction?.urgencyScore,
          clientId: clientTagging?.clientId,
          clientName: clientTagging?.clientName,
          isNewClientSuggestion: clientTagging?.newClientSuggestion ? true : false,
          relationshipSignal: clientTagging?.relationshipSignal,
          tokensUsed: analysis.totalTokensUsed,
        });

        // Update stats
        this.stats.totalTokensUsed += analysis.totalTokensUsed;

        // Add learning observation
        if (categorization?.category) {
          this.learningObservations.push({
            senderEmail: originalEmail.senderEmail,
            category: categorization.category as EmailCategory,
            confidence: categorization.confidence || 0.8,
          });
        }
      } else {
        // Handle failure
        const errorMessage =
          result.status === 'rejected'
            ? result.reason?.message || 'Unknown error'
            : result.value.errors?.[0]?.error || 'Analysis failed';

        this.failures.push({
          emailId: originalEmail.id,
          subject: this.truncateSubject(originalEmail.subject),
          sender: originalEmail.senderName || originalEmail.senderEmail,
          reason: errorMessage,
          canRetry: true,
        });

        logger.warn('Email analysis failed', {
          emailId: originalEmail.id,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * Add an analyzed email to the collection and update discoveries.
   */
  private addAnalyzedEmail(
    email: EmailForAnalysis,
    analysis: {
      category: EmailCategory;
      confidence: number;
      hasAction?: boolean;
      actionUrgency?: number;
      clientId?: string | null;
      clientName?: string;
      isNewClientSuggestion?: boolean;
      relationshipSignal?: 'positive' | 'neutral' | 'negative' | 'unknown';
      eventDetected?: { title: string; date: string };
      tokensUsed: number;
    }
  ): void {
    const analyzedEmail: AnalyzedEmail = {
      ...email,
      category: analysis.category,
      confidence: analysis.confidence,
      hasAction: analysis.hasAction,
      actionUrgency: analysis.actionUrgency,
      clientId: analysis.clientId,
      clientName: analysis.clientName,
      isNewClientSuggestion: analysis.isNewClientSuggestion,
      relationshipSignal: analysis.relationshipSignal,
      eventDetected: analysis.eventDetected,
    };

    this.analyzedEmails.push(analyzedEmail);

    // Update discoveries for real-time progress
    if (analysis.hasAction) {
      this.discoveries.actionItems++;
    }

    // REFACTORED (Jan 2026): Events are no longer a category.
    // Events are detected via the eventDetected field from analysis.
    if (analysis.eventDetected) {
      this.discoveries.events++;
    }

    if (analysis.clientName && !this.discoveries.clientsDetected.includes(analysis.clientName)) {
      this.discoveries.clientsDetected.push(analysis.clientName);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods - Database Operations
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Save auto-categorized email to database.
   */
  private async saveAutoCategory(
    emailId: string,
    category: EmailCategory
  ): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('emails')
      .update({
        category,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', emailId);

    if (error) {
      logger.warn('Failed to save auto-category', {
        emailId,
        category,
        error: error.message,
      });
    }
  }

  /**
   * Mark onboarding as complete and save final sync result.
   */
  private async markOnboardingComplete(result: InitialSyncResponse): Promise<void> {
    const supabase = await createServerClient();

    const progress: StoredSyncProgress = {
      status: 'completed',
      progress: 100,
      currentStep: SYNC_STEP_MESSAGES.complete,
      discoveries: this.discoveries,
      startedAt: new Date(Date.now() - this.stats.processingTimeMs).toISOString(),
      updatedAt: new Date().toISOString(),
      result,
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({
        onboarding_completed: true,
        initial_sync_completed_at: new Date().toISOString(),
        sync_progress: progress,
      })
      .eq('id', this.userId);

    if (error) {
      logger.error('Failed to mark onboarding complete', { error: error.message });
    }
  }

  /**
   * Save sync progress to database for polling.
   */
  private async saveSyncProgress(progress: StoredSyncProgress): Promise<void> {
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('user_profiles')
      .update({ sync_progress: progress })
      .eq('id', this.userId);

    if (error) {
      logger.warn('Failed to save sync progress', { error: error.message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods - Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Update progress and notify callback.
   */
  private async updateProgress(
    progress: number,
    step: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    this.currentProgress = progress;
    this.currentStep = step;

    // Save to database for polling
    await this.saveSyncProgress({
      status: progress < 100 ? 'in_progress' : 'completed',
      progress,
      currentStep: step,
      discoveries: this.discoveries,
      startedAt: new Date(Date.now() - this.stats.processingTimeMs).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Notify callback
    if (onProgress) {
      await onProgress(progress, step, this.discoveries);
    }

    logger.debug('Progress updated', { progress, step });
  }

  /**
   * Build empty response when no emails found.
   */
  private buildEmptyResponse(startTime: number): InitialSyncResponse {
    this.stats.processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      stats: this.stats,
      categories: [],
      clientInsights: [],
      failures: [],
      suggestedActions: [],
    };
  }

  /**
   * Truncate subject for display.
   */
  private truncateSubject(subject: string, maxLength = 60): string {
    if (!subject) return '(No subject)';
    if (subject.length <= maxLength) return subject;
    return subject.slice(0, maxLength - 3) + '...';
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new InitialSyncOrchestrator instance.
 *
 * @param config - Configuration with userId and gmailAccountId
 * @returns New InitialSyncOrchestrator instance
 */
export function createInitialSyncOrchestrator(
  config: InitialSyncOrchestratorConfig
): InitialSyncOrchestrator {
  return new InitialSyncOrchestrator(config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default InitialSyncOrchestrator;
