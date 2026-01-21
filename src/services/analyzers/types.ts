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
// EMAIL LABELS (Multi-Label Taxonomy)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Secondary labels that can be applied to any email.
 * These provide flexible, multi-dimensional classification beyond the primary category.
 *
 * REFACTORED (Jan 2026): Added `has_event` label since events are no longer
 * a primary category. Events are detected via this label and processed
 * by the EventDetector analyzer when present.
 *
 * Labels are organized by concern:
 * - Action: What type of action is needed
 * - Urgency: Time sensitivity
 * - Relationship: Who the email involves
 * - Content: What the email contains
 * - Location: Geographic relevance
 * - Personal: Personal/family context
 * - Financial: Money-related
 * - Calendar: Time-based events
 * - Learning: Educational/career content
 */
export const EMAIL_LABELS = [
  // Action-related
  'needs_reply',           // Someone is waiting for a response
  'needs_decision',        // User must choose between options
  'needs_review',          // Content requires user's review
  'needs_approval',        // Approval/sign-off requested

  // Urgency
  'urgent',                // Marked urgent or ASAP
  'has_deadline',          // Specific deadline mentioned
  'time_sensitive',        // Time-limited offer/opportunity

  // Relationship
  'from_vip',              // Sender is on VIP list
  'new_contact',           // First email from this sender
  'networking_opportunity', // Potential valuable connection

  // Content
  'has_attachment',        // Email has attachments
  'has_link',              // Contains important links
  'has_question',          // Direct question asked
  'has_event',             // Contains a calendar-worthy event with date/time (NEW Jan 2026)

  // Location
  'local_event',           // Event in user's metro area

  // Personal
  'family_related',        // Involves family members
  'community',             // Local community related

  // Financial
  'invoice',               // Invoice or bill
  'receipt',               // Purchase confirmation
  'payment_due',           // Payment deadline

  // Calendar
  'meeting_request',       // Meeting invitation
  'rsvp_needed',           // RSVP required
  'appointment',           // Scheduled appointment

  // Learning/Career
  'educational',           // Learning content
  'industry_news',         // Industry updates
  'job_opportunity',       // Job/career related
] as const;

export type EmailLabel = typeof EMAIL_LABELS[number];

// ═══════════════════════════════════════════════════════════════════════════════
// DATE TYPES (for DateExtractor)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of dates that can be extracted from emails.
 */
export const DATE_TYPES = [
  'deadline',       // Task/response deadlines
  'event',          // Calendar events
  'appointment',    // Scheduled appointments
  'payment_due',    // Invoice/bill due dates
  'expiration',     // Subscription/offer expirations
  'follow_up',      // Suggested follow-up times
  'birthday',       // Birthday mentions
  'anniversary',    // Work/personal anniversaries
  'recurring',      // Recurring events/meetings
  'reminder',       // General reminders
  'other',          // Other date-related items
] as const;

export type DateType = typeof DATE_TYPES[number];

/**
 * Recurrence patterns for recurring dates.
 */
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT RELATIONSHIP TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of relationships with contacts.
 */
export const RELATIONSHIP_TYPES = [
  'client',         // Paying client
  'colleague',      // Coworker
  'vendor',         // Service provider
  'friend',         // Personal friend
  'family',         // Family member
  'recruiter',      // Job recruiter
  'service',        // Service/support (e.g., bank, utility)
  'networking',     // Professional contact
  'unknown',        // Unknown relationship
] as const;

export type ContactRelationshipType = typeof RELATIONSHIP_TYPES[number];

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
 * This includes foundational info from onboarding that personalizes AI analysis.
 *
 * For example:
 * - Client tagger needs the list of known clients
 * - Categorizer uses VIP list for 'from_vip' label
 * - Event detector uses location for 'local_event' label
 */
export interface UserContext {
  /** User ID */
  userId: string;

  /** User's known clients */
  clients?: Client[];

  /** User's timezone (for deadline interpretation) */
  timezone?: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Foundational info from onboarding (user_context table)
  // ═══════════════════════════════════════════════════════════════════════════

  /** User's role (e.g., "Developer", "Entrepreneur") */
  role?: string;

  /** User's company */
  company?: string;

  /** User's location city */
  locationCity?: string;

  /** User's metro area (for local event detection) */
  locationMetro?: string;

  /** User's priorities in order of importance */
  priorities?: string[];

  /** User's active projects */
  projects?: string[];

  /** VIP email addresses */
  vipEmails?: string[];

  /** VIP email domains (e.g., "@importantclient.com") */
  vipDomains?: string[];

  /** User's interests for content relevance */
  interests?: string[];

  /** Family context for personal categorization */
  familyContext?: {
    spouseName?: string;
    kidsCount?: number;
    familyNames?: string[];
  };

