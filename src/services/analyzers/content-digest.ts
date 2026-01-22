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
const BASE_SYSTEM_PROMPT = `You are a helpful assistant briefing a busy professional on their emails. Your job is to read the email and tell them:
1. What is this email actually ABOUT? (the gist)
2. What are the KEY POINTS they need to know? (specific details)
3. What LINKS are worth knowing about? (filtered for value)

═══════════════════════════════════════════════════════════════════════════════
GIST (1-2 sentences, conversational)
═══════════════════════════════════════════════════════════════════════════════

Write as if you're verbally briefing someone. Be specific and natural.

GOOD EXAMPLES:
- "Figma shipped auto-layout 5.0 - the big thing is text wrapping finally works properly, plus you can set min/max widths on frames. Rolling out to everyone this week."
- "Today's Morning Brew covers the Fed rate decision (holding steady), Apple's new AI features coming in iOS 18.4, and a deep dive on why Costco's $1.50 hot dog is actually genius."
- "Sarah from Acme is checking in about the Q1 proposal - she needs it reviewed by Friday and wants to know your availability for a call next week."
- "Your AWS bill for January: $142.67, up 12% from last month. Payment processed automatically."

BAD EXAMPLES (too vague):
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

    return {
      gist: (rawData.gist as string) || 'Unable to extract gist',
      keyPoints,
      links,
      contentType,
      topicsHighlighted: rawData.topics_highlighted as string[] | undefined,
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
