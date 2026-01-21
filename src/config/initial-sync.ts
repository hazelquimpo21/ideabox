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

  /**
   * Gmail query to exclude unwanted mail.
   * By not specifying labelIds, we fetch from "All Mail" instead of just INBOX.
   * This query excludes spam, trash, and drafts.
   */
  excludeQuery: '-in:spam -in:trash -in:draft',

  /** Gmail labels to exclude from fetch (legacy - now using excludeQuery) */
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
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 *
 * These are high-confidence patterns that rarely need AI analysis.
 * User-specific patterns are stored in user_profiles.sender_patterns.
 */
export const AUTO_CATEGORIZE_DOMAINS: Record<string, EmailCategory> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Shopping (orders, shipping, retail promos)
  // ─────────────────────────────────────────────────────────────────────────
  'amazon.com': 'shopping',
  'marketing.amazon.com': 'shopping',
  'target.com': 'shopping',
  'walmart.com': 'shopping',
  'bestbuy.com': 'shopping',
  'kohls.com': 'shopping',
  'macys.com': 'shopping',
  'nordstrom.com': 'shopping',
  'gap.com': 'shopping',
  'oldnavy.com': 'shopping',
  'bananarepublic.com': 'shopping',
  'etsy.com': 'shopping',
  'ebay.com': 'shopping',
  'wish.com': 'shopping',
  'aliexpress.com': 'shopping',
  'groupon.com': 'shopping',
  'retailmenot.com': 'shopping',
  'usps.com': 'shopping',
  'ups.com': 'shopping',
  'fedex.com': 'shopping',
  'dhl.com': 'shopping',

  // ─────────────────────────────────────────────────────────────────────────
  // Newsletters - General (substacks, digests, curated content)
  // ─────────────────────────────────────────────────────────────────────────
  'substack.com': 'newsletters_general',
  'substackinc.com': 'newsletters_general',
  'medium.com': 'newsletters_general',
  'morningbrew.com': 'newsletters_general',
  'thehustle.co': 'newsletters_general',
  'ycombinator.com': 'newsletters_general', // HN digest

  // ─────────────────────────────────────────────────────────────────────────
  // News & Politics
  // ─────────────────────────────────────────────────────────────────────────
  'axios.com': 'news_politics',
  'thedailybeast.com': 'news_politics',
  'nytimes.com': 'news_politics',
  'washingtonpost.com': 'news_politics',
  'wsj.com': 'news_politics',
  'bloomberg.com': 'news_politics',

  // ─────────────────────────────────────────────────────────────────────────
  // Product Updates (tech, services you use)
  // ─────────────────────────────────────────────────────────────────────────
  'techcrunch.com': 'product_updates',
  'theverge.com': 'product_updates',
  'wired.com': 'product_updates',

  // ─────────────────────────────────────────────────────────────────────────
  // Finance (payments, banking, investments)
  // ─────────────────────────────────────────────────────────────────────────
  'paypal.com': 'finance',
  'venmo.com': 'finance',
  'stripe.com': 'finance',
  'square.com': 'finance',
  'intuit.com': 'finance',
  'turbotax.com': 'finance',
  'chase.com': 'finance',
  'bankofamerica.com': 'finance',
  'wellsfargo.com': 'finance',
  'capitalone.com': 'finance',
  'discover.com': 'finance',
  'americanexpress.com': 'finance',
  'citi.com': 'finance',
  'irs.gov': 'finance',

  // ─────────────────────────────────────────────────────────────────────────
  // Local (community, events, neighborhood)
  // Note: Events are now tracked via has_event label, category is life-bucket
  // ─────────────────────────────────────────────────────────────────────────
  'eventbrite.com': 'local',
  'meetup.com': 'local',
  'evite.com': 'local',
  'paperlesspost.com': 'local',
  'calendar.google.com': 'business_work_general',
  'outlook.live.com': 'business_work_general',

  // ─────────────────────────────────────────────────────────────────────────
  // Product Updates - Social (notifications from social platforms)
  // ─────────────────────────────────────────────────────────────────────────
  'linkedin.com': 'business_work_general', // Professional network
  'quora.com': 'newsletters_general',
  'pinterest.com': 'personal_friends_family',
  'twitter.com': 'newsletters_general',
  'x.com': 'newsletters_general',
  'facebook.com': 'personal_friends_family',
  'facebookmail.com': 'personal_friends_family',
  'instagram.com': 'personal_friends_family',
  'tiktok.com': 'personal_friends_family',
};

