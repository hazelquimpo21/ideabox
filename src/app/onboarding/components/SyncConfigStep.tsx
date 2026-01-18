/**
 * Sync Configuration Step Component
 *
 * Step in onboarding wizard where users choose:
 * - How many emails to analyze on initial sync (25/50/100/200)
 * - Whether to include already-read emails
 *
 * This gives users control over:
 * - Initial analysis time (more emails = longer wait)
 * - Initial costs (more emails = higher cost)
 * - What they see first (unread only vs recent history)
 *
 * @module app/onboarding/components/SyncConfigStep
 */

'use client';

import * as React from 'react';
import { Button, Label, Badge } from '@/components/ui';
import { Sparkles, Clock, DollarSign, Info, CheckCircle2 } from 'lucide-react';
import type { AuthUser } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SyncConfigStepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  onConfigUpdate?: (config: SyncConfig) => void;
}

export interface SyncConfig {
  initialEmailCount: number;
  includeReadEmails: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const EMAIL_COUNT_OPTIONS = [
  {
    value: 25,
    label: '25 emails',
    description: 'Quick preview',
    time: '~15 seconds',
    cost: '~$0.01',
    recommended: false,
  },
  {
    value: 50,
    label: '50 emails',
    description: 'Recommended',
    time: '~30 seconds',
    cost: '~$0.03',
    recommended: true,
  },
  {
    value: 100,
    label: '100 emails',
    description: 'Comprehensive',
    time: '~1 minute',
    cost: '~$0.06',
    recommended: false,
  },
  {
    value: 200,
    label: '200 emails',
    description: 'Deep dive',
    time: '~2 minutes',
    cost: '~$0.12',
    recommended: false,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SyncConfigStep({
  onNext,
  onBack,
  isLastStep,
  onConfigUpdate,
}: SyncConfigStepProps) {
  const [emailCount, setEmailCount] = React.useState(50);
  const [includeRead, setIncludeRead] = React.useState(true);

  // Notify parent of config changes
  React.useEffect(() => {
    onConfigUpdate?.({
      initialEmailCount: emailCount,
      includeReadEmails: includeRead,
    });
  }, [emailCount, includeRead, onConfigUpdate]);

  const selectedOption = EMAIL_COUNT_OPTIONS.find((opt) => opt.value === emailCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Initial Analysis Setup</h2>
        <p className="text-muted-foreground">
          Choose how many emails to analyze when you first sync.
          You can always sync more later.
        </p>
      </div>

      {/* Email count selection */}
      <div className="space-y-3">
        <Label className="text-base">How many recent emails should we analyze?</Label>

        <div className="grid grid-cols-2 gap-3">
          {EMAIL_COUNT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setEmailCount(option.value)}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${emailCount === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'}
              `}
            >
              {option.recommended && (
                <Badge className="absolute -top-2 -right-2 text-xs" variant="default">
                  Recommended
                </Badge>
              )}

              <div className="flex items-center gap-2 mb-1">
                {emailCount === option.value && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                <span className="font-semibold">{option.label}</span>
              </div>

              <p className="text-sm text-muted-foreground mb-2">{option.description}</p>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {option.time}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {option.cost}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Include read emails toggle */}
      <div className="space-y-3">
        <Label className="text-base">What emails should we include?</Label>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIncludeRead(true)}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              ${includeRead
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              {includeRead && <CheckCircle2 className="h-4 w-4 text-primary" />}
              <span className="font-semibold">All recent emails</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Include both read and unread emails
            </p>
          </button>

          <button
            type="button"
            onClick={() => setIncludeRead(false)}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              ${!includeRead
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              {!includeRead && <CheckCircle2 className="h-4 w-4 text-primary" />}
              <span className="font-semibold">Unread only</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Focus on emails you haven&apos;t seen
            </p>
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium mb-1">What happens next:</p>
            <ul className="text-muted-foreground space-y-1">
              <li>
                We&apos;ll fetch your last {emailCount}{' '}
                {includeRead ? 'emails' : 'unread emails'}
              </li>
              <li>AI will categorize and extract action items</li>
              <li>Estimated time: {selectedOption?.time}</li>
              <li>Estimated cost: {selectedOption?.cost}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          {isLastStep ? 'Finish Setup' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

export default SyncConfigStep;
