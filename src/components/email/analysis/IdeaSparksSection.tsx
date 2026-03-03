'use client';

import * as React from 'react';
import { Lightbulb, Bookmark, CheckCircle2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getIdeaTypeLabel, getIdeaTypeStyle } from './helpers';
import type { IdeaSparkResult } from '@/hooks/useEmailAnalysis';

const logger = createLogger('IdeaSparksSection');

interface IdeaSparksSectionProps {
  ideaSparks: IdeaSparkResult;
  emailId: string;
}

export const IdeaSparksSection = React.memo(function IdeaSparksSection({
  ideaSparks,
  emailId,
}: IdeaSparksSectionProps) {
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());

  const markSaved = React.useCallback((key: string) => {
    setSavedItems((prev: Set<string>) => new Set(prev).add(key));
  }, []);

  if (!ideaSparks.ideas || ideaSparks.ideas.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Lightbulb}
      title="Idea Sparks"
      subtitle={`(${ideaSparks.ideas.length} ideas)`}
      iconColor="text-amber-500"
      defaultOpen
    >
      <div className="space-y-2 pl-6 mt-2">
        {ideaSparks.ideas.map((idea, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Badge variant="outline" className={cn('text-xs shrink-0 mt-0.5', getIdeaTypeStyle(idea.type))}>
              {getIdeaTypeLabel(idea.type)}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{idea.idea}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{idea.relevance}</p>
            </div>
            {savedItems.has(`idea-${index}`) ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Save idea"
                onClick={() => {
                  fetch('/api/ideas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      idea: idea.idea,
                      ideaType: idea.type,
                      relevance: idea.relevance,
                      confidence: idea.confidence,
                      emailId,
                    }),
                  }).then(() => {
                    markSaved(`idea-${index}`);
                    logger.info('Idea saved from email detail', {
                      emailId: emailId.substring(0, 8),
                      ideaType: idea.type,
                    });
                  }).catch(err => {
                    logger.error('Failed to save idea from detail', {
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
