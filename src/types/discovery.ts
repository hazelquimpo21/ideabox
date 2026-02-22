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
 * All possible email categories in IdeaBox.
 * Categories are life-bucket focused (what part of life this email touches).
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
 * Actions are now tracked separately via the `actions` table.
 *
 * The AI analyzer uses human-eye inference to categorize - it considers sender
 * context, domain patterns, and content to make smart categorization decisions.
 */
export type EmailCategory =
  | 'newsletters_general'           // Substacks, digests, curated content
  | 'news_politics'                 // News outlets, political updates
  | 'product_updates'               // Tech products, SaaS tools, subscriptions you use
  | 'local'                         // Community events, neighborhood, local orgs
  | 'shopping'                      // Orders, shipping, deals, retail
  | 'travel'                        // Flights, hotels, bookings, trip info
  | 'finance'                       // Bills, banking, investments, receipts
  | 'family_kids_school'            // School emails, activities, kid logistics
  | 'family_health_appointments'    // Medical, appointments, family scheduling
  | 'client_pipeline'               // Direct client correspondence, project work
  | 'business_work_general'         // Team/internal, industry stuff, professional
  | 'personal_friends_family';      // Social, relationships, personal correspondence

/**
 * Array of all valid email categories.
 * Single source of truth - use this for validation and iteration.
 *
 * ADDED (Jan 2026): For Discover-first architecture.
 * Use this instead of hardcoding category lists elsewhere.
 */
export const EMAIL_CATEGORIES: EmailCategory[] = [
  'newsletters_general',
  'news_politics',
  'product_updates',
  'local',
  'shopping',
  'travel',
  'finance',
  'family_kids_school',
  'family_health_appointments',
  'client_pipeline',
  'business_work_general',
  'personal_friends_family',
] as const;

/**
 * Set of valid email categories for O(1) lookup.
 * Use for validating category values from URLs or user input.
 */
export const EMAIL_CATEGORIES_SET = new Set<string>(EMAIL_CATEGORIES);

// =============================================================================
// LEGACY CATEGORY MIGRATION SUPPORT
// =============================================================================

/**
 * Legacy category values from before the Jan 2026 refactor.
 * These old action-focused categories have been replaced with life-bucket categories.
 *
 * This mapping allows graceful handling of emails that haven't been re-analyzed yet,
 * or cached data that contains old category values.
 *
 * @deprecated These categories are deprecated. Use EMAIL_CATEGORIES instead.
 * @see Migration 028_category_cleanup.sql for database-level fixes
 *
 * Mapping rationale:
 * - action_required → client_pipeline (urgent work items are typically client-related)
 * - event → local (events are often community/local activities)
 * - newsletter → newsletters_general (direct mapping)
 * - promo → shopping (promotional emails are shopping-related)
 * - admin → finance (admin emails often relate to accounts/billing)
 * - personal → personal_friends_family (direct mapping)
 * - noise → newsletters_general (low-priority content, treat as newsletter)
 */
