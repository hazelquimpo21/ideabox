/**
 * Event Preference Learning Service
 *
 * Accumulates user signals (dismiss/maybe/save) to personalize event ranking.
 * Uses exponential moving average (EMA) with count-aware decay so early
 * signals have more impact and preferences stabilize over time.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOW IT WORKS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User takes action on an event (dismiss/maybe/save_to_calendar)
 * 2. updatePreferencesFromAction() extracts signals:
 *    - event_type (e.g., 'webinar', 'community')
 *    - sender_domain (e.g., 'meetup.com')
 *    - category (e.g., 'local', 'work')
 * 3. Each signal is upserted into user_event_preferences with EMA scoring
 * 4. getBehaviorWeightFromPreferences() reads cached preferences for ranking
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMA FORMULA
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * alpha = max(0.1, 1 / (total_count + 1))
 *   → First action: alpha=0.5, strong signal
 *   → After 10 actions: alpha=0.1, stable
 *
 * new_score = old_score * (1 - alpha) + action_weight * alpha
 *   → Action weights: saved_to_calendar=+1.0, maybe=+0.5, dismissed=-1.0
 *
 * @module services/events/preference-learning
 * @version 1.0.0
 * @since March 2026
 */

import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('PreferenceLearning');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type EventState = 'dismissed' | 'maybe' | 'saved_to_calendar';
type PreferenceType = 'event_type' | 'sender_domain' | 'category';

interface PreferenceRow {
  preference_type: string;
  preference_key: string;
  preference_score: number;
  positive_count: number;
  negative_count: number;
  total_count: number;
}

/**
 * Event metadata needed for preference signal extraction.
 */
export interface EventSignals {
  eventType?: string;
  senderDomain?: string;
  emailCategory?: string;
}

/**
 * In-memory cache of a user's preferences, keyed by "type:key".
 * Fetched once per request, used for all weight calculations.
 */
export type PreferenceCache = Map<string, number>;

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

