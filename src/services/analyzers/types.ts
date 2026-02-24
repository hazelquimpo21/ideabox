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
// SIGNAL STRENGTH (NEW Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Signal strength classification - "is this email worth the user's time?"
 *
 * This is the core relevance assessment. It answers: should this email be
 * surfaced prominently, or buried/auto-archived?
 *
 * DESIGN: Added to categorizer (not a separate analyzer) because it's
 * a natural extension of the "what is this email?" assessment and costs
 * zero additional API calls.
 */
export const SIGNAL_STRENGTHS = [
  'high',     // Direct human correspondence requiring attention (client, colleague, friend)
  'medium',   // Useful information worth seeing (relevant newsletter, product update you care about)
  'low',      // Background noise, can be batched or skipped (generic newsletters, promotions)
  'noise',    // Pure noise - auto-archive candidate (sales pitches, fake awards, mass outreach)
] as const;

export type SignalStrength = typeof SIGNAL_STRENGTHS[number];

// ═══════════════════════════════════════════════════════════════════════════════
// REPLY WORTHINESS (NEW Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reply worthiness assessment - "should the user reply to this?"
 *
 * More nuanced than quickAction='respond'. Distinguishes between:
 * - A client waiting for an answer (must_reply)
 * - A newsletter author whose content is relevant to your business (should_reply for networking)
 * - A cold outreach that seems interesting but isn't urgent (optional_reply)
 * - A broadcast with no expectation of response (no_reply)
 */
export const REPLY_WORTHINESS = [
  'must_reply',       // Someone is waiting. Direct question, client request, time-sensitive ask.
  'should_reply',     // Smart to reply. Networking opportunity, relationship building, warm lead.
  'optional_reply',   // Could reply if interested. Cold outreach that's actually relevant, interesting thread.
  'no_reply',         // No reply expected or useful. Broadcast, automated, transactional.
] as const;

export type ReplyWorthiness = typeof REPLY_WORTHINESS[number];

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
 * ENHANCED (Feb 2026): Added noise-detection labels for filtering out
 * low-value emails (sales pitches, fake awards, mass outreach, etc.)
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
 * - Noise: Low-value email patterns (NEW Feb 2026)
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
  'networking_opportunity', // Potential valuable connection (see criteria in categorizer prompt)

  // Content
  'has_attachment',        // Email has attachments
  'has_link',              // Contains important links
  'has_question',          // Direct question asked
  'has_event',             // Contains a calendar-worthy event with date/time (NEW Jan 2026)
  'has_multiple_events',   // Email lists multiple distinct events, course dates, or schedules (NEW Feb 2026)

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

  // Noise Detection (NEW Feb 2026)
  'sales_pitch',           // Cold sales email ("Let me show you our platform...")
  'webinar_invite',        // Generic webinar/event marketing (not relevant industry events)
  'fake_recognition',      // Fake awards, "You've been nominated", pay-to-play recognition
  'mass_outreach',         // PR pitches, link exchange, generic partnership requests
  'promotional',           // Deals, discounts, upsells from existing services
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
// SENDER TYPE CLASSIFICATION (NEW Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sender type classification - HOW does this person communicate with you?
 *
 * This is orthogonal to relationship_type (WHO is this person):
 * - sender_type: Nature of the communication channel
 * - relationship_type: Your relationship with the person (only meaningful for 'direct')
 *
 * Examples:
 * - A Substack author: sender_type='broadcast', relationship_type=null
 * - Your colleague: sender_type='direct', relationship_type='colleague'
 * - A cold sales email: sender_type='cold_outreach', relationship_type=null
 * - HARO query: sender_type='opportunity', relationship_type=null
 */
export const SENDER_TYPES = [
  'direct',         // Real person who knows you, expects/welcomes replies
  'broadcast',      // One-to-many sender (newsletter, marketing, notifications)
  'cold_outreach',  // Person reaching out cold (sales, recruiter, PR pitch)
  'opportunity',    // Mailing list where response is optional (HARO, community asks)
  'unknown',        // Not yet classified
] as const;

export type SenderType = typeof SENDER_TYPES[number];

/**
 * Subtypes for broadcast senders - finer classification.
 *
 * Only applicable when sender_type = 'broadcast'.
 */
