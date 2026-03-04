/**
 * Discovery Dashboard Types
 *
 * Type definitions for the initial email batch analysis and Discovery Dashboard feature.
 * These types define the contract between:
 * - Backend sync services → API routes
 * - API routes → Frontend components
 *
 * @module types/discovery
 * @see docs/DISCOVERY_DASHBOARD_PLAN.md for full specification
 */

// =============================================================================
// EMAIL CATEGORIES
// =============================================================================

/**
 * All possible email categories in IdeaBox (20 life-bucket categories).
 * Categories represent different areas of the user's life, not actions.
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
 * REFACTORED (Feb 2026): Renamed client_pipeline→clients, business_work_general→work,
 *   merged family_kids_school+family_health_appointments→family,
 *   split newsletters_general→newsletters_creator+newsletters_industry.
 * REFACTORED (Mar 2026 — Taxonomy v2): Expanded from 13 → 20 categories.
 *   Renamed: personal_friends_family→personal
 *   Split: news_politics→news+politics, family→family+parenting+health
 *   Merged: newsletters_creator+newsletters_industry→newsletters
 *   New: job_search, parenting, health, billing, deals, civic, sports
 *
 * The AI analyzer uses human-eye inference to categorize — it considers sender
 * context, domain patterns, and content to make smart categorization decisions.
 */
export type EmailCategory =
  // ── Work & Professional ──────────────────────────────────────────────────
  | 'clients'           // Direct client work, billable relationships
  | 'work'              // Professional non-client (team, internal, industry)
  | 'job_search'        // Applications, recruiters, interviews, offers
  // ── People & Relationships ───────────────────────────────────────────────
  | 'personal'          // Friends, social relationships, adult hobbies/clubs
  | 'family'            // Family relationships, personal family matters
  | 'parenting'         // Kids: school, childcare, pediatrician, extracurriculars, tutors
  // ── Life Admin ───────────────────────────────────────────────────────────
  | 'health'            // Medical, dental, prescriptions, insurance EOBs, vet
  | 'finance'           // Banking, investments, tax, financial planning
  | 'billing'           // Receipts, subscriptions, autopay, bills, payment failures
  | 'travel'            // Flights, hotels, bookings, trip planning
  | 'shopping'          // Orders, shipping, returns, tracking
  | 'deals'             // Sales, discounts, coupons, limited-time offers
  // ── Community & Civic ────────────────────────────────────────────────────
  | 'local'             // Community, neighborhood, local businesses/events
  | 'civic'             // Government, council, school board, HOA, voting
  | 'sports'            // Fan sports: scores, fantasy, team updates (NOT kids sports)
  // ── Information ──────────────────────────────────────────────────────────
  | 'news'              // News outlets, current events, breaking news
  | 'politics'          // Political news, campaigns, policy
  | 'newsletters'       // Substacks, digests, curated content
  | 'product_updates'   // SaaS tools, release notes, changelogs
  // ── System ───────────────────────────────────────────────────────────────
  | 'notifications';    // Verification codes, OTPs, 2FA, login alerts

/**
 * Array of all valid email categories.
 * Single source of truth — use this for validation and iteration.
 *
 * ADDED (Jan 2026): For Discover-first architecture.
 * EXPANDED (Mar 2026): 13 → 20 categories.
 */
export const EMAIL_CATEGORIES: EmailCategory[] = [
  'clients',
  'work',
  'job_search',
  'personal',
  'family',
  'parenting',
  'health',
  'finance',
  'billing',
  'travel',
  'shopping',
  'deals',
  'local',
  'civic',
  'sports',
  'news',
  'politics',
  'newsletters',
  'product_updates',
  'notifications',
] as const;

/**
 * Timeliness nature values — how the email relates to time.
 *
 * This is a key dimension of the taxonomy v2 scoring system.
 * Each email has a temporal character that determines how urgently
 * it should be surfaced and when it becomes stale.
 *
 * @since March 2026 — Taxonomy v2
 */
export const TIMELINESS_NATURES = [
  'ephemeral',   // Relevant for minutes (2FA codes, OTPs)
  'today',       // Relevant today, stale soon (daily news, scores, daily deals)
  'upcoming',    // Points to a future moment (events, flights, deadlines)
  'asap',        // Needs action now, not tied to a moment (payment failed, approval needed)
  'reference',   // File it, retrieve later (receipts, confirmations, tickets)
  'evergreen',   // No time pressure (newsletter essays, product updates, longform)
] as const;

