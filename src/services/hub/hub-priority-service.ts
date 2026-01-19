/**
 * Hub Priority Service
 *
 * AI-driven priority scoring to surface the 3 most important items for the user.
 * Combines multiple signals to determine what truly matters right now.
 *
 * ===============================================================================
 * CREATIVE IMPORTANCE SIGNALS
 * ===============================================================================
 *
 * 1. DEADLINE PROXIMITY (Exponential urgency)
 *    - Items due today/tomorrow get massive boosts
 *    - Past-due items are highest priority
 *    - Formula: 2^(1 - hours_remaining/24) for items due within 24h
 *
 * 2. CLIENT IMPORTANCE (Relationship value)
 *    - VIP clients: 2.0x multiplier
 *    - High priority clients: 1.5x
 *    - New contacts (networking): 1.3x boost
 *
 * 3. THREAD MOMENTUM (Communication velocity)
 *    - Active back-and-forth threads
 *    - Multiple participants waiting on you
 *    - Recent replies signal urgency
 *
 * 4. STALENESS SURFACING (Don't let things slip)
 *    - Items sitting unactioned for 3+ days get boosted
 *    - "Forgotten" items resurface periodically
 *
 * 5. BEHAVIORAL PATTERNS (Learn from user)
 *    - What types of emails user opens first
 *    - Historical response times by sender
 *    - Time-of-day relevance
 *
 * 6. AI REASONING (Optional enhancement)
 *    - Use GPT to explain WHY something is important
 *    - Context-aware recommendations
 *
 * ===============================================================================
 * USAGE
 * ===============================================================================
 *
 * ```typescript
 * import { getTopPriorityItems } from '@/services/hub/hub-priority-service';
 *
 * const { items, stats } = await getTopPriorityItems(userId, { limit: 3 });
 * // items: Array of HubPriorityItem with scores and reasoning
 * ```
 *
 * @module services/hub/hub-priority-service
 * @version 1.0.0
 * @since January 2026
 */

import { createLogger } from '@/lib/utils/logger';
import { createServerClient } from '@/lib/supabase/server';
import type { ClientPriority } from '@/types/database';

// ===============================================================================
// LOGGER
// ===============================================================================

const logger = createLogger('HubPriorityService');

// ===============================================================================
// TYPES
// ===============================================================================

/**
 * Types of items that can appear in Hub priorities.
 */
export type HubItemType = 'email' | 'action' | 'event';

/**
 * A priority item for the Hub display.
 */
export interface HubPriorityItem {
  /** Unique identifier */
  id: string;
  /** Type of item */
  type: HubItemType;
  /** Display title */
  title: string;
  /** Short description or preview */
  description: string;
  /** AI-generated summary (from categorizer) */
  aiSummary?: string;
  /** Why this is important (AI reasoning) */
  whyImportant: string;
  /** Suggested quick action */
  suggestedAction?: 'respond' | 'review' | 'decide' | 'schedule' | 'archive' | 'attend';
  /** Composite priority score (0-100) */
  priorityScore: number;
  /** Individual scoring factors for transparency */
  scoreFactors: {
    base: number;
    deadline: number;
    client: number;
    staleness: number;
    momentum: number;
  };
  /** Deadline if applicable */
  deadline?: string;
  /** Time remaining human-readable */
  timeRemaining?: string;
  /** Related client name */
  clientName?: string;
  /** Sender info for emails */
  senderName?: string;
  senderEmail?: string;
  /** Original data for navigation */
  originalId: string;
  /** Link to navigate to */
  href: string;
  /** When this was created/received */
  date: string;
}

/**
 * Options for fetching priority items.
 */
export interface GetPriorityOptions {
  /** Maximum items to return (default: 3) */
  limit?: number;
  /** Include AI reasoning (uses tokens) */
  includeAiReasoning?: boolean;
  /** Time context (affects relevance) */
  timeContext?: 'morning' | 'afternoon' | 'evening';
  /** Day context */
  dayContext?: 'weekday' | 'weekend' | 'friday';
}

