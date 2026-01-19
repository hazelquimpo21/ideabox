/**
 * Event Detector Analyzer
 *
 * Extracts rich event details from emails categorized as 'event'.
 * This analyzer enables calendar integration and event management.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer ONLY runs when category === 'event' (determined by Categorizer).
 * This conditional execution saves tokens:
 * - Events are ~5-10% of emails
 * - Running on all emails would be wasteful
 * - Categorizer is fast and cheap; event details are more expensive
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXTRACTED FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - eventTitle: Name of the event
 * - eventDate: Date in ISO format (YYYY-MM-DD)
 * - eventTime: Start time (HH:MM, 24-hour)
 * - eventEndTime: End time if known
 * - locationType: in_person | virtual | hybrid | unknown
 * - location: Physical address or video link
 * - registrationDeadline: RSVP deadline if mentioned
 * - rsvpRequired: Whether RSVP is needed
 * - rsvpUrl: Link to register/RSVP
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
 * // Only run if email is categorized as 'event'
 * if (categorizationResult.data.category === 'event') {
 *   const result = await detector.analyze(email);
 *
 *   if (result.success) {
 *     console.log(result.data.eventTitle);    // 'Milwaukee Tech Meetup'
 *     console.log(result.data.eventDate);     // '2026-01-25'
 *     console.log(result.data.eventTime);     // '18:00'
 *     console.log(result.data.locationType);  // 'in_person'
 *     console.log(result.data.location);      // '123 Main St, Milwaukee, WI'
 *   }
 * }
 * ```
 *
 * @module services/analyzers/event-detector
 * @version 1.0.0
 * @since January 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  EventDetectionData,
  EventDetectionResult,
  EventLocationType,
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
 * Valid location types.
 * Must match EventLocationType in types.ts.
 */
const LOCATION_TYPES = ['in_person', 'virtual', 'hybrid', 'unknown'] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for event detection.
 *
 * This prompt is crafted to:
 * 1. Extract all relevant event details accurately
 * 2. Parse dates/times into consistent formats
 * 3. Identify location type (in-person vs virtual)
 * 4. Capture registration requirements
 * 5. Be conservative about missing information
 */