export type TimelinessNature = typeof TIMELINESS_NATURES[number];

/**
 * Timeliness object — captures an email's relationship to time.
 *
 * This is orthogonal to category and email_type. An email can be
 * in any category and have any timeliness nature.
 *
 * The three date fields represent distinct temporal boundaries:
 * - relevant_date: When the thing itself happens (event, flight, meeting)
 * - late_after: When you cross a consequence threshold (bill due, RSVP soft deadline)
 * - expires: When no action is possible (sale ends, 2FA code expires, registration closes)
 *
 * @example
 * // Wedding RSVP
 * { nature: 'upcoming', relevant_date: '2026-03-28', late_after: '2026-03-10', expires: '2026-03-10', perishable: false }
 *
 * // 2FA code
 * { nature: 'ephemeral', perishable: true }
 *
 * // Newsletter essay
 * { nature: 'evergreen', perishable: false }
 *
 * // Bill due
 * { nature: 'upcoming', late_after: '2026-03-18', perishable: false }
 *
 * @since March 2026 — Taxonomy v2
 */
export interface Timeliness {
  /** The email's temporal character */
  nature: TimelinessNature;
  /** ISO date — when the thing itself happens (event, flight, meeting) */
  relevant_date?: string | null;
  /** ISO date — consequence threshold (bill due, RSVP soft deadline) */
  late_after?: string | null;
  /** ISO date — hard cutoff (sale ends, 2FA expires, registration closes) */
  expires?: string | null;
  /** Whether this email becomes worthless after its moment */
  perishable: boolean;
}

/**
 * Set of valid email categories for O(1) lookup.
 * Use for validating category values from URLs or user input.
 */
export const EMAIL_CATEGORIES_SET = new Set<string>(EMAIL_CATEGORIES);

// =============================================================================
// LEGACY CATEGORY MIGRATION SUPPORT
// =============================================================================

/**
 * Legacy category values from previous refactors.
 * Maps old category strings to current valid categories.
 *
 * This mapping allows graceful handling of emails that haven't been re-analyzed yet,
 * or cached data that contains old category values.
 *
 * @deprecated These categories are deprecated. Use EMAIL_CATEGORIES instead.
 * @see Migration 028_category_cleanup.sql for database-level fixes
 *
 * Mapping rationale (Jan 2026 action-focused → life-bucket):
 * - action_required → clients (urgent work items are typically client-related)
 * - event → local (events are often community/local activities)
 * - newsletter → newsletters_creator (direct mapping)
 * - promo → shopping (promotional emails are shopping-related)
 * - admin → finance (admin emails often relate to accounts/billing)
 * - personal → personal_friends_family (direct mapping)
 * - noise → other (low-priority content)
 *
 * Mapping rationale (Feb 2026 rename/merge/split):
 * - client_pipeline → clients
 * - business_work_general → work
 * - family_kids_school → family
 * - family_health_appointments → family
 * - newsletters_general → newsletters_creator (default; AI will re-sort on re-analysis)
 */
export const LEGACY_CATEGORY_MAP: Record<string, EmailCategory> = {
  // Jan 2026 legacy (action-focused categories)
  'action_required': 'clients',
  'event': 'local',
  'newsletter': 'newsletters',
  'promo': 'deals',
  'promotional': 'deals',
  'admin': 'finance',
  'noise': 'product_updates',
  // Feb 2026 legacy (renamed/merged/split categories)
  'client_pipeline': 'clients',
  'business_work_general': 'work',
  'family_kids_school': 'parenting',
  'family_health_appointments': 'health',
  'newsletters_general': 'newsletters',
  // Mar 2026 legacy (taxonomy v2 renames/merges/splits)
  'personal_friends_family': 'personal',
  'news_politics': 'news',
  'newsletters_creator': 'newsletters',
  'newsletters_industry': 'newsletters',
} as const;

/**
 * Type for legacy category strings.
 * Used for type-safe handling of old category values during migration.
 */
export type LegacyCategory = keyof typeof LEGACY_CATEGORY_MAP;

/**
 * Set of legacy category values for O(1) lookup.
 */
