'use client';

import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Zap, ChevronDown } from 'lucide-react';
import { SmartCaptureBar } from './SmartCaptureBar';
import { CollapsibleAnalysisSection } from './CollapsibleAnalysisSection';
import {
  EmailStyleIdeasSection,
  ClientTaggingSection,
  IdeaSparksSection,
  InsightsSection,
  MultiEventSection,
  AnalysisMetaInfo,
} from './analysis';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { Email } from '@/types/database';

/**
 * Tier-2 deep-dive analysis sections.
 *
 * Rendered below the collapsible email body. The tier-1 content (gist, key
 * points, actions, nuggets, dates, events, news) is handled by AIDigestView.
 *
 * This component only renders when analysis data is available — the "not
 * analyzed" / loading / error states are handled by AIDigestView.
 */
export interface AnalysisSummaryProps {
  email: Email;
  analysis: NormalizedAnalysis;
}

export const AnalysisSummary = React.memo(function AnalysisSummary({
  email,
  analysis,
}: AnalysisSummaryProps) {
  const [captureExpanded, setCaptureExpanded] = React.useState(false);
  const captureEverOpened = React.useRef(false);
  const handleCaptureToggle = React.useCallback((isOpen: boolean) => {
    setCaptureExpanded(isOpen);
    if (isOpen) captureEverOpened.current = true;
  }, []);

  // Check if there are any tier-2 sections to show
  const hasStyleIdeas = analysis.contentDigest?.emailStyleIdeas &&
    analysis.contentDigest.emailStyleIdeas.length > 0;
  const hasClientTagging = !!analysis.clientTagging;
  const hasIdeaSparks = analysis.ideaSparks?.hasIdeas && analysis.ideaSparks.ideas.length > 0;
  const hasInsights = analysis.insightExtraction?.hasInsights && analysis.insightExtraction.insights.length > 0;
  const hasMultiEvent = analysis.multiEventDetection?.hasMultipleEvents && analysis.multiEventDetection.events.length > 0;
  const hasSmartCapture = analysis.actionExtraction || analysis.ideaSparks;
  const hasMeta = analysis.tokensUsed || analysis.processingTimeMs || analysis.analyzerVersion;

  const hasAnything = hasStyleIdeas || hasClientTagging ||
    hasIdeaSparks || hasInsights || hasMultiEvent || hasSmartCapture || hasMeta;

  if (!hasAnything) return null;

  return (
    <Card className="mx-6 my-4">
      <CardHeader className="py-3 border-b">
        <DeepDiveHeader />
      </CardHeader>
      <CardContent className="pt-4 space-y-0">
        {hasStyleIdeas && (
          <EmailStyleIdeasSection
            emailStyleIdeas={analysis.contentDigest!.emailStyleIdeas!}
            emailId={email.id}
            senderName={email.sender_name || email.sender_email}
          />
        )}

        {hasClientTagging && (
          <ClientTaggingSection
            clientTagging={analysis.clientTagging!}
          />
        )}

        {hasIdeaSparks && (
          <IdeaSparksSection
            ideaSparks={analysis.ideaSparks!}
            emailId={email.id}
          />
        )}

        {hasInsights && (
          <InsightsSection
            insightExtraction={analysis.insightExtraction!}
            emailId={email.id}
          />
        )}

        {hasMultiEvent && (
          <MultiEventSection
            multiEventDetection={analysis.multiEventDetection!}
          />
        )}

        {hasSmartCapture && (
          <CollapsibleAnalysisSection
            icon={Zap}
            title="Quick Capture"
            subtitle="Save actions & ideas to board"
            iconColor="text-orange-500"
            onToggle={handleCaptureToggle}
          >
            {captureEverOpened.current && (
              <SmartCaptureBar
                emailId={email.id}
                emailSubject={email.subject || undefined}
                emailGist={email.gist || email.snippet || undefined}
                actionExtraction={analysis.actionExtraction}
                ideaSparks={analysis.ideaSparks}
                contactId={analysis.clientTagging?.clientId}
              />
            )}
          </CollapsibleAnalysisSection>
        )}

        {hasMeta && (
          <AnalysisMetaInfo
            tokensUsed={analysis.tokensUsed}
            processingTimeMs={analysis.processingTimeMs}
            analyzerVersion={analysis.analyzerVersion}
          />
        )}
      </CardContent>
    </Card>
  );
});

/** Simple header for the deep-dive card */
function DeepDiveHeader() {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <ChevronDown className="h-4 w-4" />
      Deep Dive
    </div>
  );
}