export const LEGACY_CATEGORY_MAP: Record<string, EmailCategory> = {
  'action_required': 'client_pipeline',
  'event': 'local',
  'newsletter': 'newsletters_general',
  'promo': 'shopping',
  'promotional': 'shopping',
  'admin': 'finance',
  'personal': 'personal_friends_family',
  'noise': 'newsletters_general',
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
 * @returns The normalized EmailCategory, or null if the category is unrecognized
 *
 * @example
 * ```typescript
 * normalizeCategory('client_pipeline')  // → 'client_pipeline' (valid new)
 * normalizeCategory('action_required')  // → 'client_pipeline' (legacy mapped)
 * normalizeCategory('unknown_value')    // → null (unrecognized)
 * ```
 */
export function normalizeCategory(category: string | null | undefined): EmailCategory | null {
  if (!category) {
    return null;
  }

  // Check if it's already a valid new category
  if (EMAIL_CATEGORIES_SET.has(category)) {
    return category as EmailCategory;
  }

  // Check if it's a legacy category that can be mapped
  if (LEGACY_CATEGORIES_SET.has(category)) {
    return LEGACY_CATEGORY_MAP[category as LegacyCategory];
  }

  // Unknown category - return null
  return null;
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
 * isLegacyCategory('client_pipeline')  // → false
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
  newsletters_general: {
    label: 'Newsletters - General',
    icon: '📰',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    description: 'Substacks, digests, and curated content',
  },
  news_politics: {
    label: 'News & Politics',
    icon: '🗞️',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    description: 'News outlets and political updates',
  },
  product_updates: {
    label: 'Product Updates',
    icon: '📦',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    description: 'Tech products and services you subscribe to',
  },
  local: {
    label: 'Local',
    icon: '📍',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    description: 'Community events, neighborhood, local orgs',
  },
  shopping: {
    label: 'Shopping',
    icon: '🛒',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    description: 'Orders, shipping, deals, and retail',
  },
  travel: {
    label: 'Travel',
    icon: '✈️',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    description: 'Flights, hotels, bookings, and trip info',
  },
  finance: {
    label: 'Finance',
    icon: '💰',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    description: 'Bills, banking, investments, and receipts',
  },
  family_kids_school: {
    label: 'Family - Kids & School',
    icon: '🎒',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    description: 'School emails, activities, kid logistics',
  },
  family_health_appointments: {
    label: 'Family - Health',
    icon: '🏥',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    description: 'Medical, appointments, family scheduling',
  },
  client_pipeline: {
    label: 'Client Pipeline',
    icon: '💼',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    description: 'Direct client correspondence and project work',
  },
  business_work_general: {
    label: 'Business/Work',
    icon: '🏢',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    description: 'Team, industry, and professional emails',
  },
  personal_friends_family: {
    label: 'Personal',
    icon: '👥',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    description: 'Friends, family, and personal correspondence',
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
  client_pipeline: 'Client',
  business_work_general: 'Work',
  family_kids_school: 'School',
  family_health_appointments: 'Health',
  personal_friends_family: 'Personal',
  finance: 'Finance',
  travel: 'Travel',
  shopping: 'Shopping',
  local: 'Local',
  newsletters_general: 'Newsletter',
  news_politics: 'News',
  product_updates: 'Updates',
};

/**
 * Pluralized short labels for filter pills that show counts.
 * "5 Clients" reads better than "5 Client" in a filter bar.
 */
export const CATEGORY_SHORT_LABELS_PLURAL: Record<EmailCategory, string> = {
  client_pipeline: 'Clients',
  business_work_general: 'Work',
  family_kids_school: 'School',
  family_health_appointments: 'Health',
  personal_friends_family: 'Personal',
  finance: 'Finance',
  travel: 'Travel',
  shopping: 'Shopping',
  local: 'Local',
  newsletters_general: 'Newsletters',
  news_politics: 'News',
  product_updates: 'Updates',
};

/**
 * Category accent colors — used for dots, bars, and other colored indicators.
 * Single Tailwind bg-* class per category. Consistent across all inbox components.
 */
export const CATEGORY_ACCENT_COLORS: Record<EmailCategory, string> = {
  client_pipeline: 'bg-blue-500',
  business_work_general: 'bg-violet-500',
  family_kids_school: 'bg-amber-500',
  family_health_appointments: 'bg-rose-500',
  personal_friends_family: 'bg-pink-500',
  finance: 'bg-green-600',
  travel: 'bg-sky-500',
  shopping: 'bg-orange-500',
  local: 'bg-teal-500',
  newsletters_general: 'bg-emerald-500',
  news_politics: 'bg-slate-500',
  product_updates: 'bg-indigo-500',
};

/**
 * Category badge colors for use in Badge components.
 * Includes background + text + dark mode variants.
 * Used in PriorityEmailList badges and other badge-style displays.
 */
export const CATEGORY_BADGE_COLORS: Record<EmailCategory, string> = {
  client_pipeline: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  business_work_general: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
  family_kids_school: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  family_health_appointments: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  personal_friends_family: 'bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300',
  finance: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  travel: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
  shopping: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
  local: 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300',
  newsletters_general: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  news_politics: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  product_updates: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300',
};

/**
 * Ordered category list for display in filter bars and sidebars.
 * Grouped: Work → Personal → Life Admin → Information.
 */
export const CATEGORIES_DISPLAY_ORDER: EmailCategory[] = [
  'client_pipeline',
  'business_work_general',
  'personal_friends_family',
  'family_kids_school',
  'family_health_appointments',
  'finance',
  'travel',
  'shopping',
  'local',
  'newsletters_general',
  'news_politics',
  'product_updates',
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
}