export const LEGACY_CATEGORIES_SET = new Set<string>(Object.keys(LEGACY_CATEGORY_MAP));

/**
 * Normalizes a category value to a valid EmailCategory.
 *
 * This function handles three cases:
 * 1. Valid new category → returns as-is
 * 2. Legacy category → maps to corresponding new category
 * 3. Unknown category → returns null
 *
 * Use this when:
 * - Reading category values from the database (might have old values)
 * - Parsing URL parameters (might contain legacy category)
 * - Processing cached sync_progress data
 *
 * @param category - The category string to normalize (can be new, legacy, or unknown)
 * @returns The normalized EmailCategory — always returns a valid category (never null)
 *
 * @example
 * ```typescript
 * normalizeCategory('clients')          // → 'clients' (valid current)
 * normalizeCategory('client_pipeline')  // → 'clients' (legacy mapped)
 * normalizeCategory('unknown_value')    // → 'personal' (unrecognized)
 * normalizeCategory(null)               // → 'personal' (missing)
 * ```
 */
export function normalizeCategory(category: string | null | undefined): EmailCategory {
  if (!category) {
    return 'personal';
  }

  // Check if it's already a valid new category
  if (EMAIL_CATEGORIES_SET.has(category)) {
    return category as EmailCategory;
  }

  // Check if it's a legacy category that can be mapped
  if (LEGACY_CATEGORIES_SET.has(category)) {
    return LEGACY_CATEGORY_MAP[category as LegacyCategory];
  }

  // Unknown category — default to personal
  return 'personal';
}

/**
 * Checks if a category value is a legacy (deprecated) category.
 *
 * @param category - The category string to check
 * @returns True if this is a legacy category that should be migrated
 *
 * @example
 * ```typescript
 * isLegacyCategory('action_required')  // → true
 * isLegacyCategory('client_pipeline')  // → true (Feb 2026 legacy)
 * isLegacyCategory('clients')          // → false (current)
 * ```
 */
export function isLegacyCategory(category: string | null | undefined): boolean {
  return category ? LEGACY_CATEGORIES_SET.has(category) : false;
}

/**
 * Display configuration for each category.
 * Used by UI components to render consistent styling.
 */
export interface CategoryDisplayConfig {
  label: string;
  icon: string; // Emoji for now, could be icon component name
  color: string; // Tailwind color class
  bgColor: string; // Background color class
  description: string;
}

/**
 * Category display configurations keyed by category.
 *
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 */
export const CATEGORY_DISPLAY: Record<EmailCategory, CategoryDisplayConfig> = {
  // ── Work & Professional ──────────────────────────────────────────────────
  clients: {
    label: 'Clients',
    icon: '💼',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    description: 'Direct client correspondence and project work',
  },
  work: {
    label: 'Work',
    icon: '🏢',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    description: 'Team, industry, and professional emails',
  },
  job_search: {
    label: 'Job Search',
    icon: '🔍',
    color: 'text-lime-700',
    bgColor: 'bg-lime-50',
    description: 'Applications, recruiters, interviews, and offers',
  },
  // ── People & Relationships ───────────────────────────────────────────────
  personal: {
    label: 'Personal',
    icon: '👥',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    description: 'Friends, social relationships, adult hobbies and clubs',
  },
  family: {
    label: 'Family',
    icon: '🏠',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    description: 'Family relationships and personal family matters',
  },
  parenting: {
    label: 'Parenting',
    icon: '👶',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    description: 'Kids: school, childcare, pediatrician, extracurriculars, tutors',
  },
  // ── Life Admin ───────────────────────────────────────────────────────────
  health: {
    label: 'Health',
    icon: '❤️‍🩹',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    description: 'Medical, dental, prescriptions, insurance EOBs, vet',
  },
  finance: {
    label: 'Finance',
    icon: '📈',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    description: 'Banking, investments, tax, financial planning',
  },
  billing: {
    label: 'Billing',
    icon: '🧾',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    description: 'Receipts, subscriptions, autopay, bills, payment failures',
  },
  travel: {
    label: 'Travel',
    icon: '✈️',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    description: 'Flights, hotels, bookings, and trip planning',
  },
  shopping: {
    label: 'Shopping',
    icon: '🛒',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    description: 'Orders, shipping, returns, and tracking',
  },
  deals: {
    label: 'Deals',
    icon: '🏷️',
    color: 'text-fuchsia-600',
    bgColor: 'bg-fuchsia-50',
    description: 'Sales, discounts, coupons, limited-time offers',
  },
  // ── Community & Civic ────────────────────────────────────────────────────
  local: {
    label: 'Local',
    icon: '📍',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    description: 'Community events, neighborhood, local businesses',
  },
  civic: {
    label: 'Civic',
    icon: '🏛️',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    description: 'Government, council, school board, HOA, voting',
  },
  sports: {
    label: 'Sports',
    icon: '🏆',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    description: 'Fan sports: scores, fantasy, team updates',
  },
  // ── Information ──────────────────────────────────────────────────────────
  news: {
    label: 'News',
    icon: '📰',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    description: 'News outlets, current events, breaking news',
  },
  politics: {
    label: 'Politics',
    icon: '🗳️',
    color: 'text-zinc-700',
    bgColor: 'bg-zinc-100',
    description: 'Political news, campaigns, policy',
  },
  newsletters: {
    label: 'Newsletters',
    icon: '✍️',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    description: 'Substacks, digests, and curated content',
  },
  product_updates: {
    label: 'Product Updates',
    icon: '📦',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    description: 'SaaS tools, release notes, changelogs',
  },
  // ── System ───────────────────────────────────────────────────────────────
  notifications: {
    label: 'Notifications',
    icon: '🔔',
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    description: 'Verification codes, login alerts, 2FA, system notifications',
  },
};

