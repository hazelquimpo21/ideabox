/**
 * AI Analyzer Configuration
 *
 * Configuration for all AI analyzers used in email processing.
 * Each analyzer can be independently enabled/disabled and tuned.
 *
 * WHY CONFIGURE ANALYZERS?
 * - Easy A/B testing of different settings
 * - Disable specific analyzers without code changes
 * - Fine-tune temperature/tokens per analyzer type
 * - Cost control through model selection
 *
 * MODEL DECISION:
 * We use GPT-4.1-mini exclusively (no fallback).
 * See docs/DECISIONS.md for cost analysis and rationale.
 */

/**
 * Available AI models.
 * Currently only GPT-4.1-mini is used (single model strategy).
 */
export type AIModel = 'gpt-4.1-mini';

/**
 * Configuration for a single analyzer.
 */
export interface AnalyzerConfig {
  /** Whether this analyzer is enabled */
  enabled: boolean;

  /** AI model to use (currently always gpt-4.1-mini) */
  model: AIModel;

  /**
   * Temperature for AI responses (0-1).
   * Lower = more deterministic, higher = more creative.
   * For classification tasks, we use low temperatures (0.2-0.3).
   */
  temperature: number;

  /**
   * Maximum tokens in AI response.
   * Keep low for structured outputs to control costs.
   */
  maxTokens: number;
}

/**
 * Email categories that the categorizer can assign.
 * These are life-bucket focused: what PART OF LIFE does this email touch?
 *
 * REFACTORED (Jan 2026): Changed from action-focused to life-bucket categories.
 * Actions are tracked separately via the `actions` table and action extraction.
 *
 * The AI analyzer uses human-eye inference to categorize - considering sender
 * context, domain patterns, and content to make smart categorization decisions.
 */
export const EMAIL_CATEGORIES = [
  'newsletters_creator',           // Substacks, digests, curated content
  'newsletters_industry',          // Industry-specific newsletters
  'news_politics',                 // News outlets, political updates
  'product_updates',               // Tech products, SaaS tools, subscriptions you use
  'local',                         // Community events, neighborhood, local orgs
  'shopping',                      // Orders, shipping, deals, retail
  'travel',                        // Flights, hotels, bookings, trip info
  'finance',                       // Bills, banking, investments, receipts
  'family',                        // School, kids, health, appointments, family scheduling
  'clients',                       // Direct client correspondence, project work
  'work',                          // Team/internal, industry stuff, professional
  'personal_friends_family',       // Social, relationships, personal correspondence
  'notifications',                 // Verification codes, OTPs, login alerts, password resets, system alerts
] as const;

export type EmailCategory = typeof EMAIL_CATEGORIES[number];

/**
 * Secondary labels available for multi-label classification.
 * Note: Full list with descriptions is in services/analyzers/types.ts
 * See docs/ENHANCED_EMAIL_INTELLIGENCE.md for complete taxonomy.
 *
 * ENHANCED (Feb 2026): Added noise detection labels.
 */
export const EMAIL_LABELS_SUMMARY = {
  action: ['needs_reply', 'needs_decision', 'needs_review', 'needs_approval'],
  urgency: ['urgent', 'has_deadline', 'time_sensitive'],
  relationship: ['from_vip', 'new_contact', 'networking_opportunity'],
  content: ['has_attachment', 'has_link', 'has_question'],
  location: ['local_event'],
  personal: ['family_related', 'community'],
  financial: ['invoice', 'receipt', 'payment_due'],
  calendar: ['meeting_request', 'rsvp_needed', 'appointment'],
  learning: ['educational', 'industry_news', 'job_opportunity'],
  noise: ['sales_pitch', 'webinar_invite', 'fake_recognition', 'mass_outreach', 'promotional'],
} as const;

/**
 * Email type values — the nature of the communication.
 * NEW (Feb 2026): Orthogonal to category. Category = life area, type = communication nature.
 */
export const EMAIL_TYPES = [
  'personal',        // Direct human correspondence
  'transactional',   // Receipts, confirmations, shipping updates
  'newsletter',      // Newsletters, digests, content roundups
  'notification',    // App notifications, social media alerts
  'promo',           // Marketing, sales, deals
  'cold_outreach',   // Unsolicited sales, PR, fake awards
  'needs_response',  // Someone is waiting for a reply
  'fyi',             // Informational, no action needed
  'automated',       // Machine-generated codes, alerts
] as const;

/**
 * Signal strength values for email relevance assessment.
 * NEW (Feb 2026): Core "is this worth the user's time?" classification.
 */
export const SIGNAL_STRENGTHS = [
  'high',     // Direct human correspondence requiring attention
  'medium',   // Useful information worth seeing
  'low',      // Background noise, can be batched/skipped
  'noise',    // Pure noise - auto-archive candidate
] as const;

/**
 * Reply worthiness values for reply assessment.
 * NEW (Feb 2026): More nuanced than quickAction='respond'.
 */
export const REPLY_WORTHINESS = [
  'must_reply',       // Someone is waiting for a response
  'should_reply',     // Smart networking/relationship move
  'optional_reply',   // Could reply if interested
  'no_reply',         // No reply expected or useful
] as const;

