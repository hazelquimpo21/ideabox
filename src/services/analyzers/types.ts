/**
 * Shared Types for AI Analyzers
 *
 * Defines common types used across all analyzer implementations.
 * These types ensure consistency between analyzers and their consumers.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TYPE CATEGORIES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Base Types - Common to all analyzers
 * 2. Result Types - Output structures from each analyzer
 * 3. Input Types - Email data fed to analyzers
 * 4. Config Types - Analyzer configuration
 *
 * @module services/analyzers/types
 * @version 1.0.0
 */

import type { Email, Client, EmailCategory, ActionType } from '@/types/database';
import type { AnalyzerConfig as BaseAnalyzerConfig } from '@/config/analyzers';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ANALYZER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extended analyzer configuration with additional options.
 */
export interface AnalyzerConfig extends BaseAnalyzerConfig {
  /** Maximum characters to include from email body */
  maxBodyChars?: number;
}

/**
 * Base result structure returned by all analyzers.
 *
 * Every analyzer returns this base structure, extended with
 * analyzer-specific data in the `data` field.
 */
export interface AnalyzerResult<T = unknown> {
  /** Whether the analysis completed successfully */
  success: boolean;

  /** Analyzer-specific result data */
  data: T;

  /**
   * Confidence score for the analysis (0-1).
   * - 0.0-0.4: Low confidence, may need human review
   * - 0.5-0.7: Medium confidence, reasonably reliable
   * - 0.8-1.0: High confidence, very reliable
   */
  confidence: number;

  /** Optional reasoning explaining the analysis */
  reasoning?: string;

  /** Number of tokens used in the API call */
  tokensUsed: number;

  /** Time taken for the analysis in milliseconds */
  processingTimeMs: number;

  /** Error message if analysis failed */
  error?: string;
}

/**
 * Email data passed to analyzers.
 *
 * This is a subset of the full Email type, containing only
 * the fields needed for AI analysis.
 */
export interface EmailInput {
  /** Unique email ID */
  id: string;

  /** Email subject line */
  subject: string | null;

  /** Sender email address */
  senderEmail: string;

  /** Sender display name */
  senderName: string | null;

  /** Email date (ISO 8601) */
  date: string;

  /** Gmail snippet (short preview) */
  snippet: string | null;

  /** Plain text body (may be truncated) */
  bodyText: string | null;

  /** Gmail labels for context */
  gmailLabels?: string[];
}

/**
 * User context passed to analyzers that need it.
 * For example, client tagger needs the list of known clients.
 */
export interface UserContext {
  /** User ID */
  userId: string;

  /** User's known clients */
  clients?: Client[];

  /** User's timezone (for deadline interpretation) */
  timezone?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick action suggestions for ALL emails.
 *
 * Unlike detailed actions (from ActionExtractor), these are lightweight
 * interaction hints that help users quickly triage their inbox.
 *
 * Every email gets a quickAction, even if it's just "archive" or "none".
 */
export type QuickAction =
  | 'respond'      // Reply needed - someone is waiting for an answer
  | 'review'       // Worth reading carefully - contains important info
  | 'archive'      // Can be dismissed - low value or already handled
  | 'save'         // Interesting content to save for later reference
  | 'calendar'     // Add to calendar - contains event/date info
  | 'unsubscribe'  // Suggest unsubscribing - newsletter user rarely reads
  | 'follow_up'    // Need to follow up on something you initiated
  | 'none';        // Truly nothing to do - purely informational

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIZER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result data from the categorizer analyzer.
 *
 * ENHANCED (Jan 2026): Added `summary` and `quickAction` fields.
 * - summary: One-sentence assistant-style overview of the email
 * - quickAction: Suggested quick interaction for ALL emails
 */
export interface CategorizationData {
  /**
   * Primary email category.
   * This is action-focused: what does the user need to DO?
   */
  category: EmailCategory;

  /**
   * Confidence in the categorization (0-1).
   */
  confidence: number;

  /**
   * Brief explanation of why this category was chosen.
   * Useful for debugging and user transparency.
   */
  reasoning: string;

  /**
   * Key topics extracted from the email.
   * Examples: 'billing', 'meeting', 'project-update', 'feedback'
   */
  topics: string[];