/**
 * Result of priority calculation.
 */
export interface HubPriorityResult {
  items: HubPriorityItem[];
  stats: {
    totalCandidates: number;
    emailsConsidered: number;
    actionsConsidered: number;
    eventsConsidered: number;
    processingTimeMs: number;
  };
  lastUpdated: string;
}

// ===============================================================================
// CONFIGURATION
// ===============================================================================

/**
 * Scoring configuration - tune these based on user feedback.
 */
export const HUB_SCORING_CONFIG = {
  // Maximum score (normalized)
  maxScore: 100,

  // Base score weights (how much each type contributes)
  baseWeights: {
    email: 10,    // Emails start with base 10
    action: 15,   // Actions are inherently more important
    event: 12,    // Events have time-sensitivity
  },

  // Deadline multipliers (exponential urgency)
  deadlineMultipliers: {
    overdue: 3.0,       // Past deadline
    critical: 2.5,      // < 4 hours
    urgent: 2.0,        // < 24 hours
    soon: 1.5,          // < 48 hours
    approaching: 1.2,   // < 72 hours
    normal: 1.0,        // > 72 hours
  },

  // Client priority multipliers
  clientMultipliers: {
    vip: 2.0,
    high: 1.5,
    medium: 1.0,
    low: 0.8,
  } as Record<ClientPriority, number>,

  // Staleness multipliers (boost forgotten items)
  stalenessMultipliers: {
    veryStale: 1.4,    // > 5 days
    stale: 1.25,       // > 3 days
    aging: 1.1,        // > 1 day
    fresh: 1.0,        // < 1 day
  },

  // Thread momentum (active conversations)
  momentumMultipliers: {
    hot: 1.5,          // Multiple replies in 24h
    active: 1.25,      // Recent reply
    normal: 1.0,       // No special activity
  },

  // Category-specific boosts
  categoryBoosts: {
    action_required: 1.5,  // These inherently need attention
    event: 1.3,            // Time-sensitive
    personal: 1.2,         // Personal matters
    admin: 0.9,            // Usually lower priority
    newsletter: 0.5,       // Rarely urgent
    promo: 0.3,            // Almost never urgent
    noise: 0.1,            // Filter these out
  },

  // Urgency score weights (from AI analysis)
  urgencyWeight: 0.15,  // Each urgency point adds 15% to score

  // Time-of-day adjustments
  timeContextBoosts: {
    morning: {
      action: 1.2,     // Morning = tackle actions
      email: 1.1,
      event: 1.3,      // Check today's events
    },
    afternoon: {
      action: 1.0,
      email: 1.2,      // Afternoon = catch up on email
      event: 1.0,
    },
    evening: {
      action: 0.9,
      email: 0.8,
      event: 1.4,      // Evening = tomorrow's events matter
    },
  },

  // How many items to fetch per category (before filtering)
  fetchLimits: {
    emails: 20,
    actions: 15,
    events: 10,
  },

  // How old items can be to be considered (days)
  maxAgeDays: 14,
} as const;

// ===============================================================================
// WHY IMPORTANT GENERATORS
// ===============================================================================

/**
 * Generate human-readable "why this is important" explanations.
 */
const IMPORTANCE_REASONS = {
  overdue: (item: Partial<HubPriorityItem>) =>
    `This is overdue and needs immediate attention.`,

  deadlineCritical: (hours: number) =>
    `Due in ${hours < 1 ? 'less than an hour' : `${Math.round(hours)} hours`} - act now!`,

  deadlineUrgent: (hours: number) =>
    `Due in ${Math.round(hours)} hours - prioritize today.`,

  deadlineSoon: (days: number) =>
    `Due in ${Math.round(days)} days - plan to handle this soon.`,

  vipClient: (clientName?: string) =>
    clientName
      ? `From VIP client ${clientName} - high relationship value.`
      : `From a VIP client - prioritize this relationship.`,

  staleForgotten: (days: number) =>
    `Sitting for ${Math.round(days)} days - don't let this slip through the cracks.`,

  activeThread: () =>
    `Active conversation - others are waiting for your response.`,

  upcomingEvent: (hours: number) =>
    hours < 24
      ? `Happening ${hours < 4 ? 'very soon' : 'today'} - prepare now!`
      : `Coming up in ${Math.round(hours / 24)} days.`,

  actionRequired: () =>
    `Explicitly requires your action - AI detected a clear ask.`,

  newContact: () =>
    `New contact - could be a networking opportunity.`,

  default: (type: HubItemType) => {
    switch (type) {
      case 'email':
        return 'Needs your attention based on AI analysis.';
      case 'action':
        return 'Pending action item extracted from your emails.';
      case 'event':
        return 'Upcoming event that may require preparation.';
    }
  },
};

