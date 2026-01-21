/**
 * Categorizer Analyzer
 *
 * Classifies emails by LIFE BUCKET - what area of the user's life each email touches.
 * This is the first analyzer in the processing pipeline.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CATEGORY PHILOSOPHY (REFACTORED Jan 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Categories are now LIFE-BUCKET focused, not action-focused:
 * - newsletters_general: Substacks, digests, curated content
 * - news_politics: News outlets, political updates
 * - product_updates: Tech products, SaaS tools you use
 * - local: Community events, neighborhood, local orgs
 * - shopping: Orders, shipping, deals, retail
 * - travel: Flights, hotels, bookings, trip info
 * - finance: Bills, banking, investments, receipts
 * - family_kids_school: School emails, kid activities, logistics
 * - family_health_appointments: Medical, appointments, family scheduling
 * - client_pipeline: Direct client correspondence, project work
 * - business_work_general: Team, industry, professional (not direct clients)
 * - personal_friends_family: Social, relationships, personal correspondence
 *
 * Actions are tracked separately via the `actions` table and `has_event` label.
 * Events are now detected via the `has_event` label and processed by EventDetector.
 *
 * The analyzer uses HUMAN-EYE INFERENCE - thinking like a thoughtful assistant
 * who considers sender context, domain patterns, and content holistically.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { CategorizerAnalyzer } from '@/services/analyzers/categorizer';
 *
 * const categorizer = new CategorizerAnalyzer();
 *
 * const result = await categorizer.analyze({
 *   id: 'email-123',
 *   subject: 'Q1 Proposal Review',
 *   senderEmail: 'sarah@acmecorp.com',
 *   senderName: 'Sarah Johnson',
 *   date: '2024-01-15T10:00:00Z',
 *   snippet: 'Please review the attached proposal...',
 *   bodyText: 'Hi, I hope this email finds you well...',
 * });
 *
 * if (result.success) {
 *   console.log(result.data.category);  // 'client_pipeline'
 *   console.log(result.data.labels);    // ['needs_review', 'has_deadline']
 *   console.log(result.data.summary);   // 'Sarah from Acme Corp wants you to review...'
 * }
 * ```
 *
 * @module services/analyzers/categorizer
 * @version 2.0.0
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig, EMAIL_CATEGORIES } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  CategorizationData,
  CategorizationResult,
  EmailInput,
  UserContext,
  QuickAction,
  EmailLabel,
} from './types';
import { EMAIL_LABELS } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'categorize_email';

/**
 * Description of what the function does.
 * This helps OpenAI understand when/how to use the function.
 */
const FUNCTION_DESCRIPTION =
  'Categorizes an email by what action (if any) is needed from the user';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick action options available.
 * Must match the QuickAction type in types.ts.
 */
const QUICK_ACTIONS = [
  'respond',      // Reply needed
  'review',       // Worth reading carefully
  'archive',      // Can be dismissed
  'save',         // Interesting, save for later
  'calendar',     // Add to calendar
  'unsubscribe',  // Suggest unsubscribing
  'follow_up',    // Need to follow up
  'none',         // Nothing to do
] as const;

/**
 * System prompt for the categorizer.
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categorization.
 *
 * This prompt is carefully crafted to:
 * 1. Focus on LIFE BUCKET - what area of the user's life does this email touch
 * 2. Use human-eye inference - think like a thoughtful assistant who knows the user
 * 3. Apply secondary labels for action tracking and flexible filtering
 * 4. Generate assistant-style summary for quick scanning
 * 5. Suggest quick action for inbox triage
 * 6. Consider sender context, domain patterns, and content holistically
 */
