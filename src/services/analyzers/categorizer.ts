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
 * - newsletters_creator: Substacks, digests, curated content (default for unsorted newsletters)
 * - newsletters_industry: Industry-specific newsletters, professional reading
 * - news_politics: News outlets, political updates
 * - product_updates: Tech products, SaaS tools you use
 * - local: Community events, neighborhood, local orgs
 * - shopping: Orders, shipping, deals, retail
 * - travel: Flights, hotels, bookings, trip info
 * - finance: Bills, banking, investments, receipts
 * - family: Family, kids, school, health, appointments
 * - clients: Direct client correspondence, project work
 * - work: Team, industry, professional (not direct clients)
 * - personal_friends_family: Social, relationships, personal correspondence
 * Every email is assigned to one of these — no "other" or uncategorized bucket.
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
 *   console.log(result.data.category);  // 'clients'
 *   console.log(result.data.labels);    // ['needs_review', 'has_deadline']
 *   console.log(result.data.summary);   // 'Sarah from Acme Corp wants you to review...'
 * }
 * ```
 *
 * @module services/analyzers/categorizer
 * @version 2.0.0
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig, EMAIL_CATEGORIES, SIGNAL_STRENGTHS, REPLY_WORTHINESS } from '@/config/analyzers';
import { normalizeCategory, EMAIL_CATEGORIES_SET } from '@/types/discovery';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  CategorizationData,
  CategorizationResult,
  EmailInput,
  UserContext,
  QuickAction,
  EmailLabel,
  SignalStrength,
  ReplyWorthiness,
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
const BASE_SYSTEM_PROMPT = `You are an intelligent email organizer and relevance filter. Your job is to:
1. Categorize emails into LIFE BUCKETS
2. Assess SIGNAL STRENGTH (is this worth the user's time?)
3. Assess REPLY WORTHINESS (should the user reply?)
4. Detect NOISE patterns (sales pitches, fake awards, mass outreach)

═══════════════════════════════════════════════════════════════════════════════
THINK LIKE A PROTECTIVE ASSISTANT
═══════════════════════════════════════════════════════════════════════════════

You are a thoughtful assistant who PROTECTS the user's attention. Don't just
categorize - evaluate whether this email deserves the user's time at all.

For EVERY email, ask yourself:
- WHO sent this? (sender email, domain, name)
- WHY would they be emailing? (genuine need vs. wanting something from user)
- Is this a REAL PERSON writing specifically to the user, or a broadcast/template?
- Does the user NEED to see this, or is it just inbox pollution?
- If a reply is expected, is it worth the user's time to reply?

Use INFERENCE and CONTEXT CLUES:
- noreply@kumon.com → Family (even without "your child")
- Email from *.edu domain → likely school-related
- "Congratulations! You've been selected..." from unknown sender → fake recognition noise
- "Quick question" from unknown sender → likely cold sales outreach
- "I'd love to feature you..." from unknown PR person → mass outreach
- Figma updates when user is a developer → Product Updates (tool they use)
- LinkedIn message from potential client → Clients
- Newsletter author whose content aligns with user's business → networking opportunity

═══════════════════════════════════════════════════════════════════════════════
SIGNAL STRENGTH (how important is this email?)
═══════════════════════════════════════════════════════════════════════════════

Rate every email's signal strength:

HIGH SIGNAL - Direct human correspondence requiring attention:
- Real person writing directly to the user about a specific matter
- Client, colleague, friend, family member with a purpose
- Business opportunities that are clearly legitimate and relevant
- Time-sensitive transactional (flight change, appointment reminder)
- Direct questions or requests from known contacts

MEDIUM SIGNAL - Useful information worth seeing:
- Newsletters the user actively reads and values
- Product updates for tools they use daily
- Relevant industry news matching user's interests
- Community/local events in their area
- Financial statements and receipts worth noting
- School/kid activity updates

LOW SIGNAL - Background noise, can be batched or skipped:
- Generic newsletters user rarely engages with
- Product updates for tools they barely use
- Generic promotional emails from known companies
- Social media notifications (LinkedIn digest, etc.)
- Marketing from companies user has bought from once

NOISE - Pure noise, auto-archive candidate:
- Cold sales pitches (even if personalized-sounding)
- Fake awards/recognition ("You've been nominated for...")
- Mass PR outreach ("I'd love to feature you in...")
- Generic webinar invites from unknown organizers
- "Quick question" from unknown senders (almost always sales)
- Link exchange / SEO outreach
- Pay-to-play conference speaker invites
- "Partnership opportunity" from unknown companies

═══════════════════════════════════════════════════════════════════════════════
NOISE DETECTION - BE VIGILANT
═══════════════════════════════════════════════════════════════════════════════

These patterns are ALMOST ALWAYS noise. Be skeptical:

FAKE RECOGNITION (label: fake_recognition):
- "Congratulations! You've been selected/nominated/chosen..."
- "You've been recognized as a Top [X] in [industry]"
- "We'd like to feature you in our [publication/list]" (then asks for money)
- "Award-winning" anything that requires payment to claim
- Key tell: they want MONEY or promote their platform, not genuinely honoring you

SALES PITCHES (label: sales_pitch):
- "Quick question" or "Thought you'd be interested" from strangers
- "I noticed your company..." followed by a pitch
- "Can we schedule 15 minutes?" from unknown senders
- "I've been following your work..." then immediately sells something
- Tool/platform demos nobody asked for
- "Boost your [metric]" or "10x your [thing]" language

MASS OUTREACH (label: mass_outreach):
- PR pitches ("I have a client who'd be perfect for your podcast/blog")
- Link exchange requests ("I noticed a broken link on your site...")
- Guest post pitches from unknown writers
- "Partnership opportunity" that's really just cross-promotion
- Influencer/creator collaboration from unknown parties

WEBINAR INVITES (label: webinar_invite):
- Generic "Join our free webinar on [topic]" from unknown organizers
- "Exclusive masterclass" or "limited seats" urgency tactics
- Conference/summit invitations that feel like marketing funnels
- NOTE: Legitimate industry events from known organizers are NOT noise

PROMOTIONAL (label: promotional):
- Sale alerts from companies (unless user actively shops there)
- "Last chance!" deals and limited-time offers
- Upsell emails from existing services
- "Your [unused feature] is waiting for you"

═══════════════════════════════════════════════════════════════════════════════
REPLY WORTHINESS (should the user reply?)
═══════════════════════════════════════════════════════════════════════════════

MUST_REPLY - Someone is waiting for a response:
- Direct question from a known contact
- Client requesting something specific
- Colleague asking for input/decision
- Friend/family asking a question
- Business partner needing information

SHOULD_REPLY - Smart to reply, builds relationships:
- Newsletter author whose content is relevant to user's business
  (replying to newsletter creators is great networking)
- Interesting cold outreach that's actually relevant and legitimate
- Community member with a genuine question
- Former colleague reaching out to reconnect
- Local business owner with a genuine introduction

OPTIONAL_REPLY - Could reply if time permits:
- Interesting discussion thread user was CC'd on
- Non-urgent "just checking in" from acquaintance
- Survey/feedback request from a service user values
- Invitation to something user might attend

NO_REPLY - No reply expected or useful:
- Newsletters and broadcasts (even good ones)
- Automated notifications and confirmations
- Sales pitches and mass outreach
- Promotional emails
- System notifications (password changes, login alerts)
- Receipt confirmations

═══════════════════════════════════════════════════════════════════════════════
NETWORKING OPPORTUNITY - WHEN TO APPLY THIS LABEL
═══════════════════════════════════════════════════════════════════════════════

Apply 'networking_opportunity' label ONLY when:
- The email represents a genuine chance to build a valuable connection
- The person/organization is relevant to the user's work or interests
- Replying would create mutual value (not just benefit the sender)

GOOD networking opportunities:
- Newsletter author in user's industry whose content is excellent
- Someone mentioning user's work positively and introducing themselves
- Legitimate conference organizer with a speaking/attending opportunity
- Community leader reaching out about collaboration
- Potential client who's done their research and has a real project
- Industry peer asking for genuine advice or offering it

NOT networking opportunities (even if they claim to be):
- "I'd love to connect" with no specific reason
- Sales people disguised as networkers
- "Let's hop on a call" from unknown people with no context
- Pay-to-play anything (speaker slots, awards, features)

═══════════════════════════════════════════════════════════════════════════════
CATEGORIES (choose ONE primary life bucket)
═══════════════════════════════════════════════════════════════════════════════

- newsletters_creator: Substacks, digests, curated content, reading material
  Examples: Morning Brew, Hacker News digest, creator newsletters
  KEY: Default for unsorted newsletter content

- newsletters_industry: Industry-specific newsletters, professional reading
  Examples: Industry trade publications, professional association updates, sector-specific digests
  KEY: Newsletters focused on a specific industry or profession

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

- family: Family, kids, school, health, appointments, family scheduling
  Examples: Teacher emails, school newsletters, doctor appointments, health reminders,
  kid activities, class signups, prescription alerts
  KEY: Related to family life - children, health, education, activities, care

- clients: Direct client work, project correspondence, billable relationships
  Examples: Client emails about projects, contract discussions, deliverable reviews
  KEY: People/companies you do paid work FOR

- work: Professional but not direct client work
  Examples: Internal team emails, industry discussions, professional networking,
  job boards, B2B SaaS marketing, conference invites
  KEY: Work-related but not a paying client relationship

- personal_friends_family: Social relationships, personal correspondence
  Examples: Friends reaching out, family messages, social invitations, personal news
  KEY: Personal relationships (not business, not logistics)

IMPORTANT: Every email MUST be assigned to one of the 12 categories above. There is
NO "other" or "uncategorized" option. Pick the BEST FIT even if the match isn't
perfect. Use your best judgment — lean toward personal_friends_family for personal
content or product_updates for automated/system content.

═══════════════════════════════════════════════════════════════════════════════
DISAMBIGUATION GUIDE
═══════════════════════════════════════════════════════════════════════════════

PRODUCT UPDATES vs WORK:
- Tool you USE daily (Figma, Slack, GitHub) → product_updates
- Random B2B marketing → work
- Tool for a specific client project → product_updates (still a tool you use)

CLIENTS vs WORK:
- Email FROM a paying client → clients
- Email about industry news → work
- LinkedIn recruiter → work
- LinkedIn message from potential client → clients

PERSONAL vs FAMILY:
- Friend inviting you to dinner → personal_friends_family
- Kid's school event → family
- Mom sharing photos → personal_friends_family
- Pediatrician appointment → family

LOCAL vs OTHER:
- Event in your metro area → local (even if also tech, art, etc.)
- Virtual webinar → work or newsletters_creator
- Conference in another city → travel or work

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
- networking_opportunity: Genuine valuable connection potential (see criteria above)

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

LEARNING/CAREER LABELS:
- educational: Learning content
- industry_news: Industry updates
- job_opportunity: Job/career related

NOISE LABELS (apply when detected):
- sales_pitch: Cold sales email
- webinar_invite: Generic webinar marketing
- fake_recognition: Fake awards, pay-to-play nomination
- mass_outreach: PR pitch, link exchange, generic partnerships
- promotional: Deals, discounts, upsells

═══════════════════════════════════════════════════════════════════════════════
SUMMARY (one sentence, assistant-style)
═══════════════════════════════════════════════════════════════════════════════

Write as if you're briefing the user. Be concise but informative.
Include: who it's from, what they want/are saying, any deadline if mentioned.
For noise emails, be blunt: "Sales pitch from [company] for their [product] - skip"

GOOD EXAMPLES:
- "Sarah from Acme Corp wants you to review the Q1 proposal by Friday"
- "Your AWS bill for January is $142.67 - payment processed"
- "Kumon reminder: homework packets due Monday"
- "Sales pitch from DataCo trying to sell their analytics platform - skip"
- "Fake award nomination from 'Business Leaders Awards' - wants $500 to attend gala"
- "Cold outreach from SEO agency wanting to 'optimize your site' - mass email"
- "Interesting Substack post from [author] on AI in healthcare - matches your interests"

═══════════════════════════════════════════════════════════════════════════════
QUICK ACTION (for inbox triage)
═══════════════════════════════════════════════════════════════════════════════

- respond: Reply needed
- review: Worth reading carefully
- archive: Can be dismissed (USE THIS FOR NOISE)
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
        description: 'Primary category based on what part of the user\'s life this touches',
      },

      // Secondary labels (NEW Jan 2026, ENHANCED Feb 2026 with noise labels)
      labels: {
        type: 'array',
        items: {
          type: 'string',
          enum: EMAIL_LABELS as unknown as string[],
        },
        maxItems: 5,
        description: 'Secondary labels for flexible filtering (0-5). Include noise labels when applicable (sales_pitch, webinar_invite, fake_recognition, mass_outreach, promotional).',
      },

      // Signal strength (NEW Feb 2026)
      signal_strength: {
        type: 'string',
        enum: SIGNAL_STRENGTHS as unknown as string[],
        description: 'How important is this email? high=direct human correspondence, medium=useful info, low=background noise, noise=auto-archive candidate',
      },

      // Reply worthiness (NEW Feb 2026)
      reply_worthiness: {
        type: 'string',
        enum: REPLY_WORTHINESS as unknown as string[],
        description: 'Should the user reply? must_reply=someone waiting, should_reply=smart networking move, optional_reply=could if interested, no_reply=no response expected',
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
        description: 'Brief explanation of why this category was chosen and signal/reply assessment',
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
          'One-sentence assistant-style summary. For noise emails, be blunt: "Sales pitch from [company] - skip"',
      },

      // Quick action for inbox triage (required)
      quick_action: {
        type: 'string',
        enum: QUICK_ACTIONS as unknown as string[],
        description: 'Suggested quick action: respond, review, archive, save, calendar, unsubscribe, follow_up, none',
      },
    },
    required: ['category', 'labels', 'signal_strength', 'reply_worthiness', 'confidence', 'reasoning', 'summary', 'quick_action'],
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
      result.data = this.normalizeResponse(result.data as unknown as Record<string, unknown>);
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
    // Validate quick_action is one of the allowed values
    const validQuickActions = new Set<string>(QUICK_ACTIONS);
    const rawQuickAction = rawData.quick_action as string;
    const quickAction: QuickAction = validQuickActions.has(rawQuickAction)
      ? (rawQuickAction as QuickAction)
      : 'review'; // Default to 'review' if invalid

    // Validate signal_strength (NEW Feb 2026)
    const validSignalStrengths = new Set<string>(SIGNAL_STRENGTHS);
    const rawSignalStrength = rawData.signal_strength as string;
    const signalStrength: SignalStrength = validSignalStrengths.has(rawSignalStrength)
      ? (rawSignalStrength as SignalStrength)
      : 'medium'; // Default to 'medium' if invalid

    // Validate reply_worthiness (NEW Feb 2026)
    const validReplyWorthiness = new Set<string>(REPLY_WORTHINESS);
    const rawReplyWorthiness = rawData.reply_worthiness as string;
    const replyWorthiness: ReplyWorthiness = validReplyWorthiness.has(rawReplyWorthiness)
      ? (rawReplyWorthiness as ReplyWorthiness)
      : 'no_reply'; // Default to 'no_reply' if invalid

    // Validate category - AI sometimes returns labels (e.g. "promotional") as categories
    // normalizeCategory() always returns a valid category (never null)
    const rawCategory = rawData.category as string;
    const validatedCategory = EMAIL_CATEGORIES_SET.has(rawCategory)
      ? rawCategory as CategorizationData['category']
      : normalizeCategory(rawCategory) as CategorizationData['category'];

    return {
      // Core categorization fields
      category: validatedCategory,
      confidence: (rawData.confidence as number) || 0.5,
      reasoning: (rawData.reasoning as string) || '',
      topics: (rawData.topics as string[]) || [],

      // Secondary labels (NEW Jan 2026, ENHANCED Feb 2026 with noise labels)
      labels: (rawData.labels as EmailLabel[]) || [],

      // Assistant-style summary
      summary: (rawData.summary as string) || 'Email received',

      // Quick action (validated)
      quickAction,

      // Signal strength (NEW Feb 2026)
      signalStrength,

      // Reply worthiness (NEW Feb 2026)
      replyWorthiness,
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
