/**
 * Sync Services Barrel Export
 *
 * Exports all sync-related services for clean imports.
 *
 * @module services/sync
 *
 * @example
 * ```typescript
 * import {
 *   EmailPreFilterService,
 *   SenderPatternService,
 *   ActionSuggesterService,
 *   DiscoveryBuilderService,
 *   InitialSyncOrchestrator,
 * } from '@/services/sync';
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Services
// ─────────────────────────────────────────────────────────────────────────────

export {
  EmailPreFilterService,
  createEmailPreFilter,
  type PreFilterStats,
} from './email-prefilter';

export {
  SenderPatternService,
  createSenderPatternService,
  type LearningObservation,
} from './sender-patterns';

export {
  ActionSuggesterService,
  createActionSuggester,
  type ActionSuggesterInput,
} from './action-suggester';

export {
  DiscoveryBuilderService,
  createDiscoveryBuilder,
  type DiscoveryBuilderInput,
  type AnalyzedEmail,
} from './discovery-builder';

export {
  InitialSyncOrchestrator,
  createInitialSyncOrchestrator,
  type InitialSyncOrchestratorConfig,
} from './initial-sync-orchestrator';

export {
  HistoricalSyncService,
  createHistoricalSyncService,
} from './historical-sync-service';
