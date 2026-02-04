/**
 * Priority Reassessment Service
 *
 * Periodically reassesses email/action priorities based on evolving factors.
 * This service should be run 2-3 times daily via cron job (pg_cron or Edge Function).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY REASSESS PRIORITIES?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Initial priority is set when email is analyzed, but priorities change:
 *
 * 1. TIME DECAY: Urgency increases as deadlines approach
 *    - "Due Friday" is low priority on Monday, high priority on Thursday
 *
 * 2. FOLLOW-UPS: Someone asked again → bump priority
 *    - Thread has new replies since last analysis
 *
 * 3. CLIENT IMPORTANCE: VIP clients get higher baseline priority
 *    - Apply client priority multiplier
 *
 * 4. STALENESS: Old unactioned items need attention or dismissal
 *    - Items sitting too long should surface or be archived
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRIORITY SCORING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Final priority = base_urgency * deadline_factor * client_factor * staleness_factor
 *
 * - base_urgency: Original urgency score from ActionExtractor (1-10)
 * - deadline_factor: 1.0 to 2.0 based on time until deadline
 * - client_factor: 1.0 (normal), 1.2 (high), 1.5 (VIP)
 * - staleness_factor: 1.0 to 1.3 based on days without action
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Run for a single user
 * import { reassessPrioritiesForUser } from '@/services/jobs/priority-reassessment';
 * await reassessPrioritiesForUser('user-123');
 *
 * // Run for all users (cron job)
 * import { reassessPrioritiesForAllUsers } from '@/services/jobs/priority-reassessment';
 * await reassessPrioritiesForAllUsers();
 * ```
 *
 * @module services/jobs/priority-reassessment
 * @version 1.0.0
 * @since January 2026
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import type { ClientPriority } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PriorityReassessment');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for priority reassessment.
 * These values can be tuned based on user feedback.
 */
