/**
 * Multi-Event Detector Analyzer
 *
 * Extracts multiple events from a single email. Handles emails that contain
 * lists of events, course schedules, event roundups, or calendars of dates.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY (Feb 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Many emails contain not just one event but a LIST of events:
 * - Community newsletters with "upcoming events" sections
 * - Course/class schedules ("Tuesdays Jan 7 - Mar 11")
 * - Conference agendas with multiple sessions
 * - Event roundup emails from organizations
 * - School calendars with multiple dates
 *
 * The existing EventDetector handles single events well. This analyzer
 * branches off to handle the multi-event case, extracting up to 10
 * events from a single email.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRIGGER CONDITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs when BOTH labels are present:
 * - `has_event`: Email contains calendar-worthy events
 * - `has_multiple_events`: Email lists multiple distinct events/dates
 *
 * When triggered, runs INSTEAD OF the single EventDetector.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LINK RESOLUTION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Optionally resolves links from the email (via ContentDigest) to find
 * additional event details. This is useful when emails say "see our full
 * calendar" with a link to a page listing all events.
 *
 * @module services/analyzers/multi-event-detector
 * @version 1.0.0
 * @since February 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import {
  resolveEventLinks,
  formatResolvedLinksForPrompt,
  type LinkInput,
} from './link-resolver';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  MultiEventDetectionData,
  MultiEventDetectionResult,
  EventDetectionData,
  EventLocationType,
  EventLocality,
  KeyDateType,
  EmailInput,
  UserContext,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const FUNCTION_NAME = 'detect_multiple_events';

const FUNCTION_DESCRIPTION =
  'Extracts multiple event details from an email containing a list of events, course schedule, or event calendar';

const LOCATION_TYPES = ['in_person', 'virtual', 'hybrid', 'unknown'] as const;
const EVENT_LOCALITIES = ['local', 'out_of_town', 'virtual'] as const;
const KEY_DATE_TYPES = ['registration_deadline', 'open_house', 'deadline', 'release_date', 'other'] as const;

/** Max events to extract per email (cost control) */
const MAX_EVENTS_PER_EMAIL = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(context?: UserContext): string {
  const userLocation = context?.locationMetro || context?.locationCity || 'unknown';

  return `You are an event extraction specialist. This email contains MULTIPLE events, dates, or schedule items. Your job is to extract ALL of them.

═══════════════════════════════════════════════════════════════════════════════
USER CONTEXT
═══════════════════════════════════════════════════════════════════════════════

User's location: ${userLocation}
(Use this to determine if events are local, out of town, or virtual)

═══════════════════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════════════════

This email contains MULTIPLE events or dates. Extract EACH ONE as a separate event.

Common patterns:
- Newsletter with "upcoming events" section listing several events
- Course schedule: "Tuesdays Jan 7 - Mar 11" → extract each class date
- Conference agenda with multiple sessions
- School calendar with key dates
- Organization listing their monthly events
- Event roundup emails

For recurring events (e.g., "Every Tuesday 6-8pm, Jan 7 through Mar 11"):
- Extract EACH individual occurrence as a separate event
- Give them the same title with the specific date
- Example: "Pottery Class - Jan 7", "Pottery Class - Jan 14", etc.

Extract up to ${MAX_EVENTS_PER_EMAIL} events. If there are more, extract the ${MAX_EVENTS_PER_EMAIL} most important/nearest ones.

═══════════════════════════════════════════════════════════════════════════════
EVENT LOCALITY
═══════════════════════════════════════════════════════════════════════════════

For each event, determine where it is RELATIVE TO THE USER:
- "local": In or near ${userLocation} (same city, nearby suburb, < 1 hour drive)
- "out_of_town": Requires travel to another city
- "virtual": Online only (webinars, Zoom, online courses)

═══════════════════════════════════════════════════════════════════════════════
KEY DATES vs FULL EVENTS
═══════════════════════════════════════════════════════════════════════════════

FULL EVENT (is_key_date = false): Something you attend (meetup, class, conference)
KEY DATE (is_key_date = true): Important date but not attended (registration deadline, release date)

═══════════════════════════════════════════════════════════════════════════════
PER-EVENT FIELDS
═══════════════════════════════════════════════════════════════════════════════

For each event extract:
- event_title: Name of the event
- event_date: Start date (YYYY-MM-DD)
- event_time: Start time (HH:MM, 24-hour) if known
- event_end_date: End date for multi-day events (YYYY-MM-DD)
- event_end_time: End time (HH:MM) if known
- location_type: in_person / virtual / hybrid / unknown
- event_locality: local / out_of_town / virtual
- location: Address or video link
- rsvp_required: Whether RSVP needed
- rsvp_url: Registration link if provided
- registration_deadline: RSVP deadline (YYYY-MM-DD)
- organizer: Who's hosting
- cost: Price info ("Free", "$25", etc.)
- additional_details: Other relevant info
- event_summary: One-sentence assistant-style summary
- key_points: 2-3 bullet points with logistics
- is_key_date: true/false
- key_date_type: if key date, the type
- confidence: 0-1 confidence in this specific event's extraction

═══════════════════════════════════════════════════════════════════════════════
IMPORTANT NOTES
═══════════════════════════════════════════════════════════════════════════════

- Extract EVERY distinct event/date mentioned, up to ${MAX_EVENTS_PER_EMAIL}
- If the email links to a page with more details, that content may be included below
- Share common fields (organizer, location) across events when they come from the same source
- Be conservative: if unsure about a field, leave it empty
- Each event needs at minimum: title and date`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Event item schema (used within the events array).
 */
const EVENT_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    event_title: {
      type: 'string',
      description: 'Name/title of the event',
    },
    event_date: {
      type: 'string',
      description: 'Event start date (YYYY-MM-DD)',
    },
    event_time: {
      type: 'string',
      description: 'Event start time (HH:MM, 24-hour)',
    },
    event_end_date: {
      type: 'string',
      description: 'End date for multi-day events (YYYY-MM-DD)',
    },
    event_end_time: {
      type: 'string',
      description: 'End time (HH:MM, 24-hour)',
    },
    location_type: {
      type: 'string',
      enum: LOCATION_TYPES as unknown as string[],
      description: 'Format: in_person, virtual, hybrid, unknown',
    },
    event_locality: {
      type: 'string',
      enum: EVENT_LOCALITIES as unknown as string[],
      description: 'Relative to user: local, out_of_town, virtual',
    },
    location: {
      type: 'string',
      description: 'Physical address or video meeting link',
    },
    rsvp_required: {
      type: 'boolean',
      description: 'Whether RSVP is required',
    },
    rsvp_url: {
      type: 'string',
      description: 'Registration URL if provided',
    },
    registration_deadline: {
      type: 'string',
      description: 'RSVP deadline (YYYY-MM-DD)',
    },
    organizer: {
      type: 'string',
      description: 'Who is hosting',
    },
    cost: {
      type: 'string',
      description: 'Cost info ("Free", "$25", etc.)',
    },
    additional_details: {
      type: 'string',
      description: 'Other relevant details',
    },
    event_summary: {
      type: 'string',
      description: 'One-sentence summary with locality',
    },
    key_points: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
      description: '1-3 concise bullet points',
    },
    is_key_date: {
      type: 'boolean',
      description: 'True if key date vs full event',
    },
    key_date_type: {
      type: 'string',
      enum: KEY_DATE_TYPES as unknown as string[],
      description: 'Type of key date if applicable',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence in this event extraction (0-1)',
    },
  },
  required: ['event_title', 'event_date', 'location_type', 'rsvp_required', 'is_key_date', 'confidence', 'event_summary'],
};

