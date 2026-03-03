'use client';

import * as React from 'react';
import { Sparkles, Bookmark, CheckCircle2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import type { InsightExtractionResult } from '@/hooks/useEmailAnalysis';

const logger = createLogger('InsightsSection');

interface InsightsSectionProps {
  insightExtraction: InsightExtractionResult;
  emailId: string;
}

export const InsightsSection = React.memo(function InsightsSection({
  insightExtraction,
  emailId,
}: InsightsSectionProps) {
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());

  const markSaved = React.useCallback((key: string) => {
    setSavedItems((prev: Set<string>) => new Set(prev).add(key));
  }, []);

  if (!insightExtraction.insights || insightExtraction.insights.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Sparkles}
      title="Insights"
      subtitle={`(${insightExtraction.insights.length})`}
      iconColor="text-purple-500"
    >
      <div className="space-y-2 pl-6 mt-2">
        {insightExtraction.insights.map((item, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
              {item.type}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{item.insight}</p>
              {item.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.topics.map((topic, i) => (
                    <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {savedItems.has(`insight-${index}`) ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Save insight"
                onClick={() => {
                  fetch('/api/insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      insight: item.insight,
                      insightType: item.type,
                      topics: item.topics,
                      confidence: item.confidence,
                      emailId,
                    }),
                  }).then(() => {
                    markSaved(`insight-${index}`);
                    logger.info('Insight saved from email detail', {
                      emailId: emailId.substring(0, 8),
                      insightType: item.type,
                    });
                  }).catch(err => {
                    logger.error('Failed to save insight from detail', {
                      error: err instanceof Error ? err.message : 'Unknown error',
                    });
                  });
                }}
              >
                <Bookmark className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </CollapsibleAnalysisSection>
  );
});
