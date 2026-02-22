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
 * 5. EventDetectorAnalyzer - Extracts rich event details (runs only for event category)
 * 6. DateExtractorAnalyzer - Extracts timeline dates (deadlines, payments, birthdays)
 * 7. ContactEnricherAnalyzer - Enriches contact info (runs selectively)
 * 8. IdeaSparkAnalyzer - Generates creative ideas from email content (NEW Feb 2026)
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
 * 7. EventDetector → only when `has_event` label present
 * 8. ContactEnricher → only for contacts needing enrichment
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
 *   DateExtractorAnalyzer,
 *   ContactEnricherAnalyzer,
 * } from '@/services/analyzers';
 *
 * // Import singleton instances
 * import {
 *   categorizer,
 *   contentDigestAnalyzer,
 *   actionExtractor,
 *   clientTagger,
 *   eventDetector,
 *   dateExtractor,
 *   contactEnricher,
 * } from '@/services/analyzers';
 *
 * // Import types
 * import type {
 *   CategorizationResult,
 *   ContentDigestResult,
 *   ActionExtractionResult,
 *   EventDetectionResult,
 *   DateExtractionResult,
 *   ContactEnrichmentResult,
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
 * @version 2.0.0
 * @since January 2026 - Added ContentDigest, enhanced ActionExtractor with multi-action
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

// Idea Spark - generates creative ideas from email content (NEW Feb 2026)
export { IdeaSparkAnalyzer, ideaSparkAnalyzer } from './idea-spark';

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
