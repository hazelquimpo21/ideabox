/**
 * AI Analyzers Module
 *
 * Re-exports all analyzer classes and utilities for convenient importing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE ANALYZERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. CategorizerAnalyzer - Classifies emails by action needed + summary + quickAction
 * 2. ActionExtractorAnalyzer - Extracts action details from emails
 * 3. ClientTaggerAnalyzer - Links emails to known clients
 * 4. EventDetectorAnalyzer - Extracts rich event details (runs only for event category)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ANALYZER EXECUTION FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Categorizer runs first (always) → determines category, summary, quickAction
 * 2. ActionExtractor runs (always) → extracts detailed action info
 * 3. ClientTagger runs (always) → links to known clients
 * 4. EventDetector runs (conditional) → only when category === 'event'
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
 * } from '@/services/analyzers';
 *
 * // Import singleton instances
 * import {
 *   categorizer,
 *   actionExtractor,
 *   clientTagger,
 *   eventDetector,
 * } from '@/services/analyzers';
 *
 * // Import types
 * import type {
 *   CategorizationResult,
 *   ActionExtractionResult,
 *   EventDetectionResult,
 *   EmailInput,
 *   QuickAction,
 * } from '@/services/analyzers';
 *
 * // Import base class for custom analyzers
 * import { BaseAnalyzer, ANALYZER_VERSION } from '@/services/analyzers';
 * ```
 *
 * @module services/analyzers
 * @version 1.1.0
 * @since January 2026 - Added EventDetector, summary, quickAction
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

  // Aggregated types
  AggregatedAnalysis,
  EmailProcessingResult,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export { toEmailInput, createFailedResult } from './types';
