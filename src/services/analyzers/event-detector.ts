/**
 * Event Detector Analyzer
 *
 * Extracts rich event details from emails with the `has_event` label.
 * This analyzer enables calendar integration and event management.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY (REFACTORED Jan 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer runs when the `has_event` LABEL is present (not category).
 * Since categories are now life-buckets, events can appear in any category:
 * - local (community events)
 * - family_kids_school (school events)
 * - business_work_general (conferences)
 * - client_pipeline (client meetings)
 *
 * The `has_event` label is set by the categorizer when an event is detected.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXTRACTED FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Core fields:
 * - eventTitle: Name of the event
 * - eventDate: Start date in ISO format (YYYY-MM-DD)
 * - eventTime: Start time (HH:MM, 24-hour)
 * - eventEndDate: End date for multi-day events
 * - eventEndTime: End time if known
 *
 * Location fields:
 * - locationType: in_person | virtual | hybrid | unknown (format)
 * - eventLocality: local | out_of_town | virtual (NEW - relative to user)
 * - location: Physical address or video link
 *
 * Registration fields:
 * - registrationDeadline: RSVP deadline if mentioned
 * - rsvpRequired: Whether RSVP is needed
 * - rsvpUrl: Link to register/RSVP
 *
 * Key date fields (NEW):
 * - isKeyDate: Whether this is a key date vs full event
 * - keyDateType: registration_deadline | open_house | deadline | etc.
 *
 * Other fields:
 * - organizer: Who's hosting
 * - cost: Price info ("Free", "$25", etc.)
 * - additionalDetails: Any other relevant info
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { EventDetectorAnalyzer } from '@/services/analyzers/event-detector';
 *
 * const detector = new EventDetectorAnalyzer();
 *
 * // Only run if email has the 'has_event' label
 * if (categorizationResult.data.labels.includes('has_event')) {
 *   const result = await detector.analyze(email, userContext);
 *
 *   if (result.success) {
 *     console.log(result.data.eventTitle);      // 'Milwaukee Tech Meetup'
 *     console.log(result.data.eventDate);       // '2026-01-25'
 *     console.log(result.data.eventLocality);   // 'local'
 *     console.log(result.data.isKeyDate);       // false
 *   }
 * }
 * ```
 *
 * @module services/analyzers/event-detector
 * @version 2.0.0
 * @since January 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  EventDetectionData,
  EventDetectionResult,
  EventLocationType,
  EventLocality,
  KeyDateType,
  EmailInput,
  UserContext,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'detect_event';

/**
 * Description of what the function does.
 * Helps OpenAI understand the purpose of this function.
 */
const FUNCTION_DESCRIPTION =
  'Extracts detailed event information from an email for calendar integration';

/**
 * Valid location types (format - how people participate).
 * Must match EventLocationType in types.ts.
 */
const LOCATION_TYPES = ['in_person', 'virtual', 'hybrid', 'unknown'] as const;

/**
 * Valid event locality types (where relative to user).
 * NEW (Jan 2026): Helps users understand if travel is required.
 */
const EVENT_LOCALITIES = ['local', 'out_of_town', 'virtual'] as const;

/**
 * Valid key date types (for non-event important dates).
 * NEW (Jan 2026): Things like registration deadlines, open houses.
 */
const KEY_DATE_TYPES = ['registration_deadline', 'open_house', 'deadline', 'release_date', 'other'] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for event detection.
 * Now includes user location context for locality detection.
 *
 * REFACTORED (Jan 2026): Added locality and key date detection.
 */
