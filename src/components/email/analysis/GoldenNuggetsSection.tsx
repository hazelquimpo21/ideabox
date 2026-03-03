'use client';

import * as React from 'react';
import { Gem, Bookmark, CheckCircle2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getNuggetBadgeColor } from './helpers';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';

const logger = createLogger('GoldenNuggetsSection');

interface GoldenNuggetsSectionProps {
  goldenNuggets: NonNullable<NormalizedAnalysis['contentDigest']>['goldenNuggets'];
  emailId: string;
}

export const GoldenNuggetsSection = React.memo(function GoldenNuggetsSection({
  goldenNuggets,
  emailId,
}: GoldenNuggetsSectionProps) {
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());

  const markSaved = React.useCallback((key: string) => {
    setSavedItems((prev: Set<string>) => new Set(prev).add(key));
  }, []);

  if (!goldenNuggets || goldenNuggets.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Gem}
      title="Worth Remembering"
      subtitle={`${goldenNuggets.length} nugget${goldenNuggets.length !== 1 ? 's' : ''}`}
      iconColor="text-yellow-500"
      defaultOpen
    >
      <div className="space-y-1.5 pl-6 mt-2">
        {goldenNuggets.map((nugget, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5', getNuggetBadgeColor(nugget.type))}>
              {nugget.type.replace(/_/g, ' ')}
            </Badge>
            <p className="text-sm leading-snug flex-1">{nugget.nugget}</p>
            {savedItems.has(`nugget-${index}`) ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Save nugget"
                onClick={() => {
                  const nuggetTypeToIdeaType: Record<string, string> = {
                    deal: 'business',
                    tip: 'learning',
                    quote: 'content_creation',
                    stat: 'business',
                    recommendation: 'learning',
                    remember_this: 'business',
                    sales_opportunity: 'business',
                  };
                  fetch('/api/ideas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      idea: nugget.nugget,
                      ideaType: nuggetTypeToIdeaType[nugget.type] || 'business',
                      relevance: `Extracted ${nugget.type.replace(/_/g, ' ')} from email`,
                      confidence: 0.8,
                      emailId,
                    }),
                  }).then(() => {
                    markSaved(`nugget-${index}`);
                    logger.info('Golden nugget saved', { emailId: emailId.substring(0, 8), type: nugget.type });
                  }).catch(err => {
                    logger.error('Failed to save nugget', { error: err instanceof Error ? err.message : 'Unknown error' });
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
