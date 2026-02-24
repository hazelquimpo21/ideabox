/**
 * Insight Extractor Analyzer
 *
 * Synthesizes interesting ideas, tips, frameworks, and observations from
 * email content — particularly newsletters and substantive articles.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): "What's Worth Knowing" from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This analyzer fills a specific gap in the analysis pipeline:
 *
 * - ContentDigest answers: "What does the email SAY?" (summarization)
 * - IdeaSpark answers:     "What should I DO?" (creative, lateral, actionable)
 * - InsightExtractor:      "What's WORTH KNOWING?" (synthesis, ideas, tips)
 *
 * DESIGN PHILOSOPHY:
 * - Insights should be SYNTHESIZED, not just pulled quotes
 * - Each insight should feel like something worth writing in a notebook
 * - Quality > quantity — 2 great insights beat 4 mediocre ones
 * - Only generates insights when content has genuine substance
 * - Uses moderate temperature (0.4) — needs creativity for synthesis
 *   but stays grounded in source material
 *
 * EXECUTION:
 * - Phase 2 conditional analyzer (runs after Phase 1 categorizer + contentDigest)
 * - Gated on content type: multi_topic_digest, single_topic, curated_links
 * - Also gated on signal_strength !== 'noise'
 * - Estimated skip rate: ~70-80% of emails
 * - Cost: ~$0.0002/email × ~40 qualifying emails/day = ~$0.24/month
 *
 * INSIGHT TYPES:
 * - tip: Practical, actionable advice or best practice
 * - framework: Mental model, methodology, or structured approach
 * - observation: Interesting observation or analysis worth noting
 * - counterintuitive: Surprising finding that challenges assumptions
 * - trend: Emerging pattern, direction, or industry movement
 *
 * @module services/analyzers/insight-extractor
 * @since February 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type {
  InsightExtractionData,
  InsightExtractionResult,
  EmailInput,
  UserContext,
  FunctionSchema,
  INSIGHT_TYPES,
} from './types';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InsightExtractor');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Content types that typically contain synthesizable insights.
 * These are the content types from ContentDigest that gate this analyzer.
 * Personal updates, transactional emails, etc. rarely have insights.
 */
