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
