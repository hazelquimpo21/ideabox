/**
 * Idea Spark Analyzer
 *
 * Generates creative, actionable ideas from email content by cross-referencing
 * what's in the email with what the AI knows about the user — their role,
 * interests, projects, location, family, and the current date/season.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REFINED (MAR 2026): Smarter idea generation for solopreneurs
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT CHANGED:
 * - 0-3 ideas instead of always 3 — the model can say "this email isn't idea-worthy"
 * - New idea types: tweet_draft, learning, tool_to_try, place_to_visit
 * - Removed: social_post (too vague), hobby (merged into learning), shopping (rarely useful)
 * - Solopreneur framing — ideas oriented toward building, shipping, growing
 * - Email metadata passed to model (category, email_type) for smarter decisions
 * - Removed "SPECIAL CASES" that forced bad ideas from receipts and spam
 *
 * PHILOSOPHY:
 * - Not every email deserves ideas. A password reset doesn't need 3 ideas.
 * - When an email IS idea-worthy, the ideas should be genuinely useful.
 * - Think like a sharp friend who knows the user's business and life.
 * - Quality > quantity — 1 great idea beats 3 mediocre ones.
 *
 * EXECUTION:
 * - Runs in Phase 2 of EmailProcessor (after categorizer)
 * - SKIPPED for noise, low-signal, automated, notification, and transactional emails
 * - Uses higher temperature (0.7) for creative output
 * - Receives full UserContext + email metadata for personalization
 *
 * IDEA TYPES:
 * - tweet_draft:       An actual tweet or social post draft, not "write a tweet about X"
 * - networking:        Reach out, connect, introduce, collaborate
 * - business:          Business opportunity, proposal, strategy
 * - content_creation:  Blog post, article, podcast topic, video idea
 * - learning:          Course, tutorial, book, skill, concept to explore
 * - tool_to_try:       Tool, app, or service worth checking out
 * - place_to_visit:    Restaurant, cafe, event, attraction, experience
 * - date_night:        Partner/relationship activities, romantic ideas
 * - family_activity:   Activities with kids, family outings, traditions
 * - personal_growth:   Habits to build, routines to start, health/wellness
 * - community:         Local involvement, volunteering, neighborhood
 *
 * COST:
 * - ~$0.0002 per email at GPT-4.1-mini
 * - ~100 emails/day (after smarter filtering) × $0.0002 = ~$0.02/day = ~$0.60/month
 *
 * @module services/analyzers/idea-spark
 * @version 2.0.0
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

const FUNCTION_NAME = 'generate_idea_sparks';

const FUNCTION_DESCRIPTION =
  'Generate 0-3 creative, actionable ideas inspired by the email — or return 0 if the email isn\'t idea-worthy';

/**
 * Maps old idea types to their new equivalents.
 * Used during the transition period to handle any stale data
 * or cached responses that use the old type names.
 */
