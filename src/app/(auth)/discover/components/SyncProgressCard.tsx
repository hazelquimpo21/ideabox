/**
 * Sync Progress Card Component
 *
 * Shows real-time progress during email analysis.
 * Displays progress bar, current step, and discoveries found so far.
 */

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SyncDiscoveries } from '@/types/discovery';

interface SyncProgressCardProps {
  progress: number;
  currentStep: string;
  discoveries: SyncDiscoveries;
}

export function SyncProgressCard({
  progress,
  currentStep,
  discoveries,
}: SyncProgressCardProps) {
  return (
    <div className="container max-w-lg mx-auto py-12 px-4">
      <Card>
        <CardContent className="pt-6">
          {/* Icon and Title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <span className="text-3xl animate-pulse">✨</span>
            </div>
            <h2 className="text-2xl font-bold">Analyzing Your Emails</h2>
            <p className="text-muted-foreground mt-2">{currentStep}</p>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Discoveries so far */}
          {(discoveries.actionItems > 0 ||
            discoveries.events > 0 ||
            discoveries.clientsDetected.length > 0) && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Found so far:</p>
              <div className="flex flex-wrap gap-2">
                {discoveries.actionItems > 0 && (
                  <Badge variant="secondary">
                    {discoveries.actionItems} action items
                  </Badge>
                )}
                {discoveries.events > 0 && (
                  <Badge variant="secondary">
                    {discoveries.events} events
                  </Badge>
                )}
                {discoveries.clientsDetected.map((client) => (
                  <Badge key={client} variant="outline">
                    Client: {client}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Estimated time */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            This usually takes 15-60 seconds
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
