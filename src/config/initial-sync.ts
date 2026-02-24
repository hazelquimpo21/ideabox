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

  /**
   * Maximum emails to fetch from Gmail.
   * INCREASED (Feb 2026): Was 50, now 100 to reduce missed emails during onboarding.
   * Users with active inboxes often have 50+ emails in the last few days alone.
   * The pre-filter system skips ~20-30% without AI, so 100 fetched ≈ 70-80 analyzed.
   */
  maxEmails: parseInt(process.env.INITIAL_SYNC_MAX_EMAILS || '100', 10),

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

  /** Timeout for entire sync operation (4 minutes — increased for 100 email default) */
  timeoutMs: 240000,

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
/**
 * Email address patterns that should skip AI analysis during initial sync pre-filter.
 *
 * REFINED (Feb 2026): Removed noreply@, notifications@, and alerts@ from skip list.
 * These senders often send important emails (shipping confirmations, payment receipts,
 * appointment reminders) that the AI should still categorize. The AI will classify
 * them as notifications/shopping/finance appropriately.
 *
 * Only truly worthless system emails are skipped:
 */
export const SKIP_SENDER_PATTERNS: RegExp[] = [
  // System addresses that never contain useful content
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce@/i,
  /^auto@/i,
  /^automated@/i,
  /^do-?not-?reply@.*\.noreply\./i, // Double noreply patterns (truly automated)
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
  // Newsletters - Creator (substacks, digests, curated content)
  // ─────────────────────────────────────────────────────────────────────────
  'substack.com': 'newsletters_creator',
  'substackinc.com': 'newsletters_creator',
  'medium.com': 'newsletters_creator',
  'morningbrew.com': 'newsletters_creator',
  'thehustle.co': 'newsletters_creator',
  'ycombinator.com': 'newsletters_creator', // HN digest

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
  'calendar.google.com': 'work',
  'outlook.live.com': 'work',

  // ─────────────────────────────────────────────────────────────────────────
  // Product Updates - Social (notifications from social platforms)
  // ─────────────────────────────────────────────────────────────────────────
  'linkedin.com': 'work', // Professional network
  'quora.com': 'newsletters_creator',
  'pinterest.com': 'personal_friends_family',
  'twitter.com': 'newsletters_creator',
  'x.com': 'newsletters_creator',
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

  // Newsletters - Creator
  newsletter: 'newsletters_creator',
  newsletters: 'newsletters_creator',
  digest: 'newsletters_creator',
  weekly: 'newsletters_creator',
  daily: 'newsletters_creator',
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
  newsletters_creator: {
    empty: 'No newsletters',
    singular: '1 newsletter',
    plural: (count) => `${count} newsletters and digests`,
  },
  newsletters_industry: {
    empty: 'No industry newsletters',
    singular: '1 industry newsletter',
    plural: (count) => `${count} industry newsletters`,
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
  family: {
    empty: 'No family emails',
    singular: '1 family email',
    plural: (count) => `${count} family emails`,
  },
  clients: {
    empty: 'No client emails',
    singular: '1 client email',
    plural: (count, urgentCount) =>
      urgentCount && urgentCount > 0
        ? `${count} client emails (${urgentCount} need attention)`
        : `${count} client emails`,
  },
  work: {
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