export const PRIORITY_CONFIG = {
  /**
   * Maximum priority score.
   * Reassessment won't push scores above this.
   */
  maxPriority: 10,

  /**
   * Minimum priority score.
   * Even boosted items won't drop below this.
   */
  minPriority: 1,

  /**
   * Client priority multipliers.
   * Higher priority clients get their items boosted.
   */
  clientMultipliers: {
    low: 1.0,
    medium: 1.0,
    high: 1.2,
    vip: 1.5,
  } as Record<ClientPriority, number>,

  /**
   * Deadline urgency thresholds (in hours).
   * Items with deadlines within these windows get boosted.
   */
  deadlineThresholds: {
    critical: 4,    // < 4 hours → 2.0x multiplier
    urgent: 24,     // < 24 hours → 1.5x multiplier
    soon: 48,       // < 48 hours → 1.25x multiplier
    approaching: 72, // < 72 hours → 1.1x multiplier
  },

  /**
   * Deadline multipliers for each threshold.
   */
  deadlineMultipliers: {
    critical: 2.0,
    urgent: 1.5,
    soon: 1.25,
    approaching: 1.1,
    normal: 1.0,
  },

  /**
   * Staleness thresholds (in days).
   * Items sitting without action get boosted to surface them.
   */
  stalenessThresholds: {
    veryStale: 7,   // > 7 days → 1.3x multiplier
    stale: 4,       // > 4 days → 1.2x multiplier
    aging: 2,       // > 2 days → 1.1x multiplier
  },

  /**
   * Staleness multipliers for each threshold.
   */
  stalenessMultipliers: {
    veryStale: 1.3,
    stale: 1.2,
    aging: 1.1,
    fresh: 1.0,
  },

  /**
   * How far back to look for emails (in days).
   * We don't need to reassess very old emails.
   */
  lookbackDays: 14,

  /**
   * Batch size for processing.
   * Process items in chunks to avoid overwhelming the database.
   */
  batchSize: 100,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action item from database with related data.
 */
interface ActionItem {
  id: string;
  email_id: string | null;
  user_id: string;
  urgency_score: number;
  deadline: string | null;
  status: string;
  created_at: string;
  client_id: string | null;
}

/**
 * Email with analysis data for reassessment.
 */
interface EmailWithAnalysis {
  id: string;
  user_id: string;
  priority_score: number;
  date: string;
  analyzed_at: string | null;
  client_id: string | null;
  category: string | null;
}

/**
 * Result of priority reassessment.
 */
export interface ReassessmentResult {
  success: boolean;
  userId: string;
  actionsProcessed: number;
  actionsUpdated: number;
  emailsProcessed: number;
  emailsUpdated: number;
  durationMs: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reassesses priorities for a single user.
 *
 * This function:
 * 1. Fetches pending actions with deadlines
 * 2. Fetches recent action_required emails
 * 3. Applies priority multipliers based on:
 *    - Time until deadline
 *    - Client priority
 *    - Item staleness
 * 4. Updates priority_score/urgency_score in database
 *
 * @param userId - User ID to reassess priorities for
 * @returns Reassessment result with stats
 *
 * @example
 * ```typescript
 * const result = await reassessPrioritiesForUser('user-123');
 * console.log(`Updated ${result.actionsUpdated} actions, ${result.emailsUpdated} emails`);
 * ```
 */
export async function reassessPrioritiesForUser(
  userId: string
): Promise<ReassessmentResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.start('Reassessing priorities for user', { userId });

  const result: ReassessmentResult = {
    success: true,
    userId,
    actionsProcessed: 0,
    actionsUpdated: 0,
    emailsProcessed: 0,
    emailsUpdated: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    const supabase = await createServerClient();

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch client priorities for this user
    // ═══════════════════════════════════════════════════════════════════════
    const clientPriorities = await fetchClientPriorities(supabase, userId);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Reassess action items
    // ═══════════════════════════════════════════════════════════════════════
    const actionResult = await reassessActions(supabase, userId, clientPriorities);
    result.actionsProcessed = actionResult.processed;
    result.actionsUpdated = actionResult.updated;
    errors.push(...actionResult.errors);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Reassess email priorities
    // ═══════════════════════════════════════════════════════════════════════
    const emailResult = await reassessEmails(supabase, userId, clientPriorities);
    result.emailsProcessed = emailResult.processed;
    result.emailsUpdated = emailResult.updated;
    errors.push(...emailResult.errors);

    result.durationMs = Date.now() - startTime;
    result.errors = errors;
    result.success = errors.length === 0;

    logger.success('Priority reassessment complete', {
      userId,
      actionsProcessed: result.actionsProcessed,
      actionsUpdated: result.actionsUpdated,
      emailsProcessed: result.emailsProcessed,
      emailsUpdated: result.emailsUpdated,
      durationMs: result.durationMs,
      errorCount: errors.length,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Priority reassessment failed', {
      userId,
      error: errorMessage,
    });

    return {
      ...result,
      success: false,
      durationMs: Date.now() - startTime,
      errors: [...errors, errorMessage],
    };
  }
}

/**
 * Reassesses priorities for all users.
 *
 * This function should be called by a cron job 2-3 times daily.
 * It iterates through all users and reassesses their priorities.
 *
 * @returns Array of results for each user
 *
 * @example
 * ```typescript
 * // In a cron job or Edge Function
 * const results = await reassessPrioritiesForAllUsers();
 * const totalUpdated = results.reduce((sum, r) => sum + r.actionsUpdated, 0);
 * console.log(`Updated ${totalUpdated} actions across ${results.length} users`);
 * ```
 */
export async function reassessPrioritiesForAllUsers(): Promise<ReassessmentResult[]> {
  const startTime = Date.now();

  logger.start('Running priority reassessment for all users');

  const supabase = await createServerClient();

  // Get all users with completed onboarding
  const { data: users, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('onboarding_completed', true);

  if (error) {
    logger.error('Failed to fetch users for reassessment', { error: error.message });
    return [];
  }

  if (!users || users.length === 0) {
    logger.info('No users to reassess');
    return [];
  }

  logger.info('Starting reassessment', { userCount: users.length });

  // Process each user
  const results: ReassessmentResult[] = [];

  for (const user of users) {
    try {
      const result = await reassessPrioritiesForUser(user.id);
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to reassess user', {
        userId: user.id,
        error: errorMessage,
      });
      results.push({
        success: false,
        userId: user.id,
        actionsProcessed: 0,
        actionsUpdated: 0,
        emailsProcessed: 0,
        emailsUpdated: 0,
        durationMs: 0,
        errors: [errorMessage],
      });
    }
  }

  const totalDuration = Date.now() - startTime;
  const totalActionsUpdated = results.reduce((sum, r) => sum + r.actionsUpdated, 0);
  const totalEmailsUpdated = results.reduce((sum, r) => sum + r.emailsUpdated, 0);
  const failedCount = results.filter(r => !r.success).length;

  logger.success('Batch priority reassessment complete', {
    usersProcessed: results.length,
    totalActionsUpdated,
    totalEmailsUpdated,
    failedCount,
    totalDurationMs: totalDuration,
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches client priorities for a user.
 * Returns a map of client_id → priority multiplier.
 */
async function fetchClientPriorities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<Map<string, number>> {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, priority')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    logger.warn('Failed to fetch client priorities', { error: error.message });
    return new Map();
  }

  const priorityMap = new Map<string, number>();

  for (const client of clients || []) {
    const multiplier = PRIORITY_CONFIG.clientMultipliers[client.priority as ClientPriority] ?? 1.0;
    priorityMap.set(client.id, multiplier);
  }

  return priorityMap;
}

/**
 * Reassesses priorities for action items.
 */
async function reassessActions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  clientPriorities: Map<string, number>
): Promise<{ processed: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let updated = 0;

  // Fetch pending actions with deadlines or recent creation
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRIORITY_CONFIG.lookbackDays);

  const { data: actions, error } = await supabase
    .from('actions')
    .select('id, email_id, user_id, urgency_score, deadline, status, created_at, client_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', cutoffDate.toISOString())
    .limit(PRIORITY_CONFIG.batchSize);

  if (error) {
    errors.push(`Failed to fetch actions: ${error.message}`);
    return { processed, updated, errors };
  }

  if (!actions || actions.length === 0) {
    return { processed, updated, errors };
  }

  // Process each action
  for (const action of actions as ActionItem[]) {
    processed++;

    const newPriority = calculatePriority(
      action.urgency_score,
      action.deadline,
      action.created_at,
      action.client_id ? clientPriorities.get(action.client_id) : undefined
    );

    // Only update if priority changed significantly (avoid noise)
    if (Math.abs(newPriority - action.urgency_score) >= 0.5) {
      const { error: updateError } = await supabase
        .from('actions')
        .update({ urgency_score: Math.round(newPriority) })
        .eq('id', action.id);

      if (updateError) {
        errors.push(`Failed to update action ${action.id}: ${updateError.message}`);
      } else {
        updated++;
        logger.debug('Updated action priority', {
          actionId: action.id,
          oldPriority: action.urgency_score,
          newPriority: Math.round(newPriority),
        });
      }
    }
  }

  return { processed, updated, errors };
}

