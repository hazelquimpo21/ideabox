'use client';

import * as React from 'react';
import { Palette, Bookmark, CheckCircle2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';

const logger = createLogger('EmailStyleIdeasSection');

interface EmailStyleIdeasSectionProps {
  emailStyleIdeas: NonNullable<NormalizedAnalysis['contentDigest']>['emailStyleIdeas'];
  emailId: string;
  senderName: string;
}

export const EmailStyleIdeasSection = React.memo(function EmailStyleIdeasSection({
  emailStyleIdeas,
  emailId,
  senderName,
}: EmailStyleIdeasSectionProps) {
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());

  const markSaved = React.useCallback((key: string) => {
    setSavedItems((prev: Set<string>) => new Set(prev).add(key));
  }, []);

  if (!emailStyleIdeas || emailStyleIdeas.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Palette}
      title="Email Style Ideas"
      iconColor="text-pink-500"
    >
      <div className="space-y-2 pl-6 mt-2">
        {emailStyleIdeas.map((style, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5 bg-pink-50 text-pink-600 border-pink-200">
              {style.type.replace(/_/g, ' ')}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{style.idea}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{style.whyItWorks}</p>
            </div>
            {savedItems.has(`style-${index}`) ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Save email style idea"
                onClick={() => {
                  fetch('/api/ideas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      idea: `${style.idea} — ${style.whyItWorks}`,
                      ideaType: 'content_creation',
                      relevance: `Email style idea (${style.type.replace(/_/g, ' ')}) from ${senderName}`,
                      confidence: style.confidence,
                      emailId,
                    }),
                  }).then(() => {
                    markSaved(`style-${index}`);
                    logger.info('Email style idea saved', { emailId: emailId.substring(0, 8), type: style.type });
                  }).catch(err => {
                    logger.error('Failed to save style idea', { error: err instanceof Error ? err.message : 'Unknown error' });
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
