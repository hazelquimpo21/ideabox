/**
 * Initial Sync Configuration
 *
 * Configuration settings for the initial email batch analysis
 * that runs when a user first connects their Gmail account.
 *
 * @module config/initial-sync
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md
 */

import type { InitialSyncConfig, EmailCategory } from '@/types/discovery';

// =============================================================================
// MAIN CONFIGURATION
// =============================================================================

/**
 * Default configuration for initial sync.
 * Can be overridden via environment variables or request parameters.
 */
export const INITIAL_SYNC_CONFIG: InitialSyncConfig = {
  // ─────────────────────────────────────────────────────────────────────────
  // Email Fetching
  // ─────────────────────────────────────────────────────────────────────────

  /** Maximum emails to fetch from Gmail */
  maxEmails: parseInt(process.env.INITIAL_SYNC_MAX_EMAILS || '50', 10),

  /** Include already-read emails (true gives better demo experience) */
  includeRead: true,

  /** Gmail labels to exclude from fetch */
  excludeLabels: ['SPAM', 'TRASH', 'DRAFT'],

  // ─────────────────────────────────────────────────────────────────────────
  // Processing
  // ─────────────────────────────────────────────────────────────────────────

  /** Batch size for parallel AI processing */
  batchSize: 10,

  /** Max retries per email within same sync */
  maxRetries: 2,

  /** Timeout for entire sync operation (2 minutes) */
  timeoutMs: 120000,

  // ─────────────────────────────────────────────────────────────────────────
  // Progress Updates
  // ─────────────────────────────────────────────────────────────────────────

  /** How often to update progress in database (ms) */
  progressUpdateIntervalMs: 1000,

  // ─────────────────────────────────────────────────────────────────────────
  // Token Optimization
  // ─────────────────────────────────────────────────────────────────────────

  /** Confidence threshold to skip AI analysis (0-1) */
  skipAIThreshold: 0.95,

  /** Max similar emails to analyze per sender domain */
  maxSimilarEmailsToAnalyze: 2,
};

// =============================================================================
// PRE-FILTER RULES
// =============================================================================

/**
 * Email address patterns that should skip AI analysis.
 * These are typically automated senders with predictable content.
 */
export const SKIP_SENDER_PATTERNS: RegExp[] = [
  // No-reply addresses
  /^no-?reply@/i,
  /^noreply@/i,
  /^do-?not-?reply@/i,

  // System addresses
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce@/i,
  /^notifications?@/i,

  // Common automated senders
  /^alerts?@/i,
  /^auto@/i,
  /^automated@/i,
];

/**
 * Domains that can be auto-categorized without AI.
 * Key: domain (lowercase), Value: category
 *
 * These are high-confidence patterns that rarely need AI analysis.
 * User-specific patterns are stored in user_profiles.sender_patterns.
 */
export const AUTO_CATEGORIZE_DOMAINS: Record<string, EmailCategory> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Promotional (promo)
  // ─────────────────────────────────────────────────────────────────────────
  'amazon.com': 'promo',
  'marketing.amazon.com': 'promo',
  'target.com': 'promo',
  'walmart.com': 'promo',
  'bestbuy.com': 'promo',
  'kohls.com': 'promo',
  'macys.com': 'promo',
  'nordstrom.com': 'promo',
  'gap.com': 'promo',
  'oldnavy.com': 'promo',
  'bananarepublic.com': 'promo',
  'etsy.com': 'promo',
  'ebay.com': 'promo',
  'wish.com': 'promo',
  'aliexpress.com': 'promo',
  'groupon.com': 'promo',
  'retailmenot.com': 'promo',

  // ─────────────────────────────────────────────────────────────────────────
  // Newsletters (newsletter)
  // ─────────────────────────────────────────────────────────────────────────
  'substack.com': 'newsletter',
  'substackinc.com': 'newsletter',
  'medium.com': 'newsletter',
  'morningbrew.com': 'newsletter',
  'thehustle.co': 'newsletter',
  'axios.com': 'newsletter',
  'thedailybeast.com': 'newsletter',
  'nytimes.com': 'newsletter',
  'washingtonpost.com': 'newsletter',
  'wsj.com': 'newsletter',
  'bloomberg.com': 'newsletter',
  'techcrunch.com': 'newsletter',
  'theverge.com': 'newsletter',
  'wired.com': 'newsletter',
  'ycombinator.com': 'newsletter', // HN digest

  // ─────────────────────────────────────────────────────────────────────────
  // Admin (receipts, confirmations, notifications)
  // ─────────────────────────────────────────────────────────────────────────
  'paypal.com': 'admin',
  'venmo.com': 'admin',
  'stripe.com': 'admin',
  'square.com': 'admin',
  'intuit.com': 'admin',
  'turbotax.com': 'admin',
  'chase.com': 'admin',
  'bankofamerica.com': 'admin',
  'wellsfargo.com': 'admin',
  'capitalone.com': 'admin',
  'discover.com': 'admin',
  'americanexpress.com': 'admin',
  'citi.com': 'admin',
  'usps.com': 'admin',
  'ups.com': 'admin',
  'fedex.com': 'admin',
  'dhl.com': 'admin',
  'irs.gov': 'admin',

  // ─────────────────────────────────────────────────────────────────────────
  // Events (event)
  // ─────────────────────────────────────────────────────────────────────────
  'eventbrite.com': 'event',
  'meetup.com': 'event',
  'evite.com': 'event',
  'paperlesspost.com': 'event',
  'calendar.google.com': 'event',
  'outlook.live.com': 'event',

  // ─────────────────────────────────────────────────────────────────────────
  // Noise (low value, safe to ignore)
  // ─────────────────────────────────────────────────────────────────────────
  'linkedin.com': 'noise', // Most LinkedIn emails are low-value
  'quora.com': 'noise',
  'pinterest.com': 'noise',
  'twitter.com': 'noise', // Notifications
  'x.com': 'noise',
  'facebook.com': 'noise',
  'facebookmail.com': 'noise',
  'instagram.com': 'noise',
  'tiktok.com': 'noise',
};

