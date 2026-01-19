/**
 * Date Extractor Analyzer
 *
 * Extracts timeline-relevant dates from emails for the Hub "upcoming things" view.
 * This analyzer runs on ALL emails to identify deadlines, payments, birthdays, etc.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer runs on every email to build a comprehensive timeline view.
 * It extracts dates that are NOT events (events are handled by EventDetector).
 * Focus areas:
 * - Deadlines: "Please respond by Friday"
 * - Payment dues: "Invoice due January 30"
 * - Expirations: "Your subscription expires Feb 28"
 * - Appointments: "Your appointment is confirmed for 2pm Thursday"
 * - Follow-ups: "Let's reconnect in Q2"
 * - Birthdays: "My birthday is next week"
 * - Recurring: "Our monthly check-in"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXTRACTED FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For each date found:
 * - dateType: Type of date (deadline, payment_due, birthday, etc.)
 * - date: The date in ISO format (YYYY-MM-DD)
 * - time: Time if known (HH:MM, 24-hour)
 * - title: Short description of what the date is for
 * - description: Additional context
 * - isRecurring: Whether this is a recurring date
 * - recurrencePattern: daily, weekly, monthly, yearly
 * - confidence: How confident we are in this extraction
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { DateExtractorAnalyzer } from '@/services/analyzers/date-extractor';
 *
 * const extractor = new DateExtractorAnalyzer();
 * const result = await extractor.analyze(email);
 *
 * if (result.success && result.data.hasDates) {
 *   for (const date of result.data.dates) {
 *     console.log(`${date.dateType}: ${date.title} on ${date.date}`);
 *   }
 * }
 * ```
 *
 * @module services/analyzers/date-extractor
 * @version 1.0.0
 * @since January 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  DateExtractionData,
  DateExtractionResult,
  ExtractedDate,
  EmailInput,
  UserContext,
  DateType,
  RecurrencePattern,
} from './types';
import { DATE_TYPES } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 */
const FUNCTION_NAME = 'extract_dates';

/**
 * Description of what the function does.
 */
const FUNCTION_DESCRIPTION =
  'Extracts timeline-relevant dates from an email for the user\'s upcoming items view';

/**
 * Valid recurrence patterns.
 */
const RECURRENCE_PATTERNS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for date extraction.
 */
