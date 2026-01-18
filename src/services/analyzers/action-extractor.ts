/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Type normalization issues
/**
 * Action Extractor Analyzer
 *
 * Determines if an email requires action and extracts detailed action information.
 * This analyzer is key to IdeaBox's productivity focus - surfacing what needs to be DONE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ACTION PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Not every email requires action. This analyzer is CONSERVATIVE:
 * - FYI emails, automated notifications, newsletters → no action
 * - Questions that need answers → action (respond)
 * - Requests for review/approval → action (review)
 * - Deadlines mentioned → action with urgency
 *
 * Action types:
 * - respond: Need to reply to this email
 * - review: Need to review attached/linked content
 * - create: Need to create something (document, code, etc.)
 * - schedule: Need to schedule a meeting or event
 * - decide: Need to make a decision
 * - none: No action required
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * URGENCY SCORING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The urgency score (1-10) helps prioritize actions:
 * - 1-3: Can wait a week or more (low priority)
 * - 4-6: Should be done this week (medium priority)
 * - 7-8: Should be done in 1-2 days (high priority)
 * - 9-10: Urgent, needs immediate attention (critical)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { ActionExtractorAnalyzer } from '@/services/analyzers/action-extractor';
 *
 * const extractor = new ActionExtractorAnalyzer();
 *
 * const result = await extractor.analyze({
 *   id: 'email-123',
 *   subject: 'Can you review this proposal by Friday?',
 *   senderEmail: 'client@example.com',
 *   senderName: 'Jane Smith',
 *   date: '2024-01-15T10:00:00Z',
 *   snippet: 'Please review the attached proposal...',
 *   bodyText: 'Hi, I hope this email finds you well...',
 * });
 *
 * if (result.success && result.data.hasAction) {
 *   console.log(result.data.actionType);      // 'review'
 *   console.log(result.data.actionTitle);     // 'Review proposal'
 *   console.log(result.data.urgencyScore);    // 7
 *   console.log(result.data.deadline);        // '2024-01-19T23:59:59Z'
 * }
 * ```
 *
 * @module services/analyzers/action-extractor
 * @version 1.0.0
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig, ACTION_TYPES } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  ActionExtractionData,
  ActionExtractionResult,
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
const FUNCTION_NAME = 'extract_action';

/**
 * Description of what the function does.
 * Helps OpenAI understand the purpose of this function.
 */
const FUNCTION_DESCRIPTION =
  'Determines if email requires action and extracts action details';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for action extraction.
 *
 * This prompt is crafted to:
 * 1. Be conservative (not everything is an action)
 * 2. Identify different types of actions
 * 3. Extract deadlines when mentioned
 * 4. Provide realistic urgency scores
 * 5. Estimate time to complete
 */
