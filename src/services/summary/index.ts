/**
 * Summary Service Module
 *
 * AI-synthesized email summaries — generates on-demand when stale + new data.
 *
 * @module services/summary
 * @since February 2026
 */

export {
  generateSummary,
  getLatestSummaryWithState,
  markSummaryStale,
} from './summary-generator';

export type {
  EmailSummary,
  UserSummaryState,
  SummaryResult,
  SummarySection,
  SummaryItem,
  SummaryStats,
  SummaryEmailRef,
  SummaryEmailIndex,
  SummaryLatestResponse,
  SummaryGenerateResponse,
  GenerateSummaryResult,
} from './types';
