/**
 * Event Composite Weight Calculator
 *
 * Computes a dynamic 0.0–1.0 composite weight for events, used for sorting
 * and relevance display. Combines multiple signals into a single score.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WEIGHT COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Base Type Weight    (0.15) — From event type taxonomy defaults
 * 2. Commitment Boost    (0.20) — From commitment tier (confirmed > fyi)
 * 3. AI Relevance Score  (0.25) — From EventDetector relevanceScore, normalized
 * 4. Sender Weight       (0.15) — VIP/known contact boost
 * 5. Temporal Urgency    (0.10) — Approaching events get urgency boost
 * 6. Behavior Weight     (0.15) — Placeholder for future preference learning
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { computeCompositeWeight } from '@/services/events/composite-weight';
 *
 * const weight = computeCompositeWeight({
 *   eventType: 'community',
 *   commitmentLevel: 'suggested',
 *   relevanceScore: 7,
 *   isVipSender: false,
 *   isKnownContact: true,
 *   hasPriorExchange: false,
 *   eventDate: '2026-03-10',
 *   rsvpDeadline: '2026-03-08',
 * });
 *
 * console.log(weight); // 0.54
 * ```
 *
 * @module services/events/composite-weight
 * @version 1.0.0
 * @since March 2026
 */

import {
  EVENT_TYPE_WEIGHTS,
  COMMITMENT_BOOSTS,
  type EventType,
  type CommitmentLevel,
} from '@/services/analyzers/types';
import {
  getBehaviorWeightFromPreferences,
  type PreferenceCache,
  type EventSignals,
} from '@/services/events/preference-learning';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input signals for computing composite weight.
 */
export interface CompositeWeightInput {
  /** Event type from taxonomy */
  eventType?: EventType;
  /** Commitment level (AI-inferred or user-set) */
  commitmentLevel?: CommitmentLevel;
  /** AI relevance score (0-10) from EventDetector */
  relevanceScore?: number;
  /** Whether sender is a VIP contact */
  isVipSender?: boolean;
  /** Whether sender is a known contact */
  isKnownContact?: boolean;
  /** Whether there's been prior exchange with sender */
  hasPriorExchange?: boolean;
  /** Event date (YYYY-MM-DD) for temporal urgency */
  eventDate?: string;
  /** RSVP deadline (YYYY-MM-DD) for urgency boost */
  rsvpDeadline?: string;
  /** User is dismissed this event */
  isDismissed?: boolean;
  /** User's preference cache (from fetchUserPreferences). Enables personalized ranking. */
  preferenceCache?: PreferenceCache;
  /** Sender domain (e.g., 'meetup.com') for preference lookups */
  senderDomain?: string;
  /** Email category (e.g., 'community', 'work') for preference lookups */
  emailCategory?: string;
}

/**
 * Detailed breakdown of the composite weight components.
 * Useful for debugging and "why this ranking" explanations.
 */
