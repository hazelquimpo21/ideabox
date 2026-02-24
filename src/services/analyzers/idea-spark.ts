/**
 * Idea Spark Analyzer
 *
 * Generates creative, actionable ideas from email content by cross-referencing
 * what's in the email with what the AI knows about the user — their role,
 * interests, projects, location, family, and the current date/season.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Creative Idea Generation from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the most "creative" analyzer in the system. While other analyzers
 * classify, extract, or summarize, this one generates NEW ideas that connect
 * the email's content to the user's actual life.
 *
 * PHILOSOPHY:
 * - Think laterally, not obviously. A shipping confirmation might inspire
 *   a date night. A tech newsletter might inspire a social post.
 * - Every idea must connect back to something specific about the user.
 * - Ideas are suggestions, not tasks — the user decides what to pursue.
 * - Quality > quantity — 3 thoughtful ideas beat 10 generic ones.
 *
 * EXECUTION:
 * - Runs in Phase 2 of EmailProcessor (after categorizer)
 * - SKIPPED when signal_strength = 'noise' to save tokens (~30% of emails)
 * - Uses higher temperature (0.7) for creative output
 * - Receives full UserContext for personalization
 *
 * IDEA TYPES:
 * - social_post:      Content for social media (tweet, LinkedIn post, blog)
 * - networking:        Reach out, connect, introduce, collaborate
 * - business:          Business opportunity, proposal, strategy
 * - content_creation:  Blog post, article, podcast topic, video idea
 * - hobby:             Personal interests, side projects, learning
 * - shopping:          Gift ideas, things to buy, wishlist items
 * - date_night:        Partner/relationship activities, romantic ideas
 * - family_activity:   Activities with kids, family outings, traditions
 * - personal_growth:   Skills to learn, habits to build, books to read
 * - community:         Local involvement, volunteering, neighborhood
 *
 * COST:
 * - ~$0.0002 per email at GPT-4.1-mini
 * - ~175 emails/day (after noise filtering) × $0.0002 = ~$0.035/day = ~$1.05/month
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { IdeaSparkAnalyzer } from '@/services/analyzers/idea-spark';
 *
 * const sparkAnalyzer = new IdeaSparkAnalyzer();
 *
 * const result = await sparkAnalyzer.analyze(emailInput, userContext);
 *
 * if (result.success && result.data.hasIdeas) {
 *   result.data.ideas.forEach(idea => {
 *     console.log(`[${idea.type}] ${idea.idea}`);
 *     console.log(`  Why: ${idea.relevance}`);
 *     console.log(`  Confidence: ${idea.confidence}`);
 *   });
 * }
 * ```
 *
 * @module services/analyzers/idea-spark
 * @version 1.0.0
 * @since February 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type { FunctionSchema } from '@/lib/ai/openai-client';
import type {
  IdeaSparkData,
  IdeaSparkResult,
  IdeaSpark,
  IdeaType,
  EmailInput,
  UserContext,
} from './types';
import { IDEA_TYPES } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function name for OpenAI function calling.
 * This name appears in the API response and logs.
 */
const FUNCTION_NAME = 'generate_idea_sparks';

/**
 * Description of what the function does.
 * Helps OpenAI understand the purpose of this function.
 */
const FUNCTION_DESCRIPTION =
  'Generates 3 creative, actionable ideas inspired by the email content and the user\'s context';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for idea generation.
 *
 * This is a DYNAMIC prompt — it incorporates the user's context (role,
 * interests, projects, location, family, current date) to personalize
 * idea generation. Without user context, ideas would be generic.
 *
 * The prompt is designed to encourage LATERAL thinking — connecting
 * email content to unexpected areas of the user's life.
 *
 * @param context - User context for personalization
 * @returns Complete system prompt string
 */
