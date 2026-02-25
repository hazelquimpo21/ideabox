/**
 * Services Module
 *
 * Central export point for all IdeaBox services.
 * Includes AI analyzers and email processors.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICE CATEGORIES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Analyzers - AI-powered email analysis
 *    - CategorizerAnalyzer: Classifies emails by action needed
 *    - ActionExtractorAnalyzer: Extracts action details
 *    - ClientTaggerAnalyzer: Links emails to clients
 *
 * 2. Processors - Email processing orchestration
 *    - EmailProcessor: Processes single emails
 *    - BatchProcessor: Processes multiple emails efficiently
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Import everything
 * import * as services from '@/services';
 *
 * // Import specific items
 * import {
 *   emailProcessor,
 *   batchProcessor,
 *   categorizer,
 *   actionExtractor,
 *   clientTagger,
 * } from '@/services';
 *
 * // Import types
 * import type {
 *   CategorizationResult,
 *   BatchResult,
 *   EmailProcessingResult,
 * } from '@/services';
 * ```
 *
 * @module services
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZERS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export all analyzer classes, instances, and types
export * from './analyzers';

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSORS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export all processor classes, instances, and types
export * from './processors';

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export all sync services for initial batch analysis and discovery
export * from './sync';

// ═══════════════════════════════════════════════════════════════════════════════
// HUB SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export Hub priority scoring services
export * from './hub';

// ═══════════════════════════════════════════════════════════════════════════════
// USER CONTEXT SERVICES (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export user context service for personalized AI analysis
export * from './user-context';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT SERVICES (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export contact management service
// Handles contact creation from emails, Google import, VIP suggestions, and aliases
export * from './contacts';

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY SERVICES (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export email summary generation service
// AI-synthesized narrative digests, generated on-demand when stale
export * from './summary';
