/**
 * Content Digest Analyzer
 *
 * Extracts the SUBSTANCE of an email: what it's actually about, what matters,
 * and what links are worth knowing about.
 *
 * Think of this as having an eager, helpful assistant read every email and
 * brief you on what you need to know - without reading it yourself.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DESIGN PHILOSOPHY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. GIST should be conversational, like an assistant briefing you:
 *    - "Figma shipped auto-layout 5.0 - the big thing is text wrapping finally
 *       works properly. Rolling out to everyone this week."
 *    - NOT: "Product update announcement from Figma"
 *
 * 2. KEY POINTS should be SPECIFIC, not vague:
 *    - GOOD: "New min-width and max-width properties on auto-layout frames"
 *    - BAD: "New features available"
 *
 * 3. LINKS should be filtered for VALUE:
 *    - Include: Registration links, articles that are the point, documents to review
 *    - Exclude: Tracking pixels, generic footers, unsubscribe (noted but not featured)
 *
 * 4. For NEWSLETTERS with multiple topics:
 *    - Match to user interests and highlight relevant items
 *    - Provide the gist of ALL topics, but mark which match interests
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPLEMENTARY TO EVENT DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For event emails, BOTH analyzers run with different focuses:
 * - ContentDigest: "The speaker is Jane from Google, topic is AI in Production"
 * - EventDetector: "Sat Jan 25 at 6pm, local, free, RSVP required"
 *
 * ContentDigest = content substance | EventDetector = event logistics
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { ContentDigestAnalyzer } from '@/services/analyzers/content-digest';
 *
 * const digestAnalyzer = new ContentDigestAnalyzer();
 *
 * const result = await digestAnalyzer.analyze(email, userContext);
 *
 * if (result.success) {
 *   console.log(result.data.gist);         // "Figma shipped auto-layout 5.0..."
 *   console.log(result.data.keyPoints);    // [{point: "...", relevance: "..."}]
 *   console.log(result.data.links);        // [{url, type, title, description}]
 *   console.log(result.data.contentType);  // "single_topic"
 * }
 * ```
 *
 * @module services/analyzers/content-digest
 * @version 1.0.0
 * @since January 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  ContentDigestData,
  ContentDigestResult,
  EmailInput,
  UserContext,
  LinkType,
  ContentType,
  KeyPoint,
  ExtractedLink,
  GoldenNugget,
  GoldenNuggetType,
  EmailStyleIdea,
  EmailStyleIdeaType,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'extract_content_digest';

/**
 * Description of what the function does.
 * Helps OpenAI understand when/how to use the function.
 */
const FUNCTION_DESCRIPTION =
  'Extracts the gist, key points, and notable links from an email for quick scanning';

/**
 * Valid link types for classification.
 */
const LINK_TYPES: LinkType[] = [
  'article',
  'registration',
  'document',
  'video',
  'product',
  'tool',
  'social',
  'unsubscribe',
  'other',
];

/**
 * Valid content types for email structure classification.
 */
