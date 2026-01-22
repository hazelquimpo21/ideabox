/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Type normalization issues
/**
 * Action Extractor Analyzer
 *
 * Determines if an email requires action and extracts detailed action information.
 * This analyzer is key to IdeaBox's productivity focus - surfacing what needs to be DONE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENHANCED (JAN 2026): Multi-Action Support
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Now supports extracting MULTIPLE action items from a single email.
 * Many emails contain more than one request:
 *
 *   "Can you review the proposal by Friday? Also, please send me your headshot
 *    for the conference page. Oh, and don't forget to book your travel."
 *
 * This email contains THREE actions:
 * 1. Review proposal (deadline: Friday)
 * 2. Send headshot
 * 3. Book travel
 *
 * The enhanced extractor finds ALL of them and prioritizes appropriately.
 *
 * BACKWARDS COMPATIBILITY:
 * - Legacy fields (actionType, actionTitle, etc.) still populated from primary action
 * - Existing code continues to work without changes
 * - New code can use the `actions` array for full multi-action support
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
 * - respond: Need to reply to this email with information/answer
 * - review: Need to review attached/linked content
 * - create: Need to create something (document, code, etc.)
 * - schedule: Need to schedule a meeting or event
 * - decide: Need to make a decision (approve/reject, choose option)
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
 *   subject: 'Review proposal + send headshot + book travel',
 *   senderEmail: 'client@example.com',
 *   senderName: 'Jane Smith',
 *   date: '2024-01-15T10:00:00Z',
 *   snippet: 'Please review the attached proposal...',
 *   bodyText: 'Can you review the proposal by Friday? Also send headshot...',
 * });
 *
 * if (result.success && result.data.hasAction) {
 *   // NEW: Multiple actions support
 *   result.data.actions.forEach(action => {
 *     console.log(`${action.priority}. ${action.title} (${action.type})`);
 *   });
 *
 *   // LEGACY: Still works (uses primary action)
 *   console.log(result.data.actionType);      // 'review'
 *   console.log(result.data.actionTitle);     // 'Review proposal'
 * }
 * ```
 *
 * @module services/analyzers/action-extractor
 * @version 2.0.0
 * @since January 2026 - Added multi-action support
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig, ACTION_TYPES } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  ActionExtractionData,
  ActionExtractionResult,
  EnhancedActionExtractionData,
  ActionItem,
  EmailInput,
  UserContext,
  ActionType,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'extract_actions';

/**
 * Description of what the function does.
 * Helps OpenAI understand the purpose of this function.
 */
const FUNCTION_DESCRIPTION =
  'Extracts ALL action items from an email with priority and deadline information';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT (ENHANCED FOR MULTI-ACTION)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for action extraction.
 *
 * ENHANCED (Jan 2026): Now instructs AI to find ALL actions, not just one.
 *
 * This prompt is crafted to:
 * 1. Be conservative (not everything is an action)
 * 2. Find ALL action items in an email
 * 3. Prioritize actions appropriately
 * 4. Extract deadlines when mentioned
 * 5. Provide realistic urgency scores
 * 6. Estimate time to complete
 */
