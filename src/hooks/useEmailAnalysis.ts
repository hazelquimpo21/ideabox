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
 * ENHANCED (Feb 2026): Added summary, quickAction, signalStrength, replyWorthiness, labels.
 */
export interface CategorizationResult {
  category: string;
  confidence: number;
  reasoning: string;
  topics?: string[];
  summary?: string;
  quickAction?: string;
  signalStrength?: 'high' | 'medium' | 'low' | 'noise';
  replyWorthiness?: 'must_reply' | 'should_reply' | 'optional_reply' | 'no_reply';
  labels?: string[];
}

/**
 * A single action item from multi-action extraction (NEW Feb 2026).
 */
export interface ActionItem {
  type: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: number;
  estimatedMinutes?: number;
  sourceLine?: string;
  confidence: number;
}

/**
 * Action extraction result from AI analyzer.
 * ENHANCED (Feb 2026): Supports multi-action `actions[]` array alongside legacy single-action fields.
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
  actions?: ActionItem[];
  primaryActionIndex?: number;
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
 * Event detection result from AI analyzer.
 * Present when email has the `has_event` label (since Jan 2026, events are
 * no longer a primary category but detected via labels).
 *
 * ENHANCED (Jan 2026): Added locality, multi-day support, and key date detection.
 */
export interface EventDetectionResult {
  hasEvent: boolean;
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  eventEndTime?: string;
  /** End date for multi-day events (NEW Jan 2026) */
  eventEndDate?: string;
  locationType: 'in_person' | 'virtual' | 'hybrid' | 'unknown';
  /** Event locality relative to user (NEW Jan 2026) */
  eventLocality?: 'local' | 'out_of_town' | 'virtual' | null;
  location?: string;
  registrationDeadline?: string;
  rsvpRequired: boolean;
  rsvpUrl?: string;
  organizer?: string;
  cost?: string;
  additionalDetails?: string;
  /** One-sentence assistant-style summary of the event */
  eventSummary?: string;
  /** 2-4 key bullet points about the event */
  keyPoints?: string[];
  /** Whether this is a key date vs full event (NEW Jan 2026) */
  isKeyDate?: boolean;
  /** Type of key date if isKeyDate is true (NEW Jan 2026) */
  keyDateType?: 'registration_deadline' | 'open_house' | 'deadline' | 'release_date' | 'other';
  confidence: number;
}

/**
 * Idea spark result from the IdeaSpark analyzer (NEW Feb 2026).
 * Contains 3 creative ideas generated from email content + user context.
 */
export interface IdeaSparkResult {
  hasIdeas: boolean;
  ideas: {
    idea: string;
    type: string;
    relevance: string;
    confidence: number;
  }[];
  confidence: number;
}

/**
 * Insight extraction result from the InsightExtractor analyzer (NEW Feb 2026).
 * Synthesizes interesting ideas, tips, frameworks from newsletter/substantive content.
 */
export interface InsightExtractionResult {
  hasInsights: boolean;
  insights: {
    insight: string;
    type: string;
    topics: string[];
    confidence: number;
  }[];
  confidence: number;
}

/**
 * News brief result from the NewsBrief analyzer (NEW Feb 2026).
 * Extracts factual news items — what happened, what launched, what changed.
 */
export interface NewsBriefResult {
  hasNews: boolean;
  newsItems: {
    headline: string;
    detail: string;
    topics: string[];
    dateMentioned?: string;
    confidence: number;
  }[];
  confidence: number;
}

/**
 * Content digest result from the ContentDigest analyzer.
 * Provides gist, key points, and extracted links for quick scanning.
 */
export interface ContentDigestResult {
  gist: string;
  keyPoints: { point: string; relevance?: string }[];
  links: {
    url: string;
    type: string;
    title: string;
    description: string;
    isMainContent: boolean;
  }[];
  contentType: string;
  topicsHighlighted?: string[];
  confidence: number;
}

/**
 * Date extraction result from the DateExtractor analyzer.
 * Identifies dates, deadlines, and time-sensitive items embedded in emails.
 */