export interface CompositeWeightBreakdown {
  /** Final composite weight (0.0–1.0) */
  compositeWeight: number;
  /** Individual component scores */
  components: {
    baseTypeWeight: number;
    commitmentBoost: number;
    relevanceScore: number;
    senderWeight: number;
    temporalUrgency: number;
    behaviorWeight: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT WEIGHTS (how much each signal matters)
// ═══════════════════════════════════════════════════════════════════════════════

const WEIGHTS = {
  baseType:    0.15,
  commitment:  0.20,
  relevance:   0.25,
  sender:      0.15,
  temporal:    0.10,
  behavior:    0.15,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT CALCULATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base type weight from event taxonomy.
 * Meetings = 0.9, webinars = 0.25, etc.
 */
function getBaseTypeWeight(eventType?: EventType): number {
  if (!eventType) return 0.5; // default for unclassified
  return EVENT_TYPE_WEIGHTS[eventType] ?? 0.5;
}

/**
 * Commitment boost from user's relationship to event.
 * Confirmed = 1.0, fyi = 0.15, etc.
 */
function getCommitmentBoost(commitmentLevel?: CommitmentLevel): number {
  if (!commitmentLevel) return COMMITMENT_BOOSTS.suggested; // default
  return COMMITMENT_BOOSTS[commitmentLevel] ?? COMMITMENT_BOOSTS.suggested;
}

/**
 * Normalize AI relevance score from 0-10 to 0.0-1.0.
 */
function getNormalizedRelevance(relevanceScore?: number): number {
  if (relevanceScore == null) return 0.5; // default mid-range
  return clamp(relevanceScore / 10);
}

/**
 * Sender weight based on VIP/contact status.
 */
function getSenderWeight(input: CompositeWeightInput): number {
  if (input.isVipSender) return 1.0;
  if (input.isKnownContact && input.hasPriorExchange) return 0.7;
  if (input.isKnownContact) return 0.5;
  return 0.1; // unknown sender
}

/**
 * Temporal urgency based on how close the event is.
 * Closer events = higher urgency. RSVP deadlines add extra boost.
 */
function getTemporalUrgency(input: CompositeWeightInput): number {
  if (!input.eventDate) return 0.3; // no date = moderate default

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(input.eventDate + 'T00:00:00');
  const daysUntil = Math.floor((eventDate.getTime() - today.getTime()) / 86400000);

  // Past events have zero urgency
  if (daysUntil < 0) return 0.0;

  let urgency = dateProximityToUrgency(daysUntil);

  // RSVP deadline approaching adds urgency
  if (input.rsvpDeadline) {
    const rsvpDate = new Date(input.rsvpDeadline + 'T00:00:00');
    const daysUntilRsvp = Math.floor((rsvpDate.getTime() - today.getTime()) / 86400000);
    if (daysUntilRsvp >= 0 && daysUntilRsvp <= 3) {
      urgency = clamp(urgency + 0.2);
    }
  }

  return urgency;
}

/**
 * Convert days-until-event to urgency score.
 */
function dateProximityToUrgency(daysLeft: number): number {
  if (daysLeft <= 0) return 1.0;
  if (daysLeft === 1) return 0.9;
  if (daysLeft <= 3) return 0.7;
  if (daysLeft <= 7) return 0.5;
  if (daysLeft <= 14) return 0.3;
  return 0.1;
}

/**
 * Behavior weight from preference learning (Phase 4).
 *
 * When a preferenceCache is provided, calculates personalized weight based on
 * accumulated dismiss/save patterns for the event's type, sender domain,
 * and email category. Without a cache, returns neutral 0.5.
 *
 * @param input - Composite weight input with optional preferenceCache
 * @returns Behavior weight (0.0–1.0), 0.5 = neutral
 */
function getBehaviorWeight(input: CompositeWeightInput): number {
  if (!input.preferenceCache) return 0.5;

  const signals: EventSignals = {
    eventType: input.eventType,
    senderDomain: input.senderDomain,
    emailCategory: input.emailCategory,
  };

  return getBehaviorWeightFromPreferences(input.preferenceCache, signals);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute composite weight for an event.
 *
 * Returns a single 0.0–1.0 score that combines:
 * - What kind of event it is (type taxonomy defaults)
 * - How committed the user is (confirmed > invited > suggested > fyi)
 * - How relevant the AI thinks it is (relevanceScore from detector)
 * - Who sent it (VIP > known contact > unknown)
 * - How soon it is (approaching events score higher)
 * - User behavior patterns (placeholder for future learning)
 *
 * @param input - Signal inputs for the event
 * @returns Composite weight (0.0–1.0)
 */
export function computeCompositeWeight(input: CompositeWeightInput): number {
  // Dismissed events always get 0
  if (input.isDismissed) return 0.0;

  const breakdown = computeCompositeWeightBreakdown(input);
  return breakdown.compositeWeight;
}

/**
 * Compute composite weight with full component breakdown.
 * Use this when you need to explain "why this ranking" to the user.
 *
 * @param input - Signal inputs for the event
 * @returns Detailed breakdown with per-component scores
 */
export function computeCompositeWeightBreakdown(input: CompositeWeightInput): CompositeWeightBreakdown {
  const components = {
    baseTypeWeight: getBaseTypeWeight(input.eventType),
    commitmentBoost: getCommitmentBoost(input.commitmentLevel),
    relevanceScore: getNormalizedRelevance(input.relevanceScore),
    senderWeight: getSenderWeight(input),
    temporalUrgency: getTemporalUrgency(input),
    behaviorWeight: getBehaviorWeight(input),
  };

  const compositeWeight = clamp(
    components.baseTypeWeight  * WEIGHTS.baseType +
    components.commitmentBoost * WEIGHTS.commitment +
    components.relevanceScore  * WEIGHTS.relevance +
    components.senderWeight    * WEIGHTS.sender +
    components.temporalUrgency * WEIGHTS.temporal +
    components.behaviorWeight  * WEIGHTS.behavior
  );

  return {
    compositeWeight: round(compositeWeight),
    components,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SORT COMPARATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sort comparator for events within a time group.
 * Sorts by: commitment tier first, then composite weight descending.
 *
 * This ensures confirmed events always appear above suggested events,
 * even if a suggested event has slightly higher composite weight.
 */
export const COMMITMENT_SORT_ORDER: Record<CommitmentLevel, number> = {
  confirmed: 0,
  invited:   1,
  suggested: 2,
  fyi:       3,
};

/**
 * Compare two events for sorting within a time group.
 * Primary: commitment tier (confirmed first)
 * Secondary: composite weight (higher first)
 * Tertiary: event date (sooner first)
 */
export function compareEvents(
  a: { commitmentLevel?: CommitmentLevel; compositeWeight?: number; date: string },
  b: { commitmentLevel?: CommitmentLevel; compositeWeight?: number; date: string },
): number {
  // Primary: commitment tier
  const aOrder = COMMITMENT_SORT_ORDER[a.commitmentLevel || 'suggested'];
  const bOrder = COMMITMENT_SORT_ORDER[b.commitmentLevel || 'suggested'];
  if (aOrder !== bOrder) return aOrder - bOrder;

  // Secondary: composite weight (higher first)
  const aWeight = a.compositeWeight ?? 0.5;
  const bWeight = b.compositeWeight ?? 0.5;
  if (aWeight !== bWeight) return bWeight - aWeight;

  // Tertiary: date (sooner first)
  return a.date.localeCompare(b.date);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