const BASE_SYSTEM_PROMPT = `You are an intelligent email organizer. Your job is to categorize emails into LIFE BUCKETS - organizing by what part of the user's life each email touches.

═══════════════════════════════════════════════════════════════════════════════
THINK LIKE A HUMAN ASSISTANT
═══════════════════════════════════════════════════════════════════════════════

Categorize as a thoughtful human assistant would - someone who understands the user's life context. Don't just keyword match. Consider:

- WHO sent this? (sender email, domain, name)
- WHY would they be emailing?
- WHAT part of the user's life does this touch?
- WHERE would the user naturally look for it?

Use INFERENCE and CONTEXT CLUES:
- noreply@kumon.com → obviously Family - Kids & School (even without "your child")
- Email from *.edu domain → likely school-related
- Email from pediatrician's office → Family - Health
- Figma updates when user is a developer → Product Updates (tool they use)
- LinkedIn message from potential client → Client Pipeline (not Business/Work)
- Eventbrite for Milwaukee tech meetup → Local (even though it's also "tech")

When ambiguous, choose the bucket where the user would most naturally look for it.

═══════════════════════════════════════════════════════════════════════════════
CATEGORIES (choose ONE primary life bucket)
═══════════════════════════════════════════════════════════════════════════════

- newsletters_general: Substacks, digests, curated content, reading material
  Examples: Morning Brew, Hacker News digest, industry newsletters

- news_politics: News outlets, political updates, current events
  Examples: NYT, CNN, political campaigns, government notices

- product_updates: Tech products, SaaS tools, services you subscribe to
  Examples: Figma updates, GitHub notifications, Spotify, Netflix
  KEY: Tools/products the user actively USES, not marketing from random companies

- local: Community events, neighborhood, local organizations
  Examples: Local meetups, community boards, city newsletters, library events
  KEY: Geographically local to the user's area

- shopping: Orders, shipping, deals, retail, purchases
  Examples: Amazon orders, shipping notifications, sale alerts, returns

- travel: Flights, hotels, bookings, trip planning
  Examples: Airline confirmations, hotel bookings, Airbnb, trip itineraries

- finance: Bills, banking, investments, financial receipts
  Examples: Bank statements, credit card alerts, invoices, payment confirmations

- family_kids_school: School emails, kid activities, educational logistics
  Examples: Teacher emails, school newsletters, class signups, activity registrations
  KEY: Related to children's education, activities, or care

- family_health_appointments: Medical, health appointments, family scheduling
  Examples: Doctor appointments, health reminders, prescription alerts, dental
  KEY: Health-related for any family member

- client_pipeline: Direct client work, project correspondence, billable relationships
  Examples: Client emails about projects, contract discussions, deliverable reviews
  KEY: People/companies you do paid work FOR

- business_work_general: Professional but not direct client work
  Examples: Internal team emails, industry discussions, professional networking,
  job boards, B2B SaaS marketing, conference invites
  KEY: Work-related but not a paying client relationship

- personal_friends_family: Social relationships, personal correspondence
  Examples: Friends reaching out, family messages, social invitations, personal news
  KEY: Personal relationships (not business, not logistics)

═══════════════════════════════════════════════════════════════════════════════
DISAMBIGUATION GUIDE
═══════════════════════════════════════════════════════════════════════════════

PRODUCT UPDATES vs BUSINESS/WORK:
- Tool you USE daily (Figma, Slack, GitHub) → product_updates
- Random B2B marketing → business_work_general
- Tool for a specific client project → product_updates (still a tool you use)

CLIENT PIPELINE vs BUSINESS/WORK:
- Email FROM a paying client → client_pipeline
- Email about industry news → business_work_general
- LinkedIn recruiter → business_work_general
- LinkedIn message from potential client → client_pipeline

PERSONAL vs FAMILY:
- Friend inviting you to dinner → personal_friends_family
- Kid's school event → family_kids_school
- Mom sharing photos → personal_friends_family
- Pediatrician appointment → family_health_appointments

LOCAL vs OTHER:
- Event in your metro area → local (even if also tech, art, etc.)
- Virtual webinar → business_work_general or newsletters_general
- Conference in another city → travel or business_work_general

═══════════════════════════════════════════════════════════════════════════════
LABELS (choose 0-5 secondary labels)
═══════════════════════════════════════════════════════════════════════════════

Labels provide ADDITIONAL context beyond the category. Apply relevant labels.

ACTION LABELS (what needs to happen):
- needs_reply: Someone is explicitly waiting for a response
- needs_decision: User must choose between options
- needs_review: Content requires careful reading
- needs_approval: Approval or sign-off requested

URGENCY LABELS:
- urgent: Marked urgent, ASAP, or critical
- has_deadline: Specific deadline/due date mentioned
- time_sensitive: Limited-time offer or opportunity

RELATIONSHIP LABELS:
- from_vip: Sender is on user's VIP list
- new_contact: First email from this sender
- networking_opportunity: Potential valuable connection

CONTENT LABELS:
- has_attachment: Email mentions or has attachments
- has_link: Contains important links
- has_question: Direct question asked
- has_event: Contains a calendar-worthy event (date/time)

FINANCIAL LABELS:
- invoice: Invoice or bill to pay
- receipt: Purchase confirmation
- payment_due: Payment deadline

CALENDAR LABELS:
- meeting_request: Meeting invitation
- rsvp_needed: RSVP or registration required
- appointment: Scheduled appointment

═══════════════════════════════════════════════════════════════════════════════
SUMMARY (one sentence, assistant-style)
═══════════════════════════════════════════════════════════════════════════════

Write as if you're briefing the user. Be concise but informative.
Include: who it's from, what they want/are saying, any deadline if mentioned.

GOOD EXAMPLES:
- "Sarah from Acme Corp wants you to review the Q1 proposal by Friday"
- "Your AWS bill for January is $142.67 - payment processed"
- "Kumon reminder: homework packets due Monday"
- "Shorewood Library: Summer reading program starts June 1"
- "Order shipped: Your Amazon package arriving Thursday"
- "Dr. Smith: Annual checkup reminder for next Tuesday"

═══════════════════════════════════════════════════════════════════════════════
QUICK ACTION (for inbox triage)
═══════════════════════════════════════════════════════════════════════════════

- respond: Reply needed
- review: Worth reading carefully
- archive: Can be dismissed
- save: Interesting, save for later
- calendar: Add to calendar
- unsubscribe: Suggest unsubscribing
- follow_up: Need to follow up
- none: Nothing to do

═══════════════════════════════════════════════════════════════════════════════
TOPICS (1-5 keywords)
═══════════════════════════════════════════════════════════════════════════════

Extract key topics: billing, project-update, homework, appointment, shipping, etc.

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════════════════════

Be decisive. If truly ambiguous between two buckets, pick the most likely one and note lower confidence (< 0.7).`;

