/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * useEmailAnalysis Hook
 *
 * Fetches rich AI analysis data for a specific email from the email_analyses table.
 * Returns categorization, action extraction, client tagging, and other analysis results.
 *
 * @module hooks/useEmailAnalysis
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { EmailAnalysis } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('useEmailAnalysis');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categorization result from AI analyzer.
 */
export interface CategorizationResult {
  category: string;
  confidence: number;
  reasoning: string;
  topics?: string[];
}

/**
 * Action extraction result from AI analyzer.
 */
export interface ActionExtractionResult {
  hasAction: boolean;
  actionType: 'respond' | 'review' | 'create' | 'schedule' | 'decide' | 'none';
  actionTitle?: string;
  actionDescription?: string;
  urgencyScore?: number;
  deadline?: string;
  estimatedMinutes?: number;
  confidence: number;
}

/**
 * Client tagging result from AI analyzer.
 */
export interface ClientTaggingResult {
  clientMatch: boolean;
  clientId?: string;
  clientName?: string;
  projectName?: string;
  matchConfidence: number;
  newClientSuggestion?: string;
  relationshipSignal?: 'positive' | 'neutral' | 'negative' | 'unknown';
}

/**
 * Normalized analysis data structure.
 */
export interface NormalizedAnalysis {
  categorization?: CategorizationResult;
  actionExtraction?: ActionExtractionResult;
  clientTagging?: ClientTaggingResult;
  tokensUsed?: number;
  processingTimeMs?: number;
  analyzerVersion?: string;
  analyzedAt?: string;
}

/**
 * Return type from useEmailAnalysis hook.
 */
export interface UseEmailAnalysisReturn {
  analysis: NormalizedAnalysis | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalizes raw database JSONB into typed structures.
 */
function normalizeAnalysis(raw: EmailAnalysis): NormalizedAnalysis {
  const normalized: NormalizedAnalysis = {
    tokensUsed: raw.tokens_used ?? undefined,
    processingTimeMs: raw.processing_time_ms ?? undefined,
    analyzerVersion: raw.analyzer_version,
    analyzedAt: raw.created_at,
  };

  // Normalize categorization (handles both snake_case and camelCase from different analyzer versions)
  if (raw.categorization) {
    const cat = raw.categorization as Record<string, unknown>;
    normalized.categorization = {
      category: (cat.category as string) || 'unknown',
      confidence: (cat.confidence as number) || 0,
      reasoning: (cat.reasoning as string) || '',
      topics: cat.topics as string[] | undefined,
    };
  }

  // Normalize action extraction
  if (raw.action_extraction) {
    const action = raw.action_extraction as Record<string, unknown>;
    normalized.actionExtraction = {
      hasAction: (action.has_action as boolean) || (action.hasAction as boolean) || false,
      actionType: (action.action_type as string) || (action.actionType as string) || 'none',
      actionTitle: (action.action_title as string) || (action.actionTitle as string),
      actionDescription: (action.action_description as string) || (action.actionDescription as string),
      urgencyScore: (action.urgency_score as number) || (action.urgencyScore as number),
      deadline: (action.deadline as string),
      estimatedMinutes: (action.estimated_minutes as number) || (action.estimatedMinutes as number),
      confidence: (action.confidence as number) || 0,
    };
  }

  // Normalize client tagging
  if (raw.client_tagging) {
    const client = raw.client_tagging as Record<string, unknown>;
    normalized.clientTagging = {
      clientMatch: (client.client_match as boolean) || (client.clientMatch as boolean) || false,
      clientId: (client.client_id as string) || (client.clientId as string),
      clientName: (client.client_name as string) || (client.clientName as string),
      projectName: (client.project_name as string) || (client.projectName as string),
      matchConfidence: (client.match_confidence as number) || (client.matchConfidence as number) || 0,
      newClientSuggestion: (client.new_client_suggestion as string) || (client.newClientSuggestion as string),
      relationshipSignal: (client.relationship_signal as string) || (client.relationshipSignal as string) as 'positive' | 'neutral' | 'negative' | 'unknown' | undefined,
    };
  }

  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch email analysis data for a specific email.
 *
 * @param emailId - The email ID to fetch analysis for
 * @returns Analysis data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { analysis, isLoading, error } = useEmailAnalysis(emailId);
 *
 * if (analysis?.actionExtraction?.hasAction) {
 *   console.log('Action:', analysis.actionExtraction.actionTitle);
 * }
 * ```
 */
export function useEmailAnalysis(emailId: string | null): UseEmailAnalysisReturn {
  const [analysis, setAnalysis] = React.useState<NormalizedAnalysis | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchAnalysis = React.useCallback(async () => {
    if (!emailId) {
      setAnalysis(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    logger.debug('Fetching email analysis', { emailId });

    try {
      const { data, error: queryError } = await supabase
        .from('email_analyses')
        .select('*')
        .eq('email_id', emailId)
        .single();

      if (queryError) {
        // PGRST116 means no rows found - not an error, just no analysis yet
        if (queryError.code === 'PGRST116') {
          logger.debug('No analysis found for email', { emailId });
          setAnalysis(null);
          return;
        }
        throw new Error(queryError.message);
      }

      const normalized = normalizeAnalysis(data as EmailAnalysis);
      setAnalysis(normalized);

      logger.success('Analysis fetched', {
        emailId,
        hasAction: normalized.actionExtraction?.hasAction,
        category: normalized.categorization?.category,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch analysis', { emailId, error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, emailId]);

  // Fetch on mount and when emailId changes
  React.useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return {
    analysis,
    isLoading,
    error,
    refetch: fetchAnalysis,
  };
}

export default useEmailAnalysis;