const CONTENT_TYPES: ContentType[] = [
  'single_topic',
  'multi_topic_digest',
  'curated_links',
  'personal_update',
  'transactional',
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base system prompt for content digest extraction.
 * Additional user context (interests) is appended dynamically.
 */
const BASE_SYSTEM_PROMPT = `You are the user's sharpest assistant — the person who reads every email before they do and briefs them like a trusted friend. "Right on top of that, Rose!" energy. Give them the juice, skip the filler, and always flag the hidden gems they'd want to remember.

Your job:
1. What's the GIST? (tell them in 1-2 punchy sentences — WHAT + WHY it matters)
2. What are the KEY POINTS? (the specific stuff that matters, with real details)
3. What LINKS are worth their click? (filtered for value, not noise)
4. Any GOLDEN NUGGETS? (deals, tips, things to remember, sales opportunities, contact details — the stuff buried in emails that's easy to miss)

═══════════════════════════════════════════════════════════════════════════════
GIST (1-2 sentences — talk like a human, not a bot)
═══════════════════════════════════════════════════════════════════════════════

Write like you're telling a friend. Be specific, punchy, natural. Drop corporate filler.

GOOD EXAMPLES:
- "Figma shipped auto-layout 5.0 — text wrapping finally works, plus min/max widths on frames. Rolling out this week."
- "Morning Brew today: Fed held rates, Apple's AI features in iOS 18.4, and a great deep dive on why Costco's $1.50 hot dog is genius."
- "Sarah from Acme needs the Q1 proposal reviewed by Friday and wants to schedule a call next week."
- "AWS bill: $142.67, up 12% from last month. Auto-paid."

BAD EXAMPLES (too vague, robotic):
- "Product update from Figma"
- "Newsletter with multiple stories"
- "Email about project work"

═══════════════════════════════════════════════════════════════════════════════
KEY POINTS (2-5 bullet points, SPECIFIC)
═══════════════════════════════════════════════════════════════════════════════

Each key point should be scannable in 2 seconds. Include:
- Names, dates, numbers, prices (specific details)
- What's NEW or CHANGED
- What the reader needs to DO (if anything)

GOOD KEY POINTS:
- "Figma released auto-layout 5.0 with text wrapping and min/max widths"
- "Rolling out Monday Jan 27 to all plans including free tier"
- "Breaking change: existing fixed-width text may need adjustment"
- "Migration guide available at figma.com/migration"

BAD KEY POINTS (too vague):
- "Product update announcement"
- "New features available"
- "Important information included"
- "Changes coming soon"

For NEWSLETTERS with multiple topics:
- Extract the gist of each story/topic
- If user has interests listed, note which topics match (in 'relevance' field)

═══════════════════════════════════════════════════════════════════════════════
LINKS (filtered for VALUE)
═══════════════════════════════════════════════════════════════════════════════

Only extract links worth knowing about. Filter out noise.

INCLUDE (high value):
- Registration/RSVP links (event signups)
- Documents to review (PDFs, docs, proposals)
- Articles that ARE the content (the blog post the newsletter is sharing)
- Videos that are primary content
- Product pages being announced

DE-EMPHASIZE (include but mark appropriately):
- Unsubscribe links (type: 'unsubscribe', not main content)
- Social follow links (type: 'social', not main content)

EXCLUDE ENTIRELY:
- Tracking pixels / email open trackers
- Generic company homepage links (unless relevant)
- "View in browser" links
- Privacy policy / terms links (unless that's the email's topic)

For each link, provide:
- url: The actual URL
- type: article, registration, document, video, product, tool, social, unsubscribe, other
- title: What the link is (e.g., "Auto-layout 5.0 announcement")
- description: Why someone might click it (e.g., "Full details with examples")
- isMainContent: true if this link IS the point of the email

═══════════════════════════════════════════════════════════════════════════════
CONTENT TYPE (structure classification)
═══════════════════════════════════════════════════════════════════════════════

Classify the email structure:
- single_topic: One main subject (product update, request, announcement)
- multi_topic_digest: Newsletter with multiple stories (Morning Brew, etc.)
- curated_links: Link roundup, reading list, resource collection
- personal_update: Personal correspondence, life update from friend/family
- transactional: Receipt, confirmation, notification, automated

═══════════════════════════════════════════════════════════════════════════════
GOLDEN NUGGETS (deals, tips, things worth remembering)
═══════════════════════════════════════════════════════════════════════════════

Scan for things the user might want to SAVE or REMEMBER — the little treasures
buried in emails that are easy to miss. Think like a friend who reads every
email and texts them: "hey, don't miss this part!"

- DEALS & DISCOUNTS: Promo codes, sale dates, limited-time offers, price drops.
  Include the code, the amount, and when it expires.
  E.g., "Code SAVE20 for 20% off, expires March 1"
- TIPS & ADVICE: Practical tips, how-tos, best practices mentioned in passing.
  Things you'd screenshot or jot in a notebook.
  E.g., "Pro tip: use Cmd+K to search across all Figma files"
- QUOTES & LINES: Memorable quotes, funny lines, or wisdom worth saving.
  E.g., "'The best time to plant a tree was 20 years ago. The second best is now.'"
- NUMBERS & STATS: Interesting data points, benchmarks, or metrics.
  Things you'd reference in a meeting or use in a pitch.
  E.g., "Average open rate for newsletters in tech is 38%"
- RECOMMENDATIONS: Products, books, tools, restaurants, or services recommended.
  E.g., "Highly recommends 'Shape Up' by Basecamp for product teams"
- REMEMBER THIS: Important context, contact info, relationship details, or facts
  mentioned in passing that the user might want to recall later.
  E.g., "Sarah mentioned she's moving to Austin in April" or
  "New client prefers Slack over email for quick updates" or
  "Annual renewal is $299, comes up again in November"
- SALES & OPPORTUNITIES: Business leads, partnership offers, sponsorship deals,
  or revenue opportunities buried in the email.
  E.g., "They're looking for a developer for a 3-month contract starting March"

Only include nuggets that are genuinely useful or memorable. Skip generic stuff.
Each nugget should have a type and a short description that captures the value.

═══════════════════════════════════════════════════════════════════════════════
EMAIL STYLE IDEAS (for solopreneurs studying great emails)
═══════════════════════════════════════════════════════════════════════════════

For NEWSLETTERS and BRAND EMAILS that are well-designed, note what a
solopreneur could STEAL for their own emails. Think like a copywriter
studying the craft — what makes this email effective?

- LAYOUT: How the email is structured (sections, hierarchy, whitespace).
  E.g., "Uses a 3-part structure: hook story → key insight → CTA. Clean sections with bold headers."
- SUBJECT LINE: What made the subject line effective or attention-grabbing.
  E.g., "Subject uses curiosity gap: 'The $1.50 decision that made Costco billions'"
- TONE: The voice and style the reader could emulate.
  E.g., "Casual authority — writes like a smart friend, not a professor. Uses 'you' and 'we' heavily."
- CTA: How the call-to-action was crafted.
  E.g., "Soft CTA: 'Reply to this email with your biggest challenge' — feels personal, drives engagement"
- VISUAL: Design elements, imagery, branding worth noting.
  E.g., "Single hero image above fold, brand colors as section dividers, clean sans-serif font"
- STORYTELLING: How the email uses narrative to engage.
  E.g., "Opens with personal anecdote (failed product launch), pivots to lesson, reader sees themselves in it"
- PERSONALIZATION: How it feels personal despite being mass-sent.
  E.g., "References subscriber's city in opener, uses first name 3x, mentions 'your Tuesday reading'"

Only include style ideas for emails that are genuinely well-crafted and would
teach a solopreneur something useful about email marketing.
Skip for personal emails, transactional emails, plain text emails, etc.

═══════════════════════════════════════════════════════════════════════════════
NOTIFICATION / VERIFICATION / EPHEMERAL EMAILS
═══════════════════════════════════════════════════════════════════════════════

For emails that are just notifications, verification codes, OTPs, password
resets, login alerts, or other ephemeral/disposable emails:
- Keep the gist ultra-short: "Verification code: 482910" or "Login alert from GitHub"
- key_points: empty or just the code/alert itself
- links: only include if there's an action link (like "Verify email")
- content_type: "transactional"
- golden_nuggets: empty (nothing to save)
- email_style_ideas: empty (nothing to learn from)

These emails are "glance and delete" — treat them that way.

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE
═══════════════════════════════════════════════════════════════════════════════

Be confident for clear emails. Lower confidence (< 0.7) when:
- Email is very short or lacks context
- Content is ambiguous or unclear
- Links are hard to classify`;

/**
 * Builds the full system prompt with user context injected.
 * User interests help identify which newsletter topics are relevant.
 */
function buildSystemPrompt(context?: UserContext): string {
  const parts = [BASE_SYSTEM_PROMPT];

  if (context) {
    const contextParts: string[] = [];

    // Add user interests for relevance matching
    if (context.interests?.length) {
      contextParts.push(`USER INTERESTS: ${context.interests.join(', ')}`);
      contextParts.push(
        'For multi-topic newsletters, mark key points that match these interests with relevance notes.'
      );
    }

    // Add role context for better gist writing
    if (context.role) {
      contextParts.push(`USER ROLE: ${context.role}`);
    }

    // Add projects for context
    if (context.projects?.length) {
      contextParts.push(`USER PROJECTS: ${context.projects.join(', ')}`);
    }

    if (contextParts.length > 0) {
      parts.push('\n═══════════════════════════════════════════════════════════════════════════════');
      parts.push('USER CONTEXT (use for personalized relevance)');
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
 * All fields match the ContentDigestData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Gist - the conversational summary
      gist: {
        type: 'string',
        description:
          'One-two sentence conversational briefing. Write like telling a friend. Include specifics (names, numbers, dates). Example: "Figma shipped auto-layout 5.0 - text wrapping finally works, plus min/max widths. Rolling out this week."',
      },

      // Key points array
      key_points: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: {
              type: 'string',
              description:
                'A specific, scannable key point. Include details (names, dates, numbers). NOT vague summaries.',
            },
            relevance: {
              type: 'string',
              description:
                'Why this matters to the user (optional). E.g., "Matches your interest in AI"',
            },
          },
          required: ['point'],
        },
        minItems: 2,
        maxItems: 5,
        description:
          '2-5 specific key points. Each should be scannable in 2 seconds.',
      },

      // Links array
      links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL',
            },
            type: {
              type: 'string',
              enum: LINK_TYPES,
              description: 'Type of link: article, registration, document, video, product, tool, social, unsubscribe, other',
            },
            title: {
              type: 'string',
              description: 'What the link is. E.g., "Auto-layout 5.0 announcement"',
            },
            description: {
              type: 'string',
              description: 'Why someone might click. E.g., "Full tutorial with examples"',
            },
            is_main_content: {
              type: 'boolean',
              description: 'True if this link IS the point of the email',
            },
          },
          required: ['url', 'type', 'title', 'description', 'is_main_content'],
        },
        maxItems: 10,
        description:
          'Notable links from the email. Filter out tracking pixels and generic footers.',
      },

      // Content type classification
      content_type: {
        type: 'string',
        enum: CONTENT_TYPES,
        description:
          'Structure of the email: single_topic, multi_topic_digest, curated_links, personal_update, transactional',
      },

      // Topics highlighted (for newsletters)
      topics_highlighted: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For multi_topic_digest: which topics match user interests. E.g., ["AI", "TypeScript"]',
      },

      // Golden nuggets — deals, tips, things worth remembering (NEW Feb 2026)
      golden_nuggets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nugget: {
              type: 'string',
              description: 'The nugget itself — a deal, tip, quote, stat, recommendation, or notable detail. Be specific and include key details (amounts, dates, names, codes).',
            },
            type: {
              type: 'string',
              enum: ['deal', 'tip', 'quote', 'stat', 'recommendation', 'remember_this', 'sales_opportunity'],
              description: 'Type: deal (promo/discount), tip (advice), quote (memorable line), stat (data point), recommendation (product/book/tool), remember_this (context/facts to recall later), sales_opportunity (business lead/revenue opportunity)',
            },
          },
          required: ['nugget', 'type'],
        },
        maxItems: 7,
        description: 'Deals, tips, quotes, stats, recommendations, or notable details worth saving. Include relationship context, business opportunities, and things the user would want to remember later.',
      },

      // Email style ideas — notable email format/design ideas (NEW Feb 2026)
      email_style_ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            idea: {
              type: 'string',
              description: 'What is notable about this email\'s format, design, tone, or structure that a solopreneur could learn from.',
            },
            type: {
              type: 'string',
              enum: ['layout', 'subject_line', 'tone', 'cta', 'visual', 'storytelling', 'personalization'],
              description: 'Aspect: layout (structure), subject_line (headline), tone (voice/style), cta (call-to-action), visual (design), storytelling (narrative), personalization (custom feel)',
            },
            why_it_works: {
              type: 'string',
              description: 'Brief explanation of why this approach is effective',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'How notable/worth-saving this is (0.5+ means genuinely interesting)',
            },
          },
          required: ['idea', 'type', 'why_it_works', 'confidence'],
        },
        maxItems: 3,
        description: 'Email format/design ideas worth saving. Only for newsletters and well-crafted emails from brands or influencers the user might want to learn from. Skip for personal emails and plain transactional emails.',
      },

      // Confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in the extraction (0-1)',
      },
    },
    required: ['gist', 'key_points', 'links', 'content_type', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT DIGEST ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Content Digest Analyzer
 *
 * Extracts the substance of an email for quick scanning:
 * - Gist: 1-2 sentence conversational briefing
 * - Key Points: 2-5 specific, actionable bullet points
 * - Links: Notable URLs with type and context
 *
 * This analyzer runs on ALL emails (not conditional) to provide
 * consistent content intelligence across the inbox.
 *
 * @example
 * ```typescript
 * const digestAnalyzer = new ContentDigestAnalyzer();
 *
 * const result = await digestAnalyzer.analyze(email, userContext);
 *
 * if (result.success) {
 *   // Display gist in email list view
 *   console.log(result.data.gist);
 *
 *   // Show key points on hover or detail view
 *   result.data.keyPoints.forEach(kp => {
 *     console.log(`• ${kp.point}`);
 *     if (kp.relevance) console.log(`  (${kp.relevance})`);
 *   });
 *
 *   // Highlight main content links
 *   const mainLinks = result.data.links.filter(l => l.isMainContent);
 * }
 * ```
 */
export class ContentDigestAnalyzer extends BaseAnalyzer<ContentDigestData> {
  /**
   * Creates a new ContentDigestAnalyzer instance.
   *
   * Uses the contentDigest configuration from config/analyzers.ts.
   * The config controls:
   * - enabled: Whether this analyzer runs
   * - model: AI model to use (gpt-4.1-mini)
   * - temperature: Response randomness (0.3 for natural gist writing)
   * - maxTokens: Maximum response tokens (700 for detailed extraction)
   */
  constructor() {
    super('ContentDigest', analyzerConfig.contentDigest);
  }

  /**
   * User context for interest matching.
   * Stored here so getSystemPrompt can access it.
   */
  private currentContext?: UserContext;

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and extracts content digest.
   *
   * @param email - Email data to analyze
   * @param context - User context (interests for relevance matching)
   * @returns Content digest result with gist, key points, and links
   *
   * @example
   * ```typescript
   * const result = await digestAnalyzer.analyze({
   *   id: 'email-123',
   *   subject: 'Figma: Auto-layout 5.0 is here',
   *   senderEmail: 'updates@figma.com',
   *   senderName: 'Figma',
   *   date: '2026-01-20T10:00:00Z',
   *   bodyText: 'Today we're excited to announce...',
   * }, { interests: ['design', 'tools'] });
   *
   * // result.data:
   * // {
   * //   gist: "Figma shipped auto-layout 5.0 - text wrapping finally works...",
   * //   keyPoints: [
   * //     { point: "Text wrapping now works in auto-layout frames" },
   * //     { point: "New min/max width properties for responsive design" },
   * //     { point: "Rolling out Monday Jan 27 to all plans" }
   * //   ],
   * //   links: [
   * //     { url: "https://figma.com/blog/...", type: "article", ... }
   * //   ],
   * //   contentType: "single_topic",
   * //   confidence: 0.92
   * // }
   * ```
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<ContentDigestResult> {
    // Store context for use in getSystemPrompt
    this.currentContext = context;

    // Log with context info for debugging
    this.logger.debug('Extracting content digest', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      hasUserInterests: (context?.interests?.length ?? 0) > 0,
      userInterests: context?.interests?.slice(0, 3),
    });

    // Use the base class executeAnalysis which handles all common logic
    const result = await this.executeAnalysis(email);

    // Post-process to normalize the response format
    // (OpenAI returns snake_case, we use camelCase)
    if (result.success) {
      result.data = this.normalizeResponse(result.data);

      // Log successful extraction details for troubleshooting
      this.logger.info('Content digest extracted', {
        emailId: email.id,
        gistLength: result.data.gist?.length ?? 0,
        keyPointsCount: result.data.keyPoints?.length ?? 0,
        linksCount: result.data.links?.length ?? 0,
        contentType: result.data.contentType,
        confidence: result.data.confidence,
        topicsHighlighted: result.data.topicsHighlighted,
        goldenNuggetsCount: result.data.goldenNuggets?.length ?? 0,
        goldenNuggetTypes: result.data.goldenNuggets?.map(n => n.type) ?? [],
        emailStyleIdeasCount: result.data.emailStyleIdeas?.length ?? 0,
        emailStyleIdeaTypes: result.data.emailStyleIdeas?.map(s => s.type) ?? [],
      });
    } else {
      this.logger.error('Content digest extraction failed', {
        emailId: email.id,
        subject: email.subject?.substring(0, 60),
        error: result.error,
      });
    }

    // Clear context after use
    this.currentContext = undefined;

    return result;
  }

  /**
   * Returns the OpenAI function schema for content digest extraction.
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for content digest extraction.
   *
   * The prompt instructs the AI to:
   * - Write conversational, specific gists (not vague summaries)
   * - Extract key points with real details (names, numbers, dates)
   * - Filter links for value (exclude tracking, generic footers)
   * - Match newsletter topics to user interests
   *
   * @param context - User context (interests for relevance matching)
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
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method converts between them.
   *
   * @param rawData - Raw data from OpenAI (snake_case)
   * @returns Normalized data (camelCase)
   */
  private normalizeResponse(rawData: Record<string, unknown>): ContentDigestData {
    // Normalize key_points to keyPoints
    const rawKeyPoints = rawData.key_points as Array<{ point: string; relevance?: string }> | undefined;
    const keyPoints: KeyPoint[] = (rawKeyPoints || []).map((kp) => ({
      point: kp.point || '',
      relevance: kp.relevance,
    }));

    // Normalize links with is_main_content -> isMainContent
    const rawLinks = rawData.links as Array<{
      url: string;
      type: string;
      title: string;
      description: string;
      is_main_content: boolean;
    }> | undefined;

    const links: ExtractedLink[] = (rawLinks || []).map((link) => ({
      url: link.url || '',
      type: (link.type as LinkType) || 'other',
      title: link.title || '',
      description: link.description || '',
      isMainContent: Boolean(link.is_main_content),
    }));

    // Validate content_type
    const rawContentType = rawData.content_type as string;
    const contentType: ContentType = CONTENT_TYPES.includes(rawContentType as ContentType)
      ? (rawContentType as ContentType)
      : 'single_topic';

    // Normalize golden_nuggets (NEW Feb 2026, ENHANCED Feb 2026 with remember_this + sales_opportunity)
    const VALID_NUGGET_TYPES = new Set(['deal', 'tip', 'quote', 'stat', 'recommendation', 'remember_this', 'sales_opportunity']);
    const rawNuggets = rawData.golden_nuggets as Array<{ nugget: string; type: string }> | undefined;
    const filteredOutNuggets = (rawNuggets || []).filter(n => !n.nugget || !VALID_NUGGET_TYPES.has(n.type));
    const goldenNuggets: GoldenNugget[] = (rawNuggets || [])
      .filter(n => n.nugget && VALID_NUGGET_TYPES.has(n.type))
      .map(n => ({
        nugget: n.nugget,
        type: n.type as GoldenNuggetType,
      }));

    // Log if any nuggets were filtered out due to invalid type
    if (filteredOutNuggets.length > 0) {
      this.logger.warn('Filtered out invalid golden nuggets', {
        filteredCount: filteredOutNuggets.length,
        invalidTypes: filteredOutNuggets.map(n => n.type),
        keptCount: goldenNuggets.length,
      });
    }

    // Normalize email_style_ideas (NEW Feb 2026)
    const VALID_STYLE_TYPES = new Set(['layout', 'subject_line', 'tone', 'cta', 'visual', 'storytelling', 'personalization']);
    const rawStyleIdeas = rawData.email_style_ideas as Array<{
      idea: string; type: string; why_it_works: string; confidence: number;
    }> | undefined;
    const filteredOutStyles = (rawStyleIdeas || []).filter(s => !s.idea || !VALID_STYLE_TYPES.has(s.type));
    const emailStyleIdeas: EmailStyleIdea[] = (rawStyleIdeas || [])
      .filter(s => s.idea && VALID_STYLE_TYPES.has(s.type))
      .map(s => ({
        idea: s.idea,
        type: s.type as EmailStyleIdeaType,
        whyItWorks: s.why_it_works || '',
        confidence: Math.min(1, Math.max(0, s.confidence || 0.5)),
      }));

    // Log if any style ideas were filtered out
    if (filteredOutStyles.length > 0) {
      this.logger.warn('Filtered out invalid email style ideas', {
        filteredCount: filteredOutStyles.length,
        invalidTypes: filteredOutStyles.map(s => s.type),
        keptCount: emailStyleIdeas.length,
      });
    }

    return {
      gist: (rawData.gist as string) || 'Unable to extract gist',
      keyPoints,
      links,
      contentType,
      topicsHighlighted: rawData.topics_highlighted as string[] | undefined,
      ...(goldenNuggets.length > 0 ? { goldenNuggets } : {}),
      ...(emailStyleIdeas.length > 0 ? { emailStyleIdeas } : {}),
      confidence: (rawData.confidence as number) || 0.5,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default content digest analyzer instance for convenience.
 *
 * Use this for simple cases where you don't need custom configuration.
 *
 * @example
 * ```typescript
 * import { contentDigestAnalyzer } from '@/services/analyzers/content-digest';
 *
 * const result = await contentDigestAnalyzer.analyze(email, userContext);
 * console.log(result.data.gist);
 * ```
 */
export const contentDigestAnalyzer = new ContentDigestAnalyzer();