  /** Work schedule for time-aware analysis */
  workHours?: {
    start: string; // "09:00"
    end: string;   // "17:00"
    days: number[]; // [1,2,3,4,5] for Mon-Fri
  };

  /** Whether onboarding is complete */
  onboardingCompleted?: boolean;
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
 * REFACTORED (Jan 2026): Changed to life-bucket categorization.
 * - category: Now represents what AREA OF LIFE the email touches
 * - labels: Include action labels like `has_event`, `needs_reply` for filtering
 * - summary: One-sentence assistant-style overview of the email
 * - quickAction: Suggested quick interaction for inbox triage
 *
 * The AI uses HUMAN-EYE INFERENCE to categorize - considering sender context,
 * domain patterns, and content to make smart decisions like a thoughtful assistant.
 */
export interface CategorizationData {
  /**
   * Primary email category (LIFE BUCKET).
   * What area of the user's life does this email touch?
   *
   * Categories: newsletters_general, news_politics, product_updates, local,
   * shopping, travel, finance, family_kids_school, family_health_appointments,
   * client_pipeline, business_work_general, personal_friends_family
   */
  category: EmailCategory;

  /**
   * Secondary labels for multi-dimensional classification.
   * Allows flexible filtering beyond the primary category.
   *
   * Examples:
   * - ['needs_reply', 'has_deadline', 'from_vip']
   * - ['local_event', 'rsvp_needed']
   * - ['invoice', 'payment_due']
   *
   * Maximum 5 labels per email.
   */
  labels: EmailLabel[];

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
 * Event format type - describes how attendees participate.
 * Helps users understand the format of the event.
 */
export type EventLocationType = 'in_person' | 'virtual' | 'hybrid' | 'unknown';

/**
 * Event locality type - describes where the event is relative to the user.
 *
 * ADDED (Jan 2026): Helps users understand if travel is required.
 * - local: Event is in or near the user's metro area
 * - out_of_town: Event requires travel to another city
 * - virtual: Event is online-only (no physical location)
 */
export type EventLocality = 'local' | 'out_of_town' | 'virtual' | null;

/**
 * Key date types - for important dates that aren't full events.
 * Examples: registration deadlines, open house dates, release dates.
 */
export type KeyDateType = 'registration_deadline' | 'open_house' | 'deadline' | 'release_date' | 'other';

/**
 * Result data from the event detector analyzer.
 *
 * REFACTORED (Jan 2026): This analyzer now runs when the `has_event` label
 * is present (detected by the categorizer), not based on a category.
 *
 * It extracts rich details needed for calendar integration including:
 * - Date/time with proper start and end
 * - Locality (local, out_of_town, virtual)
 * - Key dates that aren't full events (deadlines, open houses)
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
   * Event end date for multi-day events (YYYY-MM-DD).
   * Example: "2026-01-27" for a 3-day conference starting Jan 25.
   * May be null for single-day events.
   */
  eventEndDate?: string;

  /**
   * Type of location: in-person, virtual, hybrid, or unknown.
   * Describes the FORMAT of the event (how people participate).
   */
  locationType: EventLocationType;

  /**
   * Where the event is relative to the user's location.
   * NEW (Jan 2026): Helps users understand if travel is required.
   * - local: In user's metro area
   * - out_of_town: Requires travel to another city
   * - virtual: Online only (set automatically if locationType is 'virtual')
   */
  eventLocality?: EventLocality;

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
   * One-sentence assistant-style summary of the event.
   * Written as if a personal assistant is briefing the user.
   *
   * Examples:
   * - "Milwaukee Tech Meetup on Sat Jan 25 at 6pm (in-person). Free. RSVP by Jan 23."
   * - "Webinar: Cloud Security 101 on Fri at 2pm (virtual). Free, registration required."
   * - "Client dinner at Fancy Restaurant on Jan 30 at 7pm. RSVP to Sarah by Monday."
   *
   * This makes events scannable at a glance.
   */
  eventSummary?: string;

  /**
   * 2-4 key bullet points about the event.
   * Concise, actionable information for quick scanning.
   *
   * Examples:
   * - ["Sat Jan 25, 6-8pm", "In-person: 123 Main St", "Free", "RSVP by Jan 23"]
   * - ["Fri Jan 30, 2pm", "Virtual (Zoom)", "Registration required"]
   * - ["$50 per person", "Dress code: Business casual", "RSVP link included"]
   */
  keyPoints?: string[];

  /**
   * Whether this is a key date rather than a full event.
   * NEW (Jan 2026): For things like registration deadlines, open houses.
   * Key dates are important dates to note but aren't full events to attend.
   */
  isKeyDate?: boolean;