export const BROADCAST_SUBTYPES = [
  'newsletter_author',    // Individual creator (Substack, personal blog)
  'company_newsletter',   // Company marketing/updates you signed up for
  'digest_service',       // LinkedIn digest, GitHub notifications, aggregators
  'transactional',        // Receipts, confirmations, noreply@ addresses
] as const;

export type BroadcastSubtype = typeof BROADCAST_SUBTYPES[number];

/**
 * How sender_type was determined.
 */
export const SENDER_TYPE_SOURCES = [
  'header',         // Detected from email headers (List-Unsubscribe, etc.)
  'email_pattern',  // Detected from email address pattern (noreply@, @substack.com)
  'ai_analysis',    // Determined by AI analyzer
  'user_behavior',  // Inferred from user actions (replied = direct)
  'manual',         // User explicitly set this
] as const;

export type SenderTypeSource = typeof SENDER_TYPE_SOURCES[number];

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT RELATIONSHIP TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of relationships with contacts.
 *
 * NOTE: Only meaningful when sender_type = 'direct'. For broadcast/cold_outreach
 * senders, relationship_type should be null or 'unknown'.
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
   * Categories: newsletters_creator, newsletters_industry, news_politics,
   * product_updates, local, shopping, travel, finance, family,
   * clients, work, personal_friends_family, other
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
   * - ['sales_pitch'] (noise detection)
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

  /**
   * Signal strength - "is this email worth the user's time?"
   * NEW (Feb 2026): Core relevance assessment for filtering and prioritization.
   *
   * - 'high': Direct human correspondence requiring attention
   * - 'medium': Useful information worth seeing
   * - 'low': Background noise, can be batched/skipped
   * - 'noise': Pure noise, auto-archive candidate
   */
  signalStrength: SignalStrength;

  /**
   * Reply worthiness - "should the user reply to this?"
   * NEW (Feb 2026): More nuanced than quickAction='respond'.
   *
   * - 'must_reply': Someone is waiting (client, colleague, direct question)
   * - 'should_reply': Smart networking/relationship move
   * - 'optional_reply': Could reply if interested
   * - 'no_reply': No reply expected or useful
   */
  replyWorthiness: ReplyWorthiness;

  /**
   * Additional categories this email could also belong to.
   * NEW (Feb 2026): Emails often touch multiple life areas.
   *
   * Examples:
   * - A client email about a dinner → primary: 'clients', additional: ['local']
   * - A family member's school newsletter → primary: 'family', additional: ['local']
   * - A finance newsletter with shopping deals → primary: 'newsletters_industry', additional: ['finance', 'shopping']
   *
   * Maximum 2 additional categories. Only include if genuinely relevant.
   * The email will show up in inbox views for ALL its categories.
   */
  additionalCategories?: EmailCategory[];
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
// MULTI-EVENT DETECTOR TYPES (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result data from the multi-event detector analyzer.
 *
 * NEW (Feb 2026): Handles emails that contain lists of multiple events,
 * course schedules, event roundups, or calendars of upcoming dates.
 *
 * Each event in the `events` array has the same shape as EventDetectionData,
 * making it compatible with the existing event saving and display pipeline.
 */
export interface MultiEventDetectionData {
  /**
   * Whether multiple events were found.
   */
  hasMultipleEvents: boolean;

  /**
   * Number of events extracted.
   */
  eventCount: number;

  /**
   * Array of extracted events, each with the same shape as EventDetectionData.
   * Max 10 events per email to cap token cost.
   */
  events: EventDetectionData[];

  /**
   * Description of the source format.
   * Examples: "Course schedule for Spring 2026", "Community event roundup", "Weekly class schedule"
   */
  sourceDescription?: string;

  /**
   * Confidence in the overall extraction accuracy (0-1).
   */
  confidence: number;
}

/**
 * Full result from the multi-event detector analyzer.
 */
