/**
 * News Brief Analyzer
 *
 * Extracts newsworthy facts from email content — what happened, what
 * launched, what changed in the world.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Factual News Extraction from Email Content
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the factual complement to InsightExtractor:
 *
 * - InsightExtractor answers: "What's WORTH KNOWING?" (ideas, tips, frameworks)
 * - NewsBrief answers:        "What HAPPENED?" (facts, launches, announcements)
 *
 * DESIGN PHILOSOPHY:
 * - News items must be FACTUAL — things that happened, not opinions
 * - Each item should answer "what happened?" not "what does it mean?"
 * - Time-sensitive: prioritize recent announcements and developments
 * - Headlines should read like a news ticker — concise, factual, specific
 * - Low temperature (0.2) since this is factual extraction, not creative synthesis
 *
 * EXECUTION:
 * - Phase 2 conditional analyzer (runs after Phase 1 categorizer + contentDigest)
 * - Gated on: categorizer labels include 'industry_news' OR content type is
 *   multi_topic_digest/curated_links AND signal_strength !== 'noise'
 * - Estimated skip rate: ~85-90% of emails
 * - Cost: ~$0.00015/email × ~25 qualifying emails/day = ~$0.11/month
 *
 * EXAMPLES OF GOOD NEWS ITEMS:
 * - "EU passed AI Act requiring model transparency for high-risk systems"
 * - "Apple announced Vision Pro 2 with 50% better battery life (shipping March)"
 * - "Stripe acquired Bridge for $1.1B to expand stablecoin infrastructure"
 *
 * @module services/analyzers/news-brief
 * @since February 2026
 */

import { BaseAnalyzer } from './base-analyzer';
import { analyzerConfig } from '@/config/analyzers';
import type {
  NewsBriefData,
  NewsBriefResult,
  EmailInput,
  UserContext,
  FunctionSchema,
} from './types';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('NewsBrief');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Content types that typically contain newsworthy items.
 * These are the content types from ContentDigest that gate this analyzer.
 * NewsBrief is more selective than InsightExtractor — not all newsletters
 * have news, but all news newsletters have newsletter content types.
 */
export const NEWS_ELIGIBLE_CONTENT_TYPES = [
  'multi_topic_digest',  // News roundup newsletters
  'curated_links',       // Link roundups that often include news
] as const;

/**
 * Categorizer labels that indicate newsworthy content.
 * Emails with these labels are eligible even if content type doesn't match.
 */
