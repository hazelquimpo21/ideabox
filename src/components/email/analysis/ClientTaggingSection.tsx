'use client';

import * as React from 'react';
import { Building2 } from 'lucide-react';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getRelationshipIcon } from './helpers';
import type { ClientTaggingResult } from '@/hooks/useEmailAnalysis';

interface ClientTaggingSectionProps {
  clientTagging: ClientTaggingResult;
}

export const ClientTaggingSection = React.memo(function ClientTaggingSection({
  clientTagging,
}: ClientTaggingSectionProps) {
  return (
    <CollapsibleAnalysisSection
      icon={Building2}
      title="Client"
      iconColor="text-teal-500"
    >
      <div className="mt-2">
        {clientTagging.clientMatch ? (
          <div className="pl-6 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{clientTagging.clientName || 'Matched Client'}</span>
              {clientTagging.relationshipSignal && (
                getRelationshipIcon(clientTagging.relationshipSignal)
              )}
            </div>
            {clientTagging.projectName && (
              <p className="text-xs text-muted-foreground">Project: {clientTagging.projectName}</p>
            )}
          </div>
        ) : (
          <div className="pl-6">
            <p className="text-sm text-muted-foreground">Not linked to a client</p>
            {clientTagging.newClientSuggestion && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Suggestion: {clientTagging.newClientSuggestion}
              </p>
            )}
          </div>
        )}
      </div>
    </CollapsibleAnalysisSection>
  );
});