export interface DateExtractionResult {
  hasDates: boolean;
  dates: {
    dateType: string;
    date: string;
    time?: string;
    endDate?: string;
    endTime?: string;
    title: string;
    description?: string;
    relatedEntity?: string;
    isRecurring: boolean;
    recurrencePattern?: string;
    confidence: number;
  }[];
  confidence: number;
}

/**
 * Multi-event detection result from the MultiEventDetector analyzer.
 * Handles emails containing multiple events (e.g., event roundup newsletters).
 */
export interface MultiEventDetectionResult {
  hasMultipleEvents: boolean;
  eventCount: number;
  events: EventDetectionResult[];
  sourceDescription?: string;
  confidence: number;
}

/**
 * Normalized analysis data structure.
 */
export interface NormalizedAnalysis {
  categorization?: CategorizationResult;
  contentDigest?: ContentDigestResult;
  actionExtraction?: ActionExtractionResult;
  clientTagging?: ClientTaggingResult;
  eventDetection?: EventDetectionResult;
  multiEventDetection?: MultiEventDetectionResult;
  dateExtraction?: DateExtractionResult;
  ideaSparks?: IdeaSparkResult;
  insightExtraction?: InsightExtractionResult;
  newsBrief?: NewsBriefResult;
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
      summary: (cat.summary as string) || undefined,
      quickAction: (cat.quick_action as string) || (cat.quickAction as string) || undefined,
      signalStrength: ((cat.signal_strength as string) || (cat.signalStrength as string) || undefined) as CategorizationResult['signalStrength'],
      replyWorthiness: ((cat.reply_worthiness as string) || (cat.replyWorthiness as string) || undefined) as CategorizationResult['replyWorthiness'],
      labels: (cat.labels as string[]) || undefined,
    };
  }

  // Normalize action extraction (enhanced multi-action support)
  if (raw.action_extraction) {
    const action = raw.action_extraction as Record<string, unknown>;
    const rawActions = (action.actions as Array<Record<string, unknown>>) || [];
    normalized.actionExtraction = {
      hasAction: (action.has_action as boolean) || (action.hasAction as boolean) || false,
      actionType: (action.action_type as string) || (action.actionType as string) || 'none',
      actionTitle: (action.action_title as string) || (action.actionTitle as string),
      actionDescription: (action.action_description as string) || (action.actionDescription as string),
      urgencyScore: (action.urgency_score as number) || (action.urgencyScore as number),
      deadline: (action.deadline as string),
      estimatedMinutes: (action.estimated_minutes as number) || (action.estimatedMinutes as number),
      confidence: (action.confidence as number) || 0,
      primaryActionIndex: (action.primary_action_index as number) ?? (action.primaryActionIndex as number) ?? undefined,
      actions: rawActions.length > 0 ? rawActions.map(a => ({
        type: (a.type as string) || 'none',
        title: (a.title as string) || '',
        description: (a.description as string) || undefined,
        deadline: (a.deadline as string) || undefined,
        priority: (a.priority as number) || 1,
        estimatedMinutes: (a.estimated_minutes as number) || (a.estimatedMinutes as number) || undefined,
        sourceLine: (a.source_line as string) || (a.sourceLine as string) || undefined,
        confidence: (a.confidence as number) || 0.5,
      })) : undefined,
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

  // Normalize event detection (only present for event-categorized emails)
  if (raw.event_detection) {
    const event = raw.event_detection as Record<string, unknown>;
    normalized.eventDetection = {
      hasEvent: (event.has_event as boolean) || (event.hasEvent as boolean) || false,
      eventTitle: (event.event_title as string) || (event.eventTitle as string) || 'Untitled Event',
      eventDate: (event.event_date as string) || (event.eventDate as string) || '',
      eventTime: (event.event_time as string) || (event.eventTime as string),
      eventEndTime: (event.event_end_time as string) || (event.eventEndTime as string),
      locationType: ((event.location_type as string) || (event.locationType as string) || 'unknown') as 'in_person' | 'virtual' | 'hybrid' | 'unknown',
      location: (event.location as string),
      registrationDeadline: (event.registration_deadline as string) || (event.registrationDeadline as string),
      rsvpRequired: (event.rsvp_required as boolean) || (event.rsvpRequired as boolean) || false,
      rsvpUrl: (event.rsvp_url as string) || (event.rsvpUrl as string),
      organizer: (event.organizer as string),
      cost: (event.cost as string),
      additionalDetails: (event.additional_details as string) || (event.additionalDetails as string),
      // Assistant-style summary and key points (NEW Jan 2026)
      eventSummary: (event.event_summary as string) || (event.eventSummary as string),
      keyPoints: (event.key_points as string[]) || (event.keyPoints as string[]),
      confidence: (event.confidence as number) || 0,
    };
    logger.debug('Normalized event detection data', {
      eventTitle: normalized.eventDetection.eventTitle,
      eventDate: normalized.eventDetection.eventDate,
      locationType: normalized.eventDetection.locationType,
      hasEventSummary: !!normalized.eventDetection.eventSummary,
      keyPointsCount: normalized.eventDetection.keyPoints?.length || 0,
    });
  }

  // Normalize content digest
  if (raw.contentDigest || (raw as Record<string, unknown>).content_digest) {
    const digest = (raw.contentDigest || (raw as Record<string, unknown>).content_digest) as Record<string, unknown>;
    const rawKeyPoints = (digest.key_points as Array<Record<string, unknown>>) || (digest.keyPoints as Array<Record<string, unknown>>) || [];
    const rawLinks = (digest.links as Array<Record<string, unknown>>) || [];
    normalized.contentDigest = {
      gist: (digest.gist as string) || '',
      keyPoints: rawKeyPoints.map(kp => ({
        point: (kp.point as string) || '',
        relevance: (kp.relevance as string) || undefined,
      })),
      links: rawLinks.map(link => ({
        url: (link.url as string) || '',
        type: (link.type as string) || 'other',
        title: (link.title as string) || '',
        description: (link.description as string) || '',
        isMainContent: (link.is_main_content as boolean) || (link.isMainContent as boolean) || false,
      })),
      contentType: (digest.content_type as string) || (digest.contentType as string) || 'single_topic',
      topicsHighlighted: (digest.topics_highlighted as string[]) || (digest.topicsHighlighted as string[]) || undefined,
      confidence: (digest.confidence as number) || 0,
    };
  }

  // Normalize date extraction
  if (raw.date_extraction || (raw as Record<string, unknown>).dateExtraction) {
    const extraction = (raw.date_extraction || (raw as Record<string, unknown>).dateExtraction) as Record<string, unknown>;
    const rawDates = (extraction.dates as Array<Record<string, unknown>>) || [];
    normalized.dateExtraction = {
      hasDates: (extraction.has_dates as boolean) || (extraction.hasDates as boolean) || false,
      dates: rawDates.map(d => ({
        dateType: (d.date_type as string) || (d.dateType as string) || 'other',
        date: (d.date as string) || '',
        time: (d.time as string) || undefined,
        endDate: (d.end_date as string) || (d.endDate as string) || undefined,
        endTime: (d.end_time as string) || (d.endTime as string) || undefined,
        title: (d.title as string) || '',
        description: (d.description as string) || undefined,
        relatedEntity: (d.related_entity as string) || (d.relatedEntity as string) || undefined,
        isRecurring: (d.is_recurring as boolean) || (d.isRecurring as boolean) || false,
        recurrencePattern: (d.recurrence_pattern as string) || (d.recurrencePattern as string) || undefined,
        confidence: (d.confidence as number) || 0.5,
      })),
      confidence: (extraction.confidence as number) || 0,
    };
  }

  // Normalize multi-event detection
  if (raw.multi_event_detection || (raw as Record<string, unknown>).multiEventDetection) {
    const multi = (raw.multi_event_detection || (raw as Record<string, unknown>).multiEventDetection) as Record<string, unknown>;
    const rawEvents = (multi.events as Array<Record<string, unknown>>) || [];
    normalized.multiEventDetection = {
      hasMultipleEvents: (multi.has_multiple_events as boolean) || (multi.hasMultipleEvents as boolean) || false,
      eventCount: (multi.event_count as number) || (multi.eventCount as number) || rawEvents.length,
      events: rawEvents.map(event => ({
        hasEvent: true,
        eventTitle: (event.event_title as string) || (event.eventTitle as string) || 'Untitled Event',
        eventDate: (event.event_date as string) || (event.eventDate as string) || '',
        eventTime: (event.event_time as string) || (event.eventTime as string),
        eventEndTime: (event.event_end_time as string) || (event.eventEndTime as string),
        locationType: ((event.location_type as string) || (event.locationType as string) || 'unknown') as EventDetectionResult['locationType'],
        location: (event.location as string),
        rsvpRequired: (event.rsvp_required as boolean) || (event.rsvpRequired as boolean) || false,
        rsvpUrl: (event.rsvp_url as string) || (event.rsvpUrl as string),
        organizer: (event.organizer as string),
        cost: (event.cost as string),
        confidence: (event.confidence as number) || 0.5,
      })),
      sourceDescription: (multi.source_description as string) || (multi.sourceDescription as string) || undefined,
      confidence: (multi.confidence as number) || 0,
    };
  }

  // Normalize idea sparks (NEW Feb 2026)
  if (raw.idea_sparks) {
    const sparks = raw.idea_sparks as Record<string, unknown>;
    const rawIdeas = (sparks.ideas as Array<Record<string, unknown>>) || [];
    normalized.ideaSparks = {
      hasIdeas: (sparks.has_ideas as boolean) || (sparks.hasIdeas as boolean) || false,
      ideas: rawIdeas.map(idea => ({
        idea: (idea.idea as string) || '',
        type: (idea.type as string) || 'personal_growth',
        relevance: (idea.relevance as string) || '',
        confidence: (idea.confidence as number) || 0.5,
      })),
      confidence: (sparks.confidence as number) || 0,
    };
    logger.debug('Normalized idea sparks data', {
      hasIdeas: normalized.ideaSparks.hasIdeas,
      ideaCount: normalized.ideaSparks.ideas.length,
      confidence: normalized.ideaSparks.confidence,
    });
  }

  // Normalize insight extraction (NEW Feb 2026)
  if (raw.insight_extraction) {
    const extraction = raw.insight_extraction as Record<string, unknown>;
    const rawInsights = (extraction.insights as Array<Record<string, unknown>>) || [];
    normalized.insightExtraction = {
      hasInsights: (extraction.has_insights as boolean) || (extraction.hasInsights as boolean) || false,
      insights: rawInsights.map(item => ({
        insight: (item.insight as string) || '',
        type: (item.type as string) || 'observation',
        topics: (item.topics as string[]) || [],
        confidence: (item.confidence as number) || 0.5,
      })),
      confidence: (extraction.confidence as number) || 0,
    };
    logger.debug('Normalized insight extraction data', {
      hasInsights: normalized.insightExtraction.hasInsights,
      insightCount: normalized.insightExtraction.insights.length,
      confidence: normalized.insightExtraction.confidence,
    });
  }

  // Normalize news brief (NEW Feb 2026)
  if (raw.news_brief) {
    const brief = raw.news_brief as Record<string, unknown>;
    const rawItems = (brief.news_items as Array<Record<string, unknown>>) || (brief.newsItems as Array<Record<string, unknown>>) || [];
    normalized.newsBrief = {
      hasNews: (brief.has_news as boolean) || (brief.hasNews as boolean) || false,
      newsItems: rawItems.map(item => ({
        headline: (item.headline as string) || '',
        detail: (item.detail as string) || '',
        topics: (item.topics as string[]) || [],
        dateMentioned: (item.date_mentioned as string) || (item.dateMentioned as string),
        confidence: (item.confidence as number) || 0.5,
      })),
      confidence: (brief.confidence as number) || 0,
    };
    logger.debug('Normalized news brief data', {
      hasNews: normalized.newsBrief.hasNews,
      newsItemCount: normalized.newsBrief.newsItems.length,
      confidence: normalized.newsBrief.confidence,
    });
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
        .maybeSingle();

      if (queryError) {
        throw new Error(queryError.message);
      }

      if (!data) {
        logger.debug('No analysis found for email', { emailId });
        setAnalysis(null);
        return;
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