/**
 * Builds the full system prompt with user context injected.
 * This enables personalized categorization based on user's VIPs, location, etc.
 */
function buildSystemPrompt(context?: UserContext): string {
  const parts = [BASE_SYSTEM_PROMPT];

  if (context) {
    const contextParts: string[] = [];

    // Add VIP context
    if (context.vipEmails?.length || context.vipDomains?.length) {
      const vips = [
        ...(context.vipEmails || []),
        ...(context.vipDomains || []),
      ];
      contextParts.push(`VIP CONTACTS (apply 'from_vip' label): ${vips.join(', ')}`);
    }

    // Add location context
    if (context.locationMetro) {
      contextParts.push(`USER LOCATION: ${context.locationMetro}. Apply 'local_event' label for events in this area.`);
    }

    // Add family context
    if (context.familyContext?.familyNames?.length) {
      contextParts.push(`FAMILY MEMBERS: ${context.familyContext.familyNames.join(', ')}. Apply 'family_related' label when mentioned.`);
    }

    // Add role/priorities context
    if (context.role) {
      contextParts.push(`USER ROLE: ${context.role}`);
    }
    if (context.priorities?.length) {
      contextParts.push(`USER PRIORITIES: ${context.priorities.join(', ')}`);
    }

    if (contextParts.length > 0) {
      parts.push('\n═══════════════════════════════════════════════════════════════════════════════');
      parts.push('USER CONTEXT (use for personalized labeling)');
      parts.push('═══════════════════════════════════════════════════════════════════════════════');
      parts.push(contextParts.join('\n'));
    }
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured output.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * Using function calling ensures consistent, typed responses.
 *
 * ENHANCED (Jan 2026): Added summary, quick_action, and labels fields.
 * - summary: One-sentence assistant-style overview
 * - quick_action: Suggested action for inbox triage
 * - labels: Secondary labels for multi-dimensional classification
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Primary category (required)
      category: {
        type: 'string',
        enum: EMAIL_CATEGORIES as unknown as string[],
        description: 'Primary category based on action needed (NOT who sent it)',
      },

      // Secondary labels (NEW Jan 2026)
      labels: {
        type: 'array',
        items: {
          type: 'string',
          enum: EMAIL_LABELS as unknown as string[],
        },
        maxItems: 5,
        description: 'Secondary labels for flexible filtering (0-5). Only apply labels that clearly fit.',
      },

      // Confidence score (required)
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in this categorization (0-1)',
      },

      // Reasoning (required for transparency)
      reasoning: {
        type: 'string',
        description: 'Brief explanation of why this category was chosen',
      },

      // Topic keywords (optional but helpful)
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key topics extracted from email: billing, meeting, feedback, etc.',
      },

      // One-sentence summary (required)
      summary: {
        type: 'string',
        description:
          'One-sentence assistant-style summary. Example: "Sarah from Acme wants you to review the proposal by Friday"',
      },

      // Quick action for inbox triage (required)
      quick_action: {
        type: 'string',
        enum: QUICK_ACTIONS as unknown as string[],
        description: 'Suggested quick action: respond, review, archive, save, calendar, unsubscribe, follow_up, none',
      },
    },
    required: ['category', 'labels', 'confidence', 'reasoning', 'summary', 'quick_action'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIZER ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categorizer Analyzer
 *
 * Classifies emails into one of seven action-focused categories.
 * This analyzer runs first in the pipeline and helps determine
 * which other analyzers should process the email.
 *
 * Key design decisions:
 * - Action-focused categories (not sender-based)
 * - "client" is NOT a category (tracked separately)
 * - Conservative: when unsure, prefers action_required
 * - Extracts topics for filtering and search
 *
 * @example
 * ```typescript
 * const categorizer = new CategorizerAnalyzer();
 *
 * // Check if categorizer is enabled
 * if (!categorizer.isEnabled()) {
 *   console.log('Categorizer is disabled in config');
 *   return;
 * }
 *
 * // Analyze an email
 * const result = await categorizer.analyze(emailInput);
 *
 * if (result.success) {
 *   // Use the categorization
 *   console.log(`Category: ${result.data.category}`);
 *   console.log(`Confidence: ${result.confidence}`);
 *   console.log(`Topics: ${result.data.topics?.join(', ')}`);
 * } else {
 *   // Handle failure
 *   console.error(`Categorization failed: ${result.error}`);
 * }
 * ```
 */
export class CategorizerAnalyzer extends BaseAnalyzer<CategorizationData> {
  /**
   * Creates a new CategorizerAnalyzer instance.
   *
   * Uses the categorizer configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.2 for consistency)
   * - maxTokens: Maximum response tokens (300)
   */
  constructor() {
    super('Categorizer', analyzerConfig.categorizer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and returns its category.
   *
   * This is the main entry point for categorization.
   * Internally uses executeAnalysis() from BaseAnalyzer
   * which handles:
   * - Email formatting
   * - API calls with retry
   * - Error handling
   * - Logging
   *
   * ENHANCED (Jan 2026): Now also returns summary and quickAction fields.
   *
   * @param email - Email data to categorize
   * @param _context - User context (not used by categorizer)
   * @returns Categorization result with category, confidence, reasoning, topics, summary, quickAction
   *
   * @example
   * ```typescript
   * const result = await categorizer.analyze({
   *   id: 'email-123',
   *   subject: 'Invoice #1234',
   *   senderEmail: 'billing@stripe.com',
   *   senderName: 'Stripe',
   *   date: '2024-01-15T10:00:00Z',
   *   snippet: 'Your payment was successful',
   *   bodyText: 'Receipt for your payment of $99.00...',
   * });
   *
   * // result.data.category === 'admin'
   * // result.data.topics === ['billing', 'payment', 'receipt']
   * // result.data.summary === 'Stripe payment receipt for $99.00 - no action needed'
   * // result.data.quickAction === 'archive'
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<CategorizationResult> {
    // Note: context is not used by categorizer (unlike client tagger)
    void context;

    // Use the base class executeAnalysis which handles all common logic:
    // - Logging
    // - API calls with retry
    // - Error handling
    // - Cost tracking
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    // (OpenAI returns snake_case, we use camelCase)
    if (result.success) {
      result.data = this.normalizeResponse(result.data);
    }

    return result;
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
  private normalizeResponse(rawData: Record<string, unknown>): CategorizationData {
    return {
      // Core categorization fields
      category: rawData.category as CategorizationData['category'],
      confidence: (rawData.confidence as number) || 0.5,
      reasoning: (rawData.reasoning as string) || '',
      topics: (rawData.topics as string[]) || [],

      // Secondary labels (NEW Jan 2026)
      labels: (rawData.labels as EmailLabel[]) || [],

      // Assistant-style summary
      summary: (rawData.summary as string) || 'Email received',

      // Quick action (convert snake_case to camelCase)
      quickAction: (rawData.quick_action as QuickAction) || 'review',
    };
  }

  /**
   * Returns the OpenAI function schema for categorization.
   *
   * The schema defines the structured output format:
   * - category: One of the EMAIL_CATEGORIES
   * - confidence: 0-1 confidence score
   * - reasoning: Why this category was chosen
   * - topics: Array of topic keywords
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for categorization.
   *
   * The prompt instructs the AI to:
   * - Categorize by ACTION needed, not sender
   * - Avoid using "client" as a category
   * - Apply secondary labels for multi-dimensional filtering
   * - Be conservative (prefer action_required when unsure)
   * - Extract relevant topic keywords
   * - Be honest about confidence
   *
   * ENHANCED (Jan 2026): Now uses user context for personalized labeling.
   * - VIP contacts get 'from_vip' label
   * - Local events get 'local_event' label
   * - Family members get 'family_related' label
   *
   * @param context - User context for personalized labeling
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    return buildSystemPrompt(context);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default categorizer instance for convenience.
 *
 * Use this for simple cases where you don't need
 * custom configuration.
 *
 * @example
 * ```typescript
 * import { categorizer } from '@/services/analyzers/categorizer';
 *
 * const result = await categorizer.analyze(email);
 * ```
 */
export const categorizer = new CategorizerAnalyzer();