  /**
   * One-sentence assistant-style summary of the email.
   * Written as if a personal assistant is briefing the user.
   *
   * Examples:
   * - "Sarah from Acme Corp wants you to review the Q1 proposal by Friday"
   * - "Your AWS bill for January is $142.67 - no action needed"
   * - "LinkedIn: 5 people viewed your profile this week"
   * - "Mom sent photos from the weekend trip"
   *
   * This makes emails scannable without opening them.
   */
  summary: string;

  /**
   * Suggested quick interaction for this email.
   * Unlike detailed actions, this is a lightweight triage hint.
   *
   * EVERY email gets a quickAction, even low-priority ones.
   * This helps users quickly process their inbox.
   */
  quickAction: QuickAction;
}

/**
 * Full result from the categorizer analyzer.
 */
export type CategorizationResult = AnalyzerResult<CategorizationData>;

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXTRACTOR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result data from the action extractor analyzer.
 */
export interface ActionExtractionData {
  /**
   * Whether this email requires any action from the user.
   * If false, other fields may be empty/default.
   */
  hasAction: boolean;

  /**
   * Type of action required.
   * 'none' if hasAction is false.
   */
  actionType: ActionType;

  /**
   * Short title for the action.
   * Example: "Reply to client about timeline"
   */
  actionTitle?: string;

  /**
   * Detailed description of what needs to be done.
   */
  actionDescription?: string;

  /**
   * Urgency score (1-10).
   * - 1-3: Can wait a week or more
   * - 4-6: Should be done this week
   * - 7-8: Should be done in 1-2 days
   * - 9-10: Urgent, needs immediate attention
   */
  urgencyScore: number;

  /**
   * Deadline for the action (ISO 8601), if mentioned in email.
   */
  deadline?: string;

  /**
   * Estimated time to complete the action (minutes).
   */
  estimatedMinutes?: number;

  /**
   * Confidence in the action extraction (0-1).
   */
  confidence: number;
}

/**
 * Full result from the action extractor analyzer.
 */
export type ActionExtractionResult = AnalyzerResult<ActionExtractionData>;

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT TAGGER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Relationship signal detected from email tone.
 */
export type RelationshipSignal = 'positive' | 'neutral' | 'negative' | 'unknown';

/**
 * Result data from the client tagger analyzer.
 */
export interface ClientTaggingData {
  /**
   * Whether this email relates to a known client.
   */
  clientMatch: boolean;

  /**
   * Name of the matched client (from provided roster).
   * null if no match found.
   */
  clientName: string | null;

  /**
   * ID of the matched client.
   * null if no match found.
   */
  clientId?: string | null;

  /**
   * Confidence in the client match (0-1).
   */
  matchConfidence: number;

  /**
   * Specific project mentioned in the email.
   * Example: 'PodcastPipeline', 'HappenlistScraper'
   */
  projectName?: string;

  /**
   * If no match, suggests if this could be a new client.
   */
  newClientSuggestion?: string;

  /**
   * Sentiment/health of the relationship based on email tone.
   */
  relationshipSignal: RelationshipSignal;
}

/**
 * Full result from the client tagger analyzer.
 */
export type ClientTaggingResult = AnalyzerResult<ClientTaggingData>;

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT DETECTOR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event location type.
 * Helps users understand if travel is required.
 */
export type EventLocationType = 'in_person' | 'virtual' | 'hybrid' | 'unknown';

/**
 * Result data from the event detector analyzer.
 *
 * This analyzer ONLY runs when category === 'event'.
 * It extracts rich details needed for calendar integration.
 *
 * DESIGN DECISION: Separate analyzer instead of extending categorizer.
 * - Keeps categorizer fast and focused
 * - Only incurs cost for actual events (~5-10% of emails)
 * - Easier to tune independently
 * - Can be disabled without affecting categorization
 */
export interface EventDetectionData {
  /**
   * Whether this email contains a detectable event.
   * Should always be true if this analyzer ran (pre-filtered).
   */
  hasEvent: boolean;

  /**
   * Title/name of the event.
   * Example: "Milwaukee Tech Meetup", "Q1 Planning Call"
   */
  eventTitle: string;

  /**
   * Event date in ISO 8601 format (YYYY-MM-DD).
   * Example: "2026-01-25"
   */
  eventDate: string;

  /**
   * Event start time in HH:MM format (24-hour).
   * Example: "18:00"
   * May be null if time not specified.
   */
  eventTime?: string;

  /**
   * Event end time in HH:MM format (24-hour).
   * Example: "20:00"
   * May be null if not specified or unknown.
   */
  eventEndTime?: string;

