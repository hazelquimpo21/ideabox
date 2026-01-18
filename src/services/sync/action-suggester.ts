/**
 * Action Suggester Service
 *
 * Generates suggested quick actions based on email analysis results.
 * These suggestions help users take immediate action after initial sync:
 * - Archive bulk categories (promo, noise)
 * - View urgent items
 * - Add suggested clients
 * - Review detected events
 *
 * Actions are prioritized and limited to avoid overwhelming the user.
 *
 * @module services/sync/action-suggester
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import { createLogger } from '@/lib/utils/logger';
import { SUGGESTED_ACTION_THRESHOLDS } from '@/config/initial-sync';
import type {
  SuggestedAction,
  SuggestedActionType,
  ActionPriority,
  CategorySummary,
  ClientInsight,
  EmailCategory,
} from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('ActionSuggester');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum number of suggested actions to return.
 * Too many can overwhelm the user.
 */
const MAX_SUGGESTED_ACTIONS = 5;

/**
 * Priority weights for sorting actions.
 */
const PRIORITY_WEIGHTS: Record<ActionPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Action type weights for tie-breaking.
 */
const ACTION_TYPE_WEIGHTS: Record<SuggestedActionType, number> = {
  view_urgent: 4,
  add_events: 3,
  add_client: 2,
  archive_category: 1,
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input data for generating suggested actions.
 */
export interface ActionSuggesterInput {
  categories: CategorySummary[];
  clientInsights: ClientInsight[];
}

// =============================================================================
// MAIN CLASS
// =============================================================================

/**
 * Service for generating suggested quick actions.
 *
 * @example
 * ```typescript
 * const suggester = new ActionSuggesterService();
 *
 * const actions = suggester.generateActions({
 *   categories: categorySummaries,
 *   clientInsights: clientInsights,
 * });
 *
 * // Returns prioritized list like:
 * // [
 * //   { type: 'view_urgent', label: 'Review 3 urgent items', priority: 'high' },
 * //   { type: 'archive_category', label: 'Archive 15 promotional emails', priority: 'medium' },
 * // ]
 * ```
 */
export class ActionSuggesterService {
  // ───────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate suggested actions based on analysis results.
   *
   * @param input - Categories and client insights from analysis
   * @returns Prioritized list of suggested actions
   */
  generateActions(input: ActionSuggesterInput): SuggestedAction[] {
    logger.info('Generating suggested actions', {
      categoryCount: input.categories.length,
      clientInsightCount: input.clientInsights.length,
    });

    const allActions: SuggestedAction[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Generate each type of action
    // ─────────────────────────────────────────────────────────────────────────
    allActions.push(...this.generateUrgentViewActions(input.categories));
    allActions.push(...this.generateEventActions(input.categories));
    allActions.push(...this.generateArchiveActions(input.categories));
    allActions.push(...this.generateClientActions(input.clientInsights));

    // ─────────────────────────────────────────────────────────────────────────
    // Sort by priority and return top N
    // ─────────────────────────────────────────────────────────────────────────
    const sortedActions = this.sortActions(allActions);
    const topActions = sortedActions.slice(0, MAX_SUGGESTED_ACTIONS);

    logger.info('Generated suggested actions', {
      totalGenerated: allActions.length,
      returned: topActions.length,
      types: topActions.map((a) => a.type),
    });

    return topActions;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Action Generators
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate "view urgent items" action if there are urgent emails.
   */
  private generateUrgentViewActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    const actionRequired = categories.find((c) => c.category === 'action_required');

    if (!actionRequired) {
      return actions;
    }

    // Check for urgent items (urgency > threshold)
    const urgentCount = actionRequired.urgentCount || 0;

    if (urgentCount > 0) {
      actions.push({
        id: `view_urgent_${Date.now()}`,
        type: 'view_urgent',
        label: urgentCount === 1
          ? 'Review 1 urgent item'
          : `Review ${urgentCount} urgent items`,
        description:
          urgentCount === 1
            ? 'This email has a deadline soon'
            : 'These emails have deadlines soon',
        count: urgentCount,
        priority: 'high',
      });

      logger.debug('Generated urgent view action', { urgentCount });
    }

    return actions;
  }

  /**
   * Generate "add events to calendar" action if events were detected.
   */
  private generateEventActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    const eventCategory = categories.find((c) => c.category === 'event');

    if (!eventCategory || eventCategory.count === 0) {
      return actions;
    }

    const eventCount = eventCategory.count;

    actions.push({
      id: `add_events_${Date.now()}`,
      type: 'add_events',
      label: eventCount === 1
        ? 'Review 1 event'
        : `Review ${eventCount} events`,
      description: eventCategory.upcomingEvent
        ? `Next: ${eventCategory.upcomingEvent.title}`
        : 'Events and invitations were detected',
      count: eventCount,
      priority: eventCount >= 3 ? 'high' : 'medium',
    });

    logger.debug('Generated event action', { eventCount });

    return actions;
  }

  /**
   * Generate "archive category" actions for low-value categories.
   */
  private generateArchiveActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // Categories that are candidates for bulk archive
    const archiveableCategories: EmailCategory[] = ['promo', 'noise'];

    for (const categoryName of archiveableCategories) {
      const category = categories.find((c) => c.category === categoryName);

      if (!category) {
        continue;
      }

      // Check if count meets threshold
      if (category.count < SUGGESTED_ACTION_THRESHOLDS.archiveCategoryMinCount) {
        continue;
      }

      const label = this.getArchiveLabel(categoryName, category.count);
      const description = this.getArchiveDescription(categoryName, category);

      actions.push({
        id: `archive_${categoryName}_${Date.now()}`,
        type: 'archive_category',
        label,
        description,
        category: categoryName,
        count: category.count,
        priority: category.count >= 10 ? 'medium' : 'low',
      });

      logger.debug('Generated archive action', {
        category: categoryName,
        count: category.count,
      });
    }

    return actions;
  }

  /**
   * Generate "add client" actions for suggested new clients.
   */
  private generateClientActions(clientInsights: ClientInsight[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // Filter to only new suggestions
    const newClientSuggestions = clientInsights.filter((c) => c.isNewSuggestion);

    for (const client of newClientSuggestions) {
      // Only suggest if enough emails
      if (client.emailCount < SUGGESTED_ACTION_THRESHOLDS.newClientMinEmails) {
        continue;
      }

      actions.push({
        id: `add_client_${client.clientName.replace(/\s+/g, '_')}_${Date.now()}`,
        type: 'add_client',
        label: `Add "${client.clientName}" as client`,
        description: `${client.emailCount} emails found, ${client.actionRequiredCount} need response`,
        clientName: client.clientName,
        count: client.emailCount,
        priority: client.actionRequiredCount > 0 ? 'medium' : 'low',
      });

      logger.debug('Generated add client action', {
        clientName: client.clientName,
        emailCount: client.emailCount,
      });
    }

    return actions;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get user-friendly label for archive action.
   */
  private getArchiveLabel(category: EmailCategory, count: number): string {
    const categoryLabels: Record<EmailCategory, string> = {
      promo: 'promotional',
      noise: 'low-priority',
      admin: 'admin',
      newsletter: 'newsletter',
      event: 'event',
      action_required: 'action',
      personal: 'personal',
    };

    const categoryLabel = categoryLabels[category] || category;
    const emailWord = count === 1 ? 'email' : 'emails';

    return `Archive ${count} ${categoryLabel} ${emailWord}`;
  }

  /**
   * Get description for archive action.
   */
  private getArchiveDescription(
    category: EmailCategory,
    summary: CategorySummary
  ): string {
    if (category === 'promo') {
      if (summary.topSenders.length > 0) {
        const senderNames = summary.topSenders
          .slice(0, 3)
          .map((s) => s.name || s.email.split('@')[0])
          .join(', ');
        return `From: ${senderNames}`;
      }
      return 'Marketing and promotional content';
    }

    if (category === 'noise') {
      return 'Low-value emails safe to archive';
    }

    return `${category} emails that can be archived`;
  }

  /**
   * Sort actions by priority and type.
   */
  private sortActions(actions: SuggestedAction[]): SuggestedAction[] {
    return [...actions].sort((a, b) => {
      // First sort by priority weight
      const priorityDiff =
        PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then by action type weight
      return ACTION_TYPE_WEIGHTS[b.type] - ACTION_TYPE_WEIGHTS[a.type];
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new ActionSuggesterService instance.
 *
 * @returns New ActionSuggesterService instance
 */
export function createActionSuggester(): ActionSuggesterService {
  return new ActionSuggesterService();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ActionSuggesterService;