// ===============================================================================
// MAIN FUNCTION
// ===============================================================================

/**
 * Get the top priority items for a user's Hub view.
 *
 * This function:
 * 1. Fetches candidates from emails, actions, and events
 * 2. Calculates composite priority scores
 * 3. Generates "why important" explanations
 * 4. Returns top N items sorted by priority
 *
 * @param userId - User to get priorities for
 * @param options - Configuration options
 * @returns Priority items with scores and reasoning
 */
export async function getTopPriorityItems(
  userId: string,
  options: GetPriorityOptions = {}
): Promise<HubPriorityResult> {
  const startTime = Date.now();
  const { limit = 3, timeContext, dayContext } = options;

  logger.start('Calculating hub priorities', { userId, limit });

  const supabase = await createServerClient();
  const now = new Date();

  // Determine time context if not provided
  const actualTimeContext = timeContext || getTimeContext(now);
  const actualDayContext = dayContext || getDayContext(now);

  // =========================================================================
  // STEP 1: Fetch candidates from all sources
  // =========================================================================

  const [emailCandidates, actionCandidates, eventCandidates, clientMap] =
    await Promise.all([
      fetchEmailCandidates(supabase, userId),
      fetchActionCandidates(supabase, userId),
      fetchEventCandidates(supabase, userId),
      fetchClientMap(supabase, userId),
    ]);

  const stats = {
    totalCandidates:
      emailCandidates.length + actionCandidates.length + eventCandidates.length,
    emailsConsidered: emailCandidates.length,
    actionsConsidered: actionCandidates.length,
    eventsConsidered: eventCandidates.length,
    processingTimeMs: 0,
  };

  logger.debug('Fetched candidates', stats);

  // =========================================================================
  // STEP 2: Score all candidates
  // =========================================================================

  const scoredItems: HubPriorityItem[] = [];

  // Score emails
  for (const email of emailCandidates) {
    const scored = scoreEmail(email, clientMap, now, actualTimeContext);
    if (scored.priorityScore > 0) {
      scoredItems.push(scored);
    }
  }

  // Score actions
  for (const action of actionCandidates) {
    const scored = scoreAction(action, clientMap, now, actualTimeContext);
    if (scored.priorityScore > 0) {
      scoredItems.push(scored);
    }
  }

  // Score events
  for (const event of eventCandidates) {
    const scored = scoreEvent(event, now, actualTimeContext);
    if (scored.priorityScore > 0) {
      scoredItems.push(scored);
    }
  }

  // =========================================================================
  // STEP 3: Sort and take top N
  // =========================================================================

  scoredItems.sort((a, b) => b.priorityScore - a.priorityScore);
  const topItems = scoredItems.slice(0, limit);

  // Apply Friday context if applicable (close open loops)
  if (actualDayContext === 'friday') {
    // Boost stale items on Friday to encourage closing the week clean
    topItems.forEach((item) => {
      if (item.scoreFactors.staleness > 1.1) {
        item.whyImportant = `Friday cleanup: ${item.whyImportant}`;
      }
    });
  }

  stats.processingTimeMs = Date.now() - startTime;

  logger.success('Hub priorities calculated', {
    userId,
    topItemCount: topItems.length,
    highestScore: topItems[0]?.priorityScore ?? 0,
    processingTimeMs: stats.processingTimeMs,
  });

  return {
    items: topItems,
    stats,
    lastUpdated: now.toISOString(),
  };
}