  /**
   * Type of location: in-person, virtual, hybrid, or unknown.
   * Helps users understand if travel is required.
   */
  locationType: EventLocationType;

  /**
   * Physical address or virtual meeting link.
   * Examples:
   * - "123 Main St, Milwaukee, WI 53211"
   * - "https://zoom.us/j/123456789"
   * - "Google Meet link in calendar invite"
   */
  location?: string;

  /**
   * Registration or RSVP deadline if mentioned.
   * ISO 8601 format.
   */
  registrationDeadline?: string;

  /**
   * Whether RSVP or registration is required.
   */
  rsvpRequired: boolean;

  /**
   * URL to register or RSVP if provided.
   */
  rsvpUrl?: string;

  /**
   * Who is organizing/hosting the event.
   * Example: "MKE Tech Community", "Sarah Johnson"
   */
  organizer?: string;

  /**
   * Cost information if mentioned.
   * Examples: "Free", "$25", "Members free, $10 for guests"
   */
  cost?: string;

  /**
   * Additional relevant details about the event.
   * Free-form text for anything not captured above.
   * Example: "Parking available in attached garage"
   */
  additionalDetails?: string;

  /**
   * Confidence in the event extraction (0-1).
   */
  confidence: number;
}

/**
 * Full result from the event detector analyzer.
 */
export type EventDetectionResult = AnalyzerResult<EventDetectionData>;

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined analysis data from all analyzers.
 * This is stored in the email_analyses table.
 *
 * STRUCTURE:
 * - categorization: Always runs (core classification + summary)
 * - actionExtraction: Always runs (detailed action info)
 * - clientTagging: Always runs (client linking)
 * - eventDetection: Only runs when category === 'event'
 *
 * Future analyzers (Phase 2+):
 * - urlExtraction: Extract and categorize URLs
 * - contentOpportunity: Tweet ideas, networking opportunities
 */
export interface AggregatedAnalysis {
  /** Categorization results (always present if analysis succeeded) */
  categorization?: CategorizationData;

  /** Action extraction results (always present if analysis succeeded) */
  actionExtraction?: ActionExtractionData;

  /** Client tagging results (always present if analysis succeeded) */
  clientTagging?: ClientTaggingData;

  /**
   * Event detection results.
   * Only present when category === 'event'.
   * Contains rich event details for calendar integration.
   */
  eventDetection?: EventDetectionData;

  /** Total tokens used across all analyzers */
  totalTokensUsed: number;

  /** Total processing time across all analyzers */
  totalProcessingTimeMs: number;

  /** Version of the analyzer system */
  analyzerVersion: string;
}

/**
 * Result from processing a single email through all analyzers.
 *
 * Contains both the aggregated analysis (for storage) and individual
 * analyzer results (for debugging and detailed inspection).
 */
export interface EmailProcessingResult {
  /** Whether all analyzers completed (some may have failed) */
  success: boolean;

  /** Aggregated analysis data (stored in email_analyses table) */
  analysis: AggregatedAnalysis;

  /**
   * Individual analyzer results for debugging.
   * Each result contains success status, raw data, confidence, and timing.
   */
  results: {
    categorization?: CategorizationResult;
    actionExtraction?: ActionExtractionResult;
    clientTagging?: ClientTaggingResult;
    eventDetection?: EventDetectionResult;
  };

  /** Errors from any failed analyzers */
  errors: Array<{
    analyzer: string;
    error: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converts a full Email record to EmailInput for analysis.
 *
 * @param email - Full email record from database
 * @returns Simplified email input for analyzers
 */
export function toEmailInput(email: Email): EmailInput {
  return {
    id: email.id,
    subject: email.subject,
    senderEmail: email.sender_email,
    senderName: email.sender_name,
    date: email.date,
    snippet: email.snippet,
    bodyText: email.body_text,
    gmailLabels: email.gmail_labels || undefined,
  };
}

/**
 * Creates a failed analyzer result.
 *
 * @param error - Error message
 * @param startTime - Start time for duration calculation
 * @returns Failed analyzer result
 */
export function createFailedResult<T>(
  error: string,
  startTime: number
): AnalyzerResult<T> {
  return {
    success: false,
    data: {} as T,
    confidence: 0,
    tokensUsed: 0,
    processingTimeMs: Date.now() - startTime,
    error,
  };
}
