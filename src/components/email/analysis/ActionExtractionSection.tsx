'use client';

import * as React from 'react';
import { Zap, Calendar, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getActionTypeIcon, getUrgencyColor } from './helpers';
import type { ActionExtractionResult } from '@/hooks/useEmailAnalysis';

interface ActionExtractionSectionProps {
  actionExtraction: ActionExtractionResult;
}

export const ActionExtractionSection = React.memo(function ActionExtractionSection({
  actionExtraction,
}: ActionExtractionSectionProps) {
  const actionCount = actionExtraction.actions?.length;
  const title = actionCount && actionCount > 1
    ? `Actions (${actionCount})`
    : 'Action';

  return (
    <CollapsibleAnalysisSection
      icon={Zap}
      title={title}
      subtitle={actionExtraction.urgencyScore
        ? `Urgency: ${actionExtraction.urgencyScore}/10`
        : undefined}
      iconColor="text-primary"
      defaultOpen
    >
      <div className="mt-2">
        {actionExtraction.urgencyScore && (
          <span className={`text-xs font-medium ${getUrgencyColor(actionExtraction.urgencyScore)} sr-only`}>
            Urgency: {actionExtraction.urgencyScore}/10
          </span>
        )}
        {actionExtraction.hasAction ? (
          <div className="space-y-2 pl-6">
            {actionExtraction.actions && actionExtraction.actions.length > 0 ? (
              actionExtraction.actions.map((action, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 p-2 rounded-md ${
                    index === (actionExtraction.primaryActionIndex ?? 0) ? 'bg-primary/5 border border-primary/10' : 'hover:bg-muted/50'
                  } transition-colors`}
                >
                  {getActionTypeIcon(action.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{action.title}</p>
                      {index === (actionExtraction.primaryActionIndex ?? 0) && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          Primary
                        </Badge>
                      )}
                    </div>
                    {action.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{action.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      {action.deadline && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          {new Date(action.deadline).toLocaleDateString()}
                        </span>
                      )}
                      {action.estimatedMinutes && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          ~{action.estimatedMinutes} min
                        </span>
                      )}
                      {action.sourceLine && (
                        <span className="truncate max-w-[200px]" title={action.sourceLine}>
                          &ldquo;{action.sourceLine}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <>
                <div className="flex items-start gap-2">
                  {getActionTypeIcon(actionExtraction.actionType)}
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {actionExtraction.actionTitle || `${actionExtraction.actionType} required`}
                    </p>
                    {actionExtraction.actionDescription && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {actionExtraction.actionDescription}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  {actionExtraction.deadline && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span>{new Date(actionExtraction.deadline).toLocaleDateString()}</span>
                    </div>
                  )}
                  {actionExtraction.estimatedMinutes && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>~{actionExtraction.estimatedMinutes} min</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground pl-6">No action required</p>
        )}
      </div>
    </CollapsibleAnalysisSection>
  );
});
