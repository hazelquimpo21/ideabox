'use client';

import * as React from 'react';
import { Rss, Bookmark, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import type { NewsBriefResult } from '@/hooks/useEmailAnalysis';

const logger = createLogger('NewsBriefSection');

interface NewsBriefSectionProps {
  newsBrief: NewsBriefResult;
  emailId: string;
}

export const NewsBriefSection = React.memo(function NewsBriefSection({
  newsBrief,
  emailId,
}: NewsBriefSectionProps) {
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());

  const markSaved = React.useCallback((key: string) => {
    setSavedItems((prev: Set<string>) => new Set(prev).add(key));
  }, []);

  if (!newsBrief.newsItems || newsBrief.newsItems.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Rss}
      title="News Brief"
      subtitle={`(${newsBrief.newsItems.length} items)`}
      iconColor="text-emerald-500"
    >
      <div className="space-y-2 pl-6 mt-2">
        {newsBrief.newsItems.map((item, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{item.headline}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {item.topics.map((topic, i) => (
                  <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {topic}
                  </span>
                ))}
                {item.dateMentioned && (
                  <span className="text-xs text-muted-foreground">
                    {item.dateMentioned}
                  </span>
                )}
              </div>
            </div>
            {savedItems.has(`news-${index}`) ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Save news item"
                onClick={() => {
                  fetch('/api/news', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      headline: item.headline,
                      detail: item.detail,
                      topics: item.topics,
                      dateMentioned: item.dateMentioned,
                      confidence: item.confidence,
                      emailId,
                    }),
                  }).then(() => {
                    markSaved(`news-${index}`);
                    logger.info('News item saved from email detail', {
                      emailId: emailId.substring(0, 8),
                    });
                  }).catch(err => {
                    logger.error('Failed to save news item from detail', {
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