/**
 * Reassesses priorities for emails.
 */
async function reassessEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  clientPriorities: Map<string, number>
): Promise<{ processed: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let updated = 0;

  // Fetch recent action_required emails
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRIORITY_CONFIG.lookbackDays);

  // REFACTORED (Jan 2026): 'action_required' → 'client_pipeline'
  // Work-related emails that need attention are now in client_pipeline category
  const { data: emails, error } = await supabase
    .from('emails')
    .select('id, user_id, priority_score, date, analyzed_at, client_id, category')
    .eq('user_id', userId)
    .eq('category', 'client_pipeline')
    .eq('is_archived', false)
    .gte('date', cutoffDate.toISOString())
    .limit(PRIORITY_CONFIG.batchSize);

  if (error) {
    errors.push(`Failed to fetch emails: ${error.message}`);
    return { processed, updated, errors };
  }

  if (!emails || emails.length === 0) {
    return { processed, updated, errors };
  }

  // Process each email
  for (const email of emails as EmailWithAnalysis[]) {
    processed++;

    // For emails, we use the date as the creation time
    // and apply staleness factor based on analyzed_at
    const newPriority = calculatePriority(
      email.priority_score,
      null, // Emails don't have deadlines directly
      email.analyzed_at || email.date,
      email.client_id ? clientPriorities.get(email.client_id) : undefined
    );

    // Only update if priority changed significantly
    if (Math.abs(newPriority - email.priority_score) >= 0.5) {
      const { error: updateError } = await supabase
        .from('emails')
        .update({ priority_score: Math.round(newPriority) })
        .eq('id', email.id);

      if (updateError) {
        errors.push(`Failed to update email ${email.id}: ${updateError.message}`);
      } else {
        updated++;
        logger.debug('Updated email priority', {
          emailId: email.id,
          oldPriority: email.priority_score,
          newPriority: Math.round(newPriority),
        });
      }
    }
  }

  return { processed, updated, errors };
}