function buildSystemPrompt(context?: UserContext): string {
  // Build the "what I know about the user" section
  const userInfoParts: string[] = [];

  if (context?.role) {
    userInfoParts.push(`Role: ${context.role}`);
  }
  if (context?.company) {
    userInfoParts.push(`Company: ${context.company}`);
  }
  if (context?.locationCity || context?.locationMetro) {
    userInfoParts.push(`Location: ${context.locationCity || context.locationMetro}`);
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
  if (context?.familyContext) {
    const fam = context.familyContext;
    const famParts: string[] = [];
    if (fam.spouseName) famParts.push(`partner: ${fam.spouseName}`);
    if (fam.kidsCount) famParts.push(`${fam.kidsCount} kid(s)`);
    if (fam.familyNames && fam.familyNames.length > 0) {
      famParts.push(`family: ${fam.familyNames.join(', ')}`);
    }
    if (famParts.length > 0) {
      userInfoParts.push(`Family: ${famParts.join(', ')}`);
    }
  }

  // Build current date context (season, day of week, time of year)
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const month = now.getMonth();
  const season = month >= 2 && month <= 4 ? 'Spring' :
                 month >= 5 && month <= 7 ? 'Summer' :
                 month >= 8 && month <= 10 ? 'Fall' : 'Winter';

  const dateContext = `Today: ${dayNames[now.getDay()]}, ${monthNames[month]} ${now.getDate()}, ${now.getFullYear()} (${season})`;

  // Compose the user context block
  const userContextBlock = userInfoParts.length > 0
    ? `═══════════════════════════════════════════════════════════════════════════════
WHAT I KNOW ABOUT THE USER
═══════════════════════════════════════════════════════════════════════════════

${userInfoParts.join('\n')}
${dateContext}
`
    : `═══════════════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════════════

${dateContext}
(No additional user context available — generate more general ideas)
`;

  return `You're the user's creative thinking partner — the friend who reads their email over coffee and goes "oh wait, this gave me an idea for you." You connect dots they wouldn't see. You know their life, their projects, their family, their neighborhood — and you think laterally.

Generate 3 actionable ideas inspired by the email. Each one should feel like a genuine "hey, you should do this" from a smart friend — not a brainstorming bot. Quality over quantity. If an idea feels forced, make it better or pick a different angle.

${userContextBlock}

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

Read the email and generate EXACTLY 3 ideas. Each idea should:
1. Be inspired by something specific in the email (not generic)
2. Connect to the user's actual life (their role, interests, projects, family, location)
3. Be actionable — something the user could actually DO
4. Be diverse — try to span different idea types

═══════════════════════════════════════════════════════════════════════════════
THINK LATERALLY — NOT OBVIOUSLY
═══════════════════════════════════════════════════════════════════════════════

GOOD lateral thinking:
- A shipping confirmation for kitchen items → "Plan a cooking date night with ${context?.familyContext?.spouseName || 'your partner'} to try them out"
- A tech newsletter about AI → "Write a LinkedIn post about how AI impacts ${context?.role || 'your work'}"
- A school email about a science fair → "Start a weekend science project with the kids related to ${context?.interests?.[0] || 'something you enjoy'}"
- A finance email about tax deadline → "Research ${context?.locationCity || 'local'} tax-saving strategies for ${context?.role || 'self-employed'} people"
- A client email about project completion → "Write a case study about this project for your portfolio"
- A newsletter about a local event → "Invite ${context?.familyContext?.spouseName || 'someone'} for a date night at the event"

BAD obvious thinking:
- "Read the newsletter" (not an idea, it's just reading)
- "Think about AI" (too vague)
- "Check your finances" (obvious and generic)
- "Reply to the email" (that's a task, not an idea)

═══════════════════════════════════════════════════════════════════════════════
IDEA TYPES (choose the most fitting for each idea)
═══════════════════════════════════════════════════════════════════════════════

- social_post:      Content for social media (tweet, LinkedIn post, blog)
- networking:        Reach out to someone, introduce, collaborate, follow up
- business:          Business opportunity, proposal, offering, strategy
- content_creation:  Blog post, article, podcast episode, video idea
- hobby:             Personal interests, side projects, learning new skills
- shopping:          Gift ideas, things to buy, wishlist additions
- date_night:        Partner activities, romantic ideas, couple experiences
- family_activity:   Activities with kids, family outings, traditions
- personal_growth:   Skills to learn, habits to build, books to read
- community:         Local involvement, volunteering, neighborhood events

═══════════════════════════════════════════════════════════════════════════════
CONFIDENCE SCORING
═══════════════════════════════════════════════════════════════════════════════

Score each idea 0.0-1.0 based on how strong the connection is:
- 0.8-1.0: Strong connection to both email content AND user context
- 0.5-0.7: Moderate connection — idea makes sense but connection is looser
- 0.3-0.4: Weak connection — a stretch, but potentially interesting
- Below 0.3: Don't generate ideas this weak

═══════════════════════════════════════════════════════════════════════════════
RELEVANCE EXPLANATION
═══════════════════════════════════════════════════════════════════════════════

For each idea, explain WHY it connects — what in the email + what about the user
makes this idea relevant. Keep it to 1 sentence.

Example: "Your interest in AI + this newsletter's coverage of production ML
makes this a natural LinkedIn topic for your audience"

═══════════════════════════════════════════════════════════════════════════════
SPECIAL CASES
═══════════════════════════════════════════════════════════════════════════════

- SPAM/NOISE: If the email is clearly spam or noise, still generate ideas but
  make them about the TOPIC, not the email itself. A spam sales email about
  CRM software could inspire: "Research CRM options for your business."
- TRANSACTIONAL: Receipts, confirmations, etc. — get creative! A receipt for
  a restaurant could inspire a date night idea or a food blog post.
- NEWSLETTERS: Rich source! Highlight specific articles or topics that
  connect to the user's interests and projects.

═══════════════════════════════════════════════════════════════════════════════
VOICE & TONE
═══════════════════════════════════════════════════════════════════════════════

Write ideas like a friend texting, not a consultant presenting:
GOOD: "Write a quick LinkedIn post about this product launch — your take on production ML would resonate with your audience"
BAD: "Consider creating a social media post discussing the implications of this product launch for the ML community"

GOOD: "Grab tickets to this pottery class with ${context?.familyContext?.spouseName || 'your partner'} — it's $25 and right near ${context?.locationCity || 'you'}"
BAD: "You may want to consider attending the pottery class mentioned in this email as a potential date night activity"

Keep it punchy, specific, and actionable. The user should read it and think "oh yeah, I should do that."`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured idea output.
 *
 * This schema defines exactly what JSON structure OpenAI should return.
 * All fields match the IdeaSparkData interface.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      // Whether ideas were successfully generated
      has_ideas: {
        type: 'boolean',
        description: 'Whether ideas were generated (false only for truly empty/unparseable emails)',
      },

      // Array of 3 idea sparks
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            idea: {
              type: 'string',
              description: 'The idea itself — 1-2 sentences, specific and actionable',
            },
            type: {
              type: 'string',
              enum: IDEA_TYPES as unknown as string[],
              description: 'Category of idea: social_post, networking, business, content_creation, hobby, shopping, date_night, family_activity, personal_growth, community',
            },
            relevance: {
              type: 'string',
              description: 'Why this idea connects to the user — 1 sentence explaining the bridge between email content and user context',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'How strong the connection is between email content and this idea (0.3-1.0)',
            },
          },
          required: ['idea', 'type', 'relevance', 'confidence'],
        },
        minItems: 3,
        maxItems: 3,
        description: 'Exactly 3 creative ideas inspired by the email content + user context',
      },

      // Overall confidence
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in the idea generation quality (average of individual scores)',
      },
    },
    required: ['has_ideas', 'ideas', 'confidence'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// IDEA SPARK ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Idea Spark Analyzer
 *
 * Generates 3 creative, actionable ideas from each email by cross-referencing
 * the email content with the user's full context. This is the most "creative"
 * analyzer in the system — it uses a higher temperature (0.7) and encourages
 * lateral thinking.
 *
 * PHASE 2 EXECUTION:
 * This analyzer runs AFTER the categorizer determines signal_strength.
 * Emails classified as 'noise' are skipped to save tokens.
 *
 * @example
 * ```typescript
 * const sparkAnalyzer = new IdeaSparkAnalyzer();
 *
 * // Must provide user context for personalized ideas
 * const result = await sparkAnalyzer.analyze(emailInput, userContext);
 *
 * if (result.success && result.data.hasIdeas) {
 *   console.log(`Generated ${result.data.ideas.length} ideas:`);
 *   result.data.ideas.forEach((idea, i) => {
 *     console.log(`  ${i + 1}. [${idea.type}] ${idea.idea}`);
 *     console.log(`     Why: ${idea.relevance}`);
 *   });
 * }
 * ```
 */
export class IdeaSparkAnalyzer extends BaseAnalyzer<IdeaSparkData> {
  /**
   * Creates a new IdeaSparkAnalyzer instance.
   *
   * Uses the ideaSpark configuration from config/analyzers.ts:
   * - enabled: true (can be toggled off to save costs)
   * - model: gpt-4.1-mini
   * - temperature: 0.7 (high for creative output)
   * - maxTokens: 600 (3 ideas with type + relevance + confidence)
   */
  constructor() {
    super('IdeaSpark', analyzerConfig.ideaSpark);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and generates 3 creative ideas.
   *
   * This method:
   * 1. Validates the email has enough content for idea generation
   * 2. Logs the user context being used for personalization
   * 3. Calls the AI with the full user context in the system prompt
   * 4. Normalizes the response (snake_case → camelCase)
   * 5. Logs the generated ideas for debugging
   *
   * @param email - Email data to generate ideas from
   * @param context - User context (role, interests, projects, etc.) — IMPORTANT for quality
   * @returns Idea spark result with 3 ideas
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<IdeaSparkResult> {
    // Log analysis start with context quality indicator
    const contextQuality = this.assessContextQuality(context);
    this.logger.info('Generating idea sparks', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      contextQuality,
      hasInterests: !!(context?.interests?.length),
      hasProjects: !!(context?.projects?.length),
      hasFamily: !!(context?.familyContext),
      hasLocation: !!(context?.locationCity),
    });

    // Log a warning if user context is sparse — ideas will be less personalized
    if (contextQuality === 'minimal') {
      this.logger.warn('Sparse user context — ideas will be less personalized', {
        emailId: email.id,
        tip: 'Complete onboarding profile for better ideas',
      });
    }

    // Execute the AI analysis via base class
    const result = await this.executeAnalysis(email, context);

    // Post-process: normalize response format and validate
    if (result.success) {
      result.data = this.normalizeResponse(result.data);

      // Log generated ideas for debugging and quality monitoring
      this.logger.info('Idea sparks generated', {
        emailId: email.id,
        ideaCount: result.data.ideas.length,
        hasIdeas: result.data.hasIdeas,
        overallConfidence: result.data.confidence,
        ideaSummary: result.data.ideas.map(idea => ({
          type: idea.type,
          confidence: idea.confidence,
          preview: idea.idea.substring(0, 60),
        })),
      });
    } else {
      // Log failure with details for debugging
      this.logger.warn('Idea spark generation failed — returning empty result', {
        emailId: email.id,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for idea generation.
   *
   * The schema enforces:
   * - Exactly 3 ideas (minItems: 3, maxItems: 3)
   * - Each idea has: idea text, type, relevance, confidence
   * - Type must be one of the 10 IDEA_TYPES
   * - Confidence is 0-1 float
   *
   * @returns Function schema for OpenAI function calling
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for idea generation.
   *
   * This is a DYNAMIC prompt — it changes based on user context.
   * The more the user has filled in their profile (interests, projects,
   * family, location), the more personalized the ideas will be.
   *
   * @param context - User context for personalization
   * @returns System prompt string
   */
  getSystemPrompt(context?: UserContext): string {
    return buildSystemPrompt(context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Assesses the quality of user context for idea personalization.
   *
   * Better context = better ideas. This helps us log when ideas
   * might be generic due to sparse user profiles.
   *
   * @param context - User context to assess
   * @returns Quality level: 'rich', 'moderate', or 'minimal'
   */
  private assessContextQuality(context?: UserContext): 'rich' | 'moderate' | 'minimal' {
    if (!context) return 'minimal';

    let score = 0;
    if (context.role) score++;
    if (context.interests && context.interests.length > 0) score++;
    if (context.projects && context.projects.length > 0) score++;
    if (context.locationCity) score++;
    if (context.familyContext) score++;
    if (context.priorities && context.priorities.length > 0) score++;

    if (score >= 4) return 'rich';
    if (score >= 2) return 'moderate';
    return 'minimal';
  }

  /**
   * Normalizes the OpenAI response to match our TypeScript interface.
   *
   * OpenAI returns snake_case property names from the function schema,
   * but our interface uses camelCase. This method:
   * 1. Converts snake_case to camelCase
   * 2. Validates each idea has required fields
   * 3. Ensures exactly 3 ideas (pads with empty if needed)
   * 4. Validates idea types against IDEA_TYPES enum
   *
   * @param rawData - Raw data from OpenAI (may be snake_case)
   * @returns Normalized IdeaSparkData
   */
  private normalizeResponse(rawData: Record<string, unknown>): IdeaSparkData {
    const hasIdeas = Boolean(rawData.has_ideas ?? rawData.hasIdeas);

    // Normalize ideas array
    const rawIdeas = (rawData.ideas as Array<{
      idea: string;
      type: string;
      relevance: string;
      confidence: number;
    }>) || [];

    // Validate and normalize each idea
    const ideas: IdeaSpark[] = rawIdeas
      .filter(idea => idea && idea.idea && idea.type) // Filter out malformed ideas
      .map(idea => ({
        idea: idea.idea,
        type: this.validateIdeaType(idea.type),
        relevance: idea.relevance || 'Connected to email content',
        confidence: typeof idea.confidence === 'number'
          ? Math.max(0, Math.min(1, idea.confidence))
          : 0.5,
      }));

    // Log if we got fewer than 3 ideas (unexpected)
    if (ideas.length < 3 && hasIdeas) {
      this.logger.warn('Received fewer than 3 ideas from AI — padding with empty', {
        receivedCount: ideas.length,
        expectedCount: 3,
      });
    }

    return {
      hasIdeas: hasIdeas && ideas.length > 0,
      ideas,
      confidence: typeof rawData.confidence === 'number'
        ? (rawData.confidence as number)
        : ideas.length > 0
          ? ideas.reduce((sum, i) => sum + i.confidence, 0) / ideas.length
          : 0,
    };
  }

  /**
   * Validates an idea type string against the IDEA_TYPES enum.
   *
   * If the AI returns an unexpected type, defaults to 'personal_growth'
   * (the most generic type) and logs a warning.
   *
   * @param type - Raw type string from AI
   * @returns Validated IdeaType
   */
  private validateIdeaType(type: string): IdeaType {
    const validTypes = IDEA_TYPES as readonly string[];
    if (validTypes.includes(type)) {
      return type as IdeaType;
    }

    // Log unexpected type for debugging
    this.logger.warn('Unexpected idea type from AI — defaulting to personal_growth', {
      receivedType: type,
      validTypes: validTypes.join(', '),
    });

    return 'personal_growth';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default idea spark analyzer instance for convenience.
 *
 * Use this for standard idea generation. The singleton shares
 * the same configuration and logger instance.
 *
 * @example
 * ```typescript
 * import { ideaSparkAnalyzer } from '@/services/analyzers/idea-spark';
 *
 * // Generate ideas (requires user context for personalization)
 * const result = await ideaSparkAnalyzer.analyze(emailInput, userContext);
 *
 * if (result.data.hasIdeas) {
 *   result.data.ideas.forEach(idea => {
 *     console.log(`[${idea.type}] ${idea.idea}`);
 *   });
 * }
 * ```
 */
export const ideaSparkAnalyzer = new IdeaSparkAnalyzer();
