'use client';

import * as React from 'react';
import { Card, CardHeader, CardContent, Button, Skeleton } from '@/components/ui';
import { Brain, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { EventDetailsCard } from './EventDetailsCard';
import { ContentDigestSection } from './ContentDigestSection';
import { DateExtractionSection } from './DateExtractionSection';
import { SmartCaptureBar } from './SmartCaptureBar';
import {
  CategoriesSection,
  GoldenNuggetsSection,
  EmailStyleIdeasSection,
  ActionExtractionSection,
  ClientTaggingSection,
  IdeaSparksSection,
  InsightsSection,
  NewsBriefSection,
  MultiEventSection,
  AnalysisMetaInfo,
} from './analysis';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { ExtractedDate } from '@/hooks/useExtractedDates';
import type { Email } from '@/types/database';

export interface AnalysisSummaryProps {
  email: Email;
  onAnalyze?: (emailId: string) => Promise<void>;
  isAnalyzing?: boolean;
  analysis?: NormalizedAnalysis | null;
  isLoadingAnalysis?: boolean;
  extractedDates?: ExtractedDate[];
  refetchAnalysis?: () => Promise<void>;
}

export const AnalysisSummary = React.memo(function AnalysisSummary({
  email,
  onAnalyze,
  isAnalyzing,
  analysis,
  isLoadingAnalysis,
  extractedDates,
  refetchAnalysis,
}: AnalysisSummaryProps) {
  const handleAnalyze = React.useCallback(async () => {
    if (onAnalyze) {
      await onAnalyze(email.id);
      if (refetchAnalysis) await refetchAnalysis();
    }
  }, [onAnalyze, email.id, refetchAnalysis]);

  // ── Not analyzed yet ──────────────────────────────────────────────────
  if (!email.analyzed_at) {
    return (
      <Card className="mx-6 my-4 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Brain className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Analysis Pending</p>
                <p className="text-xs text-muted-foreground">
                  This email hasn&apos;t been analyzed yet
                </p>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Analyze Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoadingAnalysis) {
    return (
      <Card className="mx-6 my-4">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading Analysis...
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (email.analysis_error) {
    return (
      <Card className="mx-6 my-4 border-destructive/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-sm text-destructive">Analysis Failed</p>
                <p className="text-xs text-muted-foreground">{email.analysis_error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  // ── Populated analysis ────────────────────────────────────────────────
  const analysisCard = (
    <Card className="mx-6 my-4">
      <CardHeader className="py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            AI Analysis
          </div>
          {analysis.categorization?.confidence && (
            <span className="text-xs text-muted-foreground">
              {Math.round(analysis.categorization.confidence * 100)}% confident
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-1">
        {analysis.categorization && (
          <CategoriesSection
            categorization={analysis.categorization}
            emailCategory={email.category}
          />
        )}

        {analysis.contentDigest?.gist && (
          <ContentDigestSection
            digest={analysis.contentDigest}
            emailId={email.id}
            emailCategory={email.category}
          />
        )}

        {analysis.contentDigest?.goldenNuggets && analysis.contentDigest.goldenNuggets.length > 0 && (
          <GoldenNuggetsSection
            goldenNuggets={analysis.contentDigest.goldenNuggets}
            emailId={email.id}
          />
        )}

        {analysis.contentDigest?.emailStyleIdeas && analysis.contentDigest.emailStyleIdeas.length > 0 && (
          <EmailStyleIdeasSection
            emailStyleIdeas={analysis.contentDigest.emailStyleIdeas}
            emailId={email.id}
            senderName={email.sender_name || email.sender_email}
          />
        )}

        {analysis.actionExtraction && (
          <ActionExtractionSection
            actionExtraction={analysis.actionExtraction}
          />
        )}

        {analysis.clientTagging && (
          <ClientTaggingSection
            clientTagging={analysis.clientTagging}
          />
        )}

        {analysis.ideaSparks?.hasIdeas && analysis.ideaSparks.ideas.length > 0 && (
          <IdeaSparksSection
            ideaSparks={analysis.ideaSparks}
            emailId={email.id}
          />
        )}

        {analysis.insightExtraction?.hasInsights && analysis.insightExtraction.insights.length > 0 && (
          <InsightsSection
            insightExtraction={analysis.insightExtraction}
            emailId={email.id}
          />
        )}

        {analysis.newsBrief?.hasNews && analysis.newsBrief.newsItems.length > 0 && (
          <NewsBriefSection
            newsBrief={analysis.newsBrief}
            emailId={email.id}
          />
        )}

        {((extractedDates && extractedDates.length > 0) || analysis.dateExtraction) && (
          <DateExtractionSection
            extraction={analysis.dateExtraction}
            dates={extractedDates && extractedDates.length > 0 ? extractedDates.map(d => ({
              dateType: d.date_type || 'other',
              date: d.date,
              time: d.event_time || undefined,
              endDate: (d as unknown as Record<string, unknown>).end_date as string || undefined,
              endTime: (d as unknown as Record<string, unknown>).end_time as string || undefined,
              title: d.title,
              description: d.description || undefined,
              relatedEntity: (d as unknown as Record<string, unknown>).related_entity as string || undefined,
              isRecurring: d.is_recurring || false,
              recurrencePattern: d.recurrence_pattern || undefined,
              confidence: d.confidence || 0.5,
            })) : undefined}
          />
        )}

        {analysis.multiEventDetection?.hasMultipleEvents && analysis.multiEventDetection.events.length > 0 && (
          <MultiEventSection
            multiEventDetection={analysis.multiEventDetection}
          />
        )}

        <SmartCaptureBar
          emailId={email.id}
          emailSubject={email.subject || undefined}
          emailGist={email.gist || email.snippet || undefined}
          actionExtraction={analysis.actionExtraction}
          ideaSparks={analysis.ideaSparks}
          contactId={analysis.clientTagging?.clientId}
        />

        <AnalysisMetaInfo
          tokensUsed={analysis.tokensUsed}
          processingTimeMs={analysis.processingTimeMs}
          analyzerVersion={analysis.analyzerVersion}
        />
      </CardContent>
    </Card>
  );

  if (analysis.eventDetection?.hasEvent) {
    return (
      <>
        {analysisCard}
        <EventDetailsCard
          event={analysis.eventDetection}
          emailSubject={email.subject || undefined}
          description={email.snippet || undefined}
        />
      </>
    );
  }

  return analysisCard;
});
