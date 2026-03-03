'use client';

import * as React from 'react';
import { Signal, Reply } from 'lucide-react';
import { Badge } from '@/components/ui';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getCategoryBadge, getSignalBadge, getReplyBadge } from './helpers';
import type { CategorizationResult } from '@/hooks/useEmailAnalysis';
import type { EmailCategory } from '@/types/database';

interface CategoriesSectionProps {
  categorization: CategorizationResult;
  emailCategory: EmailCategory | null;
}

export const CategoriesSection = React.memo(function CategoriesSection({
  categorization,
  emailCategory,
}: CategoriesSectionProps) {
  const categoryBadge = getCategoryBadge(emailCategory);

  return (
    <CollapsibleAnalysisSection
      icon={Signal}
      title="Category & Signals"
      iconColor="text-blue-500"
      defaultOpen
    >
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium">Category:</span>
          <Badge variant={categoryBadge.variant} className="gap-1">
            {categoryBadge.icon}
            {emailCategory?.replace('_', ' ')}
          </Badge>
          {categorization.additionalCategories && categorization.additionalCategories.length > 0 && (
            categorization.additionalCategories.map((addCat, i) => (
              <Badge key={i} variant="outline" className="gap-1 text-[10px] border-dashed">
                {getCategoryBadge(addCat as EmailCategory).icon}
                {addCat.replace(/_/g, ' ')}
              </Badge>
            ))
          )}
          {categorization.signalStrength && (
            <Badge variant="outline" className={`text-[10px] gap-1 ${getSignalBadge(categorization.signalStrength).className}`}>
              <Signal className="h-3 w-3" />
              {getSignalBadge(categorization.signalStrength).label}
            </Badge>
          )}
          {categorization.replyWorthiness && categorization.replyWorthiness !== 'no_reply' && (
            <Badge variant="outline" className={`text-[10px] gap-1 ${getReplyBadge(categorization.replyWorthiness).className}`}>
              <Reply className="h-3 w-3" />
              {getReplyBadge(categorization.replyWorthiness).label}
            </Badge>
          )}
          {categorization.quickAction && categorization.quickAction !== 'none' && (
            <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200">
              {categorization.quickAction.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
        {categorization.summary && (
          <p className="text-sm font-medium mt-2 mb-1 border-l-2 border-blue-300 pl-3">
            {categorization.summary}
          </p>
        )}
        {categorization.reasoning && (
          <p className="text-sm text-muted-foreground mt-1 border-l-2 border-muted pl-3">
            {categorization.reasoning}
          </p>
        )}
        {categorization.labels && categorization.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {categorization.labels.map((label, i) => (
              <Badge key={i} variant="outline" className="text-[10px] text-muted-foreground">
                {label.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}
        {categorization.topics && categorization.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {categorization.topics.map((topic, i) => (
              <Badge key={i} variant="outline" className="text-xs">{topic}</Badge>
            ))}
          </div>
        )}
      </div>
    </CollapsibleAnalysisSection>
  );
});