const SYSTEM_PROMPT = `You are a date extraction specialist. Your job is to find timeline-relevant dates in emails that the user needs to be aware of.

═══════════════════════════════════════════════════════════════════════════════
DATE TYPES TO EXTRACT
═══════════════════════════════════════════════════════════════════════════════

Focus on dates that represent commitments, deadlines, or upcoming things:

1. DEADLINE
   - Response deadlines: "Please reply by Friday"
   - Task deadlines: "The proposal is due January 30"
   - Submission deadlines: "Applications close Feb 15"

2. PAYMENT_DUE
   - Invoice due dates: "Payment due: January 30, 2026"
   - Bill reminders: "Your bill of $142.67 is due next week"
   - Subscription charges: "Your card will be charged on the 15th"

3. EXPIRATION
   - Subscription ends: "Your trial expires February 28"
   - Offer expiration: "This discount ends midnight Sunday"
   - Access expiration: "Your access expires in 7 days"

4. APPOINTMENT
   - Confirmed appointments: "Your appointment is Thursday at 2pm"
   - Scheduled calls: "Our call is set for Monday 10am"
   - Reservations: "Your reservation is confirmed for 7pm Friday"

5. FOLLOW_UP
   - Suggested reconnects: "Let's touch base in Q2"
   - Check-in reminders: "I'll follow up next week"
   - Future discussions: "We should revisit this in March"

6. BIRTHDAY
   - Direct mentions: "My birthday is March 12"
   - Birthday emails: "Happy birthday! Your special day is coming up"
   - Party invites: "Birthday party for Sarah on the 15th"

7. ANNIVERSARY
   - Work anniversaries: "Your 1-year anniversary with us"
   - Membership anniversaries: "Thank you for 5 years"

8. RECURRING
   - Regular meetings: "Our weekly standup"
   - Periodic events: "Monthly newsletter"
   - Only flag as recurring if explicitly mentioned

9. REMINDER
   - General reminders: "Don't forget about next week"
   - Action reminders: "Remember to submit by Friday"

10. OTHER
    - Any other date that seems important to surface

═══════════════════════════════════════════════════════════════════════════════
DATE PARSING RULES
═══════════════════════════════════════════════════════════════════════════════

- date: Always ISO format (YYYY-MM-DD)
  - "January 30, 2026" → "2026-01-30"
  - "next Friday" → calculate from email date
  - "in 7 days" → calculate from email date
  - "end of month" → last day of current month

- time: 24-hour format (HH:MM) if specified
  - "2pm" → "14:00"
  - "10:30 AM" → "10:30"
  - Leave empty if no time mentioned

- For date ranges, use end_date and end_time

═══════════════════════════════════════════════════════════════════════════════
WHAT NOT TO EXTRACT
═══════════════════════════════════════════════════════════════════════════════

- Past dates (only future dates are useful)
- The email's sent date
- Vague references without specific dates: "sometime soon", "eventually"
- Historical dates: "We met last year"
- Event invitations (those are handled by the EventDetector)

═══════════════════════════════════════════════════════════════════════════════
OUTPUT GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

- Extract 0-10 dates per email (most emails have 0-2)
- Be conservative: only extract clear, actionable dates
- Create descriptive titles: "Invoice #1234 due" not just "Due date"
- Include the related entity when relevant: "Call with Sarah", "Acme Corp deadline"
- Set confidence based on clarity of the date (0.5 for fuzzy dates, 0.9+ for explicit)

If no timeline-relevant dates are found, return has_dates: false with empty dates array.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether any dates were found
      has_dates: {
        type: 'boolean',
        description: 'Whether any timeline-relevant dates were found in the email',
      },

      // Array of extracted dates
      dates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date_type: {
              type: 'string',
              enum: DATE_TYPES as unknown as string[],
              description: 'Type of date extracted',
            },
            date: {
              type: 'string',
              description: 'The date in ISO format (YYYY-MM-DD)',
            },
            time: {
              type: 'string',
              description: 'Time in 24-hour format (HH:MM) if known',
            },
            end_date: {
              type: 'string',
              description: 'End date for ranges (YYYY-MM-DD)',
            },
            end_time: {
              type: 'string',
              description: 'End time for ranges (HH:MM)',
            },
            title: {
              type: 'string',
              description: 'Short descriptive title for this date',
            },
            description: {
              type: 'string',
              description: 'Additional context about this date',
            },
            source_snippet: {
              type: 'string',
              description: 'Original text that contained this date',
            },
            related_entity: {
              type: 'string',
              description: 'Related person, company, or project',
            },
            is_recurring: {
              type: 'boolean',
              description: 'Whether this is a recurring date',
            },
            recurrence_pattern: {
              type: 'string',
              enum: RECURRENCE_PATTERNS as unknown as string[],
              description: 'Recurrence pattern if recurring',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence in this date extraction (0-1)',
            },
          },
          required: ['date_type', 'date', 'title', 'is_recurring', 'confidence'],
        },
        maxItems: 10,
        description: 'Array of extracted dates (0-10 per email)',
      },

      // Overall confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in the extraction',
      },
    },
    required: ['has_dates', 'dates', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATE EXTRACTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Date Extractor Analyzer
 *
 * Extracts timeline-relevant dates from emails for the Hub "upcoming things" view.
 * Runs on ALL emails to build a comprehensive timeline.
 *
 * Features:
 * - Identifies deadlines, payments, expirations, appointments
 * - Parses dates into consistent ISO format
 * - Detects recurring patterns
 * - Captures related entities (people, companies, projects)
 *
 * @example
 * ```typescript
 * const extractor = new DateExtractorAnalyzer();
 * const result = await extractor.analyze(email);
 *
 * if (result.success && result.data.hasDates) {
 *   for (const date of result.data.dates) {
 *     await saveExtractedDate(date);
 *   }
 * }
 * ```
 */
export class DateExtractorAnalyzer extends BaseAnalyzer<DateExtractionData> {
  /**
   * Creates a new DateExtractorAnalyzer instance.
   */
  constructor() {
    super('DateExtractor', analyzerConfig.dateExtractor);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and extracts timeline-relevant dates.
   *
   * @param email - Email data to analyze
   * @param context - User context (includes timezone for date calculation)
   * @returns Date extraction result with array of extracted dates
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<DateExtractionResult> {
    // Note: context could be used for timezone-aware date parsing
    void context;

    this.logger.debug('Extracting dates from email', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    if (result.success) {
      result.data = this.normalizeResponse(result.data, email);
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for date extraction.
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for date extraction.
   *
   * @param context - User context (could include timezone for date hints)
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    // Could enhance with user's timezone for better date parsing
    let prompt = SYSTEM_PROMPT;

    if (context?.timezone) {
      prompt += `\n\nUSER TIMEZONE: ${context.timezone}. Use this for relative date calculations.`;
    }

    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   */
  private normalizeResponse(
    rawData: Record<string, unknown>,
    email: EmailInput
  ): DateExtractionData {
    const rawDates = (rawData.dates as Array<Record<string, unknown>>) || [];

    // Filter out past dates based on email date
    const emailDate = new Date(email.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const validDates: ExtractedDate[] = rawDates
      .map((d) => this.normalizeDate(d))
      .filter((d) => {
        // Keep dates that are today or in the future
        const extractedDate = new Date(d.date);
        return extractedDate >= today;
      });

    return {
      hasDates: validDates.length > 0,
      dates: validDates,
      confidence: (rawData.confidence as number) || 0.5,
    };
  }

  /**
   * Normalizes a single extracted date from snake_case to camelCase.
   */
  private normalizeDate(raw: Record<string, unknown>): ExtractedDate {
    return {
      dateType: (raw.date_type as DateType) || 'other',
      date: (raw.date as string) || '',
      time: raw.time as string | undefined,
      endDate: raw.end_date as string | undefined,
      endTime: raw.end_time as string | undefined,
      title: (raw.title as string) || 'Upcoming date',
      description: raw.description as string | undefined,
      sourceSnippet: raw.source_snippet as string | undefined,
      relatedEntity: raw.related_entity as string | undefined,
      isRecurring: Boolean(raw.is_recurring),
      recurrencePattern: raw.recurrence_pattern as RecurrencePattern | undefined,
      confidence: (raw.confidence as number) || 0.5,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default date extractor instance for convenience.
 *
 * @example
 * ```typescript
 * import { dateExtractor } from '@/services/analyzers/date-extractor';
 *
 * const result = await dateExtractor.analyze(email);
 * if (result.data.hasDates) {
 *   console.log(`Found ${result.data.dates.length} dates`);
 * }
 * ```
 */
export const dateExtractor = new DateExtractorAnalyzer();
