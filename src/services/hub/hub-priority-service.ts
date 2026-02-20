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
 *
 * UPDATED Jan 2026: Added 'extracted_date' type for timeline intelligence.
 * Extracted dates include deadlines, birthdays, payment dues, etc. from emails.
 */
export type HubItemType = 'email' | 'action' | 'event' | 'extracted_date';

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
 *
 * UPDATED Jan 2026: Added extractedDatesConsidered to stats for timeline intelligence.
 */
export interface HubPriorityResult {
  items: HubPriorityItem[];
  stats: {
    totalCandidates: number;
    emailsConsidered: number;
    actionsConsidered: number;
    eventsConsidered: number;
    /** NEW: Count of extracted dates (deadlines, birthdays, etc.) considered */
    extractedDatesConsidered: number;
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

  // ─────────────────────────────────────────────────────────────────────────
  // Signal strength multipliers (NEW Feb 2026)
  // Applied to email base scores based on AI-assessed signal quality.
  // This is the primary mechanism for suppressing noise in the Hub.
  // ─────────────────────────────────────────────────────────────────────────
  signalStrengthMultipliers: {
    high: 1.8,      // Direct correspondence - boost significantly
    medium: 1.0,    // Neutral - no modification
    low: 0.3,       // Background noise - heavily suppress
    noise: 0.05,    // Pure noise - essentially remove from Hub
  } as Record<string, number>,

  // ─────────────────────────────────────────────────────────────────────────
  // Reply worthiness boosts (NEW Feb 2026)
  // Emails that warrant replies get boosted so users see them sooner.
  // ─────────────────────────────────────────────────────────────────────────
  replyWorthinessBoosts: {
    must_reply: 1.6,      // Someone is waiting - high boost
    should_reply: 1.3,    // Good networking move - moderate boost
    optional_reply: 1.0,  // Neutral
    no_reply: 0.8,        // No reply expected - slight reduction
  } as Record<string, number>,

  // ─────────────────────────────────────────────────────────────────────────
  // Category-specific boosts
  // REFACTORED (Jan 2026): Updated for life-bucket categories.
  // Higher multipliers for categories that typically need attention.
  // ─────────────────────────────────────────────────────────────────────────
  categoryBoosts: {
    // Work & Business - high priority
    client_pipeline: 1.5,               // Client work needs attention
    business_work_general: 1.3,         // Professional matters
    // Family & Personal - moderate-high priority
    family_kids_school: 1.3,            // Kid-related often time-sensitive
    family_health_appointments: 1.4,    // Health matters are important
    personal_friends_family: 1.2,       // Personal relationships
    // Life Admin - moderate priority
    finance: 1.2,                       // Bills, payments
    travel: 1.3,                        // Travel is time-sensitive
    shopping: 0.6,                      // Orders, promos - lower priority
    local: 1.1,                         // Community events
    // Information - lower priority
    newsletters_general: 0.5,           // Rarely urgent
    news_politics: 0.4,                 // Can wait
    product_updates: 0.3,               // Almost never urgent
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
    /** NEW: Fetch limit for extracted dates (deadlines, birthdays, etc.) */
    extractedDates: 15,
  },

  // How old items can be to be considered (days)
  maxAgeDays: 14,

  // =========================================================================
  // EXTRACTED DATE CONFIGURATION (NEW - Jan 2026)
  // =========================================================================
  // Date types have different urgency weights. Deadlines and payments are
  // time-critical, while birthdays and anniversaries are nice-to-know.
  //
  // These multipliers are applied to the base score before deadline proximity
  // calculations, so a deadline due tomorrow will still rank higher than a
  // birthday due tomorrow.
  // =========================================================================

  /**
   * Date type weights - determines relative importance of different date types.
   *
   * Design rationale:
   * - deadline (1.6): Most critical - missed deadlines have consequences
   * - payment_due (1.5): Financial obligations, often have late fees
   * - expiration (1.4): Time-sensitive offers/subscriptions
   * - appointment (1.3): Scheduled commitments with others
   * - follow_up (1.2): AI-suggested follow-ups, moderately important
   * - event (1.1): General events (already handled by events table, lower here)
   * - birthday (1.0): Social importance but not time-critical
   * - anniversary (0.9): Nice to remember, lower urgency
   * - reminder (0.8): General reminders
   * - recurring (0.7): Recurring items are expected, less surprising
   * - other (0.6): Catch-all for unclassified dates
   */
  dateTypeWeights: {
    deadline: 1.6,
    payment_due: 1.5,
    expiration: 1.4,
    appointment: 1.3,
    follow_up: 1.2,
    event: 1.1,
    birthday: 1.0,
    anniversary: 0.9,
    reminder: 0.8,
    recurring: 0.7,
    other: 0.6,
  } as Record<string, number>,

  /**
   * Base weight for extracted dates.
   * Set to 13 (between actions at 15 and events at 12) because extracted dates
   * represent important future commitments that need attention.
   */
  extractedDateBaseWeight: 13,
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

  // =========================================================================
  // EXTRACTED DATE IMPORTANCE REASONS (NEW - Jan 2026)
  // =========================================================================
  // These reasons are specific to extracted dates and provide context about
  // why a particular date/deadline/birthday matters.
  // =========================================================================

  /** Deadline extracted from an email - time-critical */
  extractedDeadline: (hours: number, relatedEntity?: string) => {
    const entity = relatedEntity ? ` for ${relatedEntity}` : '';
    if (hours < 0) {
      return `Deadline${entity} is overdue - requires immediate attention.`;
    }
    if (hours < 24) {
      return `Deadline${entity} is due ${hours < 4 ? 'very soon' : 'today'} - act now!`;
    }
    return `Deadline${entity} approaching in ${Math.round(hours / 24)} days.`;
  },

  /** Payment due date - financial obligation */
  paymentDue: (hours: number, relatedEntity?: string) => {
    const entity = relatedEntity ? ` (${relatedEntity})` : '';
    if (hours < 0) {
      return `Payment${entity} is overdue - may incur late fees.`;
    }
    if (hours < 24) {
      return `Payment${entity} due today - avoid late fees.`;
    }
    return `Payment${entity} due in ${Math.round(hours / 24)} days.`;
  },

  /** Birthday from email or contact */
  birthday: (timeRemaining: string, relatedEntity?: string) => {
    const whose = relatedEntity ? `${relatedEntity}'s` : 'A';
    return `${whose} birthday is ${timeRemaining} - don't forget to wish them!`;
  },

  /** Work or relationship anniversary */
  anniversary: (timeRemaining: string, relatedEntity?: string) => {
    const whose = relatedEntity ? `${relatedEntity}'s` : 'An';
    return `${whose} anniversary is ${timeRemaining}.`;
  },

  /** Subscription/offer expiration */
  expiration: (hours: number, relatedEntity?: string) => {
    const what = relatedEntity || 'Something';
    if (hours < 24) {
      return `${what} expires today - take action before it's too late.`;
    }
    return `${what} expires in ${Math.round(hours / 24)} days.`;
  },

  /** Scheduled appointment */
  appointment: (hours: number, relatedEntity?: string) => {
    const with_ = relatedEntity ? ` with ${relatedEntity}` : '';
    if (hours < 4) {
      return `Appointment${with_} is very soon - prepare now!`;
    }
    if (hours < 24) {
      return `Appointment${with_} is today.`;
    }
    return `Appointment${with_} in ${Math.round(hours / 24)} days.`;
  },

  /** AI-suggested follow-up time */
  followUp: (relatedEntity?: string) => {
    const who = relatedEntity ? ` with ${relatedEntity}` : '';
    return `Good time to follow up${who} - maintain the relationship.`;
  },

  /** Generic extracted date */
  genericDate: (dateType: string, timeRemaining: string) =>
    `${dateType.charAt(0).toUpperCase() + dateType.slice(1).replace('_', ' ')} ${timeRemaining}.`,

  default: (type: HubItemType) => {
    switch (type) {
      case 'email':
        return 'Needs your attention based on AI analysis.';
      case 'action':
        return 'Pending action item extracted from your emails.';
      case 'event':
        return 'Upcoming event that may require preparation.';
      case 'extracted_date':
        return 'Important date extracted from your emails.';
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
  // UPDATED Jan 2026: Added extracted dates fetch for timeline intelligence.
  // Extracted dates include deadlines, birthdays, payment dues, etc. that
  // were automatically identified from email content.
  // =========================================================================

  const [emailCandidates, actionCandidates, eventCandidates, extractedDateCandidates, clientMap] =
    await Promise.all([
      fetchEmailCandidates(supabase, userId),
      fetchActionCandidates(supabase, userId),
      fetchEventCandidates(supabase, userId),
      fetchExtractedDateCandidates(supabase, userId),
      fetchClientMap(supabase, userId),
    ]);

  // Build stats object with all candidate counts
  const stats = {
    totalCandidates:
      emailCandidates.length + actionCandidates.length + eventCandidates.length + extractedDateCandidates.length,
    emailsConsidered: emailCandidates.length,
    actionsConsidered: actionCandidates.length,
    eventsConsidered: eventCandidates.length,
    extractedDatesConsidered: extractedDateCandidates.length,
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
  // Score extracted dates (NEW - Jan 2026)
  // =========================================================================
  // Extracted dates represent time-sensitive items pulled from email content:
  // - Deadlines: project due dates, response deadlines
  // - Payment dues: invoice deadlines, subscription payments
  // - Birthdays: contact birthdays mentioned in emails
  // - Appointments: scheduled meetings extracted from emails
  // - Expirations: offer expirations, subscription renewals
  //
  // Each date type has different urgency weights configured in dateTypeWeights.
  // =========================================================================
  for (const extractedDate of extractedDateCandidates) {
    try {
      const scored = scoreExtractedDate(extractedDate, now, actualTimeContext);
      if (scored.priorityScore > 0) {
        scoredItems.push(scored);
      }
    } catch (error) {
      // Log error but continue processing other dates
      // This ensures one malformed date doesn't break the entire Hub
      logger.warn('Failed to score extracted date', {
        dateId: extractedDate.id,
        dateType: extractedDate.date_type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
  analyzed_at: string | null;
  is_read: boolean;
  thread_id: string;
  // From email_analyses join
  analysis_summary?: string;
  analysis_quick_action?: string;
  analysis_urgency?: number;
  // NEW Feb 2026: Signal strength and reply worthiness from categorizer
  analysis_signal_strength?: string;
  analysis_reply_worthiness?: string;
}

interface ActionCandidate {
  id: string;
  title: string;
  description: string | null;
  action_type: string | null;
  urgency_score: number;
  deadline: string | null;
  status: string;
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

/**
 * Candidate structure for extracted dates from the extracted_dates table.
 * NEW - Jan 2026: Part of the Enhanced Email Intelligence feature.
 *
 * These dates are automatically extracted from email content by the
 * DateExtractorAnalyzer and represent time-sensitive items like:
 * - Deadlines, payment dues, birthdays, appointments, expirations
 *
 * @see docs/ENHANCED_EMAIL_INTELLIGENCE.md
 * @see supabase/migrations/013_extracted_dates.sql
 */
interface ExtractedDateCandidate {
  /** UUID primary key */
  id: string;
  /** Type of date: 'deadline', 'birthday', 'payment_due', etc. */
  date_type: string;
  /** The primary date (YYYY-MM-DD) */
  date: string;
  /** Time if known (HH:MM:SS), null for all-day */
  time: string | null;
  /** Display title: "Invoice #1234 due", "Sarah's birthday" */
  title: string;
  /** Additional context about the date */
  description: string | null;
  /** Priority score set during extraction (1-10) */
  priority_score: number;
  /** Source email that contained this date */
  email_id: string | null;
  /** Related contact if applicable */
  contact_id: string | null;
  /** Whether this is a recurring date */
  is_recurring: boolean;
  /** Related entity name: company, person, or project */
  related_entity: string | null;
  /** Extraction confidence (0.00-1.00) */
  confidence: number | null;
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
      priority_score, contact_id, analyzed_at, is_read, thread_id
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
        analyses.map((a: { email_id: string; categorization: { summary?: string; quick_action?: string; signal_strength?: string; reply_worthiness?: string } | null }) => [
          a.email_id,
          a.categorization,
        ])
      );
      for (const email of data) {
        const analysis = analysisMap.get(email.id) as { summary?: string; quick_action?: string; signal_strength?: string; reply_worthiness?: string } | undefined;
        if (analysis) {
          email.analysis_summary = analysis.summary;
          email.analysis_quick_action = analysis.quick_action;
          // NEW Feb 2026: Extract signal strength and reply worthiness
          email.analysis_signal_strength = analysis.signal_strength;
          email.analysis_reply_worthiness = analysis.reply_worthiness;
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
      deadline, status, contact_id, email_id, created_at
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

/**
 * Fetches client data from the contacts table.
 * Returns a map of contact ID → { name, priority } for contacts with is_client = true.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch clients for
 * @returns Map of contact ID → { name, priority }
 *
 * @since February 2026 — Phase 3 Navigation Redesign
 * Updated Phase 4: Removed legacy clients table fallback (clients table archived).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchClientMap(supabase: any, userId: string): Promise<Map<string, { name: string; priority: ClientPriority }>> {
  const map = new Map<string, { name: string; priority: ClientPriority }>();

  // Contacts with is_client = true
  const { data: contactClients, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, email, client_priority')
    .eq('user_id', userId)
    .eq('is_client', true)
    .eq('client_status', 'active');

  if (contactError) {
    logger.warn('Failed to fetch client contacts', { error: contactError.message });
  } else if (contactClients) {
    for (const c of contactClients) {
      const priority = (c.client_priority || 'medium') as ClientPriority;
      map.set(c.id, { name: c.name || c.email, priority });
    }
    logger.debug('Client contacts fetched from contacts table', { count: contactClients.length });
  }

  return map;
}

/**
 * Fetches upcoming extracted dates for Hub consideration.
 * NEW - Jan 2026: Part of Enhanced Email Intelligence feature.
 *
 * Query strategy:
 * 1. Only fetch dates within the next 7 days (upcoming items)
 * 2. Exclude acknowledged dates (user has already handled them)
 * 3. Exclude hidden dates (user chose not to see them)
 * 4. Respect snooze times (don't show snoozed items until snooze expires)
 * 5. Order by date to prioritize closest dates
 *
 * Error handling:
 * - Returns empty array on database error (graceful degradation)
 * - Logs warning with error details for debugging
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch dates for
 * @returns Array of extracted date candidates, or empty array on error
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExtractedDateCandidates(supabase: any, userId: string): Promise<ExtractedDateCandidate[]> {
  // Calculate date range: today through 7 days from now
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  // Format dates for Supabase query (YYYY-MM-DD)
  const todayStr = today.toISOString().split('T')[0];
  const weekFromNowStr = weekFromNow.toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  logger.debug('Fetching extracted date candidates', {
    userId,
    dateRange: { from: todayStr, to: weekFromNowStr },
    limit: HUB_SCORING_CONFIG.fetchLimits.extractedDates,
  });

  try {
    // Build query with all necessary filters
    // Note: We use a complex OR condition for snooze to handle NULL values
    const { data, error } = await supabase
      .from('extracted_dates')
      .select(`
        id, date_type, date, time, title, description,
        priority_score, email_id, contact_id, is_recurring,
        related_entity, confidence
      `)
      .eq('user_id', userId)
      .eq('is_acknowledged', false)
      .eq('is_hidden', false)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
      .gte('date', todayStr)
      .lte('date', weekFromNowStr)
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: false })
      .limit(HUB_SCORING_CONFIG.fetchLimits.extractedDates);

    if (error) {
      // Log the error with full context for debugging
      logger.warn('Failed to fetch extracted date candidates', {
        userId,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        hint: error.hint,
      });
      // Return empty array - graceful degradation
      // The Hub will still work, just without extracted dates
      return [];
    }

    logger.debug('Fetched extracted date candidates successfully', {
      userId,
      count: data?.length ?? 0,
    });

    return data || [];
  } catch (error) {
    // Catch any unexpected errors (network issues, etc.)
    logger.error('Unexpected error fetching extracted date candidates', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
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

  // Signal strength factor (NEW Feb 2026)
  // This is the primary noise suppression mechanism
  const signalStrengthFactor =
    config.signalStrengthMultipliers[email.analysis_signal_strength || 'medium'] ?? 1.0;
  baseScore *= signalStrengthFactor;

  // Reply worthiness factor (NEW Feb 2026)
  const replyWorthinessFactor =
    config.replyWorthinessBoosts[email.analysis_reply_worthiness || 'no_reply'] ?? 1.0;
  baseScore *= replyWorthinessFactor;

  // Client factor — use contact_id exclusively (Phase 4)
  let clientFactor = 1.0;
  let clientName: string | undefined;
  const clientContactId = (email as Record<string, unknown>).contact_id as string | null;
  if (clientContactId && clientMap.has(clientContactId)) {
    const client = clientMap.get(clientContactId)!;
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
  } else if (email.category === 'client_pipeline') {
    // REFACTORED (Jan 2026): 'action_required' → 'client_pipeline'
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
    // UPDATED (Feb 2026): /discover → /inbox per Navigation Redesign
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

  // Client factor — use contact_id exclusively (Phase 4)
  let clientFactor = 1.0;
  let clientName: string | undefined;
  const resolvedActionClientId = (action as Record<string, unknown>).contact_id as string | null;
  if (resolvedActionClientId && clientMap.has(resolvedActionClientId)) {
    const client = clientMap.get(resolvedActionClientId)!;
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
    // UPDATED (Feb 2026): /actions → /tasks per Navigation Redesign
    href: `/tasks?action=${action.id}`,
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
    // UPDATED (Feb 2026): /events → /calendar per Navigation Redesign
    href: `/calendar?event=${event.id}`,
    date: event.start_date,
  };
}

/**
 * Scores an extracted date for Hub priority ranking.
 * NEW - Jan 2026: Part of Enhanced Email Intelligence feature.
 *
 * Scoring strategy:
 * 1. Start with base weight (extractedDateBaseWeight = 13)
 * 2. Apply date type weight (deadline=1.6, birthday=1.0, etc.)
 * 3. Apply deadline proximity multiplier (overdue, critical, urgent, etc.)
 * 4. Apply recurring item reduction (0.85x for recurring items)
 * 5. Apply confidence factor (low confidence reduces score)
 * 6. Apply time-of-day context boost
 *
 * The result is normalized to 0-100 scale for comparison with other item types.
 *
 * @param extractedDate - The extracted date candidate to score
 * @param now - Current timestamp for deadline calculations
 * @param timeContext - Time of day context (morning/afternoon/evening)
 * @returns Scored HubPriorityItem ready for ranking
 */
function scoreExtractedDate(
  extractedDate: ExtractedDateCandidate,
  now: Date,
  timeContext: 'morning' | 'afternoon' | 'evening'
): HubPriorityItem {
  const config = HUB_SCORING_CONFIG;

  // =========================================================================
  // STEP 1: Calculate base score with date type weight
  // =========================================================================
  // Different date types have different inherent urgency levels.
  // A deadline due tomorrow is more urgent than a birthday tomorrow.
  // =========================================================================
  let baseScore = config.extractedDateBaseWeight;

  // Apply date type weight (default to 1.0 if unknown type)
  const dateTypeWeight = config.dateTypeWeights[extractedDate.date_type] ?? 1.0;
  baseScore *= dateTypeWeight;

  // Apply priority score from extraction (1-10 scale)
  // This allows the AI extractor to indicate item importance
  if (extractedDate.priority_score && extractedDate.priority_score > 0) {
    baseScore *= 1 + (extractedDate.priority_score * config.urgencyWeight) / 10;
  }

  // =========================================================================
  // STEP 2: Calculate time until date
  // =========================================================================
  // Parse the date and time to determine how soon this item is.
  // If no time is specified, assume 9:00 AM (business hours start).
  // =========================================================================
  let dateTime: Date;
  try {
    // Handle date parsing carefully - dates might be in various formats
    const dateStr = extractedDate.date;
    const timeStr = extractedDate.event_time;

    if (timeStr) {
      // Combine date and time
      dateTime = new Date(`${dateStr}T${timeStr}`);
    } else {
      // No time specified - assume 9:00 AM local time
      dateTime = new Date(`${dateStr}T09:00:00`);
    }

    // Validate the date is valid
    if (isNaN(dateTime.getTime())) {
      logger.warn('Invalid date in extracted date', {
        dateId: extractedDate.id,
        date: dateStr,
        event_time: timeStr,
      });
      // Use a fallback - treat as today at 9 AM
      dateTime = new Date();
      dateTime.setHours(9, 0, 0, 0);
    }
  } catch (error) {
    // Date parsing failed - use fallback
    logger.warn('Failed to parse extracted date', {
      dateId: extractedDate.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    dateTime = new Date();
    dateTime.setHours(9, 0, 0, 0);
  }

  // Calculate hours until the date
  const hoursUntil = (dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // =========================================================================
  // STEP 3: Calculate deadline proximity multiplier
  // =========================================================================
  // Items closer to their date get higher priority. Overdue items get the
  // highest multiplier to ensure they surface prominently.
  // =========================================================================
  let deadlineFactor = config.deadlineMultipliers.normal;
  let timeRemaining: string | undefined;

  if (hoursUntil < 0) {
    // Overdue - highest priority
    deadlineFactor = config.deadlineMultipliers.overdue;
    const hoursOverdue = Math.abs(hoursUntil);
    if (hoursOverdue < 24) {
      timeRemaining = 'Overdue!';
    } else {
      timeRemaining = `${Math.round(hoursOverdue / 24)} days overdue`;
    }
  } else if (hoursUntil < 4) {
    // Critical - less than 4 hours
    deadlineFactor = config.deadlineMultipliers.critical;
    timeRemaining = hoursUntil < 1 ? 'Less than 1 hour' : `${Math.ceil(hoursUntil)} hours`;
  } else if (hoursUntil < 24) {
    // Urgent - due today
    deadlineFactor = config.deadlineMultipliers.urgent;
    timeRemaining = hoursUntil < 12 ? `${Math.ceil(hoursUntil)} hours` : 'Today';
  } else if (hoursUntil < 48) {
    // Soon - due tomorrow
    deadlineFactor = config.deadlineMultipliers.soon;
    timeRemaining = 'Tomorrow';
  } else if (hoursUntil < 72) {
    // Approaching - 2-3 days
    deadlineFactor = config.deadlineMultipliers.approaching;
    timeRemaining = `${Math.round(hoursUntil / 24)} days`;
  } else {
    // Normal - more than 3 days out
    timeRemaining = `${Math.round(hoursUntil / 24)} days`;
  }

  // =========================================================================
  // STEP 4: Apply modifiers
  // =========================================================================

  // Recurring items are slightly less urgent (they'll come around again)
  if (extractedDate.is_recurring) {
    baseScore *= 0.85;
  }

  // Low confidence extractions get reduced priority
  // This prevents questionable AI extractions from dominating the Hub
  if (extractedDate.confidence !== null && extractedDate.confidence < 0.7) {
    baseScore *= 0.9;
  }

  // No client/staleness/momentum factors for extracted dates
  // (these are date-specific, not communication-specific)
  const clientFactor = 1.0;
  const stalenessFactor = 1.0;
  const momentumFactor = 1.0;

  // Apply time-of-day context boost (use event boost since dates are similar)
  const timeBoost = config.timeContextBoosts[timeContext].event;

  // =========================================================================
  // STEP 5: Calculate composite score
  // =========================================================================
  const rawScore =
    baseScore * clientFactor * stalenessFactor * deadlineFactor * momentumFactor * timeBoost;

  // Scale to 0-100 range (multiply by 4 to match event scaling)
  const priorityScore = Math.min(config.maxScore, Math.round(rawScore * 4));

  // =========================================================================
  // STEP 6: Generate "why important" explanation
  // =========================================================================
  // Use date-type-specific explanations for better context
  // =========================================================================
  let whyImportant: string;
  const relatedEntity = extractedDate.related_entity || undefined;

  switch (extractedDate.date_type) {
    case 'deadline':
      whyImportant = IMPORTANCE_REASONS.extractedDeadline(hoursUntil, relatedEntity);
      break;
    case 'payment_due':
      whyImportant = IMPORTANCE_REASONS.paymentDue(hoursUntil, relatedEntity);
      break;
    case 'birthday':
      whyImportant = IMPORTANCE_REASONS.birthday(timeRemaining || 'soon', relatedEntity);
      break;
    case 'anniversary':
      whyImportant = IMPORTANCE_REASONS.anniversary(timeRemaining || 'soon', relatedEntity);
      break;
    case 'expiration':
      whyImportant = IMPORTANCE_REASONS.expiration(hoursUntil, relatedEntity);
      break;
    case 'appointment':
      whyImportant = IMPORTANCE_REASONS.appointment(hoursUntil, relatedEntity);
      break;
    case 'follow_up':
      whyImportant = IMPORTANCE_REASONS.followUp(relatedEntity);
      break;
    default:
      // Generic fallback for unknown date types
      whyImportant = IMPORTANCE_REASONS.genericDate(
        extractedDate.date_type,
        timeRemaining || 'soon'
      );
  }

  // =========================================================================
  // STEP 7: Build and return the priority item
  // =========================================================================
  return {
    id: `date-${extractedDate.id}`,
    type: 'extracted_date',
    title: extractedDate.title,
    description: extractedDate.description || '',
    whyImportant,
    suggestedAction: mapDateTypeToSuggestedAction(extractedDate.date_type),
    priorityScore,
    scoreFactors: {
      base: baseScore,
      deadline: deadlineFactor,
      client: clientFactor,
      staleness: stalenessFactor,
      momentum: momentumFactor,
    },
    deadline: dateTime.toISOString(),
    timeRemaining,
    originalId: extractedDate.id,
    // Link to calendar view with this date highlighted
    // UPDATED (Feb 2026): /timeline → /calendar per Navigation Redesign
    href: `/calendar?date=${extractedDate.id}`,
    date: extractedDate.date,
  };
}

/**
 * Maps extracted date types to suggested actions.
 * NEW - Jan 2026: Helper for scoreExtractedDate.
 *
 * The suggested action helps users understand what they should do with the item.
 * Different date types have different natural actions.
 *
 * @param dateType - The type of extracted date
 * @returns Suggested action for the Hub UI
 */
function mapDateTypeToSuggestedAction(dateType: string): HubPriorityItem['suggestedAction'] {
  switch (dateType) {
    // Deadlines and payments require decisions/actions
    case 'deadline':
    case 'payment_due':
      return 'decide';

    // Appointments and events need attendance
    case 'appointment':
    case 'event':
      return 'attend';

    // Follow-ups suggest responding
    case 'follow_up':
      return 'respond';

    // Most other types just need review
    case 'birthday':
    case 'anniversary':
    case 'expiration':
    case 'reminder':
    case 'recurring':
    default:
      return 'review';
  }
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
