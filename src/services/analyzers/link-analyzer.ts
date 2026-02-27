/**
 * Link Analyzer
 *
 * Enriches raw links extracted by ContentDigest with AI-powered priority
 * scoring, topic tagging, save-worthiness assessment, and expiration detection.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Deep URL Intelligence from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ContentDigest (Phase 1) already extracts raw links with basic metadata:
 *   { url, type, title, description, isMainContent }
 *
 * This Phase 2 analyzer ENRICHES those links by cross-referencing them with
 * the user's context (role, interests, projects, location) to answer:
 *   - "Which of these links should I actually click?" (priority)
 *   - "What are these links about?" (topics)
 *   - "Should I bookmark this for later?" (saveWorthy)
 *   - "Is this link time-sensitive?" (expires)
 *
 * PHILOSOPHY:
 * - Priority is USER-CENTRIC — a Python tutorial is must_read for a Python dev
 *   but reference for a product manager
 * - Topics enable cross-email discovery: "show me all AI links this week"
 * - Save-worthy separates "read now" from "save for later" links
 * - Expiration catches deals, registrations, and limited-time offers
 *
 * EXECUTION:
 * - Runs in Phase 2 of EmailProcessor (after categorizer + ContentDigest)
 * - ONLY runs when categorizer labels include 'has_link'
 * - SKIPPED when signal_strength = 'noise'
 * - Receives raw links from ContentDigest as additional context
 * - Uses low temperature (0.2) for consistent classification
 *
 * LINK PRIORITIES:
 * - must_read:      Directly relevant to user's active interests/projects
 * - worth_reading:  Tangentially interesting, broadens perspective
 * - reference:      Useful documentation/tools to have on hand
 * - skip:           Tracking pixels, generic footers, unsubscribe links
 *
 * COST:
 * - ~$0.0002 per email at GPT-4.1-mini
 * - ~60 emails/day with links × $0.0002 = ~$0.012/day = ~$0.36/month
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { LinkAnalyzer } from '@/services/analyzers/link-analyzer';
 *
 * const analyzer = new LinkAnalyzer();
 *
 * // Pass raw links from ContentDigest via email body context
 * const result = await analyzer.analyze(emailInput, userContext);
 *
 * if (result.success && result.data.hasLinks) {
 *   const mustReads = result.data.links.filter(l => l.priority === 'must_read');
 *   console.log(`${mustReads.length} must-read links found`);
 *   result.data.links.forEach(link => {
 *     console.log(`[${link.priority}] ${link.title} — ${link.topics.join(', ')}`);
 *   });
 * }
 * ```
 *
 * @module services/analyzers/link-analyzer
 * @version 1.0.0
 * @since February 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  LinkAnalysisData,
  LinkAnalysisResult,
  AnalyzedLink,
  LinkPriority,
  LinkType,
  EmailInput,
  UserContext,
  ExtractedLink,
} from './types';
import { LINK_TYPES, LINK_PRIORITIES } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 */
const FUNCTION_NAME = 'analyze_links';

/**
 * Description of what the function does.
 */
const FUNCTION_DESCRIPTION =
  'Analyzes and enriches extracted links with priority, topics, save-worthiness, and expiration detection based on user context';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for link analysis.
 *
 * This is a DYNAMIC prompt — it incorporates the user's context (role,
 * interests, projects) to personalize link priority assessment.
 * Without user context, priorities default to generic relevance.
 *
 * @param context - User context for personalization
 * @param rawLinks - Raw links from ContentDigest to include in the prompt
 * @returns Complete system prompt string
 */