// =============================================================================
// SHARED INBOX DISPLAY CONSTANTS
// =============================================================================
// Centralized here to avoid duplication across inbox components.
// InboxEmailRow, CategoryFilterBar, CategorySummaryPanel, and PriorityEmailList
// all import from here instead of defining their own copies.

/**
 * Short category labels for compact UI elements (pills, badges, inline tags).
 * These are shorter than CATEGORY_DISPLAY.label and designed for tight layouts.
 *
 * @example
 * ```tsx
 * import { CATEGORY_SHORT_LABELS } from '@/types/discovery';
 * <span>{CATEGORY_SHORT_LABELS[email.category]}</span>
 * ```
 */
export const CATEGORY_SHORT_LABELS: Record<EmailCategory, string> = {
  clients: 'Client',
  work: 'Work',
  job_search: 'Jobs',
  personal: 'Personal',
  family: 'Family',
  parenting: 'Parenting',
  health: 'Health',
  finance: 'Finance',
  billing: 'Billing',
  travel: 'Travel',
  shopping: 'Shopping',
  deals: 'Deals',
  local: 'Local',
  civic: 'Civic',
  sports: 'Sports',
  news: 'News',
  politics: 'Politics',
  newsletters: 'Newsletter',
  product_updates: 'Updates',
  notifications: 'Alerts',
};

/**
 * Pluralized short labels for filter pills that show counts.
 * "5 Clients" reads better than "5 Client" in a filter bar.
 */
export const CATEGORY_SHORT_LABELS_PLURAL: Record<EmailCategory, string> = {
  clients: 'Clients',
  work: 'Work',
  job_search: 'Jobs',
  personal: 'Personal',
  family: 'Family',
  parenting: 'Parenting',
  health: 'Health',
  finance: 'Finance',
  billing: 'Billing',
  travel: 'Travel',
  shopping: 'Shopping',
  deals: 'Deals',
  local: 'Local',
  civic: 'Civic',
  sports: 'Sports',
  news: 'News',
  politics: 'Politics',
  newsletters: 'Newsletters',
  product_updates: 'Updates',
  notifications: 'Alerts',
};

/**
 * Category accent colors — used for dots, bars, and other colored indicators.
 * Single Tailwind bg-* class per category. Consistent across all inbox components.
 */
export const CATEGORY_ACCENT_COLORS: Record<EmailCategory, string> = {
  clients: 'bg-blue-500',
  work: 'bg-violet-500',
  job_search: 'bg-lime-500',
  personal: 'bg-pink-500',
  family: 'bg-amber-500',
  parenting: 'bg-rose-500',
  health: 'bg-red-500',
  finance: 'bg-green-600',
  billing: 'bg-emerald-500',
  travel: 'bg-sky-500',
  shopping: 'bg-orange-500',
  deals: 'bg-fuchsia-500',
  local: 'bg-teal-500',
  civic: 'bg-stone-500',
  sports: 'bg-yellow-500',
  news: 'bg-slate-500',
  politics: 'bg-zinc-500',
  newsletters: 'bg-emerald-500',
  product_updates: 'bg-indigo-500',
  notifications: 'bg-gray-400',
};