const SYSTEM_PROMPT = `You are an event extraction specialist. Your job is to extract detailed event information from emails for calendar integration.

═══════════════════════════════════════════════════════════════════════════════
DATE AND TIME EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

- event_date: Extract the date in ISO format (YYYY-MM-DD)
  - "January 25, 2026" → "2026-01-25"
  - "1/25/26" → "2026-01-25"
  - "next Friday" → calculate based on email date
  - If multiple dates, use the first/main event date

- event_time: Extract start time in 24-hour format (HH:MM)
  - "6:00 PM" → "18:00"
  - "2:30 PM" → "14:30"
  - "10am" → "10:00"
  - Leave empty if no specific time mentioned

- event_end_time: Extract end time if mentioned
  - "6-8 PM" → start "18:00", end "20:00"
  - Leave empty if not specified

═══════════════════════════════════════════════════════════════════════════════
LOCATION EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

- location_type: Determine if event is:
  - "in_person": Physical location required (office, venue, restaurant)
  - "virtual": Online only (Zoom, Google Meet, Teams, webinar)
  - "hybrid": Both in-person and virtual options
  - "unknown": Can't determine from email

- location: Extract the actual location
  - Physical address: "123 Main St, Milwaukee, WI 53211"
  - Video link: "https://zoom.us/j/123456789"
  - Meeting room: "Conference Room B, 3rd Floor"
  - If multiple, provide the primary one

═══════════════════════════════════════════════════════════════════════════════
REGISTRATION AND RSVP
═══════════════════════════════════════════════════════════════════════════════

- rsvp_required: Is registration/RSVP needed?
  - Look for: "RSVP", "register", "sign up", "limited seats", "reserve"
  - true if registration seems required
  - false if open event or no registration mentioned

- registration_deadline: When is the RSVP due?
  - Extract deadline if mentioned
  - Format as ISO date (YYYY-MM-DD)

- rsvp_url: Registration link if provided
  - Extract any signup/registration URLs

═══════════════════════════════════════════════════════════════════════════════
OTHER DETAILS
═══════════════════════════════════════════════════════════════════════════════

- event_title: Name/title of the event
  - Use the actual event name, not subject line
  - "Milwaukee Tech Meetup: AI in Production"
  - "Q1 Planning Session"
  - "Sarah's Birthday Party"

- organizer: Who is hosting/organizing
  - Company name, person name, or organization
  - "MKE Tech Community", "John Smith", "Marketing Team"

- cost: Price information if mentioned
  - "Free"
  - "$25"
  - "Members free, $10 for guests"
  - Leave empty if not mentioned

- additional_details: Any other important info
  - Parking instructions
  - Dress code
  - What to bring
  - Special requirements

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════════════════════

- Be conservative: if you're unsure about a field, leave it empty
- Set confidence based on how clearly the event details are stated
- Lower confidence if: date ambiguous, location unclear, time not specified`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
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
        description: 'Whether this email contains a detectable event (should be true)',
      },

      // Event title
      event_title: {
        type: 'string',
        description: 'Name/title of the event',
      },

      // Date in ISO format
      event_date: {
        type: 'string',
        description: 'Event date in ISO format (YYYY-MM-DD)',
      },

      // Start time in 24-hour format
      event_time: {
        type: 'string',
        description: 'Event start time in 24-hour format (HH:MM)',
      },

      // End time if known
      event_end_time: {
        type: 'string',
        description: 'Event end time in 24-hour format (HH:MM) if known',
      },

      // Location type
      location_type: {
        type: 'string',
        enum: LOCATION_TYPES as unknown as string[],
        description: 'Type of location: in_person, virtual, hybrid, or unknown',
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

      // Confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the extraction accuracy (0-1)',
      },
    },
    required: ['has_event', 'event_title', 'event_date', 'location_type', 'rsvp_required', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT DETECTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event Detector Analyzer
 *
 * Extracts rich event details from emails for calendar integration.
 * This analyzer should ONLY run when category === 'event'.
 *
 * Features:
 * - Parses dates/times into consistent formats
 * - Identifies location type (in-person, virtual, hybrid)
 * - Extracts registration requirements and deadlines
 * - Captures cost and organizer information
 *
 * @example
 * ```typescript
 * const detector = new EventDetectorAnalyzer();
 *
 * // Only run if categorized as event
 * if (category === 'event') {
 *   const result = await detector.analyze(email);
 *
 *   if (result.success) {
 *     // Create calendar event
 *     await createCalendarEvent({
 *       title: result.data.eventTitle,
 *       date: result.data.eventDate,
 *       time: result.data.eventTime,
 *       location: result.data.location,
 *       isVirtual: result.data.locationType === 'virtual',
 *     });
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
   * Analyzes an email and extracts event details.
   *
   * IMPORTANT: This analyzer should only be called when the email
   * has been categorized as 'event' by the Categorizer.
   *
   * @param email - Email data to analyze
   * @param _context - User context (not used by event detector)
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
   * });
   *
   * // result.data:
   * // {
   * //   hasEvent: true,
   * //   eventTitle: 'Milwaukee Tech Meetup: AI in Production',
   * //   eventDate: '2026-01-25',
   * //   eventTime: '18:00',
   * //   locationType: 'in_person',
   * //   location: '123 Main St, Milwaukee, WI 53211',
   * //   rsvpRequired: true,
   * //   rsvpUrl: 'https://mketech.org/rsvp',
   * //   organizer: 'MKE Tech Community',
   * //   cost: 'Free',
   * //   confidence: 0.95,
   * // }
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<EventDetectionResult> {
    // Note: context is not used by event detector
    void context;

    // Log that this is a conditional analyzer
    this.logger.debug('Running event detection (only for event-categorized emails)', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    // (OpenAI returns snake_case, we use camelCase)
    if (result.success) {
      result.data = this.normalizeResponse(result.data);
    }

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
   * The prompt instructs the AI to:
   * - Extract dates in ISO format
   * - Extract times in 24-hour format
   * - Identify location type
   * - Capture registration requirements
   * - Be conservative about missing info
   *
   * @param _context - User context (not used by event detector)
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    // Note: context is not used by event detector
    // Could be extended to include user's timezone for date interpretation
    void context;
    return SYSTEM_PROMPT;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   *
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method converts between them.
   *
   * @param rawData - Raw data from OpenAI (snake_case)
   * @returns Normalized data (camelCase)
   */
  private normalizeResponse(rawData: Record<string, unknown>): EventDetectionData {
    return {
      // Core event fields
      hasEvent: Boolean(rawData.has_event),
      eventTitle: (rawData.event_title as string) || 'Untitled Event',
      eventDate: (rawData.event_date as string) || '',

      // Time fields (optional)
      eventTime: rawData.event_time as string | undefined,
      eventEndTime: rawData.event_end_time as string | undefined,

      // Location fields
      locationType: (rawData.location_type as EventLocationType) || 'unknown',
      location: rawData.location as string | undefined,

      // Registration fields
      registrationDeadline: rawData.registration_deadline as string | undefined,
      rsvpRequired: Boolean(rawData.rsvp_required),
      rsvpUrl: rawData.rsvp_url as string | undefined,

      // Additional info
      organizer: rawData.organizer as string | undefined,
      cost: rawData.cost as string | undefined,
      additionalDetails: rawData.additional_details as string | undefined,

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