function buildSystemPrompt(context?: UserContext, rawLinks?: ExtractedLink[]): string {
  // Build the user context section
  const userInfoParts: string[] = [];

  if (context?.role) {
    userInfoParts.push(`Role: ${context.role}`);
  }
  if (context?.company) {
    userInfoParts.push(`Company: ${context.company}`);
  }
  if (context?.interests && context.interests.length > 0) {
    userInfoParts.push(`Interests: ${context.interests.join(', ')}`);
  }
  if (context?.projects && context.projects.length > 0) {
    userInfoParts.push(`Active projects: ${context.projects.join(', ')}`);
  }
  if (context?.priorities && context.priorities.length > 0) {
    userInfoParts.push(`Priorities: ${context.priorities.join(', ')}`);
  }

  const userContextBlock = userInfoParts.length > 0
    ? `═══════════════════════════════════════════════════════════════════════════════
WHAT I KNOW ABOUT THE USER
═══════════════════════════════════════════════════════════════════════════════

${userInfoParts.join('\n')}
`
    : `═══════════════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════════════

(No user context available — prioritize based on general relevance)
`;

  // Build the raw links section if available
  const rawLinksBlock = rawLinks && rawLinks.length > 0
    ? `═══════════════════════════════════════════════════════════════════════════════
LINKS ALREADY EXTRACTED (from ContentDigest — Phase 1)
═══════════════════════════════════════════════════════════════════════════════

${rawLinks.map((link, i) => `${i + 1}. [${link.type}] ${link.title || 'Untitled'} — ${link.url}
   Description: ${link.description || 'None'}
   Main content: ${link.isMainContent ? 'Yes' : 'No'}`).join('\n\n')}
`
    : '';

  return `You're the user's link curator — the person who reads through all the URLs in their emails and tells them which ones are actually worth their time. You know their interests, their projects, and what they care about.

Analyze every link in this email and enrich each one with:
1. PRIORITY — how important is this to THIS user specifically?
2. TOPICS — what subjects does this link cover?
3. SAVE WORTHY — should they bookmark this for later?
4. EXPIRES — is this link time-sensitive (deals, registrations, limited offers)?

${userContextBlock}
${rawLinksBlock}
═══════════════════════════════════════════════════════════════════════════════
PRIORITY LEVELS
═══════════════════════════════════════════════════════════════════════════════

- must_read:      Directly relevant to user's active interests, projects, or role.
                  Example: An article about a technology they actively use.
- worth_reading:  Interesting but not directly related to current work.
                  Example: A well-written industry analysis in their field.
- reference:      Useful to have — documentation, tools, resources.
                  Example: A link to API docs for a service they use.
- skip:           Low value — tracking pixels, generic footers, unsubscribe,
                  social media follow buttons, privacy policies.

═══════════════════════════════════════════════════════════════════════════════
SAVE-WORTHINESS
═══════════════════════════════════════════════════════════════════════════════

A link is save-worthy if the user would want to come back to it later:
- Evergreen articles, tutorials, documentation → save-worthy
- Time-limited deals, news that will be stale tomorrow → NOT save-worthy
- Tools and products they might want to try → save-worthy
- Tracking links, generic footers → NOT save-worthy

═══════════════════════════════════════════════════════════════════════════════
EXPIRATION DETECTION
═══════════════════════════════════════════════════════════════════════════════

Look for time-limited content and extract the expiration date if possible:
- Registration deadlines: "Register by March 15"
- Sale end dates: "Sale ends this Friday"
- Limited-time offers: "Available until Feb 28"
- Early bird pricing: "Early bird ends March 1"

If no explicit date, use null. Do NOT guess or fabricate dates.

═══════════════════════════════════════════════════════════════════════════════
TOPIC TAGGING
═══════════════════════════════════════════════════════════════════════════════

Apply 1-3 short topic tags per link for filtering and discovery:
- Use specific tags: "React", "ML-ops", "tax-planning" (NOT "technology" or "finance")
- Match user's known interests when applicable
- Tags should be lowercase, hyphenated (e.g., "prompt-engineering", "home-improvement")

═══════════════════════════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════════════════════════

Write a 1-sentence summary of the link landscape. Be specific:
GOOD: "3 AI articles (2 must-read), 1 registration link expiring Friday, 2 reference docs"
BAD: "Several links found in this email" (too vague)

═══════════════════════════════════════════════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════════════════════════════════════════════

1. FILTER OUT noise links: tracking pixels, email client images, privacy policies,
   generic footer links (Twitter/LinkedIn/Facebook follow buttons) should be
   classified as skip with save_worthy=false.
2. Preserve the original URL, type, title, and description from ContentDigest
   if they were already extracted. Only add new fields.
3. If no meaningful links exist (only tracking/unsubscribe), set has_links=false.
4. For the email body text, focus on the CONTENT around links to understand context.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured link analysis output.
 *
 * This schema enforces the AnalyzedLink structure for each link.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      has_links: {
        type: 'boolean',
        description: 'Whether meaningful links were found (false if only tracking/unsubscribe links)',
      },

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
              enum: LINK_TYPES as unknown as string[],
              description: 'Type of content: article, registration, document, video, product, tool, social, unsubscribe, other',
            },
            title: {
              type: 'string',
              description: 'Title or label for the link',
            },
            description: {
              type: 'string',
              description: 'Brief description of why this link matters',
            },
            is_main_content: {
              type: 'boolean',
              description: 'Whether this is the main content link of the email',
            },
            priority: {
              type: 'string',
              enum: LINK_PRIORITIES as unknown as string[],
              description: 'How important this link is to the user: must_read, worth_reading, reference, skip',
            },
            topics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topic tags for filtering (1-3 short tags, lowercase, hyphenated)',
            },
            save_worthy: {
              type: 'boolean',
              description: 'Whether this link is worth bookmarking for later reference',
            },
            expires: {
              type: 'string',
              description: 'Expiration date if time-limited content (YYYY-MM-DD), or null',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence in the enrichment quality (0-1)',
            },
          },
          required: ['url', 'type', 'title', 'description', 'is_main_content', 'priority', 'topics', 'save_worthy', 'confidence'],
        },
        description: 'Array of analyzed links with enriched metadata',
      },

      summary: {
        type: 'string',
        description: 'One-sentence overview of the links landscape (e.g., "3 AI articles, 1 registration link, 2 reference docs")',
      },

      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in the link analysis quality (0-1)',
      },
    },
    required: ['has_links', 'links', 'summary', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LINK ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Link Analyzer
 *
 * Enriches raw links from ContentDigest with AI-powered priority scoring,
 * topic tagging, save-worthiness, and expiration detection.
 *
 * PHASE 2 EXECUTION:
 * This analyzer runs AFTER ContentDigest extracts raw links AND the
 * categorizer determines the email has links (has_link label).
 * Emails classified as 'noise' are skipped to save tokens.
 *
 * @example
 * ```typescript
 * const analyzer = new LinkAnalyzer();
 *
 * const result = await analyzer.analyze(emailInput, userContext);
 *
 * if (result.success && result.data.hasLinks) {
 *   const mustReads = result.data.links.filter(l => l.priority === 'must_read');
 *   console.log(`Found ${mustReads.length} must-read links`);
 * }
 * ```
 */
export class LinkAnalyzer extends BaseAnalyzer<LinkAnalysisData> {
  /**
   * Raw links from ContentDigest — set before calling analyze().
   * These are passed to the system prompt so the AI can enrich existing
   * link data rather than re-extracting from scratch.
   */
  private rawLinks: ExtractedLink[] = [];

  /**
   * Creates a new LinkAnalyzer instance.
   *
   * Uses the linkAnalyzer configuration from config/analyzers.ts:
   * - enabled: true
   * - model: gpt-4.1-mini
   * - temperature: 0.2 (low for consistent classification)
   * - maxTokens: 800 (multiple links with priority + topics)
   */
  constructor() {
    super('LinkAnalyzer', analyzerConfig.linkAnalyzer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sets the raw links from ContentDigest for enrichment.
   *
   * Call this BEFORE analyze() to pass in the already-extracted links.
   * The analyzer will enrich these rather than re-extracting from scratch.
   *
   * @param links - Raw links from ContentDigest
   */
  setRawLinks(links: ExtractedLink[]): void {
    this.rawLinks = links;
    this.logger.debug('Raw links set for enrichment', {
      linkCount: links.length,
      types: links.map(l => l.type),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes email links and enriches them with priority, topics, and metadata.
   *
   * This method:
   * 1. Validates raw links are available from ContentDigest
   * 2. Logs user context quality for debugging
   * 3. Calls the AI with raw links + user context in the system prompt
   * 4. Normalizes the response (snake_case → camelCase)
   * 5. Sorts results by priority (must_read first)
   *
   * @param email - Email data containing the links
   * @param context - User context (role, interests, projects) for personalized priority
   * @returns Link analysis result with enriched link metadata
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<LinkAnalysisResult> {
    // Log analysis start with context summary
    this.logger.info('Analyzing email links', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      rawLinkCount: this.rawLinks.length,
      hasUserContext: !!(context?.role || context?.interests?.length),
    });

    // If no raw links available, return early with empty result
    if (this.rawLinks.length === 0) {
      this.logger.debug('No raw links to analyze — returning empty result', {
        emailId: email.id,
      });
      return {
        success: true,
        data: {
          hasLinks: false,
          links: [],
          summary: 'No links found in this email.',
          confidence: 1.0,
        },
        confidence: 1.0,
        tokensUsed: 0,
        processingTimeMs: 0,
      };
    }

    // Execute the AI analysis via base class
    const result = await this.executeAnalysis(email, context);

    // Post-process: normalize response format and validate
    if (result.success) {
      result.data = this.normalizeResponse(result.data);

      // Sort links by priority: must_read > worth_reading > reference > skip
      result.data.links.sort((a, b) => {
        const priorityOrder: Record<LinkPriority, number> = {
          must_read: 0,
          worth_reading: 1,
          reference: 2,
          skip: 3,
        };
        return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      });

      // Log analysis summary
      const priorityCounts = result.data.links.reduce(
        (acc, link) => {
          acc[link.priority] = (acc[link.priority] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      this.logger.info('Link analysis complete', {
        emailId: email.id,
        totalLinks: result.data.links.length,
        hasLinks: result.data.hasLinks,
        priorityCounts,
        saveWorthyCount: result.data.links.filter(l => l.saveWorthy).length,
        expiringCount: result.data.links.filter(l => l.expires).length,
        overallConfidence: result.data.confidence,
      });
    } else {
      this.logger.warn('Link analysis failed — returning empty result', {
        emailId: email.id,
        error: result.error,
      });
    }

    // Clear raw links after analysis to prevent stale data
    this.rawLinks = [];

    return result;
  }

  /**
   * Returns the OpenAI function schema for link analysis.
   *
   * The schema enforces:
   * - Each link has: url, type, title, description, priority, topics, save_worthy, confidence
   * - Priority must be one of: must_read, worth_reading, reference, skip
   * - Type must be one of the LINK_TYPES
   * - Confidence is 0-1 float
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for link analysis.
   *
   * This is a DYNAMIC prompt — it changes based on:
   * 1. User context (role, interests, projects) for priority personalization
   * 2. Raw links from ContentDigest for enrichment context
   *
   * @param context - User context for personalization
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    return buildSystemPrompt(context, this.rawLinks);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   *
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method:
   * 1. Converts snake_case → camelCase
   * 2. Validates priority values against LINK_PRIORITIES
   * 3. Validates type values against LINK_TYPES
   * 4. Clamps confidence to 0-1 range
   * 5. Ensures topics is always an array
   *
   * @param rawData - Raw data from OpenAI (may be snake_case)
   * @returns Normalized LinkAnalysisData
   */
  private normalizeResponse(rawData: Record<string, unknown>): LinkAnalysisData {
    const hasLinks = Boolean(rawData.has_links ?? rawData.hasLinks);

    // Normalize links array
    const rawLinks = (rawData.links as Array<{
      url: string;
      type: string;
      title: string;
      description: string;
      is_main_content?: boolean;
      isMainContent?: boolean;
      priority: string;
      topics: string[];
      save_worthy?: boolean;
      saveWorthy?: boolean;
      expires?: string;
      confidence: number;
    }>) || [];

    // Validate and normalize each link
    const links: AnalyzedLink[] = rawLinks
      .filter(link => link && link.url && link.title) // Filter out malformed links
      .map(link => ({
        url: link.url,
        type: this.validateLinkType(link.type),
        title: link.title,
        description: link.description || '',
        isMainContent: Boolean(link.is_main_content ?? link.isMainContent),
        priority: this.validatePriority(link.priority),
        topics: Array.isArray(link.topics) ? link.topics.slice(0, 3) : [],
        saveWorthy: Boolean(link.save_worthy ?? link.saveWorthy),
        expires: link.expires || undefined,
        confidence: typeof link.confidence === 'number'
          ? Math.max(0, Math.min(1, link.confidence))
          : 0.5,
      }));

    // Log normalization stats
    if (rawLinks.length !== links.length) {
      this.logger.warn('Some links were filtered during normalization', {
        rawCount: rawLinks.length,
        normalizedCount: links.length,
        droppedCount: rawLinks.length - links.length,
      });
    }

    return {
      hasLinks: hasLinks && links.length > 0,
      links,
      summary: typeof rawData.summary === 'string'
        ? rawData.summary
        : `${links.length} link${links.length === 1 ? '' : 's'} found.`,
      confidence: typeof rawData.confidence === 'number'
        ? (rawData.confidence as number)
        : links.length > 0
          ? links.reduce((sum, l) => sum + l.confidence, 0) / links.length
          : 0,
    };
  }

  /**
   * Validates a priority string against LINK_PRIORITIES.
   *
   * If the AI returns an unexpected priority, defaults to 'reference'
   * (the most neutral priority) and logs a warning.
   *
   * @param priority - Raw priority string from AI
   * @returns Validated LinkPriority
   */
  private validatePriority(priority: string): LinkPriority {
    const validPriorities = LINK_PRIORITIES as readonly string[];
    if (validPriorities.includes(priority)) {
      return priority as LinkPriority;
    }

    this.logger.warn('Unexpected link priority from AI — defaulting to reference', {
      receivedPriority: priority,
      validPriorities: validPriorities.join(', '),
    });

    return 'reference';
  }

  /**
   * Validates a link type string against LINK_TYPES.
   *
   * If the AI returns an unexpected type, defaults to 'other'
   * and logs a warning.
   *
   * @param type - Raw type string from AI
   * @returns Validated LinkType
   */
  private validateLinkType(type: string): LinkType {
    const validTypes = LINK_TYPES as readonly string[];
    if (validTypes.includes(type)) {
      return type as LinkType;
    }

    this.logger.warn('Unexpected link type from AI — defaulting to other', {
      receivedType: type,
      validTypes: validTypes.join(', '),
    });

    return 'other';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default link analyzer instance for convenience.
 *
 * Use this for standard link analysis. The singleton shares
 * the same configuration and logger instance.
 *
 * @example
 * ```typescript
 * import { linkAnalyzer } from '@/services/analyzers/link-analyzer';
 *
 * linkAnalyzer.setRawLinks(contentDigestLinks);
 * const result = await linkAnalyzer.analyze(emailInput, userContext);
 *
 * if (result.data.hasLinks) {
 *   const mustReads = result.data.links.filter(l => l.priority === 'must_read');
 *   console.log(`${mustReads.length} must-read links found`);
 * }
 * ```
 */
export const linkAnalyzer = new LinkAnalyzer();