const ACTION_WEIGHTS: Record<EventState, number> = {
  saved_to_calendar: 1.0,
  maybe: 0.5,
  dismissed: -1.0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE PATH: Update preferences on user action
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update user preferences based on an event state change.
 *
 * This is called as a side-effect in POST /api/events/[id]/state.
 * It's fire-and-forget — preference update failures should NOT block
 * the state change response.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @param state - The action taken (dismissed, maybe, saved_to_calendar)
 * @param signals - Event metadata for signal extraction
 */
export async function updatePreferencesFromAction(
  supabase: any,
  userId: string,
  state: EventState,
  signals: EventSignals
): Promise<void> {
  const actionWeight = ACTION_WEIGHTS[state];

  logger.debug('Updating preferences from action', {
    userId: userId.substring(0, 8),
    state,
    actionWeight,
    signals,
  });

  const updates: Array<{ type: PreferenceType; key: string }> = [];

  if (signals.eventType) {
    updates.push({ type: 'event_type', key: signals.eventType });
  }
  if (signals.senderDomain) {
    updates.push({ type: 'sender_domain', key: signals.senderDomain.toLowerCase() });
  }
  if (signals.emailCategory) {
    updates.push({ type: 'category', key: signals.emailCategory });
  }

  if (updates.length === 0) {
    logger.debug('No preference signals to update');
    return;
  }

  // Process each preference update
  for (const { type, key } of updates) {
    try {
      await upsertPreference(supabase, userId, type, key, actionWeight);
    } catch (err) {
      // Log but don't throw — preference updates are non-critical
      logger.warn('Failed to upsert preference', {
        type,
        key,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  logger.debug('Preferences updated', { count: updates.length });
}

/**
 * Upsert a single preference with EMA scoring.
 */
async function upsertPreference(
  supabase: any,
  userId: string,
  preferenceType: PreferenceType,
  preferenceKey: string,
  actionWeight: number
): Promise<void> {
  // Try to fetch existing preference
  const { data: existing, error: fetchError } = await supabase
    .from('user_event_preferences')
    .select('preference_score, positive_count, negative_count, total_count')
    .eq('user_id', userId)
    .eq('preference_type', preferenceType)
    .eq('preference_key', preferenceKey)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows — that's fine, we'll insert
    // Anything else (including table-not-found) is a real error
    if (fetchError.code === 'PGRST205' || fetchError.message?.includes('schema cache')) {
      logger.warn('user_event_preferences table not found — run migration 046');
      return;
    }
    throw fetchError;
  }

  const oldScore = existing?.preference_score ?? 0;
  const oldPositive = existing?.positive_count ?? 0;
  const oldNegative = existing?.negative_count ?? 0;
  const oldTotal = existing?.total_count ?? 0;

  // Count-aware decay: early signals have more impact
  const alpha = Math.max(0.1, 1 / (oldTotal + 1));
  const newScore = clamp(oldScore * (1 - alpha) + actionWeight * alpha, -1, 1);

  const isPositive = actionWeight > 0;
  const newPositive = oldPositive + (isPositive ? 1 : 0);
  const newNegative = oldNegative + (isPositive ? 0 : 1);
  const newTotal = oldTotal + 1;

  if (existing) {
    // Update existing preference
    const { error } = await supabase
      .from('user_event_preferences')
      .update({
        preference_score: round(newScore),
        positive_count: newPositive,
        negative_count: newNegative,
        total_count: newTotal,
      })
      .eq('user_id', userId)
      .eq('preference_type', preferenceType)
      .eq('preference_key', preferenceKey);

    if (error) throw error;
  } else {
    // Insert new preference
    const { error } = await supabase
      .from('user_event_preferences')
      .insert({
        user_id: userId,
        preference_type: preferenceType,
        preference_key: preferenceKey,
        preference_score: round(newScore),
        positive_count: newPositive,
        negative_count: newNegative,
        total_count: newTotal,
      });

    if (error) throw error;
  }

  logger.debug('Preference upserted', {
    type: preferenceType,
    key: preferenceKey,
    oldScore: round(oldScore),
    newScore: round(newScore),
    alpha: round(alpha),
    totalCount: newTotal,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ PATH: Fetch preferences for weight calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all preferences for a user in a single query.
 * Returns a cache map keyed by "type:key" → score.
 *
 * Call this ONCE per request, then pass to getBehaviorWeightFromPreferences()
 * for each event. This avoids N+1 queries.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID
 * @returns PreferenceCache map
 */
export async function fetchUserPreferences(
  supabase: any,
  userId: string
): Promise<PreferenceCache> {
  const cache: PreferenceCache = new Map();

  try {
    const { data, error } = await supabase
      .from('user_event_preferences')
      .select('preference_type, preference_key, preference_score')
      .eq('user_id', userId);

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        logger.debug('user_event_preferences table not found — returning empty cache');
        return cache;
      }
      throw error;
    }

    for (const row of (data || []) as PreferenceRow[]) {
      cache.set(`${row.preference_type}:${row.preference_key}`, row.preference_score);
    }

    logger.debug('User preferences loaded', {
      userId: userId.substring(0, 8),
      preferenceCount: cache.size,
    });
  } catch (err) {
    logger.warn('Failed to fetch user preferences', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  return cache;
}

/**
 * Calculate behavior weight for a single event using cached preferences.
 *
 * Combines event_type, sender_domain, and category preferences into a
 * single 0.0–1.0 score. Neutral (no data) returns 0.5.
 *
 * @param cache - User's preference cache (from fetchUserPreferences)
 * @param signals - Event's signals (eventType, senderDomain, emailCategory)
 * @returns Behavior weight (0.0–1.0)
 */
export function getBehaviorWeightFromPreferences(
  cache: PreferenceCache,
  signals: EventSignals
): number {
  // If no preferences exist, return neutral
  if (cache.size === 0) return 0.5;

  const typeScore = signals.eventType
    ? cache.get(`event_type:${signals.eventType}`) ?? 0
    : 0;

  const domainScore = signals.senderDomain
    ? cache.get(`sender_domain:${signals.senderDomain.toLowerCase()}`) ?? 0
    : 0;

  const categoryScore = signals.emailCategory
    ? cache.get(`category:${signals.emailCategory}`) ?? 0
    : 0;

  // Normalize each score from [-1,1] to [0,1]
  const normalize = (s: number) => (s + 1) / 2;

  // Weighted combination: event type matters most, then domain, then category
  const combined =
    normalize(typeScore) * 0.5 +
    normalize(domainScore) * 0.3 +
    normalize(categoryScore) * 0.2;

  return round(combined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
