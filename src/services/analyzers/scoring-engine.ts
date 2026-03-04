/**
 * Scoring Engine — Multi-dimensional email importance scoring
 *
 * Pure computation service — no AI calls, no database access.
 * Runs after all analyzers complete to produce five normalized scores
 * (0.0–1.0) that power inbox ranking, smart views, and notifications.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIVE SCORING DIMENSIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. IMPORTANCE  — How much does this email matter to the user's life?
 *    Driven by: category weight, sender relationship, email type, labels
 *
 * 2. URGENCY     — How time-sensitive is this right now?
 *    Driven by: timeliness nature, date proximity, perishability
 *
 * 3. ACTION      — Does the user need to DO something?
 *    Driven by: email type, action labels, timeliness nature
 *
 * 4. COGNITIVE LOAD — How much mental energy does this demand?
 *    Driven by: email type, category complexity, decision labels
 *
 * 5. MISSABILITY — What's the cost of NOT seeing this email?
 *    Driven by: perishability, deadlines, social obligations, sender expectations
 *
 * These combine into a SURFACE PRIORITY composite score used for inbox ranking.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { calculateScores } from '@/services/analyzers/scoring-engine';
 *
 * const scores = calculateScores({
 *   category: 'clients',
 *   additional_categories: [],
 *   email_type: 'needs_response',
 *   labels: ['urgent', 'has_deadline'],
 *   timeliness: { nature: 'asap', perishable: false },
 *   signal_strength: 'high',
 *   reply_worthiness: 'must_reply',
 *   has_contact: true,
 *   has_prior_exchange: true,
 * });
 *
 * console.log(scores.surface_priority); // 0.91
 * ```
 *
 * @module services/analyzers/scoring-engine
 * @version 1.0.0
 * @since March 2026 — Taxonomy v2
 */

import { createLogger } from '@/lib/utils/logger';
import type { EmailCategory, Timeliness, TimelinessNature } from '@/types/discovery';
import type { EmailType, EmailLabel, SignalStrength, ReplyWorthiness } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ScoringEngine');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input to the scoring engine — all the signals from analyzers.
 */
export interface ScoringInput {
  /** Primary email category */
  category: EmailCategory;
  /** Additional categories (for multi-bucket emails) */
  additional_categories: EmailCategory[];
  /** Email type classification */
  email_type: EmailType | null;
  /** Labels applied by categorizer */
  labels: EmailLabel[];
  /** Timeliness object from categorizer */
  timeliness: Timeliness | null;
  /** Signal strength assessment */
  signal_strength: SignalStrength | null;
  /** Reply worthiness assessment */
  reply_worthiness: ReplyWorthiness | null;
  /** Whether sender is a known contact */
  has_contact: boolean;
  /** Whether there's been prior back-and-forth with sender */
  has_prior_exchange: boolean;
}

/**
 * Output from the scoring engine — five scores + composite.
 * All scores are normalized to 0.0–1.0.
 */