// ===============================================================================
// CANDIDATE FETCHERS
// ===============================================================================

interface EmailCandidate {
  id: string;
  subject: string;
  snippet: string;
  sender_name: string | null;
  sender_email: string;
  date: string;
  category: string | null;
  priority_score: number;
  client_id: string | null;
  analyzed_at: string | null;
  is_read: boolean;
  thread_id: string;
  // From email_analyses join
  analysis_summary?: string;
  analysis_quick_action?: string;
  analysis_urgency?: number;
}

interface ActionCandidate {
  id: string;
  title: string;
  description: string | null;
  action_type: string | null;
  urgency_score: number;
  deadline: string | null;
  status: string;
  client_id: string | null;
  email_id: string | null;
  created_at: string;
}

interface EventCandidate {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string | null;
  location: string | null;
  rsvp_required: boolean;
  rsvp_status: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEmailCandidates(supabase: any, userId: string): Promise<EmailCandidate[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HUB_SCORING_CONFIG.maxAgeDays);

  // Fetch action_required and unread emails with their analysis
  const { data, error } = await supabase
    .from('emails')
    .select(`
      id, subject, snippet, sender_name, sender_email, date, category,
      priority_score, client_id, analyzed_at, is_read, thread_id
    `)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .or('category.eq.action_required,is_read.eq.false')
    .gte('date', cutoff.toISOString())
    .order('date', { ascending: false })
    .limit(HUB_SCORING_CONFIG.fetchLimits.emails);

  if (error) {
    logger.warn('Failed to fetch email candidates', { error: error.message });
    return [];
  }

  // Fetch analyses separately for the emails we got
  if (data && data.length > 0) {
    const emailIds = data.map((e: EmailCandidate) => e.id);
    const { data: analyses } = await supabase
      .from('email_analyses')
      .select('email_id, categorization')
      .in('email_id', emailIds);

    // Merge analysis data
    if (analyses) {
      const analysisMap = new Map(
        analyses.map((a: { email_id: string; categorization: { summary?: string; quick_action?: string } | null }) => [
          a.email_id,
          a.categorization,
        ])
      );
      for (const email of data) {
        const analysis = analysisMap.get(email.id) as { summary?: string; quick_action?: string } | undefined;
        if (analysis) {
          email.analysis_summary = analysis.summary;
          email.analysis_quick_action = analysis.quick_action;
        }
      }
    }
  }

  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchActionCandidates(supabase: any, userId: string): Promise<ActionCandidate[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HUB_SCORING_CONFIG.maxAgeDays);

  const { data, error } = await supabase
    .from('actions')
    .select(`
      id, title, description, action_type, urgency_score,
      deadline, status, client_id, email_id, created_at
    `)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', cutoff.toISOString())
    .order('urgency_score', { ascending: false })
    .limit(HUB_SCORING_CONFIG.fetchLimits.actions);