function buildSystemPrompt(context?: UserContext): string {
  const userLocation = context?.locationMetro || context?.locationCity || 'unknown';

  return `You are an event extraction specialist and personal assistant. Your job is to extract detailed event information AND present it in a way that helps busy users quickly understand what they need to know.

═══════════════════════════════════════════════════════════════════════════════
USER CONTEXT
═══════════════════════════════════════════════════════════════════════════════

User's location: ${userLocation}
(Use this to determine if events are local, out of town, or virtual)

═══════════════════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════════════════

1. Extract event details (date, time, location, etc.)
2. Determine if this is a FULL EVENT or a KEY DATE (deadline, open house date)
3. Determine EVENT LOCALITY (local to user, out of town, or virtual)
4. Write a concise, assistant-style summary with key points

Think: "What would a smart assistant tell me about this event in 10 seconds?"

═══════════════════════════════════════════════════════════════════════════════
KEY DATE vs FULL EVENT (NEW!)
═══════════════════════════════════════════════════════════════════════════════

Some emails mention important DATES but not full EVENTS to attend. Distinguish:

FULL EVENT (is_key_date = false):
- Something you attend or participate in
- Has a location (physical or virtual)
- Examples: meetup, conference, meeting, party, webinar, class

KEY DATE (is_key_date = true):
- An important date to remember, but not something you "attend"
- Examples: registration deadline, open house date, release date, enrollment deadline
- Set key_date_type to: registration_deadline, open_house, deadline, release_date, other

Examples:
- "Tech Conference on Jan 25 at the Convention Center" → FULL EVENT
- "Registration deadline: Jan 20" → KEY DATE (registration_deadline)
- "School open house dates: Jan 15 and Feb 12" → KEY DATE (open_house)
- "Product launch date: March 1" → KEY DATE (release_date)

═══════════════════════════════════════════════════════════════════════════════
EVENT LOCALITY (NEW!)
═══════════════════════════════════════════════════════════════════════════════

Determine where the event is RELATIVE TO THE USER:

- "local": Event is in or near ${userLocation}
  - Same city or nearby suburb
  - Within reasonable driving distance (< 1 hour)

- "out_of_town": Event requires travel to another city
  - Different city/metro area
  - Would require flight, hotel, or significant drive

- "virtual": Event is online only
  - Automatically set if location_type is "virtual"
  - Webinars, Zoom calls, online courses

Examples (assuming user is in Milwaukee):
- "Milwaukee Tech Meetup" → local
- "Shorewood Library event" → local (suburb of Milwaukee)
- "Chicago conference" → out_of_town
- "TechCrunch Disrupt in San Francisco" → out_of_town
- "Zoom webinar" → virtual

═══════════════════════════════════════════════════════════════════════════════
EVENT SUMMARY (one sentence - REQUIRED!)
═══════════════════════════════════════════════════════════════════════════════

Write ONE sentence that tells the user everything they need to know at a glance.
Format: "[Event name] on [Day Date] at [Time] ([locality]). [Cost]. [RSVP info if needed]."

GOOD EXAMPLES:
- "Milwaukee Tech Meetup on Sat Jan 25 at 6pm (local, in-person). Free. RSVP by Jan 23."
- "TechCrunch Disrupt on Sep 15-17 in SF (out of town). $1,500. Early bird ends Aug 1."
- "Webinar: Cloud Security 101 on Fri at 2pm (virtual). Free, registration required."
- "KEY DATE: School registration deadline is Jan 20."

═══════════════════════════════════════════════════════════════════════════════
KEY POINTS (2-4 bullet points - REQUIRED!)
═══════════════════════════════════════════════════════════════════════════════

Create 2-4 concise bullet points with the most important information.
Each point should be scannable in 2 seconds.

For FULL EVENTS include:
1. When: Date and time (e.g., "Sat Jan 25, 6-8pm")
2. Where: Locality + location (e.g., "Local: Tech Hub, Milwaukee" or "Out of town: SF Convention Center")
3. Cost: If mentioned
4. Action needed: RSVP deadline or registration requirement

For KEY DATES include:
1. What: The deadline or date type
2. When: The date
3. Action needed: What to do before that date

═══════════════════════════════════════════════════════════════════════════════
DATE AND TIME EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

- event_date: Start date in ISO format (YYYY-MM-DD)
  - "January 25, 2026" → "2026-01-25"
  - "next Friday" → calculate based on email date

- event_time: Start time in 24-hour format (HH:MM)
  - "6:00 PM" → "18:00"
  - Leave empty if no specific time

- event_end_date: End date for multi-day events (YYYY-MM-DD)
  - "Jan 25-27" → end_date "2026-01-27"
  - Leave empty for single-day events

- event_end_time: End time in 24-hour format (HH:MM)
  - "6-8 PM" → end_time "20:00"

═══════════════════════════════════════════════════════════════════════════════
LOCATION EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

- location_type (format - how people participate):
  - "in_person": Physical location required
  - "virtual": Online only (Zoom, webinar)
  - "hybrid": Both options available
  - "unknown": Can't determine

- location: The actual address or link
  - Physical: "123 Main St, Milwaukee, WI 53211"
  - Virtual: "https://zoom.us/j/123456789"

═══════════════════════════════════════════════════════════════════════════════
REGISTRATION AND RSVP
═══════════════════════════════════════════════════════════════════════════════

- rsvp_required: Is registration/RSVP needed?
- registration_deadline: RSVP deadline (ISO date)
- rsvp_url: Registration link if provided

═══════════════════════════════════════════════════════════════════════════════
OTHER DETAILS
═══════════════════════════════════════════════════════════════════════════════

- event_title: Name of the event (or description of key date)
- organizer: Who is hosting
- cost: Price info ("Free", "$25", etc.)
- additional_details: Parking, dress code, what to bring

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════════════════════

- Be conservative: if unsure about a field, leave it empty
- Lower confidence if: date ambiguous, location unclear, locality uncertain`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * REFACTORED (Jan 2026): Added event_locality, event_end_date, is_key_date, key_date_type.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * All fields match the EventDetectionData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether event was detected (should always be true)
      has_event: {
        type: 'boolean',
        description: 'Whether this email contains a detectable event or key date (should be true)',
      },

      // Whether this is a key date vs full event (NEW)
      is_key_date: {
        type: 'boolean',
        description: 'True if this is a KEY DATE (deadline, open house) rather than a full event to attend',
      },

      // Key date type if applicable (NEW)
      key_date_type: {
        type: 'string',
        enum: KEY_DATE_TYPES as unknown as string[],
        description: 'Type of key date: registration_deadline, open_house, deadline, release_date, other',
      },

      // Event title
      event_title: {
        type: 'string',
        description: 'Name/title of the event or description of the key date',
      },

      // Start date in ISO format
      event_date: {
        type: 'string',
        description: 'Event start date in ISO format (YYYY-MM-DD)',
      },

      // Start time in 24-hour format
      event_time: {
        type: 'string',
        description: 'Event start time in 24-hour format (HH:MM)',
      },

      // End date for multi-day events (NEW)
      event_end_date: {
        type: 'string',
        description: 'Event end date for multi-day events in ISO format (YYYY-MM-DD)',
      },

      // End time if known
      event_end_time: {
        type: 'string',
        description: 'Event end time in 24-hour format (HH:MM) if known',
      },

      // Location type (format)
      location_type: {
        type: 'string',
        enum: LOCATION_TYPES as unknown as string[],
        description: 'Format of event: in_person, virtual, hybrid, or unknown',
      },

      // Event locality relative to user (NEW)
      event_locality: {
        type: 'string',
        enum: EVENT_LOCALITIES as unknown as string[],
        description: 'Where event is relative to user: local (nearby), out_of_town (requires travel), virtual',
      },

      // Physical or virtual location
      location: {
        type: 'string',
        description: 'Physical address or video meeting link',
      },

      // Registration deadline
      registration_deadline: {
        type: 'string',
        description: 'Registration deadline in ISO format (YYYY-MM-DD) if mentioned',
      },

      // Whether RSVP is required
      rsvp_required: {
        type: 'boolean',
        description: 'Whether registration or RSVP is required',
      },

      // RSVP URL
      rsvp_url: {
        type: 'string',
        description: 'URL to register or RSVP if provided',
      },

      // Organizer
      organizer: {
        type: 'string',
        description: 'Who is organizing/hosting the event',
      },

      // Cost
      cost: {
        type: 'string',
        description: 'Cost information (e.g., "Free", "$25", "Members free")',
      },

      // Additional details
      additional_details: {
        type: 'string',
        description: 'Any other relevant event details (parking, dress code, etc.)',
      },

      // Event summary (assistant-style)
      event_summary: {
        type: 'string',
        description: 'One-sentence summary. Include locality. Example: "Milwaukee Tech Meetup on Sat Jan 25 at 6pm (local, in-person). Free."',
      },

      // Key points (bullet points)
      key_points: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 4,
        description: '2-4 concise bullet points. For events: when, where (with locality), cost, action. For key dates: what, when, action.',
      },

      // Confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the extraction accuracy (0-1)',
      },
    },
    required: ['has_event', 'is_key_date', 'event_title', 'event_date', 'location_type', 'rsvp_required', 'confidence', 'event_summary', 'key_points'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT DETECTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event Detector Analyzer
 *
 * Extracts rich event details from emails for calendar integration.
 * This analyzer runs when the `has_event` LABEL is present.
 *
 * REFACTORED (Jan 2026):
 * - Now uses `has_event` label instead of category check
 * - Added event locality (local, out_of_town, virtual)
 * - Added key date detection (deadlines, open houses)
 * - Added multi-day event support (eventEndDate)
 *
 * Features:
 * - Parses dates/times into consistent formats
 * - Identifies location type (in-person, virtual, hybrid)
 * - Determines locality relative to user (local, out_of_town, virtual)
 * - Distinguishes key dates from full events
 * - Extracts registration requirements and deadlines
 * - Captures cost and organizer information
 *
 * @example
 * ```typescript
 * const detector = new EventDetectorAnalyzer();
 *
 * // Only run if email has 'has_event' label
 * if (labels.includes('has_event')) {
 *   const result = await detector.analyze(email, userContext);
 *
 *   if (result.success) {
 *     if (result.data.isKeyDate) {
 *       // Handle key date (deadline, open house)
 *       console.log(`Key date: ${result.data.eventTitle} on ${result.data.eventDate}`);
 *     } else {
 *       // Handle full event
 *       console.log(`Event: ${result.data.eventTitle}`);
 *       console.log(`Locality: ${result.data.eventLocality}`); // local, out_of_town, virtual
 *     }
 *   }
 * }
 * ```
 */
export class EventDetectorAnalyzer extends BaseAnalyzer<EventDetectionData> {
  /**
   * Creates a new EventDetectorAnalyzer instance.
   *
   * Uses the eventDetector configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.2 for accurate extraction)
   * - maxTokens: Maximum response tokens (600 for detailed events)
   */
  constructor() {
    super('EventDetector', analyzerConfig.eventDetector);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * User context for locality detection.
   * Stored here so getSystemPrompt can access it.
   */
  private currentContext?: UserContext;

  /**
   * Analyzes an email and extracts event details.
   *
   * IMPORTANT: This analyzer should only be called when the email
   * has the `has_event` label (detected by the Categorizer).
   *
   * REFACTORED (Jan 2026): Now uses user context for locality detection.
   *
   * @param email - Email data to analyze
   * @param context - User context (used for locality detection)
   * @returns Event detection result with all extracted fields
   *
   * @example
   * ```typescript
   * const result = await detector.analyze({
   *   id: 'email-123',
   *   subject: 'You\'re Invited: Milwaukee Tech Meetup',
   *   senderEmail: 'events@mketech.org',
   *   senderName: 'MKE Tech Community',
   *   date: '2026-01-15T10:00:00Z',
   *   snippet: 'Join us for our January meetup on January 25th at 6pm...',
   *   bodyText: 'Milwaukee Tech Meetup: AI in Production...',
   * }, { locationMetro: 'Milwaukee, WI' });
   *
   * // result.data:
   * // {
   * //   hasEvent: true,
   * //   isKeyDate: false,
   * //   eventTitle: 'Milwaukee Tech Meetup: AI in Production',
   * //   eventDate: '2026-01-25',
   * //   eventTime: '18:00',
   * //   locationType: 'in_person',
   * //   eventLocality: 'local',  // NEW
   * //   location: '123 Main St, Milwaukee, WI 53211',
   * //   rsvpRequired: true,
   * //   confidence: 0.95,
   * // }
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<EventDetectionResult> {
    // Store context for use in getSystemPrompt
    this.currentContext = context;

    // Log with context info for debugging
    this.logger.debug('Running event detection (for emails with has_event label)', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      userLocation: context?.locationMetro || context?.locationCity || 'unknown',
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    // (OpenAI returns snake_case, we use camelCase)
    if (result.success) {
      result.data = this.normalizeResponse(result.data);
    }

    // Clear context after use
    this.currentContext = undefined;

    return result;
  }

  /**
   * Returns the OpenAI function schema for event detection.
   *
   * The schema defines the structured output format:
   * - has_event: Boolean (should be true)
   * - event_title: Event name
   * - event_date: ISO date
   * - event_time: 24-hour time
   * - location_type: in_person/virtual/hybrid/unknown
   * - location: Address or link
   * - And more...
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for event detection.
   *
   * REFACTORED (Jan 2026): Now uses user context for locality detection.
   *
   * The prompt instructs the AI to:
   * - Extract dates in ISO format
   * - Extract times in 24-hour format
   * - Identify location type (format)
   * - Determine event locality (local, out_of_town, virtual)
   * - Distinguish key dates from full events
   * - Capture registration requirements
   * - Be conservative about missing info
   *
   * @param context - User context (used for locality detection)
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    // Use stored context if available (from analyze call), otherwise use passed context
    return buildSystemPrompt(this.currentContext || context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   *
   * REFACTORED (Jan 2026): Added eventLocality, eventEndDate, isKeyDate, keyDateType.
   *
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method converts between them.
   *
   * @param rawData - Raw data from OpenAI (snake_case)
   * @returns Normalized data (camelCase)
   */
  private normalizeResponse(rawData: Record<string, unknown>): EventDetectionData {
    // Determine event locality - auto-set to 'virtual' if location type is virtual
    let eventLocality = rawData.event_locality as EventLocality | undefined;
    const locationType = (rawData.location_type as EventLocationType) || 'unknown';
    if (locationType === 'virtual' && !eventLocality) {
      eventLocality = 'virtual';
    }

    return {
      // Core event fields
      hasEvent: Boolean(rawData.has_event),
      eventTitle: (rawData.event_title as string) || 'Untitled Event',
      eventDate: (rawData.event_date as string) || '',

      // Time fields (optional)
      eventTime: rawData.event_time as string | undefined,
      eventEndTime: rawData.event_end_time as string | undefined,

      // Multi-day event support (NEW Jan 2026)
      eventEndDate: rawData.event_end_date as string | undefined,

      // Location fields
      locationType,
      eventLocality,  // NEW Jan 2026: local, out_of_town, virtual
      location: rawData.location as string | undefined,

      // Registration fields
      registrationDeadline: rawData.registration_deadline as string | undefined,
      rsvpRequired: Boolean(rawData.rsvp_required),
      rsvpUrl: rawData.rsvp_url as string | undefined,

      // Additional info
      organizer: rawData.organizer as string | undefined,
      cost: rawData.cost as string | undefined,
      additionalDetails: rawData.additional_details as string | undefined,

      // Assistant-style summary and key points
      eventSummary: rawData.event_summary as string | undefined,
      keyPoints: rawData.key_points as string[] | undefined,

      // Key date fields (NEW Jan 2026)
      isKeyDate: Boolean(rawData.is_key_date),
      keyDateType: rawData.key_date_type as KeyDateType | undefined,

      // Confidence
      confidence: (rawData.confidence as number) || 0.5,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default event detector instance for convenience.
 *
 * Use this for simple cases where you don't need custom configuration.
 *
 * @example
 * ```typescript
 * import { eventDetector } from '@/services/analyzers/event-detector';
 *
 * // Only run if email is categorized as 'event'
 * if (category === 'event') {
 *   const result = await eventDetector.analyze(email);
 *   console.log(`Event: ${result.data.eventTitle} on ${result.data.eventDate}`);
 * }
 * ```
 */
export const eventDetector = new EventDetectorAnalyzer();