export const NEWS_ELIGIBLE_LABELS = [
  'industry_news',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NewsBriefAnalyzer — Extracts factual news items from email content.
 *
 * Unlike InsightExtractor (which synthesizes interesting IDEAS), this analyzer
 * identifies factual NEWS — things that happened, launched, or changed.
 *
 * @example
 * ```typescript
 * const analyzer = new NewsBriefAnalyzer(analyzerConfig.newsBrief);
 * const result = await analyzer.analyze(emailInput, userContext);
 *
 * // result.data.newsItems = [
 * //   {
 * //     headline: "EU passed AI Act requiring model transparency for high-risk systems",
 * //     detail: "Enforcement begins March 2027; affects healthcare, finance, and law enforcement AI",
 * //     topics: ["AI", "regulation", "EU"],
 * //     dateMentioned: "2027-03-01",
 * //     confidence: 0.92
 * //   },
 * //   ...
 * // ]
 * ```
 */
export class NewsBriefAnalyzer extends BaseAnalyzer<NewsBriefData> {
  readonly description = 'Extracts newsworthy facts — what happened, what launched, what changed';

  constructor() {
    super('NewsBrief', analyzerConfig.newsBrief);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM PROMPT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Builds the system prompt for news extraction.
   *
   * The prompt incorporates user context to prioritize news relevant to
   * the user's interests, but doesn't exclude news on other topics.
   *
   * KEY PROMPT DESIGN DECISIONS:
   * - Explicitly distinguishes facts from opinions (common failure mode)
   * - Headlines must be ticker-style: concise, factual, specific
   * - Detail provides context: why it matters, what the implications are
   * - Date extraction is optional but useful for timeline views
   */
  getSystemPrompt(context?: UserContext): string {
    // Build a lightweight context section for relevance boosting
    const contextLines: string[] = [];

    if (context?.interests?.length) {
      contextLines.push(`User interests: ${context.interests.join(', ')}`);
    }
    if (context?.role) {
      contextLines.push(`User role: ${context.role}`);
    }
    if (context?.projects?.length) {
      contextLines.push(`Active projects: ${context.projects.join(', ')}`);
    }

    const userContextBlock = contextLines.length > 0
      ? `
═══════════════════════════════════════════════════════════════════════════════
USER CONTEXT (use to boost relevance scoring, not to filter)
═══════════════════════════════════════════════════════════════════════════════

${contextLines.join('\n')}
`
      : '';

    logger.debug('Building news brief prompt', {
      contextFields: contextLines.length,
      hasInterests: !!context?.interests?.length,
    });

    return `You are a news extraction specialist. Your job is to identify NEWSWORTHY FACTS from email content — things that HAPPENED, LAUNCHED, or CHANGED in the world.

You are NOT analyzing opinions, providing commentary, or summarizing the email. You are extracting FACTUAL NEWS ITEMS that answer "what happened?"

${userContextBlock}

═══════════════════════════════════════════════════════════════════════════════
WHAT COUNTS AS NEWS
═══════════════════════════════════════════════════════════════════════════════

NEWS is a factual statement about something that:
- Was ANNOUNCED (product launches, company news, policy changes)
- HAPPENED (acquisitions, events, regulatory decisions)
- CHANGED (pricing updates, leadership changes, market shifts)
- Was RELEASED (software versions, reports, studies with findings)

NOT news:
- Opinions or predictions ("experts believe AI will...")
- Generic advice ("5 tips for better productivity")
- Promotional content ("50% off this week!")
- Old information repackaged

═══════════════════════════════════════════════════════════════════════════════
FORMAT
═══════════════════════════════════════════════════════════════════════════════

Each news item has:
- headline: One-line fact. Read like a news ticker — concise, factual, specific.
  GOOD: "EU passed AI Act requiring model transparency for high-risk systems"
  BAD:  "AI regulation news" (too vague — what happened?)

- detail: One sentence of context/implications.
  GOOD: "Enforcement begins March 2027; affects companies deploying AI in healthcare, finance, and law enforcement"
  BAD:  "This is important for the industry" (vague — what are the specifics?)

- topics: 1-3 short tags (lowercase, hyphenated)

- dateMentioned: Specific date if mentioned (YYYY-MM-DD format), omit if none

═══════════════════════════════════════════════════════════════════════════════
EXAMPLES — GOOD vs BAD
═══════════════════════════════════════════════════════════════════════════════

GOOD:
✓ "Stripe acquired Bridge for $1.1B to expand stablecoin infrastructure"
✓ "React 20 dropped class components entirely — migration guide available"
✓ "Fed held interest rates at 5.25% — sixth consecutive pause"
✓ "OpenAI released GPT-5 with native multimodal and 2M token context"

BAD:
✗ "AI is changing the world" (opinion, not a specific event)
✗ "Some companies raised funding" (too vague — which companies? how much?)
✗ "The newsletter had news about technology" (meta-summary, not actual news)

═══════════════════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════════════════

1. Extract 1-5 news items. Only include genuinely newsworthy facts.
2. If the email doesn't contain news (personal email, transactional, pure
   opinion piece), return has_news: false.
3. Headlines must be specific and factual — no vague summaries.
4. Detail should add context, not restate the headline.
5. Confidence: 0.8-1.0 = specific, verifiable fact; 0.5-0.7 = likely factual
   but less specific; 0.3-0.5 = borderline newsworthy.
6. Don't extract promotional announcements as news (product sales, discounts).
7. If a date is mentioned, include it in dateMentioned (YYYY-MM-DD).
8. Prioritize news relevant to the user's interests but include all
   genuinely newsworthy items.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FUNCTION SCHEMA
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * OpenAI function schema for structured news extraction.
   *
   * The schema enforces:
   * - has_news boolean (clean "nothing here" responses)
   * - 0-5 news item objects with headline, detail, topics, optional date
   * - Overall confidence for quality assessment
   */
  getFunctionSchema(): FunctionSchema {
    return {
      name: 'extract_news',
      description: 'Extracts newsworthy facts from email content — what happened, launched, or changed',
      parameters: {
        type: 'object',
        properties: {
          has_news: {
            type: 'boolean',
            description: 'Whether the email contains newsworthy facts. False for personal emails, transactional, opinion-only, or promotional content.',
          },
          news_items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                headline: {
                  type: 'string',
                  description: 'One-line factual headline. Reads like a news ticker — concise, specific, answers "what happened?"',
                },
                detail: {
                  type: 'string',
                  description: 'One sentence of context — why it matters, what the implications are.',
                },
                topics: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 3,
                  description: 'Short topic tags (lowercase, hyphenated). E.g., ["ai", "regulation"]',
                },
                date_mentioned: {
                  type: 'string',
                  description: 'Specific date mentioned in YYYY-MM-DD format, if any. E.g., launch date, effective date.',
                },
                confidence: {
                  type: 'number',
                  minimum: 0.3,
                  maximum: 1.0,
                  description: 'Confidence this is a genuine, factual news item. 0.8+ = specific and verifiable.',
                },
              },
              required: ['headline', 'detail', 'topics', 'confidence'],
            },
            maxItems: 5,
            description: '1-5 news items, or empty array if has_news is false',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Overall confidence in extraction quality.',
          },
        },
        required: ['has_news', 'news_items', 'confidence'],
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyzes an email to extract newsworthy facts.
   *
   * @param email - Email content to analyze
   * @param context - User context for relevance boosting
   * @returns News brief result with typed news items and confidence scores
   */
  async analyze(
    email: EmailInput,
    context?: UserContext
  ): Promise<NewsBriefResult> {
    logger.info('Starting news extraction', {
      emailId: email.id,
      subject: email.subject?.substring(0, 50),
      hasContext: !!context,
    });

    try {
      const result = await this.executeAnalysis(email, context);

      // Log extraction results for monitoring quality
      if (result.success && result.data.hasNews) {
        const allTopics = result.data.newsItems.flatMap(n => n.topics);
        const avgConfidence = result.data.newsItems.length > 0
          ? result.data.newsItems.reduce((sum, n) => sum + n.confidence, 0) / result.data.newsItems.length
          : 0;
        const datesFound = result.data.newsItems.filter(n => n.dateMentioned).length;

        logger.info('News items extracted successfully', {
          emailId: email.id,
          newsItemCount: result.data.newsItems.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          topics: [...new Set(allTopics)].slice(0, 8),
          datesFound,
          tokensUsed: result.tokensUsed,
          processingTimeMs: result.processingTimeMs,
        });
      } else if (result.success && !result.data.hasNews) {
        logger.debug('No news items found in email — content not newsworthy', {
          emailId: email.id,
          tokensUsed: result.tokensUsed,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('News extraction failed', {
        emailId: email.id,
        error: errorMessage,
      });

      return {
        success: false,
        data: { hasNews: false, newsItems: [], confidence: 0 },
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
   * Transforms the raw AI function call response into typed NewsBriefData.
   *
   * Handles edge cases:
   * - Empty news_items array when has_news is true (set has_news to false)
   * - Missing topics (default to empty array)
   * - Invalid date formats (strip invalid dates)
   * - Confidence clamping to valid range
   */
  protected transformResult(raw: Record<string, unknown>): NewsBriefData {
    const hasNews = Boolean(raw.has_news);
    const rawItems = Array.isArray(raw.news_items) ? raw.news_items : [];

    // If model says has_news=true but returned no items, correct it
    if (hasNews && rawItems.length === 0) {
      logger.warn('Model returned has_news=true but empty news_items array — correcting to false');
      return { hasNews: false, newsItems: [], confidence: 0 };
    }

    const newsItems = rawItems.map((item: Record<string, unknown>) => {
      const newsItem: {
        headline: string;
        detail: string;
        topics: string[];
        dateMentioned?: string;
        confidence: number;
      } = {
        headline: String(item.headline || ''),
        detail: String(item.detail || ''),
        topics: Array.isArray(item.topics) ? item.topics.map(String) : [],
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
      };

      // Validate and include date_mentioned if it looks like a valid ISO date
      const rawDate = String(item.date_mentioned || '');
      if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        newsItem.dateMentioned = rawDate;
      } else if (rawDate) {
        logger.debug('Stripping invalid date format from news item', {
          headline: newsItem.headline.substring(0, 40),
          rawDate,
        });
      }

      return newsItem;
    });

    // Calculate overall confidence as average of individual scores
    const confidence = newsItems.length > 0
      ? newsItems.reduce((sum, n) => sum + n.confidence, 0) / newsItems.length
      : Number(raw.confidence) || 0;

    return {
      hasNews: newsItems.length > 0,
      newsItems,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  /**
   * Extracts the confidence score from the result data.
   */
  protected extractConfidence(data: NewsBriefData): number {
    return data.confidence;
  }
}

export default NewsBriefAnalyzer;
