'use client';

import * as React from 'react';
import { ListChecks, Calendar, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import type { MultiEventDetectionResult } from '@/hooks/useEmailAnalysis';

interface MultiEventSectionProps {
  multiEventDetection: MultiEventDetectionResult;
}

export const MultiEventSection = React.memo(function MultiEventSection({
  multiEventDetection,
}: MultiEventSectionProps) {
  if (!multiEventDetection.events || multiEventDetection.events.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={ListChecks}
      title="Multiple Events"
      subtitle={`(${multiEventDetection.eventCount} events)`}
      iconColor="text-purple-500"
    >
      <div className="mt-2">
        {multiEventDetection.sourceDescription && (
          <p className="text-xs text-muted-foreground pl-6 mb-2">
            {multiEventDetection.sourceDescription}
          </p>
        )}
        <div className="space-y-2 pl-6">
          {multiEventDetection.events.map((evt, index) => (
            <div key={index} className="p-2 rounded-md hover:bg-muted/50 transition-colors">
              <p className="text-sm font-medium">{evt.eventTitle}</p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Calendar className="h-3 w-3" />
                  {evt.eventDate}
                </span>
                {evt.eventTime && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {evt.eventTime}
                  </span>
                )}
                {evt.location && <span>{evt.location}</span>}
                {evt.cost && <span>{evt.cost}</span>}
                {evt.rsvpRequired && (
                  <Badge variant="outline" className="text-[10px]">RSVP</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleAnalysisSection>
  );
});