/**
 * Category badge colors for use in Badge components.
 * Includes background + text + dark mode variants.
 * Used in PriorityEmailList badges and other badge-style displays.
 */
export const CATEGORY_BADGE_COLORS: Record<EmailCategory, string> = {
  clients: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  work: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
  job_search: 'bg-lime-50 text-lime-700 dark:bg-lime-950/30 dark:text-lime-300',
  personal: 'bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300',
  family: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  parenting: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  health: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  finance: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  billing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  travel: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
  shopping: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
  deals: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-300',
  local: 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300',
  civic: 'bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-300',
  sports: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300',
  news: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  politics: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300',
  newsletters: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  product_updates: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300',
  notifications: 'bg-gray-50 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
};

/**
 * Ordered category list for display in filter bars and sidebars.
 * Grouped: Work → Personal → Life Admin → Information.
 */
/**
 * Ordered category list for display in filter bars and sidebars.
 * Grouped: Work → People → Life Admin → Community → Information → System.
 */
export const CATEGORIES_DISPLAY_ORDER: EmailCategory[] = [
  // Work & Professional
  'clients',
  'work',
  'job_search',
  // People & Relationships
  'personal',
  'family',
  'parenting',
  // Life Admin
  'health',
  'finance',
  'billing',
  'travel',
  'shopping',
  'deals',
  // Community & Civic
  'local',
  'civic',
  'sports',
  // Information
  'news',
  'politics',
  'newsletters',
  'product_updates',
  // System
  'notifications',
];

// =============================================================================
// INITIAL SYNC REQUEST/RESPONSE
// =============================================================================

/**
 * Request body for POST /api/onboarding/initial-sync
 * All fields optional - uses defaults from config if not provided.
 */
export interface InitialSyncRequest {
  /** Maximum emails to fetch from Gmail (default: 50) */
  maxEmails?: number;
  /** Include already-read emails (default: true) */
  includeRead?: boolean;
}

/**
 * Statistics about the sync operation.
 * Useful for transparency and debugging.
 */