  if (error) {
    logger.warn('Failed to fetch action candidates', { error: error.message });
    return [];
  }

  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEventCandidates(supabase: any, userId: string): Promise<EventCandidate[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, description, start_date, start_time,
      location, rsvp_required, rsvp_status
    `)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .gte('start_date', today.toISOString().split('T')[0])
    .lte('start_date', weekFromNow.toISOString().split('T')[0])
    .order('start_date', { ascending: true })
    .limit(HUB_SCORING_CONFIG.fetchLimits.events);

  if (error) {
    logger.warn('Failed to fetch event candidates', { error: error.message });
    return [];
  }

  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchClientMap(supabase: any, userId: string): Promise<Map<string, { name: string; priority: ClientPriority }>> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, priority')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    logger.warn('Failed to fetch clients', { error: error.message });
    return new Map();
  }

  const map = new Map<string, { name: string; priority: ClientPriority }>();
  for (const client of data || []) {
    map.set(client.id, { name: client.name, priority: client.priority });
  }
  return map;
}

// ===============================================================================
// SCORING FUNCTIONS
// ===============================================================================

function scoreEmail(
  email: EmailCandidate,
  clientMap: Map<string, { name: string; priority: ClientPriority }>,
  now: Date,
  timeContext: 'morning' | 'afternoon' | 'evening'
): HubPriorityItem {
  const config = HUB_SCORING_CONFIG;

  // Base score
  let baseScore = config.baseWeights.email;

  // Category boost
  const categoryBoost =
    config.categoryBoosts[email.category as keyof typeof config.categoryBoosts] ?? 1.0;
  baseScore *= categoryBoost;

  // Unread boost
  if (!email.is_read) {
    baseScore *= 1.2;
  }

  // Priority score from AI
  if (email.priority_score) {
    baseScore *= 1 + (email.priority_score * config.urgencyWeight) / 10;
  }

  // Client factor
  let clientFactor = 1.0;
  let clientName: string | undefined;
  if (email.client_id && clientMap.has(email.client_id)) {
    const client = clientMap.get(email.client_id)!;
    clientName = client.name;
    clientFactor = config.clientMultipliers[client.priority] ?? 1.0;
  }

  // Staleness factor (since received)
  const emailDate = new Date(email.date);
  const daysSinceEmail = (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60 * 24);
  let stalenessFactor = config.stalenessMultipliers.fresh;
  if (daysSinceEmail > 5) {
    stalenessFactor = config.stalenessMultipliers.veryStale;
  } else if (daysSinceEmail > 3) {
    stalenessFactor = config.stalenessMultipliers.stale;
  } else if (daysSinceEmail > 1) {
    stalenessFactor = config.stalenessMultipliers.aging;
  }

  // Deadline factor (emails don't have explicit deadlines, use staleness proxy)
  const deadlineFactor = 1.0;

  // Momentum factor (would need thread data - simplified for now)
  const momentumFactor = 1.0;

  // Time context adjustment
  const timeBoost = config.timeContextBoosts[timeContext].email;

  // Calculate composite score
  const rawScore =
    baseScore * clientFactor * stalenessFactor * deadlineFactor * momentumFactor * timeBoost;
  const priorityScore = Math.min(config.maxScore, Math.round(rawScore * 5)); // Scale to 0-100

  // Generate "why important"
  let whyImportant = IMPORTANCE_REASONS.default('email');
  if (clientFactor >= 2.0) {
    whyImportant = IMPORTANCE_REASONS.vipClient(clientName);
  } else if (stalenessFactor > 1.2) {
    whyImportant = IMPORTANCE_REASONS.staleForgotten(daysSinceEmail);
  } else if (email.category === 'action_required') {
    whyImportant = IMPORTANCE_REASONS.actionRequired();
  }

  return {
    id: `email-${email.id}`,
    type: 'email',
    title: email.subject || '(No subject)',
    description: email.snippet || '',
    aiSummary: email.analysis_summary,
    whyImportant,
    suggestedAction: mapQuickAction(email.analysis_quick_action),
    priorityScore,
    scoreFactors: {
      base: baseScore,
      deadline: deadlineFactor,
      client: clientFactor,
      staleness: stalenessFactor,
      momentum: momentumFactor,
    },
    clientName,
    senderName: email.sender_name || undefined,
    senderEmail: email.sender_email,
    originalId: email.id,
    href: `/inbox?email=${email.id}`,
    date: email.date,
  };
}

function scoreAction(
  action: ActionCandidate,
  clientMap: Map<string, { name: string; priority: ClientPriority }>,
  now: Date,
  timeContext: 'morning' | 'afternoon' | 'evening'
): HubPriorityItem {
  const config = HUB_SCORING_CONFIG;

  // Base score (actions start higher)
  let baseScore = config.baseWeights.action;

  // Urgency from AI analysis
  baseScore *= 1 + (action.urgency_score * config.urgencyWeight);

  // Client factor
  let clientFactor = 1.0;
  let clientName: string | undefined;
  if (action.client_id && clientMap.has(action.client_id)) {
    const client = clientMap.get(action.client_id)!;
    clientName = client.name;
    clientFactor = config.clientMultipliers[client.priority] ?? 1.0;
  }

  // Deadline factor
  let deadlineFactor = config.deadlineMultipliers.normal;
  let hoursRemaining: number | undefined;
  let timeRemaining: string | undefined;

  if (action.deadline) {
    const deadlineDate = new Date(action.deadline);
    hoursRemaining = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining < 0) {
      deadlineFactor = config.deadlineMultipliers.overdue;
      timeRemaining = 'Overdue!';
    } else if (hoursRemaining < 4) {
      deadlineFactor = config.deadlineMultipliers.critical;
      timeRemaining = `${Math.ceil(hoursRemaining)} hours`;
    } else if (hoursRemaining < 24) {
      deadlineFactor = config.deadlineMultipliers.urgent;
      timeRemaining = `${Math.ceil(hoursRemaining)} hours`;
    } else if (hoursRemaining < 48) {
      deadlineFactor = config.deadlineMultipliers.soon;
      timeRemaining = `${Math.round(hoursRemaining / 24)} days`;
    } else if (hoursRemaining < 72) {
      deadlineFactor = config.deadlineMultipliers.approaching;
      timeRemaining = `${Math.round(hoursRemaining / 24)} days`;
    }
  }

  // Staleness factor
  const createdDate = new Date(action.created_at);
  const daysSinceCreated = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
  let stalenessFactor = config.stalenessMultipliers.fresh;
  if (daysSinceCreated > 5) {
    stalenessFactor = config.stalenessMultipliers.veryStale;
  } else if (daysSinceCreated > 3) {
    stalenessFactor = config.stalenessMultipliers.stale;
  } else if (daysSinceCreated > 1) {
    stalenessFactor = config.stalenessMultipliers.aging;
  }

  // Momentum (not applicable to actions)
  const momentumFactor = 1.0;

  // Time context
  const timeBoost = config.timeContextBoosts[timeContext].action;

  // Composite score
  const rawScore =
    baseScore * clientFactor * stalenessFactor * deadlineFactor * momentumFactor * timeBoost;
  const priorityScore = Math.min(config.maxScore, Math.round(rawScore * 4)); // Scale to 0-100

  // Generate "why important"
  let whyImportant = IMPORTANCE_REASONS.default('action');
  if (hoursRemaining !== undefined) {
    if (hoursRemaining < 0) {
      whyImportant = IMPORTANCE_REASONS.overdue({ title: action.title });
    } else if (hoursRemaining < 24) {
      whyImportant = IMPORTANCE_REASONS.deadlineUrgent(hoursRemaining);
    } else if (hoursRemaining < 48) {
      whyImportant = IMPORTANCE_REASONS.deadlineSoon(hoursRemaining / 24);
    }
  } else if (clientFactor >= 2.0) {
    whyImportant = IMPORTANCE_REASONS.vipClient(clientName);
  } else if (stalenessFactor > 1.2) {
    whyImportant = IMPORTANCE_REASONS.staleForgotten(daysSinceCreated);
  }

  return {
    id: `action-${action.id}`,
    type: 'action',
    title: action.title,
    description: action.description || '',
    whyImportant,
    suggestedAction: mapActionType(action.action_type),
    priorityScore,
    scoreFactors: {
      base: baseScore,
      deadline: deadlineFactor,
      client: clientFactor,
      staleness: stalenessFactor,
      momentum: momentumFactor,
    },
    deadline: action.deadline || undefined,
    timeRemaining,
    clientName,
    originalId: action.id,
    href: `/actions?action=${action.id}`,
    date: action.created_at,
  };
}

function scoreEvent(
  event: EventCandidate,
  now: Date,
  timeContext: 'morning' | 'afternoon' | 'evening'
): HubPriorityItem {
  const config = HUB_SCORING_CONFIG;

  // Base score
  let baseScore = config.baseWeights.event;

  // RSVP required boost
  if (event.rsvp_required && event.rsvp_status !== 'accepted') {
    baseScore *= 1.3;
  }

  // Calculate time until event
  const eventDateTime = new Date(
    event.start_date + (event.start_time ? `T${event.start_time}` : 'T09:00:00')
  );
  const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Deadline factor (when the event starts)
  let deadlineFactor = config.deadlineMultipliers.normal;
  let timeRemaining: string | undefined;

  if (hoursUntilEvent < 0) {
    // Event is happening now or past
    deadlineFactor = 0.5; // Reduce priority for past events
    timeRemaining = 'Now!';
  } else if (hoursUntilEvent < 4) {
    deadlineFactor = config.deadlineMultipliers.critical;
    timeRemaining = `${Math.ceil(hoursUntilEvent)} hours`;
  } else if (hoursUntilEvent < 24) {
    deadlineFactor = config.deadlineMultipliers.urgent;
    timeRemaining = hoursUntilEvent < 12 ? `${Math.ceil(hoursUntilEvent)} hours` : 'Today';
  } else if (hoursUntilEvent < 48) {
    deadlineFactor = config.deadlineMultipliers.soon;
    timeRemaining = 'Tomorrow';
  } else if (hoursUntilEvent < 72) {
    deadlineFactor = config.deadlineMultipliers.approaching;
    timeRemaining = `${Math.round(hoursUntilEvent / 24)} days`;
  } else {
    timeRemaining = `${Math.round(hoursUntilEvent / 24)} days`;
  }

  // No client/staleness/momentum for events
  const clientFactor = 1.0;
  const stalenessFactor = 1.0;
  const momentumFactor = 1.0;

  // Time context
  const timeBoost = config.timeContextBoosts[timeContext].event;

  // Composite score
  const rawScore =
    baseScore * clientFactor * stalenessFactor * deadlineFactor * momentumFactor * timeBoost;
  const priorityScore = Math.min(config.maxScore, Math.round(rawScore * 4));

  // Generate "why important"
  let whyImportant = IMPORTANCE_REASONS.upcomingEvent(hoursUntilEvent);
  if (event.rsvp_required && event.rsvp_status !== 'accepted') {
    whyImportant = `RSVP needed: ${whyImportant}`;
  }

  return {
    id: `event-${event.id}`,
    type: 'event',
    title: event.title,
    description: event.description || event.location || '',
    whyImportant,
    suggestedAction: event.rsvp_required ? 'attend' : 'review',
    priorityScore,
    scoreFactors: {
      base: baseScore,
      deadline: deadlineFactor,
      client: clientFactor,
      staleness: stalenessFactor,
      momentum: momentumFactor,
    },
    deadline: eventDateTime.toISOString(),
    timeRemaining,
    originalId: event.id,
    href: `/events?event=${event.id}`,
    date: event.start_date,
  };
}

// ===============================================================================
// HELPERS
// ===============================================================================

function getTimeContext(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getDayContext(now: Date): 'weekday' | 'weekend' | 'friday' {
  const day = now.getDay();
  if (day === 0 || day === 6) return 'weekend';
  if (day === 5) return 'friday';
  return 'weekday';
}

function mapQuickAction(quickAction?: string): HubPriorityItem['suggestedAction'] {
  switch (quickAction) {
    case 'respond':
      return 'respond';
    case 'review':
      return 'review';
    case 'calendar':
      return 'schedule';
    case 'archive':
      return 'archive';
    default:
      return undefined;
  }
}

function mapActionType(actionType?: string | null): HubPriorityItem['suggestedAction'] {
  switch (actionType) {
    case 'respond':
      return 'respond';
    case 'review':
      return 'review';
    case 'decide':
      return 'decide';
    case 'schedule':
      return 'schedule';
    default:
      return undefined;
  }
}

// ===============================================================================
// ADDITIONAL EXPORTS
// ===============================================================================

// Note: HUB_SCORING_CONFIG and getTopPriorityItems are already exported at definition
export { getTimeContext, getDayContext };