const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      has_multiple_events: {
        type: 'boolean',
        description: 'Whether multiple events were found (should be true)',
      },
      event_count: {
        type: 'number',
        description: 'Number of events extracted',
      },
      events: {
        type: 'array',
        items: EVENT_ITEM_SCHEMA,
        minItems: 1,
        maxItems: MAX_EVENTS_PER_EMAIL,
        description: `Array of extracted events (up to ${MAX_EVENTS_PER_EMAIL})`,
      },
      source_description: {
        type: 'string',
        description: 'Description of the event source format (e.g., "Community event roundup", "Spring course schedule")',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in the extraction (0-1)',
      },
    },
    required: ['has_multiple_events', 'event_count', 'events', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-EVENT DETECTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Multi-Event Detector Analyzer
 *
 * Extracts multiple events from a single email for calendar integration.
 * Runs when both `has_event` and `has_multiple_events` labels are present.
 *
 * NEW (Feb 2026): Handles the multi-event case that the single EventDetector
 * doesn't cover. Can optionally resolve links to find additional event details.
 */
export class MultiEventDetectorAnalyzer extends BaseAnalyzer<MultiEventDetectionData> {
  constructor() {
    super('MultiEventDetector', analyzerConfig.multiEventDetector);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTANCE STATE
  // ═══════════════════════════════════════════════════════════════════════════

  private currentContext?: UserContext;

  /** Additional content from resolved links (set before analysis) */
  private resolvedLinkContent: string = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and extracts multiple events.
   *
   * @param email - Email data to analyze
   * @param context - User context (for locality detection)
   * @param links - Optional links from ContentDigest to resolve for additional context
   * @returns Multi-event detection result
   */
  async analyze(
    email: EmailInput,
    context?: UserContext,
    links?: LinkInput[]
  ): Promise<MultiEventDetectionResult> {
    this.currentContext = context;
    this.resolvedLinkContent = '';

    this.logger.debug('Running multi-event detection', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      userLocation: context?.locationMetro || context?.locationCity || 'unknown',
      linkCount: links?.length ?? 0,
    });

    // Resolve links for additional context (non-blocking — failure is fine)
    if (links && links.length > 0) {
      try {
        const resolved = await resolveEventLinks(links);
        if (resolved.length > 0) {
          this.resolvedLinkContent = formatResolvedLinksForPrompt(resolved);
          this.logger.info('Resolved links for multi-event context', {
            emailId: email.id,
            linksResolved: resolved.length,
            contentChars: this.resolvedLinkContent.length,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug('Link resolution failed (non-fatal)', {
          emailId: email.id,
          error: message,
        });
      }
    }

    // Run AI analysis
    const result = await this.executeAnalysis(email);

    // Normalize the response
    if (result.success) {
      result.data = this.normalizeResponse(result.data as unknown as Record<string, unknown>);
    }

    // Clean up
    this.currentContext = undefined;
    this.resolvedLinkContent = '';

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  getSystemPrompt(context?: UserContext): string {
    return buildSystemPrompt(this.currentContext || context);
  }

  /**
   * Override formatEmailForAnalysis to include resolved link content.
   */
  protected formatEmailForAnalysis(email: EmailInput): string {
    const baseContent = super.formatEmailForAnalysis(email);

    if (this.resolvedLinkContent) {
      return baseContent + '\n' + this.resolvedLinkContent;
    }

    return baseContent;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the raw AI response to match our TypeScript interface.
   * Converts snake_case to camelCase and normalizes each event.
   */
  private normalizeResponse(rawData: Record<string, unknown>): MultiEventDetectionData {
    const rawEvents = (rawData.events as Array<Record<string, unknown>>) || [];

    const events: EventDetectionData[] = rawEvents.map(raw => this.normalizeEvent(raw));

    return {
      hasMultipleEvents: Boolean(rawData.has_multiple_events),
      eventCount: (rawData.event_count as number) || events.length,
      events,
      sourceDescription: rawData.source_description as string | undefined,
      confidence: (rawData.confidence as number) || 0.5,
    };
  }

  /**
   * Normalizes a single event from the AI response.
   * Same logic as EventDetector.normalizeResponse but for individual events.
   */
  private normalizeEvent(rawData: Record<string, unknown>): EventDetectionData {
    let eventLocality = rawData.event_locality as EventLocality | undefined;
    const locationType = (rawData.location_type as EventLocationType) || 'unknown';
    if (locationType === 'virtual' && !eventLocality) {
      eventLocality = 'virtual';
    }

    return {
      hasEvent: true,
      eventTitle: (rawData.event_title as string) || 'Untitled Event',
      eventDate: (rawData.event_date as string) || '',
      eventTime: rawData.event_time as string | undefined,
      eventEndTime: rawData.event_end_time as string | undefined,
      eventEndDate: rawData.event_end_date as string | undefined,
      locationType,
      eventLocality,
      location: rawData.location as string | undefined,
      registrationDeadline: rawData.registration_deadline as string | undefined,
      rsvpRequired: Boolean(rawData.rsvp_required),
      rsvpUrl: rawData.rsvp_url as string | undefined,
      organizer: rawData.organizer as string | undefined,
      cost: rawData.cost as string | undefined,
      additionalDetails: rawData.additional_details as string | undefined,
      eventSummary: rawData.event_summary as string | undefined,
      keyPoints: rawData.key_points as string[] | undefined,
      isKeyDate: Boolean(rawData.is_key_date),
      keyDateType: rawData.key_date_type as KeyDateType | undefined,
      confidence: (rawData.confidence as number) || 0.5,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const multiEventDetector = new MultiEventDetectorAnalyzer();