const LEGACY_TYPE_MAP: Record<string, IdeaType> = {
  'social_post': 'tweet_draft',
  'hobby': 'learning',
  'shopping': 'personal_growth',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for idea generation.
 *
 * REFINED (Mar 2026): Solopreneur framing, 0-3 ideas, email metadata context.
 *
 * @param context - User context for personalization
 * @returns Complete system prompt string
 */
function buildSystemPrompt(context?: UserContext): string {
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

  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const month = now.getMonth();
  const season = month >= 2 && month <= 4 ? 'Spring' :
                 month >= 5 && month <= 7 ? 'Summer' :
                 month >= 8 && month <= 10 ? 'Fall' : 'Winter';

  const dateContext = `Today: ${dayNames[now.getDay()]}, ${monthNames[month]} ${now.getDate()}, ${now.getFullYear()} (${season})`;

  const userContextBlock = userInfoParts.length > 0
    ? `WHAT I KNOW ABOUT THE USER
${userInfoParts.join('\n')}
${dateContext}`
    : `CONTEXT
${dateContext}
(No detailed user context available — be more conservative with ideas)`;

  return `You're the user's sharp creative friend — a solopreneur who reads their email and spots opportunities they'd miss. You think laterally: connecting email content to their business, projects, learning, and life.

The user is a solopreneur — they build things, ship products, create content, and manage their own business. Ideas should be oriented around building, growing, learning, and living well.

${userContextBlock}

YOUR TASK

Read the email and decide: does this email spark any genuinely useful ideas?

Return 0-3 ideas. ZERO is a valid answer. Most emails don't deserve ideas.

WHEN TO RETURN 0 IDEAS (set has_ideas=false):
- Receipts, order confirmations, shipping updates — boring transactional stuff
- Password resets, verification codes, login alerts
- Generic product update emails ("we updated our privacy policy")
- Spam, sales pitches, cold outreach
- Automated notifications with no substantive content
- Emails where you'd have to really stretch to find an idea

WHEN TO RETURN 1-3 IDEAS:
- Newsletters with interesting topics, trends, or ideas worth exploring
- Emails mentioning tools, products, or services relevant to the user
- Content about places, events, or experiences near the user
- Industry news that connects to the user's work or projects
- Personal emails that spark a creative connection
- Anything that makes you genuinely think "oh, the user should know about this"

For each idea:
1. Be inspired by something SPECIFIC in the email (quote it, reference it)
2. Connect to the user's actual life, work, or interests
3. Be actionable — something they could do THIS WEEK
4. Feel like a friend's text, not a consultant's memo

IDEA TYPES (pick the most fitting):

- tweet_draft:       Draft an actual tweet or LinkedIn post — include the text, not just "write a tweet about X"
- networking:        A specific person to reach out to, or a way to connect with someone mentioned
- business:          A business opportunity, offering idea, or strategy inspired by the content
- content_creation:  A specific blog post, article, podcast episode, or video idea with an angle
- learning:          Something concrete to learn — a tutorial, book, course, concept, or rabbit hole
- tool_to_try:       A specific tool, app, or service mentioned that's worth checking out
- place_to_visit:    A restaurant, cafe, event, shop, or experience to check out${context?.locationCity ? ` (especially near ${context.locationCity})` : ''}
- date_night:        An activity or experience to do with ${context?.familyContext?.spouseName || 'a partner'}
- family_activity:   Something to do with ${context?.familyContext?.kidsCount ? 'the kids' : 'family'}
- personal_growth:   A habit, routine, or wellness idea inspired by the content
- community:         A way to get involved locally or contribute to a cause

CONFIDENCE SCORING (be honest):
- 0.8-1.0: Strong, obvious connection — the user would definitely find this useful
- 0.6-0.7: Good connection — relevant and actionable
- 0.4-0.5: Moderate — interesting but the connection is looser
- Below 0.4: Don't include it. If you can't score above 0.4, skip the idea.

VOICE:
Write like a friend texting, not a consultant presenting.
GOOD: "That RAG framework they mentioned — worth a weekend deep dive, could level up your ${context?.projects?.[0] || 'AI project'}"
BAD: "Consider exploring the RAG framework discussed in this newsletter as it may be relevant to your professional development"

GOOD: "Draft tweet: '${context?.role || 'Builders'} underestimate [topic from email]. Here's what I learned building [project]...' — this would land with your audience"
BAD: "You could create a social media post about the topics discussed in this email"`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function schema for structured idea output.
 *
 * REFINED (Mar 2026): 0-3 ideas instead of exactly 3. Added skip_reason.
 */
const FUNCTION_SCHEMA: FunctionSchema = {
  name: FUNCTION_NAME,
  description: FUNCTION_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      has_ideas: {
        type: 'boolean',
        description: 'Whether this email sparked any genuine ideas. False for transactional, automated, or content-thin emails.',
      },

      skip_reason: {
        type: 'string',
        description: 'When has_ideas is false, briefly explain why (e.g., "transactional receipt", "password reset", "no substantive content"). Omit when has_ideas is true.',
      },

      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            idea: {
              type: 'string',
              description: 'The idea itself — 1-2 sentences, specific and actionable. For tweet_draft, include actual draft text.',
            },
            type: {
              type: 'string',
              enum: IDEA_TYPES as unknown as string[],
              description: 'Category of idea',
            },
            relevance: {
              type: 'string',
              description: 'Why this idea connects to the user — 1 sentence bridging email content to user context',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'How strong the connection is (0.4-1.0). Below 0.4 = don\'t include.',
            },
          },
          required: ['idea', 'type', 'relevance', 'confidence'],
        },
        minItems: 0,
        maxItems: 3,
        description: '0-3 creative ideas. Empty array is fine when the email isn\'t idea-worthy.',
      },

      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Overall confidence in idea quality. 0 when no ideas generated.',
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
 * Generates 0-3 creative, actionable ideas from each email by cross-referencing
 * the email content with the user's full context. This is the most "creative"
 * analyzer in the system — it uses a higher temperature (0.7) and encourages
 * lateral thinking.
 *
 * REFINED (Mar 2026): Can return 0 ideas. Smarter about what's idea-worthy.
 */