const SYSTEM_PROMPT = `You are an action extraction specialist. Your job is to find ALL action items in an email that require the user's attention.

═══════════════════════════════════════════════════════════════════════════════
FINDING MULTIPLE ACTIONS
═══════════════════════════════════════════════════════════════════════════════

Many emails contain MORE than one request. Look for ALL of them:

EXAMPLE EMAIL:
"Can you review the proposal by Friday? Also, please send me your headshot
for the conference page. Oh, and don't forget to book your travel soon."

CORRECT EXTRACTION (3 actions):
1. Review proposal (type: review, deadline: Friday, priority: 1)
2. Send headshot (type: respond, no deadline, priority: 2)
3. Book travel (type: create, no deadline but "soon", priority: 3)

WRONG EXTRACTION (1 action):
Only extracting "Review proposal" and missing the other two.

═══════════════════════════════════════════════════════════════════════════════
WHAT COUNTS AS AN ACTION
═══════════════════════════════════════════════════════════════════════════════

Look for:
- Direct requests: "Can you...", "Please...", "Would you..."
- Questions that need answers: "What do you think?", "Which option?"
- Review requests: "Take a look at...", "Check out...", "Review..."
- Approval requests: "Need your approval...", "Sign off on..."
- Things to create: "Send me...", "Put together...", "Draft..."
- Things to schedule: "Book...", "Set up a meeting...", "Find a time..."
- Soft requests: "Don't forget to...", "Remember to...", "Make sure you..."

"Review" IS an action - if someone asks you to look at something, that's a review action.

═══════════════════════════════════════════════════════════════════════════════
BE CONSERVATIVE - NOT EVERYTHING IS AN ACTION
═══════════════════════════════════════════════════════════════════════════════

Examples of NO ACTION NEEDED:
- FYI emails, pure informational content
- Automated notifications (password changed, login detected)
- Newsletter content (unless they specifically ask you to do something)
- Order confirmations (unless there's a problem)
- Thank you messages with no follow-up needed
- "Let me know if you have questions" (passive, not active request)

═══════════════════════════════════════════════════════════════════════════════
ACTION TYPES
═══════════════════════════════════════════════════════════════════════════════

- respond: Need to reply with information/answer/file (includes sending things)
- review: Need to look at/review/check something (documents, proposals, links)
- create: Need to create something (document, code, design, booking)
- schedule: Need to schedule a meeting, call, or event
- decide: Need to make a decision (approve/reject, choose option)
- none: No action required (use this if has_action is false)

═══════════════════════════════════════════════════════════════════════════════
PRIORITY ORDERING
═══════════════════════════════════════════════════════════════════════════════

Assign priority based on:
1. Has explicit deadline → higher priority
2. Someone is waiting/blocked → higher priority
3. Mentioned first in email → often higher priority
4. "Urgent" or "ASAP" language → higher priority
5. Nice-to-have or "when you get a chance" → lower priority

Priority 1 = most important, 2 = second, etc.

═══════════════════════════════════════════════════════════════════════════════
URGENCY SCORING (1-10)
═══════════════════════════════════════════════════════════════════════════════

Apply to each action individually:
- 1-3: Can wait a week or more (routine, no deadline)
- 4-6: Should be done this week (mentioned this week, moderate importance)
- 7-8: Should be done in 1-2 days (explicit deadline, client waiting)
- 9-10: Urgent, needs immediate attention (ASAP, critical, blocking others)

The overall urgencyScore should be the HIGHEST among all actions.

═══════════════════════════════════════════════════════════════════════════════
DEADLINE EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

- If a specific date/time is mentioned, convert to ISO 8601 format
- Interpret relative dates based on the email's date
- "By Friday" → that Friday 11:59 PM
- "End of week" → Friday 5 PM
- "Tomorrow" → next day 5 PM
- "Soon" or "when you get a chance" → no deadline (leave empty)
- If no deadline mentioned, leave deadline empty

═══════════════════════════════════════════════════════════════════════════════
TIME ESTIMATION
═══════════════════════════════════════════════════════════════════════════════

Per action:
- Simple reply: 5-10 minutes
- Send existing file: 5 minutes
- Thoughtful response: 15-30 minutes
- Review document: 30-60 minutes
- Create something: 60+ minutes
- Be realistic, not optimistic

Be honest about confidence. If actions are ambiguous, use lower confidence.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA (ENHANCED FOR MULTI-ACTION)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * ENHANCED (Jan 2026): Now supports multiple actions via `actions` array.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * All fields match the EnhancedActionExtractionData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether any action is needed (required)
      has_action: {
        type: 'boolean',
        description: 'Whether this email requires ANY action from the user',
      },

      // Array of action items (the NEW field)
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ACTION_TYPES as unknown as string[],
              description: 'Type of action: respond, review, create, schedule, decide',
            },
            title: {
              type: 'string',
              description: 'Short title for the action. E.g., "Review Q1 proposal"',
            },
            description: {
              type: 'string',
              description: 'Detailed description of what needs to be done (optional)',
            },
            deadline: {
              type: 'string',
              description: 'Deadline if mentioned (ISO 8601 or relative like "Friday")',
            },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              description: 'Priority within this email (1 = most important)',
            },
            estimated_minutes: {
              type: 'integer',
              description: 'Estimated minutes to complete this action',
            },
            source_line: {
              type: 'string',
              description: 'The text in the email that triggered this action',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence in this specific action extraction',
            },
          },
          required: ['type', 'title', 'priority', 'confidence'],
        },
        maxItems: 10,
        description: 'All action items found in the email, ordered by priority',
      },

      // Index of primary action (for backwards compatibility)
      primary_action_index: {
        type: 'integer',
        minimum: 0,
        description: 'Index of the most important action in the actions array (usually 0)',
      },

      // Overall urgency score (highest among all actions)
      urgency_score: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Highest urgency score across all actions (1=low, 10=critical)',
      },

      // Overall confidence score
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in the extraction',
      },
    },
    required: ['has_action', 'actions', 'urgency_score', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXTRACTOR ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action Extractor Analyzer
 *
 * ENHANCED (Jan 2026): Now extracts MULTIPLE action items per email.
 *
 * Determines if an email requires user action and extracts:
 * - Multiple action items (NEW)
 * - Action type (respond, review, create, schedule, decide, none)
 * - Action title and description per action
 * - Priority ordering within the email
 * - Urgency score (1-10)
 * - Deadline per action (if mentioned)
 * - Estimated time to complete per action
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
 *   // NEW: Access all actions
 *   console.log(`Found ${result.data.actions.length} action(s):`);
 *   result.data.actions.forEach(action => {
 *     console.log(`${action.priority}. [${action.type}] ${action.title}`);
 *     if (action.deadline) console.log(`   Deadline: ${action.deadline}`);
 *   });
 *
 *   // LEGACY: Still works (primary action)
 *   console.log(`Primary action: ${result.data.actionTitle}`);
 * }
 * ```
 */