export const INSIGHT_ELIGIBLE_CONTENT_TYPES = [
  'multi_topic_digest',  // Newsletters with multiple stories/topics
  'single_topic',        // Focused articles or thought pieces
  'curated_links',       // Link roundups with commentary
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InsightExtractorAnalyzer — Synthesizes interesting ideas and takeaways
 * from email content.
 *
 * Unlike IdeaSpark (which generates new ideas about what the user should DO),
 * this analyzer identifies the interesting IDEAS CONTAINED IN the email itself.
 *
 * @example
 * ```typescript
 * const analyzer = new InsightExtractorAnalyzer(analyzerConfig.insightExtractor);
 * const result = await analyzer.analyze(emailInput, userContext);
 *
 * // result.data.insights = [
 * //   {
 * //     insight: "Companies using RAG see 40% fewer hallucinations than fine-tuning alone",
 * //     type: "counterintuitive",
 * //     topics: ["AI", "RAG", "fine-tuning"],
 * //     confidence: 0.88
 * //   },
 * //   ...
 * // ]
 * ```
 */
export class InsightExtractorAnalyzer extends BaseAnalyzer<InsightExtractionData> {
  readonly description = 'Synthesizes interesting ideas, tips, and frameworks from email content';

  constructor() {
    super('InsightExtractor', analyzerConfig.insightExtractor);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM PROMPT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Builds the system prompt for insight extraction.
   *
   * The prompt dynamically incorporates user context (interests, role, projects)
   * to prioritize insights that are relevant to what the user cares about.
   *
   * KEY PROMPT DESIGN DECISIONS:
   * - Explicitly distinguishes insights from summaries (common failure mode)
   * - Provides examples of GOOD vs BAD insights to calibrate quality
   * - Uses user interests to weight relevance (but doesn't exclude other topics)
   * - Instructs model to return hasInsights=false for thin content
   */
  getSystemPrompt(context?: UserContext): string {
    // Build personalized context section
    const contextLines: string[] = [];

    if (context?.role) {
      contextLines.push(`Role: ${context.role}`);
    }
    if (context?.company) {
      contextLines.push(`Company: ${context.company}`);
    }
    if (context?.interests?.length) {
      contextLines.push(`Interests: ${context.interests.join(', ')}`);
    }
    if (context?.projects?.length) {
      contextLines.push(`Active projects: ${context.projects.join(', ')}`);
    }
    if (context?.priorities?.length) {
      contextLines.push(`Current priorities: ${context.priorities.join(', ')}`);
    }

    const userContextBlock = contextLines.length > 0
      ? `
═══════════════════════════════════════════════════════════════════════════════
WHAT I KNOW ABOUT THE USER (use this to assess relevance, not to filter)
═══════════════════════════════════════════════════════════════════════════════

${contextLines.join('\n')}
`
      : '';

    // Log context quality for debugging insight relevance
    const contextFieldCount = contextLines.length;
    if (contextFieldCount >= 4) {
      logger.debug('Rich user context available for insight personalization', {
        fieldCount: contextFieldCount,
      });
    } else if (contextFieldCount >= 2) {
      logger.debug('Moderate user context — insights will have decent relevance scoring', {
        fieldCount: contextFieldCount,
      });
    } else {
      logger.debug('Sparse user context — insight relevance scoring will be generic', {
        fieldCount: contextFieldCount,
      });
    }

    return `You are an insight extraction specialist. Your job is to synthesize the most interesting IDEAS, TIPS, FRAMEWORKS, and OBSERVATIONS from email content.

You are NOT summarizing the email (that's already done by another system). You are identifying the IDEAS WORTH REMEMBERING — the kind of thing someone would highlight in a newsletter, write in a notebook, or share with a colleague.

${userContextBlock}

═══════════════════════════════════════════════════════════════════════════════
WHAT MAKES A GOOD INSIGHT
═══════════════════════════════════════════════════════════════════════════════

A good insight is:
- SPECIFIC: Includes concrete details (numbers, names, mechanisms)
- SYNTHESIZED: Not a direct quote — it's the TAKEAWAY distilled into 1-2 sentences
- MEMORABLE: Something worth writing down and revisiting later
- NON-OBVIOUS: Not something the reader would already know

INSIGHT TYPES:
- "tip": Practical, actionable advice. "Use structured outputs to reduce hallucination by 40%"
- "framework": A mental model or methodology. "Jobs-to-be-done: people don't buy drills, they buy holes"
- "observation": An interesting analysis or pattern. "The best PMs spend 60% of time on discovery"
- "counterintuitive": Challenges assumptions. "Remote teams ship faster than co-located ones"
- "trend": An emerging direction. "Companies are replacing fine-tuning with RAG for most use cases"

═══════════════════════════════════════════════════════════════════════════════
EXAMPLES — GOOD vs BAD
═══════════════════════════════════════════════════════════════════════════════

GOOD:
✓ "Companies using retrieval-augmented generation see 40% fewer hallucinations than fine-tuning alone — worth revisiting your prompt architecture"
✓ "The most effective cold emails reference a specific piece of the recipient's public work — generic compliments convert 3x worse"
✓ "Tip: Running database migrations during off-peak hours reduces risk of lock contention by 80%"

BAD:
✗ "The newsletter discussed AI" (too vague — just a topic, not an insight)
✗ "Here are some tips about productivity" (meta-description, not an actual insight)
✗ "The author thinks AI is important" (everyone knows this — not non-obvious)
✗ Direct quote without synthesis (we want the TAKEAWAY, not the original text)

═══════════════════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════════════════

1. Extract 2-4 insights. Quality over quantity — skip if the email is thin.
2. Each insight should be 1-2 sentences, SPECIFIC, and feel worth bookmarking.
3. Add 1-3 topic tags per insight (short, lowercase, hyphenated).
4. If the email doesn't contain substantive ideas (e.g., it's a transactional
   email, personal greeting, or thin promotional content), return has_insights: false.
5. Confidence scoring: 0.8-1.0 = strong, specific insight; 0.5-0.7 = decent but
   less novel; 0.3-0.5 = stretching.
6. Don't repeat the same insight in different words.
7. Prioritize insights relevant to the user's interests, but don't ignore
   great insights on other topics.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FUNCTION SCHEMA
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * OpenAI function schema for structured insight extraction.
   *
   * The schema enforces:
   * - has_insights boolean (allows clean "nothing here" responses)
   * - 0-4 insight objects with type, topics, and confidence
   * - Overall confidence for quality assessment
   */
  getFunctionSchema(): FunctionSchema {
    return {
      name: 'extract_insights',
      description: 'Synthesizes interesting ideas, tips, frameworks, and observations from email content',
      parameters: {
        type: 'object',
        properties: {
          has_insights: {
            type: 'boolean',
            description: 'Whether the email contains substantive insights worth extracting. False for transactional, personal greetings, thin promotional content.',
          },
          insights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                insight: {
                  type: 'string',
                  description: '1-2 sentence synthesized insight. Specific, memorable, non-obvious. Not a summary — the TAKEAWAY.',
                },
                type: {
                  type: 'string',
                  enum: ['tip', 'framework', 'observation', 'counterintuitive', 'trend'],
                  description: 'Category: tip (advice), framework (mental model), observation (analysis), counterintuitive (surprising), trend (emerging pattern)',
                },
                topics: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 3,
                  description: 'Short topic tags (lowercase, hyphenated). E.g., ["ai", "prompt-engineering"]',
                },
                confidence: {
                  type: 'number',
                  minimum: 0.3,
                  maximum: 1.0,
                  description: 'Confidence this is genuinely interesting/useful. 0.8+ = strong, 0.5-0.7 = decent, 0.3-0.5 = stretching.',
                },
              },
              required: ['insight', 'type', 'topics', 'confidence'],
            },
            maxItems: 4,
            description: '2-4 insights, or empty array if has_insights is false',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Overall confidence in extraction quality. Lower when source content is thin.',
          },
        },
        required: ['has_insights', 'insights', 'confidence'],
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyzes an email to extract interesting insights.
   *
   * @param email - Email content to analyze
   * @param context - User context for relevance scoring
   * @returns Insight extraction result with typed insights and confidence scores
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<InsightExtractionResult> {
    logger.info('Starting insight extraction', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      hasContext: !!context,
      interestsCount: context?.interests?.length ?? 0,
    });

    try {
      const result = await this.executeAnalysis(email, context);

      // Log extraction results for monitoring quality
      if (result.success && result.data.hasInsights) {
        const insightTypes = result.data.insights.map(i => i.type);
        const avgConfidence = result.data.insights.length > 0
          ? result.data.insights.reduce((sum, i) => sum + i.confidence, 0) / result.data.insights.length
          : 0;
        const allTopics = result.data.insights.flatMap(i => i.topics);

        logger.info('Insights extracted successfully', {
          emailId: email.id,
          insightCount: result.data.insights.length,
          insightTypes,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          topics: [...new Set(allTopics)].slice(0, 6),
          tokensUsed: result.tokensUsed,
          processingTimeMs: result.processingTimeMs,
        });
      } else if (result.success && !result.data.hasInsights) {
        logger.debug('No insights found in email — content likely not substantive', {
          emailId: email.id,
          tokensUsed: result.tokensUsed,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Insight extraction failed', {
        emailId: email.id,
        error: errorMessage,
      });

      return {
        success: false,
        data: { hasInsights: false, insights: [], confidence: 0 },
        confidence: 0,
        tokensUsed: 0,
        processingTimeMs: 0,
        error: errorMessage,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESULT TRANSFORMATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Transforms the raw AI function call response into typed InsightExtractionData.
   *
   * Handles edge cases:
   * - Empty insights array when has_insights is true (set has_insights to false)
   * - Missing topics (default to empty array)
   * - Confidence clamping to valid range
   */
  protected transformResult(raw: Record<string, unknown>): InsightExtractionData {
    const hasInsights = Boolean(raw.has_insights);
    const rawInsights = Array.isArray(raw.insights) ? raw.insights : [];

    // If model says has_insights=true but returned no insights, correct it
    if (hasInsights && rawInsights.length === 0) {
      logger.warn('Model returned has_insights=true but empty insights array — correcting to false');
      return { hasInsights: false, insights: [], confidence: 0 };
    }

    const insights = rawInsights.map((item: Record<string, unknown>) => ({
      insight: String(item.insight || ''),
      type: this.validateInsightType(String(item.type || 'observation')),
      topics: Array.isArray(item.topics) ? item.topics.map(String) : [],
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
    }));

    // Calculate overall confidence as average of individual scores
    const confidence = insights.length > 0
      ? insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length
      : Number(raw.confidence) || 0;

    return {
      hasInsights: insights.length > 0,
      insights,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  /**
   * Validates an insight type string against the known types.
   * Returns 'observation' as default for unknown types.
   */
  private validateInsightType(type: string): typeof INSIGHT_TYPES[number] {
    const validTypes = ['tip', 'framework', 'observation', 'counterintuitive', 'trend'];
    return validTypes.includes(type)
      ? (type as typeof INSIGHT_TYPES[number])
      : 'observation';
  }

  /**
   * Extracts the confidence score from the result data.
   */
  protected extractConfidence(data: InsightExtractionData): number {
    return data.confidence;
  }
}

export default InsightExtractorAnalyzer;