/**
 * Calculates new priority based on multiple factors.
 *
 * Formula: base * deadline_factor * client_factor * staleness_factor
 *
 * @param basePriority - Original priority score (1-10)
 * @param deadline - Deadline ISO string (optional)
 * @param createdAt - Creation time ISO string
 * @param clientMultiplier - Client priority multiplier (optional)
 * @returns New priority score (1-10)
 */
function calculatePriority(
  basePriority: number,
  deadline: string | null | undefined,
  createdAt: string,
  clientMultiplier?: number
): number {
  const now = new Date();

  // ═══════════════════════════════════════════════════════════════════════
  // Factor 1: Deadline urgency
  // ═══════════════════════════════════════════════════════════════════════
  let deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.normal;

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const hoursUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 0) {
      // Past deadline - maximum urgency
      deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.critical;
    } else if (hoursUntilDeadline < PRIORITY_CONFIG.deadlineThresholds.critical) {
      deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.critical;
    } else if (hoursUntilDeadline < PRIORITY_CONFIG.deadlineThresholds.urgent) {
      deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.urgent;
    } else if (hoursUntilDeadline < PRIORITY_CONFIG.deadlineThresholds.soon) {
      deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.soon;
    } else if (hoursUntilDeadline < PRIORITY_CONFIG.deadlineThresholds.approaching) {
      deadlineFactor = PRIORITY_CONFIG.deadlineMultipliers.approaching;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Factor 2: Client importance
  // ═══════════════════════════════════════════════════════════════════════
  const clientFactor = clientMultiplier ?? 1.0;

  // ═══════════════════════════════════════════════════════════════════════
  // Factor 3: Staleness (items sitting without action)
  // ═══════════════════════════════════════════════════════════════════════
  let stalenessFactor = PRIORITY_CONFIG.stalenessMultipliers.fresh;

  const createdDate = new Date(createdAt);
  const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCreation > PRIORITY_CONFIG.stalenessThresholds.veryStale) {
    stalenessFactor = PRIORITY_CONFIG.stalenessMultipliers.veryStale;
  } else if (daysSinceCreation > PRIORITY_CONFIG.stalenessThresholds.stale) {
    stalenessFactor = PRIORITY_CONFIG.stalenessMultipliers.stale;
  } else if (daysSinceCreation > PRIORITY_CONFIG.stalenessThresholds.aging) {
    stalenessFactor = PRIORITY_CONFIG.stalenessMultipliers.aging;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Calculate final priority
  // ═══════════════════════════════════════════════════════════════════════
  const rawPriority = basePriority * deadlineFactor * clientFactor * stalenessFactor;

  // Clamp to valid range
  return Math.max(
    PRIORITY_CONFIG.minPriority,
    Math.min(PRIORITY_CONFIG.maxPriority, rawPriority)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  calculatePriority,
  PRIORITY_CONFIG,
};
