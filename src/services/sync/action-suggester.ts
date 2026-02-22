/**
 * Action Suggester Service
 *
 * Generates suggested quick actions based on email analysis results.
 * These suggestions help users take immediate action after initial sync:
 * - Archive bulk categories (shopping, newsletters_creator)
 * - View urgent items in clients
 * - Add suggested clients
 * - Review detected events (now in 'local' category)
 *
 * Actions are prioritized and limited to avoid overwhelming the user.
 *
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 * - action_required → clients (urgent items via urgency score)
 * - event → local (events detected via has_event label)
 * - promo/noise → shopping/newsletters_creator
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
   *
   * REFACTORED (Jan 2026): Now checks clients and work
   * categories for urgent items (identified by urgentCount from analysis).
   * The old 'action_required' category no longer exists.
   */
  private generateUrgentViewActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Find work-related categories that may have urgent items
    // REFACTORED (Jan 2026): action_required → clients + work
    // ─────────────────────────────────────────────────────────────────────────
    const clientsCategory = categories.find((c) => c.category === 'clients');
    const workCategory = categories.find((c) => c.category === 'work');

    // Sum up urgent counts from both work categories
    const urgentCount = (clientsCategory?.urgentCount || 0) + (workCategory?.urgentCount || 0);

    logger.debug('Checking for urgent items', {
      clientsUrgent: clientsCategory?.urgentCount || 0,
      workUrgent: workCategory?.urgentCount || 0,
      totalUrgent: urgentCount,
    });

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

      logger.info('Generated urgent view action', { urgentCount });
    }

    return actions;
  }

  /**
   * Generate "add events to calendar" action if events were detected.
   *
   * REFACTORED (Jan 2026): Events are no longer a separate category.
   * Events are detected via the 'has_event' label and can appear in any
   * life-bucket category (local, family, travel, etc.).
   * We now check for upcomingEvent across all categories.
   */
  private generateEventActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Events can now be in any category (local, family, travel, etc.)
    // Count categories that have detected events via upcomingEvent field
    // ─────────────────────────────────────────────────────────────────────────
    const categoriesWithEvents = categories.filter((c) => c.upcomingEvent);
    const eventCount = categoriesWithEvents.length;

    logger.debug('Checking for events across categories', {
      categoriesWithEvents: categoriesWithEvents.map(c => c.category),
      eventCount,
    });

    if (eventCount === 0) {
      return actions;
    }

    // Find the soonest upcoming event across all categories
    const soonestEvent = categoriesWithEvents
      .sort((a, b) => {
        const dateA = a.upcomingEvent?.date || '';
        const dateB = b.upcomingEvent?.date || '';
        return dateA.localeCompare(dateB);
      })[0]?.upcomingEvent;

    actions.push({
      id: `add_events_${Date.now()}`,
      type: 'add_events',
      label: eventCount === 1
        ? 'Review 1 upcoming event'
        : `Review ${eventCount} upcoming events`,
      description: soonestEvent
        ? `Next: ${soonestEvent.title}`
        : 'Events and invitations were detected',
      count: eventCount,
      priority: eventCount >= 3 ? 'high' : 'medium',
    });

    logger.info('Generated event action', { eventCount, soonestEvent: soonestEvent?.title });

    return actions;
  }

  /**
   * Generate "archive category" actions for low-value categories.
   *
   * REFACTORED (Jan 2026): Updated for life-bucket categories.
   * - promo → shopping (but only suggest archive for clearly promotional content)
   * - noise → newsletters_creator (suggest archive for high-volume newsletters)
   * - news_politics and product_updates are also archiveable
   */
  private generateArchiveActions(categories: CategorySummary[]): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Categories that are candidates for bulk archive
    // REFACTORED (Jan 2026): Updated to new life-bucket categories
    // These are typically informational and safe to archive in bulk
    // ─────────────────────────────────────────────────────────────────────────
    const archiveableCategories: EmailCategory[] = [
      'newsletters_creator',  // Substacks, digests - often pile up
      'news_politics',        // News updates - time-sensitive, archive old ones
      'product_updates',      // SaaS updates - usually low priority
    ];

    logger.debug('Checking archiveable categories', { archiveableCategories });

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
   *
   * REFACTORED (Jan 2026): Updated labels for life-bucket categories.
   */
  private getArchiveLabel(category: EmailCategory, count: number): string {
    // ─────────────────────────────────────────────────────────────────────────
    // Human-friendly labels for each category
    // REFACTORED (Jan 2026): Updated to new life-bucket categories
    // ─────────────────────────────────────────────────────────────────────────
    const categoryLabels: Record<EmailCategory, string> = {
      newsletters_creator: 'newsletter',
      newsletters_industry: 'industry newsletter',
      news_politics: 'news',
      product_updates: 'product update',
      local: 'local',
      shopping: 'shopping',
      travel: 'travel',
      finance: 'finance',
      family: 'family',
      clients: 'client',
      work: 'work',
      personal_friends_family: 'personal',
    };

    const categoryLabel = categoryLabels[category] || category;
    const emailWord = count === 1 ? 'email' : 'emails';

    logger.debug('Generated archive label', { category, categoryLabel, count });

    return `Archive ${count} ${categoryLabel} ${emailWord}`;
  }

  /**
   * Get description for archive action.
   *
   * REFACTORED (Jan 2026): Updated for life-bucket categories.
   */
  private getArchiveDescription(
    category: EmailCategory,
    summary: CategorySummary
  ): string {
    // ─────────────────────────────────────────────────────────────────────────
    // Category-specific descriptions for archive actions
    // REFACTORED (Jan 2026): Updated to new life-bucket categories
    // ─────────────────────────────────────────────────────────────────────────
    const descriptions: Partial<Record<EmailCategory, string>> = {
      newsletters_creator: 'Newsletters and digests safe to archive',
      news_politics: 'News updates that can be archived',
      product_updates: 'Product and service updates',
      shopping: 'Promotional and shopping emails',
    };

    // If we have top senders, show them
    if (summary.topSenders.length > 0) {
      const senderNames = summary.topSenders
        .slice(0, 3)
        .map((s) => s.name || s.email.split('@')[0])
        .join(', ');
      return `From: ${senderNames}`;
    }

    // Fall back to category-specific description or generic
    return descriptions[category] || `${category.replace(/_/g, ' ')} emails that can be archived`;
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
