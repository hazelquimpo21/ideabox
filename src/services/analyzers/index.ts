/**
 * AI Analyzers Module
 *
 * Re-exports all analyzer classes and utilities for convenient importing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE ANALYZERS (ENHANCED Feb 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. CategorizerAnalyzer - Classifies emails by action needed + summary + quickAction + labels
 * 2. ContentDigestAnalyzer - Extracts gist, key points, links
 * 3. ActionExtractorAnalyzer - Extracts action details (multi-action, tightened for real tasks)
 * 4. ClientTaggerAnalyzer - Links emails to known clients
 * 5. EventDetectorAnalyzer - Extracts rich event details (runs only when has_event label)
 * 6. MultiEventDetectorAnalyzer - Extracts multiple events from one email (NEW Feb 2026)
 * 7. DateExtractorAnalyzer - Extracts timeline dates (deadlines, payments, birthdays)
 * 8. ContactEnricherAnalyzer - Enriches contact info (runs selectively)
 * 9. IdeaSparkAnalyzer - Generates creative ideas from email content (NEW Feb 2026)
 * 10. InsightExtractorAnalyzer - Synthesizes ideas/tips/frameworks from newsletters (NEW Feb 2026)
 * 11. NewsBriefAnalyzer - Extracts factual news items from news emails (NEW Feb 2026)
 * 12. SenderTypeDetector - Pre-AI pattern-based sender classification (utility)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ANALYZER EXECUTION FLOW (ENHANCED Feb 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PHASE 1 (parallel — always run):
 * 1. Categorizer → determines category, summary, quickAction, labels, signal_strength
 * 2. ContentDigest → extracts gist, key points, links
 * 3. ActionExtractor → extracts MULTIPLE action items (tightened for real tasks)
 * 4. ClientTagger → links to known clients
 * 5. DateExtractor → extracts timeline dates for Hub
 *
 * PHASE 2 (conditional — run after categorizer):
 * 6. IdeaSpark → generates 3 creative ideas (NEW Feb 2026, skipped for noise emails)
 * 7. InsightExtractor → ideas/tips from newsletters (NEW Feb 2026, skipped for noise)
 * 8. NewsBrief → factual news items (NEW Feb 2026, skipped for noise)
 * 9. EventDetector → only when `has_event` label present (single event)
 * 10. MultiEventDetector → when `has_event` + `has_multiple_events` (replaces EventDetector)
 * 11. ContactEnricher → only for contacts needing enrichment
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Import individual analyzers
 * import {
 *   CategorizerAnalyzer,
 *   ContentDigestAnalyzer,
 *   ActionExtractorAnalyzer,
 *   EventDetectorAnalyzer,
 *   MultiEventDetectorAnalyzer,
 *   DateExtractorAnalyzer,
 *   ContactEnricherAnalyzer,
 *   IdeaSparkAnalyzer,
 *   InsightExtractorAnalyzer,
 *   NewsBriefAnalyzer,
 * } from '@/services/analyzers';
 *
 * // Import singleton instances
 * import {
 *   categorizer,
 *   contentDigestAnalyzer,
 *   actionExtractor,
 *   clientTagger,
 *   eventDetector,
 *   multiEventDetector,
 *   dateExtractor,
 *   contactEnricher,
 *   ideaSparkAnalyzer,
 * } from '@/services/analyzers';
 *
 * // Import types
 * import type {
 *   CategorizationResult,
 *   ContentDigestResult,
 *   ActionExtractionResult,
 *   EventDetectionResult,
 *   MultiEventDetectionResult,
 *   DateExtractionResult,
 *   ContactEnrichmentResult,
 *   IdeaSparkResult,
 *   InsightExtractionResult,
 *   NewsBriefResult,
 *   EmailInput,
 *   QuickAction,
 *   EmailLabel,
 * } from '@/services/analyzers';
 *
 * // Import base class for custom analyzers
 * import { BaseAnalyzer, ANALYZER_VERSION } from '@/services/analyzers';
 * ```
 *
 * @module services/analyzers
 * @version 3.0.0
 * @since January 2026 - Added ContentDigest, enhanced ActionExtractor with multi-action
 * @since February 2026 - Added MultiEventDetector, InsightExtractor, NewsBrief, IdeaSpark
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

export { BaseAnalyzer, ANALYZER_VERSION } from './base-analyzer';

// ═══════════════════════════════════════════════════════════════════════════════
// CONCRETE ANALYZERS
// ═══════════════════════════════════════════════════════════════════════════════

// Categorizer - classifies emails by action needed
export { CategorizerAnalyzer, categorizer } from './categorizer';

// Content Digest - extracts gist, key points, links (NEW Jan 2026)
export {
  ContentDigestAnalyzer,
  contentDigestAnalyzer,
} from './content-digest';

// Action Extractor - extracts action details (ENHANCED: multi-action support)
export { ActionExtractorAnalyzer, actionExtractor } from './action-extractor';

// Client Tagger - links emails to clients
export { ClientTaggerAnalyzer, clientTagger } from './client-tagger';

// Event Detector - extracts rich event details (runs only for category === 'event')
export { EventDetectorAnalyzer, eventDetector } from './event-detector';

// Date Extractor - extracts timeline dates (deadlines, payments, birthdays)
export { DateExtractorAnalyzer, dateExtractor } from './date-extractor';

// Contact Enricher - enriches contact info from signatures (runs selectively)
export {
  ContactEnricherAnalyzer,
  contactEnricher,
  shouldEnrichContact,
} from './contact-enricher';

// Multi-Event Detector - extracts multiple events from one email (NEW Feb 2026)
export { MultiEventDetectorAnalyzer, multiEventDetector } from './multi-event-detector';

// Idea Spark - generates creative ideas from email content (NEW Feb 2026)
export { IdeaSparkAnalyzer, ideaSparkAnalyzer } from './idea-spark';

// Insight Extractor - synthesizes ideas/tips/frameworks from newsletters (NEW Feb 2026)
export { InsightExtractorAnalyzer } from './insight-extractor';

// News Brief - extracts factual news items from news emails (NEW Feb 2026)
export { NewsBriefAnalyzer } from './news-brief';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export all types for consumer convenience
export type {
  // Configuration
  AnalyzerConfig,

  // Base types
  AnalyzerResult,
  EmailInput,
  UserContext,

  // Quick action type (used by categorizer)
  QuickAction,

  // Label type (used by categorizer) - NEW Jan 2026
  EmailLabel,

  // Date types (used by date extractor) - NEW Jan 2026
  DateType,
  RecurrencePattern,
  ExtractedDate,

  // Categorizer types
  CategorizationData,
  CategorizationResult,

  // Content digest types (NEW Jan 2026)
  ContentDigestData,
  ContentDigestResult,
  KeyPoint,
  ExtractedLink,
  LinkType,
  ContentType,

  // Action extractor types (ENHANCED: multi-action support)
  ActionExtractionData,
  ActionExtractionResult,
  EnhancedActionExtractionData,
  ActionItem,

  // Client tagger types
  ClientTaggingData,
  ClientTaggingResult,
  RelationshipSignal,

  // Event detector types
  EventDetectionData,
  EventDetectionResult,
  EventLocationType,

  // Date extractor types - NEW Jan 2026
  DateExtractionData,
  DateExtractionResult,

  // Contact enricher types - NEW Jan 2026
  ContactEnrichmentData,
  ContactEnrichmentResult,
  ContactRelationshipType,

  // Idea spark types - NEW Feb 2026
  IdeaSparkData,
  IdeaSparkResult,
  IdeaSpark,
  IdeaType,

  // Multi-event detector types - NEW Feb 2026
  MultiEventDetectionData,
  MultiEventDetectionResult,

  // Insight extractor types - NEW Feb 2026
  InsightExtractionData,
  InsightExtractionResult,

  // News brief types - NEW Feb 2026
  NewsBriefData,
  NewsBriefResult,

  // Aggregated types
  AggregatedAnalysis,
  EmailProcessingResult,
} from './types';

// Re-export constants
export {
  EMAIL_LABELS,
  DATE_TYPES,
  RELATIONSHIP_TYPES,
  LINK_TYPES,
  CONTENT_TYPES,
  IDEA_TYPES,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export { toEmailInput, createFailedResult } from './types';