  /**
   * Type of key date if isKeyDate is true.
   * Examples: registration_deadline, open_house, deadline, release_date
   */
  keyDateType?: KeyDateType;

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
// DATE EXTRACTOR TYPES (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single extracted date from an email.
 */
export interface ExtractedDate {
  /**
   * Type of date extracted.
   */
  dateType: DateType;

  /**
   * The date in ISO format (YYYY-MM-DD).
   */
  date: string;

  /**
   * Time if known (HH:MM, 24-hour format).
   */
  time?: string;

  /**
   * End date for ranges (YYYY-MM-DD).
   */
  endDate?: string;

  /**
   * End time for ranges (HH:MM).
   */
  endTime?: string;

  /**
   * Short title describing this date.
   * Example: "Invoice #1234 due", "Project deadline"
   */
  title: string;

  /**
   * Additional context about this date.
   */
  description?: string;

  /**
   * Original text snippet that contained this date.
   */
  sourceSnippet?: string;

  /**
   * Related entity (person, company, project).
   */
  relatedEntity?: string;

  /**
   * Whether this is a recurring date.
   */
  isRecurring: boolean;

  /**
   * Recurrence pattern if applicable.
   */
  recurrencePattern?: RecurrencePattern;

  /**
   * Confidence in this date extraction (0-1).
   */
  confidence: number;
}

/**
 * Result data from the date extractor analyzer.
 *
 * This analyzer extracts timeline-relevant dates for the Hub view.
 * It runs on all emails and extracts deadlines, payment dates, birthdays, etc.
 */
export interface DateExtractionData {
  /**
   * Whether any dates were found.
   */
  hasDates: boolean;

  /**
   * List of extracted dates (0-10 per email).
   */
  dates: ExtractedDate[];

  /**
   * Overall confidence in the extraction (0-1).
   */
  confidence: number;
}

/**
 * Full result from the date extractor analyzer.
 */
export type DateExtractionResult = AnalyzerResult<DateExtractionData>;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT ENRICHER TYPES (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result data from the contact enricher analyzer.
 *
 * This analyzer extracts contact metadata from email content and signatures.
 * It runs selectively on emails from contacts that need enrichment.
 *
 * SELECTIVE EXECUTION:
 * - Only runs when contact has extraction_confidence IS NULL or < 0.5
 * - Or last_extracted_at > 30 days ago
 * - And contact has 3+ emails (worth the token cost)
 */
export interface ContactEnrichmentData {
  /**
   * Whether enrichment data was found.
   */
  hasEnrichment: boolean;

  /**
   * Company name extracted from signature or email body.
   */
  company?: string;

  /**
   * Job title or role.
   */
  jobTitle?: string;

  /**
   * Phone number if found in signature.
   */
  phone?: string;

  /**
   * LinkedIn URL if found.
   */
  linkedinUrl?: string;

  /**
   * Inferred relationship type.
   */
  relationshipType?: ContactRelationshipType;

  /**
   * Birthday if mentioned (MM-DD format, year optional).
   */
  birthday?: string;

  /**
   * Work anniversary if mentioned.
   */
  workAnniversary?: string;

  /**
   * Source of the enrichment data.
   */
  source: 'signature' | 'email_body' | 'both';

  /**
   * Confidence in the extracted data (0-1).
   */
  confidence: number;
}

/**
 * Full result from the contact enricher analyzer.
 */
export type ContactEnrichmentResult = AnalyzerResult<ContactEnrichmentData>;

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined analysis data from all analyzers.
 * This is stored in the email_analyses table.
 *
 * STRUCTURE (REFACTORED Jan 2026):
 * - categorization: Always runs (life-bucket classification + summary + labels)
 * - actionExtraction: Always runs (detailed action info)
 * - clientTagging: Always runs (client linking)
 * - dateExtraction: Always runs (timeline intelligence)
 * - eventDetection: Only runs when `has_event` label is present
 * - contactEnrichment: Selective (only for contacts needing enrichment)
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
   * Date extraction results (NEW Jan 2026).
   * Always runs. Extracts deadlines, payments, birthdays, etc. for Hub timeline.
   */
  dateExtraction?: DateExtractionData;

  /**
   * Event detection results.
   * Only present when category === 'event'.
   * Contains rich event details for calendar integration.
   */
  eventDetection?: EventDetectionData;

  /**
   * Contact enrichment results (NEW Jan 2026).
   * Only present when contact needs enrichment.
   * Contains extracted company, job title, birthday, etc.
   */
  contactEnrichment?: ContactEnrichmentData;

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
    dateExtraction?: DateExtractionResult;
    eventDetection?: EventDetectionResult;
    contactEnrichment?: ContactEnrichmentResult;
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