/**
 * Email address prefixes that indicate auto-categorization.
 * Key: prefix pattern, Value: category
 *
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 *
 * Matches the local part of email (before @).
 */
export const AUTO_CATEGORIZE_PREFIXES: Record<string, EmailCategory> = {
  // Shopping (orders, receipts, shipping)
  receipt: 'shopping',
  receipts: 'shopping',
  order: 'shopping',
  orders: 'shopping',
  shipping: 'shopping',
  shipment: 'shopping',
  tracking: 'shopping',
  confirmation: 'shopping',
  confirm: 'shopping',

  // Finance (billing, payments, invoices)
  invoice: 'finance',
  billing: 'finance',
  payment: 'finance',

  // Newsletters - General
  newsletter: 'newsletters_general',
  newsletters: 'newsletters_general',
  digest: 'newsletters_general',
  weekly: 'newsletters_general',
  daily: 'newsletters_general',
  update: 'product_updates',
  updates: 'product_updates',

  // Shopping (promos, deals)
  promo: 'shopping',
  promos: 'shopping',
  promotions: 'shopping',
  deals: 'shopping',
  sale: 'shopping',
  sales: 'shopping',
  offer: 'shopping',
  offers: 'shopping',
  marketing: 'shopping',
  discount: 'shopping',
};

// =============================================================================
// CATEGORY INSIGHTS TEMPLATES
// =============================================================================

/**
 * Templates for generating category insights.
 * Used by the discovery builder to create human-readable insights.
 *
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
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
  newsletters_general: {
    empty: 'No newsletters',
    singular: '1 newsletter',
    plural: (count) => `${count} newsletters and digests`,
  },
  news_politics: {
    empty: 'No news updates',
    singular: '1 news update',
    plural: (count) => `${count} news and politics updates`,
  },
  product_updates: {
    empty: 'No product updates',
    singular: '1 product update',
    plural: (count) => `${count} product updates`,
  },
  local: {
    empty: 'No local updates',
    singular: '1 local event or update',
    plural: (count) => `${count} local events and updates`,
  },
  shopping: {
    empty: 'No shopping emails',
    singular: '1 shopping email',
    plural: (count) => `${count} orders, shipping, and deals`,
  },
  travel: {
    empty: 'No travel emails',
    singular: '1 travel email',
    plural: (count) => `${count} travel confirmations and updates`,
  },
  finance: {
    empty: 'No finance emails',
    singular: '1 finance email',
    plural: (count) => `${count} bills, payments, and statements`,
  },
  family_kids_school: {
    empty: 'No school emails',
    singular: '1 school or kids email',
    plural: (count) => `${count} school and kids emails`,
  },
  family_health_appointments: {
    empty: 'No health emails',
    singular: '1 health appointment',
    plural: (count) => `${count} health and appointment emails`,
  },
  client_pipeline: {
    empty: 'No client emails',
    singular: '1 client email',
    plural: (count, urgentCount) =>
      urgentCount && urgentCount > 0
        ? `${count} client emails (${urgentCount} need attention)`
        : `${count} client emails`,
  },
  business_work_general: {
    empty: 'No work emails',
    singular: '1 work email',
    plural: (count) => `${count} work and business emails`,
  },
  personal_friends_family: {
    empty: 'No personal emails',
    singular: '1 personal email',
    plural: (count) => `${count} personal emails`,
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
