/**
 * AI Analyzers Module
 *
 * Re-exports all analyzer classes and utilities for convenient importing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE ANALYZERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. CategorizerAnalyzer - Classifies emails by action needed + summary + quickAction + labels
 * 2. ActionExtractorAnalyzer - Extracts action details from emails
 * 3. ClientTaggerAnalyzer - Links emails to known clients
 * 4. EventDetectorAnalyzer - Extracts rich event details (runs only for event category)
 * 5. DateExtractorAnalyzer - Extracts timeline dates (deadlines, payments, birthdays)
 * 6. ContactEnricherAnalyzer - Enriches contact info (runs selectively)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ANALYZER EXECUTION FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Categorizer runs first (always) → determines category, summary, quickAction, labels
 * 2. ActionExtractor runs (always) → extracts detailed action info
 * 3. ClientTagger runs (always) → links to known clients
 * 4. DateExtractor runs (always) → extracts timeline dates for Hub
 * 5. EventDetector runs (conditional) → only when category === 'event'
 * 6. ContactEnricher runs (selective) → only for contacts needing enrichment
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Import individual analyzers
 * import {
 *   CategorizerAnalyzer,
 *   ActionExtractorAnalyzer,
 *   EventDetectorAnalyzer,
 *   DateExtractorAnalyzer,
 *   ContactEnricherAnalyzer,
 * } from '@/services/analyzers';
 *
 * // Import singleton instances
 * import {
 *   categorizer,
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
 * @version 1.2.0
 * @since January 2026 - Added DateExtractor, ContactEnricher, labels
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

// Action Extractor - extracts action details
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

  // Action extractor types
  ActionExtractionData,
  ActionExtractionResult,

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

  // Aggregated types
  AggregatedAnalysis,
  EmailProcessingResult,
} from './types';

// Re-export constants
export { EMAIL_LABELS, DATE_TYPES, RELATIONSHIP_TYPES } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export { toEmailInput, createFailedResult } from './types';