export type MultiEventDetectionResult = AnalyzerResult<MultiEventDetectionData>;

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
 *
 * SENDER TYPE CLASSIFICATION (Jan 2026):
 * - Now also determines sender_type (direct, broadcast, cold_outreach, opportunity)
 * - For broadcast senders, determines broadcast_subtype
 * - This helps distinguish real contacts from newsletters/subscriptions
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
   * NOTE: Only meaningful when senderType = 'direct'.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER TYPE CLASSIFICATION (NEW Jan 2026)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Classification of how this sender communicates.
   *
   * - 'direct': Real person who knows you, expects/welcomes replies
   * - 'broadcast': Newsletter, marketing, notifications (one-to-many)
   * - 'cold_outreach': Cold email (sales, recruiter, PR pitch)
   * - 'opportunity': Mailing list with optional response (HARO, community asks)
   * - 'unknown': Cannot determine from content
   */
  senderType?: SenderType;

  /**
   * For broadcast senders, the specific subtype.
   * Only set when senderType = 'broadcast'.
   *
   * - 'newsletter_author': Individual creator (Substack, personal blog)
   * - 'company_newsletter': Company marketing/updates
   * - 'digest_service': LinkedIn digest, GitHub notifications
   * - 'transactional': Receipts, confirmations, noreply
   */
  broadcastSubtype?: BroadcastSubtype;

  /**
   * Confidence in the sender type classification (0-1).
   * Separate from overall enrichment confidence.
   */
  senderTypeConfidence?: number;

  /**
   * Reasoning for the sender type classification.
   * Helps with debugging and transparency.
   */
  senderTypeReasoning?: string;
}

/**
 * Full result from the contact enricher analyzer.
 */