/**
 * Email address prefixes that indicate auto-categorization.
 * Key: prefix pattern, Value: category
 *
 * Matches the local part of email (before @).
 */
export const AUTO_CATEGORIZE_PREFIXES: Record<string, EmailCategory> = {
  receipt: 'admin',
  receipts: 'admin',
  order: 'admin',
  orders: 'admin',
  shipping: 'admin',
  shipment: 'admin',
  tracking: 'admin',
  confirmation: 'admin',
  confirm: 'admin',
  invoice: 'admin',
  billing: 'admin',
  payment: 'admin',

  newsletter: 'newsletter',
  newsletters: 'newsletter',
  digest: 'newsletter',
  weekly: 'newsletter',
  daily: 'newsletter',
  update: 'newsletter',
  updates: 'newsletter',

  promo: 'promo',
  promos: 'promo',
  promotions: 'promo',
  deals: 'promo',
  sale: 'promo',
  sales: 'promo',
  offer: 'promo',
  offers: 'promo',
  marketing: 'promo',
  discount: 'promo',
};

// =============================================================================
// CATEGORY INSIGHTS TEMPLATES
// =============================================================================

/**
 * Templates for generating category insights.
 * Used by the discovery builder to create human-readable insights.
 */
export const CATEGORY_INSIGHT_TEMPLATES: Record<
  EmailCategory,
  {
    /** Template when count is 0 */
    empty: string;
    /** Template for singular item */
    singular: string;
    /** Template for multiple items */
    plural: (count: number, urgentCount?: number) => string;
  }
> = {
  action_required: {
    empty: 'No action items found',
    singular: '1 email needs your attention',
    plural: (count, urgentCount) =>
      urgentCount && urgentCount > 0
        ? `${count} emails need attention (${urgentCount} urgent)`
        : `${count} emails need your attention`,
  },
  event: {
    empty: 'No events detected',
    singular: '1 event invitation found',
    plural: (count) => `${count} events and invitations`,
  },
  newsletter: {
    empty: 'No newsletters',
    singular: '1 newsletter',
    plural: (count) => `${count} newsletters and digests`,
  },
  promo: {
    empty: 'No promotional emails',
    singular: '1 promotional email',
    plural: (count) => `${count} promotional emails`,
  },
  admin: {
    empty: 'No admin emails',
    singular: '1 receipt or confirmation',
    plural: (count) => `${count} receipts and confirmations`,
  },
  personal: {
    empty: 'No personal emails',
    singular: '1 personal email',
    plural: (count) => `${count} personal emails`,
  },
  noise: {
    empty: 'No noise detected',
    singular: '1 low-priority email',
    plural: (count) => `${count} low-priority emails (safe to archive)`,
  },
};

// =============================================================================
// SUGGESTED ACTION THRESHOLDS
// =============================================================================

/**
 * Thresholds for generating suggested actions.
 */
export const SUGGESTED_ACTION_THRESHOLDS = {
  /** Minimum promo/noise emails to suggest bulk archive */
  archiveCategoryMinCount: 5,

  /** Minimum urgency score to highlight as urgent */
  urgentUrgencyScore: 7,

  /** Minimum emails from unknown business sender to suggest adding as client */
  newClientMinEmails: 2,
};

// =============================================================================
// PROGRESS STEP MESSAGES
// =============================================================================

/**
 * Human-readable messages for each sync step.
 * Shown in the loading screen during initial sync.
 */
export const SYNC_STEP_MESSAGES = {
  starting: 'Starting sync...',
  connecting: 'Connecting to Gmail...',
  fetching: 'Fetching your recent emails...',
  preFiltering: 'Preparing emails for analysis...',
  analyzing: (current: number, total: number) =>
    `Analyzing emails... (${current}/${total})`,
  buildingSummary: 'Building your email summary...',
  detectingClients: 'Detecting clients and contacts...',
  generatingActions: 'Generating quick actions...',
  finishing: 'Finishing up...',
  complete: 'Complete!',
  failed: 'Sync failed',
};

// =============================================================================
// EXPORTS
// =============================================================================

export default INITIAL_SYNC_CONFIG;