export interface SyncStats {
  /** Total emails fetched from Gmail */
  totalFetched: number;
  /** Emails skipped by pre-filter (spam, no-reply, etc.) */
  preFiltered: number;
  /** Emails successfully analyzed by AI */
  analyzed: number;
  /** Emails where AI analysis failed */
  failed: number;
  /** Total OpenAI tokens consumed */
  totalTokensUsed: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Total processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Sender information with email count.
 * Used in category cards to show top senders.
 */
export interface SenderInfo {
  /** Display name (or email if no name) */
  name: string;
  /** Email address */
  email: string;
  /** Number of emails from this sender in this category */
  count: number;
}

/**
 * Summary of emails in a single category.
 * Powers the category cards on the Discovery Dashboard.
 *
 * ENHANCED (Jan 2026): Added intelligence fields for urgency, health,
 * and actionable items to surface AI-analyzed data more prominently.
 */
export interface CategorySummary {
  /** The category this summary represents */
  category: EmailCategory;
  /** Total email count in this category */
  count: number;
  /** Unread email count */
  unreadCount: number;
  /** Top senders in this category (max 3) */
  topSenders: SenderInfo[];
  /** Sample subject lines (max 3) */
  sampleSubjects: string[];
  /** Human-readable insight about this category */
  insight: string;
  /** For action_required: number with urgency > 7 */
  urgentCount?: number;
  /** For events: next upcoming event */
  upcomingEvent?: {
    title: string;
    date: string; // ISO date string
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED INTELLIGENCE FIELDS (Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Array of urgency scores (0-10) for emails in this category */
  urgencyScores?: number[];

  /** Top actionable items that need attention */
  needsAttention?: NeedsAttentionItem[];

  /** Aggregated relationship health signals */
  healthSummary?: {
    positive: number;
    neutral: number;
    negative: number;
  };

  /** AI-generated briefing (2-3 sentences summarizing category status) */
  briefing?: string;

  /** Upcoming deadlines in this category */
  upcomingDeadlines?: {
    title: string;
    date: string;
    emailId: string;
    senderName?: string;
  }[];
}

/**
 * Item that needs user attention in a category.
 * Used in the "Needs Attention" section of enhanced category cards.
 */
export interface NeedsAttentionItem {
  /** Email ID this item relates to */
  emailId: string;
  /** Title/description of what needs attention */
  title: string;
  /** Type of attention needed */
  actionType: 'respond' | 'review' | 'decide' | 'schedule' | 'follow_up' | 'other';
  /** Sender name */
  senderName: string;
  /** Company or client name if known */
  company?: string;
  /** Deadline date if applicable */
  deadline?: string;
  /** Urgency score (0-10) */
  urgency: number;
}

/**
 * Relationship signal detected from email tone.
 */
export type RelationshipSignal = 'positive' | 'neutral' | 'negative' | 'unknown';

/**
 * Insight about a detected or suggested client.
 */
export interface ClientInsight {
  /** Client ID if matched to existing client, null if new suggestion */
  clientId: string | null;
  /** Client name (detected or from roster) */
  clientName: string;
  /** True if this is a suggested new client, not an existing one */
  isNewSuggestion: boolean;
  /** Number of emails from/about this client */
  emailCount: number;
  /** Number of action_required emails for this client */
  actionRequiredCount: number;
  /** Sample subject line */
  sampleSubject: string;
  /** Detected relationship health */
  relationshipSignal: RelationshipSignal;
}

/**
 * Information about an email that failed AI analysis.
 */
export interface AnalysisFailure {
  /** Email ID in database */
  emailId: string;
  /** Email subject (truncated) */
  subject: string;
  /** Sender email/name */
  sender: string;
  /** Reason for failure */
  reason: string;
  /** Whether this email can be retried */
  canRetry: boolean;
}

/**
 * Types of suggested quick actions.
 */
export type SuggestedActionType =
  | 'archive_category' // Bulk archive a category
  | 'add_client' // Add a suggested client
  | 'view_urgent' // View urgent action items
  | 'add_events'; // Add detected events to calendar

/**
 * Priority level for suggested actions.
 */
export type ActionPriority = 'high' | 'medium' | 'low';

/**
 * A suggested quick action for the user.
 */
export interface SuggestedAction {
  /** Unique ID for this action */
  id: string;
  /** Type of action */
  type: SuggestedActionType;
  /** Short label for the button */
  label: string;
  /** Longer description of what this does */
  description: string;
  /** For archive_category: which category */
  category?: EmailCategory;
  /** Number of items affected */
  count?: number;
  /** How important is this action */
  priority: ActionPriority;
  /** For add_client: the client name */
  clientName?: string;
}

/**
 * Full response from POST /api/onboarding/initial-sync
 * Contains everything needed to render the Discovery Dashboard.
 */
export interface InitialSyncResponse {
  /** Whether sync completed (even with partial failures) */
  success: boolean;
  /** Processing statistics */
  stats: SyncStats;
  /** Category-by-category breakdown */
  categories: CategorySummary[];
  /** Detected/suggested clients */
  clientInsights: ClientInsight[];
  /** Emails that failed analysis */
  failures: AnalysisFailure[];
  /** Suggested quick actions */
  suggestedActions: SuggestedAction[];
}

/**
 * Error response when sync completely fails.
 */
export interface InitialSyncError {
  success: false;
  error: string;
  /** Whether the user can retry */
  canRetry: boolean;
  /** Milliseconds to wait before retrying */
  retryAfterMs?: number;
}

// =============================================================================
// SYNC PROGRESS (for real-time updates)
// =============================================================================

/**
 * Status of the sync operation.
 */
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Discoveries found so far during sync.
 * Shown in real-time during the loading screen.
 */
export interface SyncDiscoveries {
  /** Number of action items found */
  actionItems: number;
  /** Number of events found */
  events: number;
  /** Names of clients detected */
  clientsDetected: string[];
}

/**
 * Response from GET /api/onboarding/sync-status
 * Used for polling during the loading screen.
 */
export interface SyncProgressResponse {
  /** Current status */
  status: SyncStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable current step */
  currentStep: string;
  /** Discoveries found so far */
  discoveries: SyncDiscoveries;
  /** Final result (only when status === 'completed') */
  result?: InitialSyncResponse;
  /** Error message (only when status === 'failed') */
  error?: string;
}

// =============================================================================
// PRE-FILTER TYPES
// =============================================================================

/**
 * Result of pre-filtering an email before AI analysis.
 */
export interface PreFilterResult {
  /** Should this email be sent to AI analysis? */
  shouldAnalyze: boolean;
  /** If not analyzing, why? */
  skipReason?: string;
  /** If we can auto-categorize without AI, what category? */
  autoCategory?: EmailCategory;
  /** Confidence in auto-categorization (0-1) */
  autoConfidence?: number;
}

/**
 * Pattern for a known sender (learned over time).
 */
export interface SenderPattern {
  /** Sender email or domain pattern */
  pattern: string;
  /** Whether this is a domain pattern (vs exact email) */
  isDomain: boolean;
  /** Most common category for this sender */
  category: EmailCategory;
  /** How confident we are (0-1) */
  confidence: number;
  /** How many emails contributed to this pattern */
  sampleSize: number;
  /** When this pattern was last updated */
  updatedAt: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for initial sync behavior.
 */
export interface InitialSyncConfig {
  /** Maximum emails to fetch */
  maxEmails: number;
  /** Include read emails */
  includeRead: boolean;
  /** Gmail query to exclude unwanted mail (syncs from "All Mail" by default) */
  excludeQuery: string;
  /** Gmail labels to exclude (legacy - now using excludeQuery) */
  excludeLabels: string[];
  /** Batch size for AI processing */
  batchSize: number;
  /** Max retries per email */
  maxRetries: number;
  /** Timeout for entire sync (ms) */
  timeoutMs: number;
  /** How often to update progress (ms) */
  progressUpdateIntervalMs: number;
  /** Confidence threshold to skip AI (0-1) */
  skipAIThreshold: number;
  /** Max similar emails to analyze per sender */
  maxSimilarEmailsToAnalyze: number;
}

/**
 * Default configuration values.
 * Note: By default, we sync from "All Mail" (no labelIds filter)
 * and use excludeQuery to filter out spam, trash, and drafts.
 */
export const DEFAULT_INITIAL_SYNC_CONFIG: InitialSyncConfig = {
  maxEmails: 50,
  includeRead: true,
  excludeQuery: '-in:spam -in:trash -in:draft',
  excludeLabels: ['SPAM', 'TRASH', 'DRAFT'],
  batchSize: 10,
  maxRetries: 2,
  timeoutMs: 120000, // 2 minutes
  progressUpdateIntervalMs: 1000,
  skipAIThreshold: 0.95,
  maxSimilarEmailsToAnalyze: 2,
};

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Email data needed for pre-filtering and analysis.
 * Subset of full email type to minimize data transfer.
 */
export interface EmailForAnalysis {
  id: string;
  gmailId: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  snippet: string;
  bodyText?: string;
  gmailLabels: string[];
  isRead: boolean;
  date: string;
}

/**
 * Result of analyzing a single email.
 */
export interface EmailAnalysisResult {
  emailId: string;
  success: boolean;
  category?: EmailCategory;
  confidence?: number;
  hasAction?: boolean;
  actionUrgency?: number;
  clientId?: string | null;
  clientName?: string;
  isNewClientSuggestion?: boolean;
  relationshipSignal?: RelationshipSignal;
  eventDetected?: {
    title: string;
    date: string;
  };
  tokensUsed: number;
  error?: string;
}

// =============================================================================
// DATABASE SYNC PROGRESS
// =============================================================================

/**
 * Shape of sync_progress column in user_profiles table.
 * Stored as JSONB for flexibility.
 */
export interface StoredSyncProgress {
  status: SyncStatus;
  progress: number;
  currentStep: string;
  discoveries: SyncDiscoveries;
  startedAt: string;
  updatedAt: string;
  result?: InitialSyncResponse;
  error?: string;
  /**
   * Checkpoint data saved after each analysis batch completes.
   * NEW (Feb 2026): Enables recovery from interrupted syncs.
   * Already-analyzed emails are skipped on resume (analyzed_at is set per-email).
   */
  checkpoint?: {
    batchNumber: number;
    totalBatches: number;
    emailsProcessed: number;
    emailsTotal: number;
    tokensUsed: number;
    analyzedCount: number;
    failedCount: number;
  };
}
