/**
 * Discovery Builder Service
 *
 * Aggregates email analysis results into the Discovery Dashboard format.
 * This is the main orchestrator that builds:
 * - Category summaries with counts, top senders, and insights
 * - Client insights (detected and suggested)
 * - Failure reports
 * - Suggested actions
 *
 * The output powers the Discovery Dashboard shown after initial sync.
 *
 * @module services/sync/discovery-builder
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import { createLogger } from '@/lib/utils/logger';
import { CATEGORY_INSIGHT_TEMPLATES } from '@/config/initial-sync';
import { ActionSuggesterService } from './action-suggester';
import type {
  EmailCategory,
  CategorySummary,
  SenderInfo,
  ClientInsight,
  AnalysisFailure,
  SuggestedAction,
  InitialSyncResponse,
  SyncStats,
  EmailAnalysisResult,
  EmailForAnalysis,
  RelationshipSignal,
} from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('DiscoveryBuilder');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum items to include in summaries.
 */
const SUMMARY_LIMITS = {
  /** Max top senders per category */
  topSenders: 3,
  /** Max sample subjects per category */
  sampleSubjects: 3,
  /** Max client insights to return */
  clientInsights: 10,
  /** Max failures to return */
  failures: 10,
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Intermediate email data with analysis results.
 */
export interface AnalyzedEmail extends EmailForAnalysis {
  category: EmailCategory;
  confidence: number;
  hasAction?: boolean;
  actionUrgency?: number;
  clientId?: string | null;
  clientName?: string;
  isNewClientSuggestion?: boolean;
  relationshipSignal?: RelationshipSignal;
  eventDetected?: {
    title: string;
    date: string;
  };
}

/**
 * Input for building the discovery response.
 */
export interface DiscoveryBuilderInput {
  /** All analyzed emails with their results */
  analyzedEmails: AnalyzedEmail[];
  /** Emails that failed analysis */
  failures: AnalysisFailure[];
  /** Processing statistics */
  stats: SyncStats;
  /** Known clients from user's roster */
  knownClients: Array<{
    id: string;
    name: string;
  }>;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/**
 * Aggregated data for a single category.
 */
interface CategoryAggregate {
  emails: AnalyzedEmail[];
  senderCounts: Map<string, { name: string; email: string; count: number }>;
  urgentCount: number;
  upcomingEvent?: { title: string; date: string };
}

/**
 * Aggregated data for a client.
 */
interface ClientAggregate {
  clientId: string | null;
  clientName: string;
  isNewSuggestion: boolean;
  emails: AnalyzedEmail[];
  relationshipSignals: RelationshipSignal[];
}

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Service for building the Discovery Dashboard response.
 *
 * @example
 * ```typescript
 * const builder = new DiscoveryBuilderService();
 *
 * const response = builder.build({
 *   analyzedEmails: emails,
 *   failures: [],
 *   stats: syncStats,
 *   knownClients: userClients,
 * });
 *
 * // Returns full InitialSyncResponse ready for API
 * ```
 */
export class DiscoveryBuilderService {
  private actionSuggester: ActionSuggesterService;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  constructor() {
    this.actionSuggester = new ActionSuggesterService();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build the complete InitialSyncResponse from analysis results.
   *
   * @param input - Analyzed emails, failures, and stats
   * @returns Complete response ready for the API
   */
  build(input: DiscoveryBuilderInput): InitialSyncResponse {
    logger.info('Building discovery response', {
      analyzedCount: input.analyzedEmails.length,
      failureCount: input.failures.length,
    });

    const startTime = Date.now();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Build category summaries
    // ─────────────────────────────────────────────────────────────────────────
    const categories = this.buildCategorySummaries(input.analyzedEmails);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Build client insights
    // ─────────────────────────────────────────────────────────────────────────
    const clientInsights = this.buildClientInsights(
      input.analyzedEmails,
      input.knownClients
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Limit and format failures
    // ─────────────────────────────────────────────────────────────────────────
    const failures = input.failures.slice(0, SUMMARY_LIMITS.failures);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Generate suggested actions
    // ─────────────────────────────────────────────────────────────────────────
    const suggestedActions = this.actionSuggester.generateActions({
      categories,
      clientInsights,
    });

    const buildTime = Date.now() - startTime;

    logger.info('Discovery response built', {
      categoryCount: categories.length,
      clientInsightCount: clientInsights.length,
      suggestedActionCount: suggestedActions.length,
      buildTimeMs: buildTime,
    });

    return {
      success: true,
      stats: input.stats,
      categories,
      clientInsights,
      failures,
      suggestedActions,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Category Building
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build summaries for all categories.
   */
  private buildCategorySummaries(emails: AnalyzedEmail[]): CategorySummary[] {
    logger.debug('Building category summaries', { emailCount: emails.length });

    // Aggregate emails by category
    const aggregates = this.aggregateByCategory(emails);

    // Build summary for each category (in display order)
    const categoryOrder: EmailCategory[] = [
      'action_required',
      'event',
      'newsletter',
      'promo',
      'admin',
      'personal',
      'noise',
    ];

    const summaries: CategorySummary[] = [];

    for (const category of categoryOrder) {
      const aggregate = aggregates.get(category);

      if (!aggregate || aggregate.emails.length === 0) {
        // Include empty categories with zero counts
        summaries.push(this.buildEmptyCategorySummary(category));
        continue;
      }

      summaries.push(this.buildCategorySummary(category, aggregate));
    }

    return summaries;
  }

  /**
   * Aggregate emails by category.
   */
  private aggregateByCategory(
    emails: AnalyzedEmail[]
  ): Map<EmailCategory, CategoryAggregate> {
    const aggregates = new Map<EmailCategory, CategoryAggregate>();

    for (const email of emails) {
      let aggregate = aggregates.get(email.category);

      if (!aggregate) {
        aggregate = {
          emails: [],
          senderCounts: new Map(),
          urgentCount: 0,
        };
        aggregates.set(email.category, aggregate);
      }

      aggregate.emails.push(email);

      // Track sender counts
      const senderKey = email.senderEmail.toLowerCase();
      const existing = aggregate.senderCounts.get(senderKey);
      if (existing) {
        existing.count++;
      } else {
        aggregate.senderCounts.set(senderKey, {
          name: email.senderName || email.senderEmail.split('@')[0],
          email: email.senderEmail,
          count: 1,
        });
      }

      // Track urgent count for work-related categories (client_pipeline, business_work_general)
      // REFACTORED (Jan 2026): Changed from action_required to work categories
      if (
        (email.category === 'client_pipeline' || email.category === 'business_work_general') &&
        email.actionUrgency &&
        email.actionUrgency >= 7
      ) {
        aggregate.urgentCount++;
      }

      // Track upcoming event (events are now detected via analysis, not category)
      // The eventDetected field comes from analysis labels, not category
      if (email.eventDetected) {
        if (
          !aggregate.upcomingEvent ||
          email.eventDetected.date < aggregate.upcomingEvent.date
        ) {
          aggregate.upcomingEvent = email.eventDetected;
        }
      }
    }

    return aggregates;
  }

  /**
   * Build summary for a single category with data.
   */
  private buildCategorySummary(
    category: EmailCategory,
    aggregate: CategoryAggregate
  ): CategorySummary {
    const emails = aggregate.emails;
    const count = emails.length;
    const unreadCount = emails.filter((e) => !e.isRead).length;

    // Get top senders
    const topSenders = this.getTopSenders(aggregate.senderCounts);

    // Get sample subjects (most recent)
    const sampleSubjects = emails
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, SUMMARY_LIMITS.sampleSubjects)
      .map((e) => this.truncateSubject(e.subject));

    // Generate insight
    const insight = this.generateInsight(category, count, aggregate.urgentCount);

    const summary: CategorySummary = {
      category,
      count,
      unreadCount,
      topSenders,
      sampleSubjects,
      insight,
    };

    // Add category-specific fields
    // REFACTORED (Jan 2026): Show urgent count for work categories
    if (
      (category === 'client_pipeline' || category === 'business_work_general') &&
      aggregate.urgentCount > 0
    ) {
      summary.urgentCount = aggregate.urgentCount;
    }

    // Events can now appear in any category (local, family_kids_school, etc.)
    // Show upcoming event if detected for categories that commonly have events
    if (aggregate.upcomingEvent) {
      summary.upcomingEvent = aggregate.upcomingEvent;
    }

    return summary;
  }

  /**
   * Build empty summary for a category with no emails.
   */
  private buildEmptyCategorySummary(category: EmailCategory): CategorySummary {
    return {
      category,
      count: 0,
      unreadCount: 0,
      topSenders: [],
      sampleSubjects: [],
      insight: CATEGORY_INSIGHT_TEMPLATES[category].empty,
    };
  }

  /**
   * Get top senders from sender counts map.
   */
  private getTopSenders(
    senderCounts: Map<string, { name: string; email: string; count: number }>
  ): SenderInfo[] {
    const senders = Array.from(senderCounts.values());

    return senders
      .sort((a, b) => b.count - a.count)
      .slice(0, SUMMARY_LIMITS.topSenders);
  }

  /**
   * Generate insight text for a category.
   */
  private generateInsight(
    category: EmailCategory,
    count: number,
    urgentCount?: number
  ): string {
    const templates = CATEGORY_INSIGHT_TEMPLATES[category];

    if (count === 0) {
      return templates.empty;
    }

    if (count === 1) {
      return templates.singular;
    }

    return templates.plural(count, urgentCount);
  }

  /**
   * Truncate subject to reasonable length.
   */
  private truncateSubject(subject: string, maxLength = 60): string {
    if (!subject) return '(No subject)';
    if (subject.length <= maxLength) return subject;
    return subject.slice(0, maxLength - 3) + '...';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Client Building
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build client insights from analyzed emails.
   */
  private buildClientInsights(
    emails: AnalyzedEmail[],
    knownClients: Array<{ id: string; name: string }>
  ): ClientInsight[] {
    logger.debug('Building client insights', {
      emailCount: emails.length,
      knownClientCount: knownClients.length,
    });

    // Create lookup for known clients
    const knownClientMap = new Map<string, string>();
    for (const client of knownClients) {
      knownClientMap.set(client.id, client.name);
    }

    // Aggregate emails by client
    const clientAggregates = new Map<string, ClientAggregate>();

    for (const email of emails) {
      // Skip emails without client info
      if (!email.clientId && !email.clientName) {
        continue;
      }

      const clientKey = email.clientId || email.clientName || '';
      let aggregate = clientAggregates.get(clientKey);

      if (!aggregate) {
        const isKnown = email.clientId ? knownClientMap.has(email.clientId) : false;

        aggregate = {
          clientId: email.clientId || null,
          clientName:
            email.clientName ||
            (email.clientId ? knownClientMap.get(email.clientId) : null) ||
            'Unknown',
          isNewSuggestion: email.isNewClientSuggestion || !isKnown,
          emails: [],
          relationshipSignals: [],
        };
        clientAggregates.set(clientKey, aggregate);
      }

      aggregate.emails.push(email);

      if (email.relationshipSignal) {
        aggregate.relationshipSignals.push(email.relationshipSignal);
      }
    }

    // Convert to ClientInsight array
    const insights: ClientInsight[] = [];

    for (const aggregate of clientAggregates.values()) {
      const actionRequiredCount = aggregate.emails.filter(
        (e) => e.category === 'action_required'
      ).length;

      // Get dominant relationship signal
      const relationshipSignal = this.getDominantSignal(aggregate.relationshipSignals);

      // Get most recent subject
      const sortedEmails = [...aggregate.emails].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const sampleSubject = this.truncateSubject(
        sortedEmails[0]?.subject || '(No subject)'
      );

      insights.push({
        clientId: aggregate.clientId,
        clientName: aggregate.clientName,
        isNewSuggestion: aggregate.isNewSuggestion,
        emailCount: aggregate.emails.length,
        actionRequiredCount,
        sampleSubject,
        relationshipSignal,
      });
    }

    // Sort: known clients first, then by email count
    insights.sort((a, b) => {
      // Known clients before suggestions
      if (a.isNewSuggestion !== b.isNewSuggestion) {
        return a.isNewSuggestion ? 1 : -1;
      }
      // Then by email count
      return b.emailCount - a.emailCount;
    });

    return insights.slice(0, SUMMARY_LIMITS.clientInsights);
  }

  /**
   * Get the dominant relationship signal from an array.
   */
  private getDominantSignal(signals: RelationshipSignal[]): RelationshipSignal {
    if (signals.length === 0) {
      return 'unknown';
    }

    const counts: Record<RelationshipSignal, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      unknown: 0,
    };

    for (const signal of signals) {
      counts[signal]++;
    }

    // Priority: negative > positive > neutral > unknown
    if (counts.negative > 0) return 'negative';
    if (counts.positive > counts.neutral) return 'positive';
    if (counts.neutral > 0) return 'neutral';
    return 'unknown';
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new DiscoveryBuilderService instance.
 *
 * @returns New DiscoveryBuilderService instance
 */
export function createDiscoveryBuilder(): DiscoveryBuilderService {
  return new DiscoveryBuilderService();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default DiscoveryBuilderService;
