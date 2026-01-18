/**
 * AI Analyzers Module
 *
 * Re-exports all analyzer classes and utilities for convenient importing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE ANALYZERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. CategorizerAnalyzer - Classifies emails by action needed
 * 2. ActionExtractorAnalyzer - Extracts action details from emails
 * 3. ClientTaggerAnalyzer - Links emails to known clients
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Import individual analyzers
 * import { CategorizerAnalyzer, ActionExtractorAnalyzer } from '@/services/analyzers';
 *
 * // Import singleton instances
 * import { categorizer, actionExtractor, clientTagger } from '@/services/analyzers';
 *
 * // Import types
 * import type {
 *   CategorizationResult,
 *   ActionExtractionResult,
 *   EmailInput,
 * } from '@/services/analyzers';
 *
 * // Import base class for custom analyzers
 * import { BaseAnalyzer, ANALYZER_VERSION } from '@/services/analyzers';
 * ```
 *
 * @module services/analyzers
 * @version 1.0.0
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

  // Aggregated types
  AggregatedAnalysis,
  EmailProcessingResult,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export { toEmailInput, createFailedResult } from './types';