export type ContactEnrichmentResult = AnalyzerResult<ContactEnrichmentData>;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT DIGEST TYPES (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Link types for extracted URLs.
 * Helps users understand what a link leads to without clicking.
 */
export const LINK_TYPES = [
  'article',       // News article, blog post, documentation
  'registration',  // Event registration, signup form
  'document',      // PDF, doc, spreadsheet to review
  'video',         // YouTube, Vimeo, video content
  'product',       // Product page, feature announcement
  'tool',          // App, SaaS tool, software
  'social',        // Social media profile/post
  'unsubscribe',   // Unsubscribe link (low-value but notable)
  'other',         // Other link types
] as const;

export type LinkType = typeof LINK_TYPES[number];

/**
 * Content types for email classification.
 * More granular than category - describes the structure of the content.
 */
export const CONTENT_TYPES = [
  'single_topic',       // Email about one main thing (product update, request, etc.)
  'multi_topic_digest', // Newsletter with multiple stories/items
  'curated_links',      // Link roundup, reading list
  'personal_update',    // Personal correspondence, life update
  'transactional',      // Receipt, confirmation, notification
] as const;

export type ContentType = typeof CONTENT_TYPES[number];

/**
 * An extracted link with context.
 * Helps users decide which links are worth clicking.
 */
export interface ExtractedLink {
  /**
   * The URL itself.
   */
  url: string;

  /**
   * Type of content the link leads to.
   */
  type: LinkType;

  /**
   * Title or label for the link.
   * Example: "How to use auto-layout 5.0"
   */
  title: string;

  /**
   * Brief description of why this link matters.
   * Example: "Full tutorial with examples"
   */
  description: string;

  /**
   * Whether this link is the main content of the email.
   * True for: the article a newsletter is sharing, the registration link for an event.
   * False for: related links, social follow links, tracking links.
   */
  isMainContent: boolean;
}

/**
 * A key point extracted from the email.
 * These are the "what you need to know" bullet points.
 */
export interface KeyPoint {
  /**
   * The key point itself - a concise, informative statement.
   * Example: "Figma released auto-layout 5.0 with text wrapping support"
   */
  point: string;

  /**
   * Why this point might be relevant to the user (optional).
   * Example: "Matches your interest in AI"
   * Only included for multi-topic digests when matching user interests.
   */
  relevance?: string;
}

/**
 * Type of golden nugget extracted from email content.
 * NEW (Feb 2026): Deals, tips, quotes, stats, and recommendations worth saving.
 * ENHANCED (Feb 2026): Added remember_this and sales_opportunity types.
 */
export type GoldenNuggetType = 'deal' | 'tip' | 'quote' | 'stat' | 'recommendation' | 'remember_this' | 'sales_opportunity';

/**
 * All valid golden nugget types as a const array for function schema enums.
 */
export const GOLDEN_NUGGET_TYPES: GoldenNuggetType[] = [
  'deal', 'tip', 'quote', 'stat', 'recommendation', 'remember_this', 'sales_opportunity',
];

/**
 * A golden nugget — a deal, tip, quote, stat, recommendation, or notable detail
 * found in an email. These are the little treasures buried in emails that are easy to miss.
 * NEW (Feb 2026)
 */
export interface GoldenNugget {
  /** The nugget text — a deal code, tip, memorable quote, stat, or recommendation */
  nugget: string;
  /** Type of nugget */
  type: GoldenNuggetType;
}

/**
 * Type of email style idea captured from an email's format/design.
 * NEW (Feb 2026): For solopreneurs who want to save ideas about
 * email formatting, layout, tone, or design from influencers and brands.
 */
export type EmailStyleIdeaType = 'layout' | 'subject_line' | 'tone' | 'cta' | 'visual' | 'storytelling' | 'personalization';

/**
 * An email style idea — something about HOW the email was written/designed
 * that the user might want to emulate in their own emails.
 * NEW (Feb 2026)
 */
export interface EmailStyleIdea {
  /** What's notable about this email's style */
  idea: string;
  /** What aspect of the email design this covers */
  type: EmailStyleIdeaType;
  /** Why this is effective or worth noting */
  whyItWorks: string;
  /** Confidence this is genuinely worth noting (0-1) */
  confidence: number;
}

/**
 * Result data from the content digest analyzer.
 *
 * This analyzer extracts the SUBSTANCE of an email:
 * - What is this email actually about? (gist)
 * - What are the key takeaways? (keyPoints)
 * - What links are worth knowing about? (links)
 * - What golden nuggets are buried in here? (deals, tips, quotes, stats)
 *
 * Think of this as having a sharp personal assistant read the email and brief you.
 *
 * DESIGN PHILOSOPHY:
 * - Gist is punchy and human: "Figma shipped auto-layout 5.0..."
 * - Key points are specific: include names, dates, numbers, not vague summaries
 * - Links are filtered: only include ones worth clicking, not tracking pixels
 * - Golden nuggets: deals, tips, quotes, stats, recommendations worth saving
 * - For newsletters: highlight items matching user interests
 */
export interface ContentDigestData {
  /**
   * One-two sentence briefing about the email content.
   * Written like an assistant telling you what the email is about.
   *
   * TONE: Conversational, specific, helpful.
   *
   * Examples:
   * - "Figma shipped auto-layout 5.0 - the big thing is text wrapping finally
   *    works properly. Rolling out to everyone this week."
   * - "Today's Morning Brew covers the Fed rate decision, Apple's AI features,
   *    and a deep dive on Costco's hot dog strategy."
   * - "Sarah from Acme is checking in about the Q1 proposal and wants to know
   *    your availability for a call next week."
   */
  gist: string;

  /**
   * 2-5 key points - the substance of the email.
   * Each point should be scannable in 2 seconds.
   *
   * GOOD key points are SPECIFIC:
   * - "Figma released auto-layout 5.0 with text wrapping and min/max widths"
   * - "Rolling out Monday Jan 27 to all plans including free tier"
   * - "Breaking change: existing fixed-width text may need adjustment"
   *
   * BAD key points are VAGUE:
   * - "Product update announcement"
   * - "New features available"
   * - "Important information included"
   */
  keyPoints: KeyPoint[];

  /**
   * Links extracted from the email with context.
   * Only includes links worth knowing about - not tracking pixels or generic footers.
   *
   * Prioritized by value:
   * 1. Main content links (isMainContent: true)
   * 2. Actionable links (registration, documents to review)
   * 3. Supplementary content (related articles, videos)
   */
  links: ExtractedLink[];

  /**
   * Type of content structure.
   * Helps UI decide how to display the digest.
   *
   * - single_topic: One main thing (show gist prominently)
   * - multi_topic_digest: Multiple stories (show key points as list)
   * - curated_links: Link collection (emphasize link list)
   * - personal_update: Personal email (de-emphasize, more private)
   * - transactional: Receipt/notification (minimal display)
   */
  contentType: ContentType;

  /**
   * For multi_topic_digest: which topics match user interests.
   * Helps highlight relevant items in newsletters.
   * Example: ["AI", "TypeScript"] when user has those interests.
   */
  topicsHighlighted?: string[];

  /**
   * Golden nuggets — deals, tips, quotes, stats, recommendations worth saving.
   * NEW (Feb 2026): The little treasures buried in emails.
   *
   * Examples:
   * - { nugget: "Code SAVE20 for 20% off, expires March 1", type: "deal" }
   * - { nugget: "Use Cmd+K to search across all Figma files", type: "tip" }
   * - { nugget: "Average open rate for tech newsletters is 38%", type: "stat" }
   */
  goldenNuggets?: GoldenNugget[];

  /**
   * Email style ideas — notable aspects of HOW this email was written/designed.
   * NEW (Feb 2026): For solopreneurs who admire certain email formats.
   *
   * Only populated for newsletters and branded emails worth learning from.
   * Examples:
   * - { idea: "Uses a single compelling question as subject line", type: "subject_line" }
   * - { idea: "Opens with a personal story before the pitch", type: "storytelling" }
   */
  emailStyleIdeas?: EmailStyleIdea[];

  /**
   * Confidence in the content extraction (0-1).
   */
  confidence: number;
}

/**
 * Full result from the content digest analyzer.
 */
export type ContentDigestResult = AnalyzerResult<ContentDigestData>;

// ═══════════════════════════════════════════════════════════════════════════════
// IDEA SPARK TYPES (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of ideas that can be sparked from email content.
 *
 * Each type represents a different area of the user's life where the
 * email content might inspire action or creativity. The AI considers
 * the user's full context (role, interests, location, family, projects)
 * to generate relevant ideas across these categories.
 *
 * Examples:
 * - A tech newsletter → social_post ("Share your take on this trend")
 * - A school email → family_activity ("Plan a science project together")
 * - A client email → business ("Propose a case study about this project")
 * - A local event email → community ("Volunteer at the event")
 * - A shipping confirmation → date_night ("Surprise dinner when package arrives")
 */
export const IDEA_TYPES = [
  'social_post',       // Content for social media (tweet, LinkedIn post, blog)
  'networking',        // Reach out, connect, introduce, collaborate
  'business',          // Business opportunity, proposal, offering, strategy
  'content_creation',  // Blog post, article, podcast topic, video idea
  'hobby',             // Personal interests, side projects, learning
  'shopping',          // Gift ideas, things to buy, wishlist items
  'date_night',        // Partner/relationship activities, romantic ideas
  'family_activity',   // Activities with kids, family outings, traditions
  'personal_growth',   // Skills to learn, habits to build, books to read
  'community',         // Local involvement, volunteering, neighborhood
] as const;

export type IdeaType = typeof IDEA_TYPES[number];

/**
 * A single idea sparked from email content.
 *
 * The AI generates these by cross-referencing the email's content with
 * what it knows about the user. A good idea is specific, actionable,
 * and connects something in the email to the user's actual life.
 *
 * GOOD idea: "Post a LinkedIn thread about how AI is changing podcast production
 *             — your PodcastPipeline project is a real-world case study"
 * BAD idea:  "Think about AI" (too vague, not connected to user)
 */
export interface IdeaSpark {
  /**
   * The idea itself — 1-2 sentences, specific and actionable.
   *
   * Should feel like a thoughtful suggestion from a friend who
   * knows you well, not a generic brainstorm.
   */
  idea: string;

  /**
   * Category of idea — helps with filtering and grouping.
   */
  type: IdeaType;

  /**
   * Why this idea connects to the user — explains the bridge
   * between the email content and the user's context.
   *
   * Example: "Your interest in AI + this newsletter's coverage of
   *           production ML makes this a natural LinkedIn topic"
   */
  relevance: string;

  /**
   * Confidence that this idea would be useful to the user (0-1).
   * Higher = stronger connection between email content and user context.
   */
  confidence: number;
}

/**
 * Result data from the idea spark analyzer.
 *
 * NEW (Feb 2026): Generates creative ideas from email content.
 *
 * Every non-noise email gets 3 ideas generated by cross-referencing
 * the email's content with the user's full context (role, interests,
 * projects, location, family, current date/season).
 *
 * DESIGN PHILOSOPHY:
 * - Ideas should be lateral, not obvious ("a finance email could inspire a date night")
 * - Every idea must connect back to something specific about the user
 * - Ideas are suggestions, not tasks — the user decides what to pursue
 * - Quality > quantity — 3 thoughtful ideas beat 10 generic ones
 */
export interface IdeaSparkData {
  /**
   * Whether ideas were successfully generated.
   * May be false for very short/empty emails with no content to inspire ideas.
   */
  hasIdeas: boolean;

  /**
   * Array of 3 ideas inspired by this email.
   * Each idea is typed, explained, and confidence-scored.
   */
  ideas: IdeaSpark[];

  /**
   * Overall confidence in the idea generation (0-1).
   * Lower for emails with thin content or weak connections to user context.
   */
  confidence: number;
}

/**
 * Full result from the idea spark analyzer.
 */
export type IdeaSparkResult = AnalyzerResult<IdeaSparkData>;

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT EXTRACTOR TYPES (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of insights that can be extracted from email content.
 *
 * These represent different kinds of "worth knowing" information — ideas,
 * tips, frameworks, observations, and trends synthesized from email content.
 * Unlike IdeaSpark (what should I DO?), insights are about what's WORTH KNOWING.
 *
 * Examples:
 * - A product management newsletter → tip ("Best PMs spend 60% on discovery")
 * - An AI research digest → trend ("RAG is replacing fine-tuning for most use cases")
 * - A business strategy email → framework ("Jobs-to-be-done for product roadmapping")
 * - An industry report → counterintuitive ("Remote teams ship faster than co-located")
 */
export const INSIGHT_TYPES = [
  'tip',               // Practical, actionable advice or best practice
  'framework',         // Mental model, methodology, or structured approach
  'observation',       // Interesting observation or analysis worth noting
  'counterintuitive',  // Surprising finding that challenges assumptions
  'trend',             // Emerging pattern, direction, or industry movement
] as const;

export type InsightType = typeof INSIGHT_TYPES[number];

/**
 * A single insight extracted from email content.
 *
 * Insights are synthesized takeaways — not just summaries of what the email
 * says, but distilled ideas worth remembering. Think "what's the interesting
 * idea here?" not "what does the email say?"
 *
 * GOOD insight: "Companies using RAG see 40% fewer hallucinations than
 *                fine-tuning alone — worth revisiting your prompt architecture"
 * BAD insight:  "The newsletter discussed AI" (too vague, just a summary)
 */
export interface EmailInsight {
  /**
   * The insight itself — 1-2 sentences, specific and memorable.
   * Should feel like something worth writing in a notebook.
   */
  insight: string;

  /**
   * Category of insight — helps with filtering and grouping.
   */
  type: InsightType;

  /**
   * Topic tags for this insight (1-3 short tags).
   * Used for filtering and connecting related insights.
   * Example: ["AI", "prompt-engineering"] or ["product-management", "discovery"]
   */
  topics: string[];

  /**
   * Confidence that this is a genuinely interesting/useful insight (0-1).
   * Higher = more specific, novel, and well-supported by the source content.
   */
  confidence: number;
}

/**
 * Result data from the insight extractor analyzer.
 *
 * NEW (Feb 2026): Synthesizes interesting ideas, tips, and frameworks
 * from email content — particularly newsletters and substantive content.
 *
 * This fills the gap between ContentDigest ("what does the email say")
 * and IdeaSpark ("what should I do about it") with "what's worth knowing."
 *
 * DESIGN PHILOSOPHY:
 * - Insights should be SYNTHESIZED, not just extracted quotes
 * - Each insight should be memorable and worth saving to a notebook
 * - Quality > quantity — 2 great insights beat 4 mediocre ones
 * - Only generate insights when the content actually has substance
 */
export interface InsightExtractionData {
  /**
   * Whether meaningful insights were found in the email.
   * False for emails with no substantive ideas (transactional, personal chat, etc.)
   */
  hasInsights: boolean;

  /**
   * Array of 2-4 insights synthesized from the email content.
   * Each insight is typed, tagged with topics, and confidence-scored.
   */
  insights: EmailInsight[];

  /**
   * Overall confidence in the extraction quality (0-1).
   * Lower when the email content is thin or generic.
   */
  confidence: number;
}

/**
 * Full result from the insight extractor analyzer.
 */
export type InsightExtractionResult = AnalyzerResult<InsightExtractionData>;

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS BRIEF TYPES (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single news item extracted from email content.
 *
 * News items are factual, time-stamped items about what HAPPENED — launches,
 * announcements, regulatory changes, acquisitions, etc. Unlike insights
 * (ideas worth knowing), news is about events in the world.
 *
 * GOOD news item:
 *   headline: "EU passed AI Act requiring model transparency for high-risk systems"
 *   detail: "Enforcement begins March 2027; affects companies deploying AI in healthcare, finance, and law enforcement"
 *
 * BAD news item:
 *   headline: "AI regulation news" (too vague, not a specific event)
 */
export interface NewsItem {
  /**
   * One-line headline of the news item.
   * Should read like a news ticker — concise, factual, specific.
   */
  headline: string;

  /**
   * One sentence of additional context or detail.
   * Answers: why does this matter? what are the implications?
   */
  detail: string;

  /**
   * Topic tags for this news item (1-3 short tags).
   * Used for filtering and connecting related news.
   * Example: ["AI", "regulation"] or ["Apple", "hardware"]
   */
  topics: string[];

  /**
   * Specific date mentioned in the news item (YYYY-MM-DD), if any.
   * Example: launch date, effective date, announcement date.
   */
  dateMentioned?: string;

  /**
   * Confidence that this is a genuine, factual news item (0-1).
   * Higher = specific, verifiable, newsworthy fact.
   */
  confidence: number;
}

/**
 * Result data from the news brief analyzer.
 *
 * NEW (Feb 2026): Extracts newsworthy facts from email content —
 * what happened, what launched, what changed in the world.
 *
 * This is the factual complement to InsightExtractor. Insights are about
 * ideas worth knowing; news is about events that happened.
 *
 * DESIGN PHILOSOPHY:
 * - News items must be FACTUAL, not opinions or analysis
 * - Each item should answer "what happened?" not "what does it mean?"
 * - Time-sensitive: prioritize recent announcements and developments
 * - Only extract news when the email actually contains newsworthy items
 */
export interface NewsBriefData {
  /**
   * Whether the email contains newsworthy items.
   * False for emails with no news (personal correspondence, transactional, etc.)
   */
  hasNews: boolean;

  /**
   * Array of 1-5 news items extracted from the email.
   * Each item has a headline, detail, topics, and optional date.
   */
  newsItems: NewsItem[];

  /**
   * Overall confidence in the extraction quality (0-1).
   */
  confidence: number;
}

/**
 * Full result from the news brief analyzer.
 */
export type NewsBriefResult = AnalyzerResult<NewsBriefData>;

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED ACTION EXTRACTOR TYPES (Multi-Action Support - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single action item extracted from an email.
 * Used in the new multi-action format.
 */
export interface ActionItem {
  /**
   * Type of action required.
   */
  type: ActionType;

  /**
   * Short title for the action.
   * Example: "Review Q1 proposal"
   */
  title: string;

  /**
   * Detailed description of what needs to be done (optional).
   */
  description?: string;

  /**
   * Deadline if mentioned (ISO 8601 or relative like "Friday").
   */
  deadline?: string;

  /**
   * Priority within this email (1 = highest).
   * Used to order actions from the same email.
   */
  priority: number;

  /**
   * Estimated time to complete in minutes.
   */
  estimatedMinutes?: number;

  /**
   * The text in the email that triggered this action.
   * Helps with debugging and user verification.
   * Example: "Please review by Friday"
   */
  sourceLine?: string;

  /**
   * Confidence in this specific action extraction (0-1).
   */
  confidence: number;
}

/**
 * Enhanced action extraction data with multi-action support.
 *
 * BACKWARDS COMPATIBLE: Old single-action fields are still populated
 * from the primary (first) action for code that hasn't migrated yet.
 *
 * NEW BEHAVIOR (Jan 2026):
 * - Multiple actions extracted into `actions` array
 * - Each action has its own priority, deadline, and confidence
 * - `urgencyScore` reflects the highest urgency across all actions
 */
export interface EnhancedActionExtractionData {
  /**
   * Whether this email requires any action from the user.
   * True if at least one action was found.
   */
  hasAction: boolean;

  /**
   * Array of action items found in the email.
   * Ordered by priority (1 = most important first).
   * Empty array if hasAction is false.
   */
  actions: ActionItem[];

  /**
   * Index of the primary (most important) action in the actions array.
   * Usually 0, but may differ if priorities are reordered.
   */
  primaryActionIndex: number;

  /**
   * Highest urgency score across all actions (1-10).
   * - 1-3: Can wait a week or more
   * - 4-6: Should be done this week
   * - 7-8: Should be done in 1-2 days
   * - 9-10: Urgent, needs immediate attention
   */
  urgencyScore: number;

  /**
   * Overall confidence in the action extraction (0-1).
   */
  confidence: number;

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY FIELDS (for backwards compatibility)
  // These mirror the primary action for code that expects the old format.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use actions[primaryActionIndex].type instead
   * Type of the primary action. 'none' if hasAction is false.
   */
  actionType: ActionType;

  /**
   * @deprecated Use actions[primaryActionIndex].title instead
   * Title of the primary action.
   */
  actionTitle?: string;

  /**
   * @deprecated Use actions[primaryActionIndex].description instead
   * Description of the primary action.
   */
  actionDescription?: string;

  /**
   * @deprecated Use actions[primaryActionIndex].deadline instead
   * Deadline of the primary action.
   */
  deadline?: string;

  /**
   * @deprecated Use actions[primaryActionIndex].estimatedMinutes instead
   * Time estimate for the primary action.
   */
  estimatedMinutes?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined analysis data from all analyzers.
 * This is stored in the email_analyses table.
 *
 * STRUCTURE (ENHANCED Feb 2026):
 * - categorization: Always runs (life-bucket classification + summary + labels)
 * - contentDigest: Always runs (gist, key points, links extraction)
 * - actionExtraction: Always runs (now supports multiple actions)
 * - clientTagging: Always runs (client linking)
 * - dateExtraction: Always runs (timeline intelligence)
 * - ideaSparks: Phase 2 — runs on non-noise emails (idea generation) [NEW Feb 2026]
 * - eventDetection: Only runs when `has_event` label is present
 * - contactEnrichment: Selective (only for contacts needing enrichment)
 */
export interface AggregatedAnalysis {
  /** Categorization results (always present if analysis succeeded) */
  categorization?: CategorizationData;

  /**
   * Content digest results (NEW Jan 2026).
   * Always runs. Extracts gist, key points, and links for quick scanning.
   * Think of this as having an assistant read the email and brief you.
   */
  contentDigest?: ContentDigestData;

  /**
   * Action extraction results (ENHANCED Jan 2026).
   * Now supports multiple actions per email.
   * Legacy single-action fields still populated for backwards compatibility.
   */
  actionExtraction?: ActionExtractionData | EnhancedActionExtractionData;

  /** Client tagging results (always present if analysis succeeded) */
  clientTagging?: ClientTaggingData;

  /**
   * Date extraction results (NEW Jan 2026).
   * Always runs. Extracts deadlines, payments, birthdays, etc. for Hub timeline.
   */
  dateExtraction?: DateExtractionData;

  /**
   * Event detection results.
   * Only present when `has_event` label is present.
   * Contains rich event details for calendar integration.
   */
  eventDetection?: EventDetectionData;

  /**
   * Multi-event detection results (NEW Feb 2026).
   * Only present when both `has_event` AND `has_multiple_events` labels are present.
   * Contains an array of events extracted from emails with multiple events/dates.
   */
  multiEventDetection?: MultiEventDetectionData;

  /**
   * Idea spark results (NEW Feb 2026).
   * Runs on all non-noise emails (Phase 2, after categorizer determines signal_strength).
   * Contains 3 creative ideas inspired by the email + user context.
   *
   * Ideas span: social posts, networking, business, hobbies, date nights,
   * family activities, personal growth, community involvement, etc.
   */
  ideaSparks?: IdeaSparkData;

  /**
   * Insight extraction results (NEW Feb 2026).
   * Phase 2 — runs on newsletter/substantive content (multi_topic_digest, single_topic, curated_links).
   * Synthesizes interesting ideas, tips, frameworks, and observations from email content.
   *
   * Fills the gap between ContentDigest ("what does the email say") and
   * IdeaSpark ("what should I do") with "what's worth knowing."
   */
  insightExtraction?: InsightExtractionData;

  /**
   * News brief results (NEW Feb 2026).
   * Phase 2 — runs on emails with newsworthy content (industry_news label or digest content types).
   * Extracts factual news items: what happened, what launched, what changed.
   *
   * The factual complement to InsightExtractor: news is about events,
   * insights are about ideas.
   */
  newsBrief?: NewsBriefData;

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
    contentDigest?: ContentDigestResult;
    actionExtraction?: ActionExtractionResult;
    clientTagging?: ClientTaggingResult;
    dateExtraction?: DateExtractionResult;
    ideaSparks?: IdeaSparkResult;
    insightExtraction?: InsightExtractionResult;
    newsBrief?: NewsBriefResult;
    eventDetection?: EventDetectionResult;
    multiEventDetection?: MultiEventDetectionResult;
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