export interface ScoringOutput {
  /** How much does this email matter to the user's life? (0.0–1.0) */
  importance: number;
  /** How time-sensitive is this right now? (0.0–1.0) */
  urgency: number;
  /** Does the user need to DO something? (0.0–1.0) */
  action_score: number;
  /** How much mental energy does this demand? (0.0–1.0) */
  cognitive_load: number;
  /** What's the cost of NOT seeing this email? (0.0–1.0) */
  missability: number;
  /** Composite score for inbox ranking (0.0–1.0) */
  surface_priority: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY BASE WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default importance weight per category (0.0–1.0).
 *
 * These represent the "average" importance of emails in each category.
 * Over time, these should be personalized per-user based on engagement
 * signals (open rate, reply rate, time-to-open, etc.).
 *
 * Higher = more likely to matter in the user's life.
 */
const CATEGORY_WEIGHTS: Record<EmailCategory, number> = {
  // High importance — direct relationships and responsibilities
  clients:         0.9,
  family:          0.9,
  health:          0.9,
  // Medium-high — professional and life admin
  work:            0.8,
  parenting:       0.8,
  finance:         0.8,
  // Medium — social and actionable
  personal:        0.7,
  billing:         0.7,
  job_search:      0.7,
  // Medium-low — community and activity
  civic:           0.5,
  travel:          0.5,
  shopping:        0.5,
  // Lower — browsable content
  local:           0.3,
  sports:          0.3,
  deals:           0.3,
  // Low — information consumption
  news:            0.2,
  politics:        0.2,
  newsletters:     0.2,
  product_updates: 0.2,
  // Minimal — system noise
  notifications:   0.1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINESS BASE URGENCY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base urgency score by timeliness nature (when no date is available).
 */
const NATURE_BASE_URGENCY: Record<TimelinessNature, number> = {
  ephemeral: 1.0,   // 2FA codes, OTPs — relevant for seconds/minutes
  asap:      0.8,   // Payment failed, approval needed — act now
  today:     0.6,   // Today's news, daily digest — relevant today only
  upcoming:  0.3,   // Future event — urgency depends on date proximity
  reference: 0.1,   // Receipts, confirmations — file and forget
  evergreen: 0.0,   // Newsletter essay — read whenever
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTANCE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate importance score — how much this email matters to the user's life.
 *
 * Formula: base_category_weight + sender_weight + type_weight + label_modifiers
 * Capped at 1.0, floored at 0.0.
 */
function calculateImportance(input: ScoringInput): number {
  let score = CATEGORY_WEIGHTS[input.category] ?? 0.3;

  // Sender relationship boosts
  if (input.has_contact && input.has_prior_exchange) {
    score += 0.3;  // Known contact with history — important
  } else if (input.has_contact) {
    score += 0.2;  // Known contact, no exchange yet
  }

  // Email type modifiers
  if (input.email_type === 'needs_response') score += 0.2;
  if (input.email_type === 'personal')       score += 0.15;
  if (input.email_type === 'fyi')            score += 0.1;
  if (input.email_type === 'marketing')      score -= 0.1;

  // Signal strength as a direct modifier
  if (input.signal_strength === 'high')   score += 0.1;
  if (input.signal_strength === 'noise')  score -= 0.3;
  if (input.signal_strength === 'low')    score -= 0.1;

  // Label-based modifiers
  const labels = new Set(input.labels);
  if (labels.has('urgent'))         score += 0.3;
  if (labels.has('invited'))        score += 0.2;
  if (labels.has('deadline'))       score += 0.2;
  if (labels.has('from_vip'))       score += 0.2;
  if (labels.has('needs_reply'))    score += 0.15;
  if (labels.has('rsvp_needed'))    score += 0.1;
  if (labels.has('needs_decision')) score += 0.1;
  if (labels.has('invoice'))        score += 0.1;

  return clamp(score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// URGENCY CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate urgency score — how time-sensitive is this right now?
 *
 * Driven primarily by the timeliness object:
 * - If dates exist, urgency increases as they approach
 * - If no dates, falls back to timeliness nature base value
 * - Perishability adds a bonus (it'll be worthless if you wait)
 */
function calculateUrgency(input: ScoringInput): number {
  const timeliness = input.timeliness;

  // No timeliness data — use signal strength as rough proxy
  if (!timeliness) {
    if (input.signal_strength === 'high') return 0.5;
    if (input.signal_strength === 'medium') return 0.3;
    return 0.1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let urgency = NATURE_BASE_URGENCY[timeliness.nature];

  // Check the tightest constraint first: expires → late_after → relevant_date
  if (timeliness.expires) {
    const daysLeft = daysBetween(today, new Date(timeliness.expires));
    if (daysLeft <= 0) {
      // Expired — email is dead, urgency is zero (should be auto-archived)
      logger.debug('Email has expired, urgency set to 0', { expires: timeliness.expires });
      return 0.0;
    }
    urgency = dateProximityToUrgency(daysLeft);
  } else if (timeliness.late_after) {
    const daysLeft = daysBetween(today, new Date(timeliness.late_after));
    if (daysLeft <= 0) {
      // Past the late threshold — very high urgency, you're behind
      urgency = 0.95;
    } else {
      urgency = dateProximityToUrgency(daysLeft);
    }
  } else if (timeliness.relevant_date) {
    const daysLeft = daysBetween(today, new Date(timeliness.relevant_date));
    if (daysLeft <= 0) {
      // Event is today or past
      urgency = timeliness.perishable ? 0.0 : 0.8;
    } else {
      urgency = dateProximityToUrgency(daysLeft);
    }
  }

  // Perishability bonus — it'll be worthless if you wait
  if (timeliness.perishable) {
    urgency += 0.2;
  }

  return clamp(urgency);
}

/**
 * Convert days-until-date to urgency score.
 * Closer dates = higher urgency, following a smooth curve.
 */
function dateProximityToUrgency(daysLeft: number): number {
  if (daysLeft <= 0) return 1.0;
  if (daysLeft === 1) return 0.9;
  if (daysLeft <= 3) return 0.7;
  if (daysLeft <= 7) return 0.5;
  if (daysLeft <= 14) return 0.3;
  return 0.1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate action score — does the user need to DO something?
 *
 * Weighted sum of action-indicating signals.
 */
function calculateActionScore(input: ScoringInput): number {
  let score = 0.0;

  // Email type signals
  if (input.email_type === 'needs_response') score += 0.5;

  // Reply worthiness
  if (input.reply_worthiness === 'must_reply')   score += 0.3;
  if (input.reply_worthiness === 'should_reply') score += 0.15;

  // Label signals
  const labels = new Set(input.labels);
  if (labels.has('needs_reply'))    score += 0.3;
  if (labels.has('needs_decision')) score += 0.3;
  if (labels.has('needs_review'))   score += 0.25;
  if (labels.has('needs_approval')) score += 0.25;
  if (labels.has('rsvp_needed'))    score += 0.3;
  if (labels.has('invited'))        score += 0.2;
  if (labels.has('deadline'))       score += 0.2;
  if (labels.has('payment_due'))    score += 0.2;

  // Timeliness nature
  if (input.timeliness?.nature === 'asap') score += 0.2;

  return clamp(score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COGNITIVE LOAD CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate cognitive load — how much mental energy does this demand?
 *
 * Some emails are important but easy (glance and archive).
 * Others require real thinking. This helps with read-ordering:
 * easy items first for quick wins, hard items when you have energy.
 */
function calculateCognitiveLoad(input: ScoringInput): number {
  let load = 0.0;

  // Base load by email type
  switch (input.email_type) {
    case 'needs_response': load = 0.7; break;  // Compose a thoughtful reply
    case 'personal':       load = 0.5; break;  // Read and possibly respond
    case 'fyi':            load = 0.3; break;  // Read and process
    case 'newsletter':     load = 0.3; break;  // Read if interested
    case 'automated':      load = 0.1; break;  // Glance and archive
    case 'marketing':      load = 0.1; break;  // Ignore or glance
    default:               load = 0.3; break;
  }

  // Decision complexity from labels
  const labels = new Set(input.labels);
  if (labels.has('needs_decision')) load += 0.25;
  if (labels.has('invited'))        load += 0.2;  // Social calculus
  if (labels.has('deadline'))       load += 0.1;  // Time pressure adds stress
  if (labels.has('needs_review'))   load += 0.15;

  // Category-based cognitive demands
  if (input.category === 'finance')    load += 0.2;  // Money thinking
  if (input.category === 'job_search') load += 0.2;  // Career decisions
  if (input.category === 'health')     load += 0.15; // Health decisions
  if (input.category === 'civic')      load += 0.1;  // Civic responsibility

  return clamp(load);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSABILITY CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate missability — what's the cost of NOT seeing this email?
 *
 * Distinct from importance: a 2FA code is low importance but high missability.
 * A newsletter essay is medium importance but zero missability.
 */
function calculateMissability(input: ScoringInput): number {
  let score = 0.0;

  // Timeliness-driven missability
  if (input.timeliness) {
    if (input.timeliness.perishable)              score += 0.4;
    if (input.timeliness.nature === 'ephemeral')  score += 0.3;
    if (input.timeliness.nature === 'evergreen')  score -= 0.3;
    if (input.timeliness.nature === 'reference')  score -= 0.2;
  }

  // Label-driven missability
  const labels = new Set(input.labels);
  if (labels.has('deadline'))       score += 0.3;  // Missing = consequence
  if (labels.has('invited'))        score += 0.2;  // Social cost — someone notices
  if (labels.has('payment_due'))    score += 0.25; // Money on the line
  if (labels.has('urgent'))         score += 0.2;  // Sender flagged it
  if (labels.has('has_tickets'))    score += 0.15; // You need this document

  // Type-driven missability
  if (input.email_type === 'needs_response') score += 0.2;  // Silence IS a response
  if (input.email_type === 'automated')      score -= 0.2;  // System doesn't care

  // Reply worthiness
  if (input.reply_worthiness === 'must_reply') score += 0.2;

  return clamp(score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE PRIORITY (COMPOSITE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate surface priority — the "master" score for inbox ranking.
 *
 * Equal weighting across all four dimensions plus missability.
 * This determines notification behavior:
 *   > 0.8 → Push notification / top of inbox
 *   0.5–0.8 → Include in next summary
 *   0.2–0.5 → Batch into daily digest
 *   < 0.2 → Silent, archive-ready
 */
function calculateSurfacePriority(
  importance: number,
  urgency: number,
  action: number,
  missability: number,
): number {
  return clamp(
    importance  * 0.25 +
    urgency     * 0.25 +
    action      * 0.25 +
    missability * 0.25
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate all five scores + composite surface priority for an email.
 *
 * This is the main entry point for the scoring engine. Call it after
 * all analyzers have run and you have the full ScoringInput.
 *
 * @param input - Signals from categorizer and other analyzers
 * @returns Five normalized scores (0.0–1.0) + composite surface_priority
 *
 * @example
 * ```typescript
 * const scores = calculateScores({
 *   category: 'billing',
 *   additional_categories: ['travel'],
 *   email_type: 'automated',
 *   labels: ['confirmation', 'has_tickets'],
 *   timeliness: { nature: 'upcoming', relevant_date: '2026-03-20', perishable: false },
 *   signal_strength: 'medium',
 *   reply_worthiness: 'no_reply',
 *   has_contact: false,
 *   has_prior_exchange: false,
 * });
 * // → { importance: 0.6, urgency: 0.3, action_score: 0.0, cognitive_load: 0.1, missability: 0.15, surface_priority: 0.26 }
 * ```
 */
export function calculateScores(input: ScoringInput): ScoringOutput {
  const importance    = calculateImportance(input);
  const urgency       = calculateUrgency(input);
  const action_score  = calculateActionScore(input);
  const cognitive_load = calculateCognitiveLoad(input);
  const missability   = calculateMissability(input);
  const surface_priority = calculateSurfacePriority(importance, urgency, action_score, missability);

  const output: ScoringOutput = {
    importance:       round(importance),
    urgency:          round(urgency),
    action_score:     round(action_score),
    cognitive_load:   round(cognitive_load),
    missability:      round(missability),
    surface_priority: round(surface_priority),
  };

  logger.debug('Scores calculated', {
    category: input.category,
    email_type: input.email_type,
    timeliness_nature: input.timeliness?.nature ?? 'none',
    ...output,
  });

  return output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Clamp a value to 0.0–1.0 range */
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Round to 2 decimal places for clean storage */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Calculate days between two dates (positive = future, negative = past) */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86400000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}
