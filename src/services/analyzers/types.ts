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
// CATEGORIZER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result data from the categorizer analyzer.
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
// AGGREGATED ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined analysis data from all analyzers.
 * This is stored in the email_analyses table.
 */
export interface AggregatedAnalysis {
  /** Categorization results */
  categorization?: CategorizationData;

  /** Action extraction results */
  actionExtraction?: ActionExtractionData;

  /** Client tagging results */
  clientTagging?: ClientTaggingData;

  /** Total tokens used across all analyzers */
  totalTokensUsed: number;

  /** Total processing time across all analyzers */
  totalProcessingTimeMs: number;

  /** Version of the analyzer system */
  analyzerVersion: string;
}

/**
 * Result from processing a single email through all analyzers.
 */
export interface EmailProcessingResult {
  /** Whether all analyzers completed (some may have failed) */
  success: boolean;

  /** Aggregated analysis data */
  analysis: AggregatedAnalysis;

  /** Individual analyzer results for debugging */
  results: {
    categorization?: CategorizationResult;
    actionExtraction?: ActionExtractionResult;
    clientTagging?: ClientTaggingResult;
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