export class ActionExtractorAnalyzer extends BaseAnalyzer<EnhancedActionExtractionData> {
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
   * Analyzes an email and extracts ALL action items.
   *
   * ENHANCED (Jan 2026): Now returns multiple actions in an array.
   *
   * The extraction includes:
   * - All action items found (actions array)
   * - Priority ordering within the email
   * - Type, title, description per action
   * - Urgency score (highest among all)
   * - Deadline per action (if mentioned)
   * - Estimated time per action
   *
   * Backwards compatibility:
   * - Legacy fields (actionType, actionTitle, etc.) populated from primary action
   * - hasAction is true if ANY action found
   *
   * @param email - Email data to analyze
   * @param _context - User context (not used by action extractor)
   * @returns Action extraction result with actions array
   *
   * @example
   * ```typescript
   * const result = await extractor.analyze({
   *   id: 'email-123',
   *   subject: 'Review + headshot + travel',
   *   bodyText: 'Please review by Friday. Also send headshot. Book travel.',
   *   ...
   * });
   *
   * // result.data:
   * // {
   * //   hasAction: true,
   * //   actions: [
   * //     { type: 'review', title: 'Review proposal', deadline: 'Friday', priority: 1 },
   * //     { type: 'respond', title: 'Send headshot', priority: 2 },
   * //     { type: 'create', title: 'Book travel', priority: 3 }
   * //   ],
   * //   primaryActionIndex: 0,
   * //   urgencyScore: 7,
   * //   // Legacy fields (from primary action):
   * //   actionType: 'review',
   * //   actionTitle: 'Review proposal',
   * //   ...
   * // }
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<ActionExtractionResult> {
    // Note: context is not used by action extractor (unlike client tagger)
    void context;

    // Log multi-action extraction
    this.logger.debug('Extracting actions (multi-action enabled)', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    // (OpenAI returns snake_case, we use camelCase)
    if (result.success) {
      result.data = this.normalizeResponse(result.data);

      // Log extraction results for debugging
      this.logger.info('Actions extracted', {
        emailId: email.id,
        hasAction: result.data.hasAction,
        actionCount: result.data.actions?.length ?? 0,
        primaryAction: result.data.actionType,
        urgencyScore: result.data.urgencyScore,
        actions: result.data.actions?.map(a => ({
          type: a.type,
          title: a.title?.substring(0, 30),
          priority: a.priority,
          hasDeadline: !!a.deadline,
        })),
      });
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for action extraction.
   *
   * ENHANCED (Jan 2026): Schema now includes `actions` array.
   *
   * The schema defines the structured output format:
   * - has_action: Boolean indicating if any action is needed
   * - actions: Array of action items with type, title, priority, deadline, etc.
   * - primary_action_index: Index of most important action
   * - urgency_score: Highest urgency across all actions
   * - confidence: 0-1 overall confidence score
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for action extraction.
   *
   * ENHANCED (Jan 2026): Prompt now instructs AI to find ALL actions.
   *
   * The prompt instructs the AI to:
   * - Find ALL action items in an email (not just one)
   * - Be conservative (not everything needs action)
   * - Identify the correct action type for each
   * - Prioritize actions appropriately
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
   * ENHANCED (Jan 2026): Handles multi-action format and populates legacy fields.
   *
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method:
   * 1. Converts snake_case to camelCase
   * 2. Normalizes the actions array
   * 3. Populates legacy fields from primary action for backwards compatibility
   *
   * @param rawData - Raw data from OpenAI (snake_case)
   * @returns Normalized data (camelCase) with both new and legacy fields
   */
  private normalizeResponse(rawData: Record<string, unknown>): EnhancedActionExtractionData {
    const hasAction = Boolean(rawData.has_action);

    // Normalize actions array
    const rawActions = rawData.actions as Array<{
      type: string;
      title: string;
      description?: string;
      deadline?: string;
      priority: number;
      estimated_minutes?: number;
      source_line?: string;
      confidence: number;
    }> | undefined;

    const actions: ActionItem[] = (rawActions || []).map((action) => ({
      type: (action.type as ActionType) || 'none',
      title: action.title || 'Action required',
      description: action.description,
      deadline: action.deadline,
      priority: action.priority || 1,
      estimatedMinutes: action.estimated_minutes,
      sourceLine: action.source_line,
      confidence: action.confidence || 0.5,
    }));

    // Sort actions by priority (1 = highest)
    actions.sort((a, b) => a.priority - b.priority);

    // Get primary action index (usually 0 after sorting)
    const primaryActionIndex = (rawData.primary_action_index as number) || 0;
    const primaryAction = actions[primaryActionIndex] || actions[0];

    // Build the enhanced response with both new and legacy fields
    const response: EnhancedActionExtractionData = {
      // NEW fields (multi-action support)
      hasAction,
      actions,
      primaryActionIndex,
      urgencyScore: (rawData.urgency_score as number) || 1,
      confidence: (rawData.confidence as number) || 0.5,

      // LEGACY fields (for backwards compatibility)
      // Populated from primary action so existing code works unchanged
      actionType: primaryAction?.type || 'none',
      actionTitle: primaryAction?.title,
      actionDescription: primaryAction?.description,
      deadline: primaryAction?.deadline,
      estimatedMinutes: primaryAction?.estimatedMinutes,
    };

    return response;
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
 *
 * // Multi-action support
 * if (result.data.hasAction) {
 *   result.data.actions.forEach(action => {
 *     console.log(`[${action.type}] ${action.title}`);
 *   });
 * }
 *
 * // Legacy support still works
 * if (result.data.hasAction) {
 *   console.log(`Action needed: ${result.data.actionTitle}`);
 * }
 * ```
 */
export const actionExtractor = new ActionExtractorAnalyzer();