const SYSTEM_PROMPT = `You are an action extraction specialist. Determine if this email requires any action from the user.

Look for:
- Questions that need answers
- Requests for feedback, review, or approval
- Tasks assigned to the user
- Decisions that need to be made
- Meetings/calls that need scheduling
- Documents that need to be created or reviewed

Be CONSERVATIVE: not every email requires action. Examples of NO ACTION:
- FYI emails, pure informational content
- Automated notifications (password changed, login detected)
- Newsletter content
- Order confirmations (unless there's a problem)
- Thank you messages with no follow-up needed

ACTION TYPES:
- respond: Need to reply to this email with information/answer
- review: Need to review attached or linked content
- create: Need to create something (document, code, design)
- schedule: Need to schedule a meeting, call, or event
- decide: Need to make a decision (approve/reject, choose option)
- none: No action required

URGENCY SCORING (1-10):
- 1-3: Can wait a week or more (routine, no deadline)
- 4-6: Should be done this week (mentioned this week, moderate importance)
- 7-8: Should be done in 1-2 days (explicit deadline, client waiting)
- 9-10: Urgent, needs immediate attention (ASAP, critical, blocking others)

DEADLINE EXTRACTION:
- If a specific date/time is mentioned, convert to ISO 8601 format
- Interpret relative dates based on the email's date
- "By Friday" → that Friday 11:59 PM
- "End of week" → Friday 5 PM
- "Tomorrow" → next day 5 PM
- If no deadline mentioned, leave deadline empty

TIME ESTIMATION:
- Simple reply: 5-10 minutes
- Thoughtful response: 15-30 minutes
- Review document: 30-60 minutes
- Create something: 60+ minutes
- Be realistic, not optimistic

Be honest about confidence. If the action is ambiguous, use lower confidence.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * All fields match the ActionExtractionData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether action is needed (required)
      has_action: {
        type: 'boolean',
        description: 'Whether this email requires any action from the user',
      },

      // Type of action (required)
      action_type: {
        type: 'string',
        enum: ACTION_TYPES as unknown as string[],
        description: 'Type of action required',
      },

      // Short action title (optional but helpful)
      action_title: {
        type: 'string',
        description: 'Short title for the action (e.g., "Reply to client about timeline")',
      },

      // Detailed description (optional)
      action_description: {
        type: 'string',
        description: 'Detailed description of what needs to be done',
      },

      // Urgency score (required)
      urgency_score: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'How urgent is this action (1=low, 10=critical)',
      },

      // Deadline if mentioned (optional)
      deadline: {
        type: 'string',
        format: 'date-time',
        description: 'Deadline for this action if mentioned in email (ISO 8601)',
      },

      // Time estimate (optional)
      estimated_minutes: {
        type: 'integer',
        description: 'Estimated minutes to complete this action',
      },

      // Confidence score (required)
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in this extraction',
      },
    },
    required: ['has_action', 'action_type', 'urgency_score', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXTRACTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action Extractor Analyzer
 *
 * Determines if an email requires user action and extracts:
 * - Action type (respond, review, create, schedule, decide, none)
 * - Action title and description
 * - Urgency score (1-10)
 * - Deadline (if mentioned)
 * - Estimated time to complete
 *
 * This is the core productivity feature of IdeaBox - converting emails
 * into actionable tasks with proper prioritization.
 *
 * @example
 * ```typescript
 * const extractor = new ActionExtractorAnalyzer();
 *
 * const result = await extractor.analyze(emailInput);
 *
 * if (result.success && result.data.hasAction) {
 *   // Create a task from the extracted action
 *   await createTask({
 *     title: result.data.actionTitle,
 *     description: result.data.actionDescription,
 *     urgency: result.data.urgencyScore,
 *     dueDate: result.data.deadline,
 *     estimatedMinutes: result.data.estimatedMinutes,
 *     emailId: emailInput.id,
 *   });
 * }
 * ```
 */
export class ActionExtractorAnalyzer extends BaseAnalyzer<ActionExtractionData> {
  /**
   * Creates a new ActionExtractorAnalyzer instance.
   *
   * Uses the actionExtractor configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.3 for nuanced descriptions)
   * - maxTokens: Maximum response tokens (500 for detailed actions)
   */
  constructor() {
    super('ActionExtractor', analyzerConfig.actionExtractor);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and extracts action information.
   *
   * The extraction includes:
   * - Whether action is needed (hasAction)
   * - Type of action (respond, review, create, schedule, decide)
   * - Human-readable title and description
   * - Urgency score for prioritization
   * - Deadline if mentioned in email
   * - Estimated time to complete
   *
   * @param email - Email data to analyze
   * @param _context - User context (not used by action extractor)
   * @returns Action extraction result
   *
   * @example
   * ```typescript
   * const result = await extractor.analyze({
   *   id: 'email-123',
   *   subject: 'Urgent: Contract needs your signature',
   *   senderEmail: 'legal@company.com',
   *   senderName: 'Legal Team',
   *   date: '2024-01-15T10:00:00Z',
   *   snippet: 'Please sign the attached contract by EOD...',
   *   bodyText: 'The contract has been reviewed and approved...',
   * });
   *
   * // result.data:
   * // {
   * //   hasAction: true,
   * //   actionType: 'review',
   * //   actionTitle: 'Sign contract',
   * //   actionDescription: 'Sign the attached contract by end of day',
   * //   urgencyScore: 8,
   * //   deadline: '2024-01-15T17:00:00Z',
   * //   estimatedMinutes: 15,
   * //   confidence: 0.92,
   * // }
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<ActionExtractionResult> {
    // Note: context is not used by action extractor (unlike client tagger)
    void context;

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
   * Returns the OpenAI function schema for action extraction.
   *
   * The schema defines the structured output format:
   * - has_action: Boolean indicating if action is needed
   * - action_type: One of the ACTION_TYPES
   * - action_title: Short human-readable title
   * - action_description: Detailed description
   * - urgency_score: 1-10 priority score
   * - deadline: ISO 8601 date if mentioned
   * - estimated_minutes: Time estimate
   * - confidence: 0-1 confidence score
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for action extraction.
   *
   * The prompt instructs the AI to:
   * - Be conservative (not everything needs action)
   * - Identify the correct action type
   * - Extract deadlines when mentioned
   * - Provide realistic urgency scores
   * - Estimate time realistically
   *
   * @param _context - User context (not used by action extractor)
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    // Note: context is not used by action extractor
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
  private normalizeResponse(rawData: Record<string, unknown>): ActionExtractionData {
    return {
      // Core action fields
      hasAction: Boolean(rawData.has_action),
      actionType: (rawData.action_type as ActionExtractionData['actionType']) || 'none',

      // Optional action details
      actionTitle: rawData.action_title as string | undefined,
      actionDescription: rawData.action_description as string | undefined,

      // Priority and timing
      urgencyScore: (rawData.urgency_score as number) || 1,
      deadline: rawData.deadline as string | undefined,
      estimatedMinutes: rawData.estimated_minutes as number | undefined,

      // Confidence
      confidence: (rawData.confidence as number) || 0.5,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default action extractor instance for convenience.
 *
 * Use this for simple cases where you don't need
 * custom configuration.
 *
 * @example
 * ```typescript
 * import { actionExtractor } from '@/services/analyzers/action-extractor';
 *
 * const result = await actionExtractor.analyze(email);
 * if (result.data.hasAction) {
 *   console.log(`Action needed: ${result.data.actionTitle}`);
 * }
 * ```
 */
export const actionExtractor = new ActionExtractorAnalyzer();