/**
 * Action types that the action extractor can identify.
 * These describe WHAT KIND of action is needed.
 *
 * ENHANCED (Feb 2026): Added concrete action types (pay, submit, register, book)
 * to distinguish "real" tasks from passive review items. This supports the
 * two-tier system: Review Queue (for scan-worthy emails) vs Real Tasks
 * (for concrete actions with verbs).
 */
export const ACTION_TYPES = [
  'respond',   // Need to reply to this email
  'review',    // Need to review attached/linked content (explicit review requests only)
  'create',    // Need to create something (document, code, etc.)
  'schedule',  // Need to schedule a meeting or event
  'decide',    // Need to make a decision
  'pay',       // Need to pay a bill, invoice, or fee [NEW Feb 2026]
  'submit',    // Need to submit a form, application, or document [NEW Feb 2026]
  'register',  // Need to register or sign up for something [NEW Feb 2026]
  'book',      // Need to book travel, reservations, or appointments [NEW Feb 2026]
  'none',      // No action required
] as const;

export type ActionType = typeof ACTION_TYPES[number];

/**
 * Analyzer configurations.
 * Each analyzer has its own tuned settings.
 *
 * ARCHITECTURE (ENHANCED Feb 2026):
 * - categorizer: Always runs first (determines category + summary + quickAction)
 * - contentDigest: Always runs (extracts gist, key points, links)
 * - actionExtractor: Always runs (multi-action, tightened for real tasks)
 * - clientTagger: Always runs (client linking)
 * - dateExtractor: Always runs (timeline intelligence)
 * - ideaSpark: Phase 2 — runs on non-noise emails after categorizer [NEW Feb 2026]
 * - insightExtractor: Phase 2 — runs on newsletter/substantive content [NEW Feb 2026]
 * - newsBrief: Phase 2 — runs on news-containing emails [NEW Feb 2026]
 * - eventDetector: Conditionally runs when `has_event` label present
 * - contactEnricher: Selectively runs for contacts needing enrichment
 */