export class IdeaSparkAnalyzer extends BaseAnalyzer<IdeaSparkData> {
  constructor() {
    super('IdeaSpark', analyzerConfig.ideaSpark);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyzes an email and generates 0-3 creative ideas.
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<IdeaSparkResult> {
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

    if (contextQuality === 'minimal') {
      this.logger.warn('Sparse user context — ideas will be less personalized', {
        emailId: email.id,
        tip: 'Complete onboarding profile for better ideas',
      });
    }

    const result = await this.executeAnalysis(email, context);

    if (result.success) {
      result.data = this.normalizeResponse(result.data);

      this.logger.info('Idea sparks generated', {
        emailId: email.id,
        ideaCount: result.data.ideas.length,
        hasIdeas: result.data.hasIdeas,
        skipReason: result.data.skipReason,
        overallConfidence: result.data.confidence,
        ideaSummary: result.data.ideas.map(idea => ({
          type: idea.type,
          confidence: idea.confidence,
          preview: idea.idea.substring(0, 60),
        })),
      });
    } else {
      this.logger.warn('Idea spark generation failed — returning empty result', {
        emailId: email.id,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Returns the OpenAI function schema for idea generation.
   * Allows 0-3 ideas (not exactly 3).
   */
  getFunctionSchema(): FunctionSchema {
    return FUNCTION_SCHEMA;
  }

  /**
   * Returns the system prompt for idea generation.
   * Dynamic — incorporates user context for personalization.
   */
  getSystemPrompt(context?: UserContext): string {
    return buildSystemPrompt(context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Assesses the quality of user context for idea personalization.
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
   * REFINED (Mar 2026):
   * - Handles 0 ideas gracefully (no more "padding with empty" warnings)
   * - Maps legacy types (social_post → tweet_draft, hobby → learning)
   * - Extracts skip_reason when present
   */
  private normalizeResponse(rawData: Record<string, unknown>): IdeaSparkData {
    const hasIdeas = Boolean(rawData.has_ideas ?? rawData.hasIdeas);
    const skipReason = (rawData.skip_reason ?? rawData.skipReason) as string | undefined;

    const rawIdeas = (rawData.ideas as Array<{
      idea: string;
      type: string;
      relevance: string;
      confidence: number;
    }>) || [];

    // Validate and normalize each idea
    const ideas: IdeaSpark[] = rawIdeas
      .filter(idea => idea && idea.idea && idea.type)
      .map(idea => ({
        idea: idea.idea,
        type: this.validateIdeaType(idea.type),
        relevance: idea.relevance || 'Connected to email content',
        confidence: typeof idea.confidence === 'number'
          ? Math.max(0, Math.min(1, idea.confidence))
          : 0.5,
      }))
      // Filter out low-confidence ideas the model shouldn't have included
      .filter(idea => idea.confidence >= 0.3);

    return {
      hasIdeas: hasIdeas && ideas.length > 0,
      ideas,
      skipReason: (!hasIdeas || ideas.length === 0) ? (skipReason || undefined) : undefined,
      confidence: typeof rawData.confidence === 'number'
        ? (rawData.confidence as number)
        : ideas.length > 0
          ? ideas.reduce((sum, i) => sum + i.confidence, 0) / ideas.length
          : 0,
    };
  }

  /**
   * Validates an idea type string against the IDEA_TYPES enum.
   * Maps legacy types to their new equivalents.
   */
  private validateIdeaType(type: string): IdeaType {
    const validTypes = IDEA_TYPES as readonly string[];
    if (validTypes.includes(type)) {
      return type as IdeaType;
    }

    // Check legacy type mapping
    const mapped = LEGACY_TYPE_MAP[type];
    if (mapped) {
      return mapped;
    }

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

export const ideaSparkAnalyzer = new IdeaSparkAnalyzer();