export const analyzerConfig = {
  /**
   * Categorizer: Classifies emails by action needed.
   * ENHANCED (Jan 2026): Now also generates summary and quickAction.
   * Low temperature for consistent classification.
   */
  categorizer: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for deterministic classification
    maxTokens: 750,   // Increased: category + reasoning + topics + summary + quickAction + signalStrength + replyWorthiness + emailType + aiBrief
  } satisfies AnalyzerConfig,

  /**
   * Content Digest: Extracts substance of email (gist, key points, links).
   * NEW (Jan 2026): Enables users to understand emails without reading them.
   *
   * Think of this as having an eager assistant read the email and brief you:
   * - Gist: 1-2 sentence conversational summary of content
   * - Key Points: 2-5 specific, scannable bullet points
   * - Links: Extracted URLs with type and context
   *
   * Runs on ALL emails. Higher token count for detailed extraction.
   */
  contentDigest: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.3, // Slightly higher for natural gist writing
    maxTokens: 1200,  // Increased from 700 — truncated JSON errors were frequent at 700
  } satisfies AnalyzerConfig,

  /**
   * Action Extractor: Identifies if/what action is needed.
   * ENHANCED (Jan 2026): Now supports multiple actions per email.
   * Slightly higher temperature for nuanced action descriptions.
   */
  actionExtractor: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.3, // Slightly higher for action descriptions
    maxTokens: 500,   // Needs room for action title + description
  } satisfies AnalyzerConfig,

  /**
   * Client Tagger: Links emails to known clients.
   * Low temperature for accurate matching.
   */
  clientTagger: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate matching
    maxTokens: 300,   // Client name + project + confidence
  } satisfies AnalyzerConfig,

  /**
   * Event Detector: Extracts rich event details.
   * ONLY runs when categorizer returns category === 'event'.
   * This saves tokens by not running on non-event emails.
   *
   * Added Jan 2026 for calendar integration.
   */
  eventDetector: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate date/time extraction
    maxTokens: 600,   // Needs room for all event fields
  } satisfies AnalyzerConfig,

  /**
   * Multi-Event Detector: Extracts multiple events from a single email.
   * NEW (Feb 2026): Handles course schedules, event roundups, newsletter
   * event sections, and any email listing several distinct events/dates.
   *
   * ONLY runs when BOTH `has_event` AND `has_multiple_events` labels present.
   * When triggered, runs INSTEAD OF the single EventDetector.
   *
   * Higher token limit to accommodate up to 10 events per email.
   * Can optionally resolve links for additional event details.
   *
   * COST: ~$0.0003/email × ~5 emails/day = ~$0.045/month
   */
  multiEventDetector: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate date/time extraction
    maxTokens: 1200,  // Higher to accommodate multiple events (up to 10)
  } satisfies AnalyzerConfig,

  /**
   * Date Extractor: Extracts timeline-relevant dates from emails.
   * Always runs to power the Hub "upcoming things" view.
   *
   * Extracts: deadlines, payment dues, expirations, birthdays, follow-ups, etc.
   *
   * Added Jan 2026 for timeline intelligence.
   */
  dateExtractor: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate date parsing
    maxTokens: 500,   // Multiple dates possible per email
  } satisfies AnalyzerConfig,

  /**
   * Idea Spark: Generates creative ideas from email content + user context.
   * NEW (Feb 2026): Cross-references email content with user's role, interests,
   * projects, location, family context, and current date/season to produce
   * 3 lateral-thinking ideas per email.
   *
   * PHASE 2 EXECUTION: Runs AFTER categorizer to gate on signal_strength.
   * Skipped when signal_strength = 'noise' to save tokens (~30% of emails).
   *
   * Higher temperature (0.7) for creative output — ideas should be surprising
   * and lateral, not obvious. This is the most "creative" analyzer.
   *
   * COST: ~$0.0002/email × ~175 emails/day = ~$1.05/month
   */
  ideaSpark: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.7, // High for creative, lateral thinking
    maxTokens: 600,   // 3 ideas with type + relevance + confidence
  } satisfies AnalyzerConfig,

  /**
   * Insight Extractor: Synthesizes interesting ideas, tips, and frameworks.
   * NEW (Feb 2026): Extracts "what's worth knowing" from email content.
   *
   * Unlike ContentDigest (which summarizes WHAT the email says) or IdeaSpark
   * (which suggests WHAT TO DO), this analyzer identifies the INTERESTING IDEAS
   * contained in the email — things worth writing in a notebook.
   *
   * PHASE 2 EXECUTION: Runs when content type is newsletter/substantive
   * (multi_topic_digest, single_topic, curated_links) AND signal != noise.
   * Estimated skip rate: ~70-80% of emails (most personal/transactional don't
   * contain synthesizable insights).
   *
   * COST: ~$0.0002/email × ~40 emails/day = ~$0.24/month
   */
  insightExtractor: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.4, // Moderate — synthesis needs some creativity but is grounded in source
    maxTokens: 500,   // 2-4 insights with type + topics + confidence
  } satisfies AnalyzerConfig,

  /**
   * News Brief: Extracts newsworthy facts from email content.
   * NEW (Feb 2026): Identifies what happened, what launched, what changed.
   *
   * The factual complement to InsightExtractor — news is about events
   * that happened in the world, not ideas or analysis.
   *
   * PHASE 2 EXECUTION: Runs when categorizer labels include 'industry_news'
   * or content type is multi_topic_digest/curated_links AND signal != noise.
   * Estimated skip rate: ~85-90% of emails.
   *
   * COST: ~$0.00015/email × ~25 emails/day = ~$0.11/month
   */
  newsBrief: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low — factual extraction needs precision, not creativity
    maxTokens: 400,   // 1-5 news items with headline + detail + topics
  } satisfies AnalyzerConfig,

  /**
   * Contact Enricher: Extracts contact metadata from email signatures/content.
   * SELECTIVE: Only runs when contact needs enrichment.
   *
   * Criteria for running:
   * - Contact has extraction_confidence IS NULL or < 0.5
   * - OR last_extracted_at > 30 days ago
   * - AND contact has 3+ emails (worth the token cost)
   *
   * Extracts: company, job title, phone, LinkedIn, relationship type, birthday.
   *
   * Added Jan 2026 for contact intelligence.
   */
  contactEnricher: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.2, // Low for accurate extraction
    maxTokens: 400,   // Contact fields are compact
  } satisfies AnalyzerConfig,

  /**
   * Summary Generator: Synthesizes narrative email digests.
   * NEW (Feb 2026): Generates on-demand when stale + new data exists.
   *
   * Input: Clustered ai_briefs + action summaries + deadlines.
   * Output: Narrative headline + themed sections + stats.
   *
   * NOT a per-email analyzer — runs once per summary generation.
   * Uses ai_brief from categorizer as input (zero re-analysis cost).
   *
   * COST: ~$0.0007/summary × ~6/day = ~$0.13/month worst case
   */
  summaryGenerator: {
    enabled: true,
    model: 'gpt-4.1-mini' as AIModel,
    temperature: 0.3, // Factual but readable narrative
    maxTokens: 800,   // Headline + themed sections + stats
  } satisfies AnalyzerConfig,
} as const;

/**
 * Type for the analyzer configuration object.
 */
export type AnalyzerConfigMap = typeof analyzerConfig;

/**
 * GPT-4.1-mini pricing for cost calculations.
 * Prices are per token.
 *
 * Current pricing (as of Jan 2026):
 * - Input:  $0.15 per 1M tokens
 * - Output: $0.60 per 1M tokens
 */
export const MODEL_PRICING = {
  'gpt-4.1-mini': {
    input: 0.15 / 1_000_000,  // $0.00000015 per token
    output: 0.60 / 1_000_000, // $0.0000006 per token
  },
} as const;

/**
 * Calculate estimated cost for an API call.
 *
 * @param model - The model used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const cost = calculateCost('gpt-4.1-mini', 500, 100);
 * // cost = 0.000135 (input) + 0.00006 (output) = $0.000195
 * ```
 */
export function calculateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
