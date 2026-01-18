/**
 * 🧙 Onboarding Wizard Component
 *
 * Multi-step wizard for new user setup. Manages step state,
 * navigation, and collects user data across steps.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STEP FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Welcome → 2. Accounts → 3. Clients → Complete
 *
 * Users can:
 * - Navigate forward with "Next"/"Continue"
 * - Navigate back with "Back"
 * - Skip optional steps (Clients)
 *
 * @module app/onboarding/components/OnboardingWizard
 */

'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import { WelcomeStep } from './WelcomeStep';
import { AccountsStep } from './AccountsStep';
import { ClientsStep } from './ClientsStep';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('OnboardingWizard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the OnboardingWizard component.
 */
export interface OnboardingWizardProps {
  /** Current authenticated user */
  user: AuthUser;
  /** Callback when wizard is completed */
  onComplete: () => void;
}

/**
 * Wizard step identifiers.
 */
type WizardStep = 'welcome' | 'accounts' | 'clients';

/**
 * Step configuration.
 */
interface StepConfig {
  id: WizardStep;
  title: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ordered list of wizard steps.
 */
const STEPS: StepConfig[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Get started with IdeaBox',
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description: 'Connect your Gmail accounts',
  },
  {
    id: 'clients',
    title: 'Clients',
    description: 'Add your main clients (optional)',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Onboarding wizard managing multi-step setup flow.
 */
export function OnboardingWizard({ user, onComplete }: OnboardingWizardProps) {
  // Current step index (0-based)
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);

  // Get current step configuration
  const currentStep = STEPS[currentStepIndex];
  const totalSteps = STEPS.length;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  // ───────────────────────────────────────────────────────────────────────────
  // Navigation handlers
  // ───────────────────────────────────────────────────────────────────────────

  const goToNextStep = React.useCallback(() => {
    if (isLastStep) {
      logger.info('Wizard complete, triggering onComplete');
      onComplete();
    } else {
      logger.info('Moving to next step', {
        from: currentStep?.id,
        to: STEPS[currentStepIndex + 1]?.id,
      });
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [isLastStep, currentStepIndex, currentStep?.id, onComplete]);

  const goToPreviousStep = React.useCallback(() => {
    if (!isFirstStep) {
      logger.info('Moving to previous step', {
        from: currentStep?.id,
        to: STEPS[currentStepIndex - 1]?.id,
      });
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [isFirstStep, currentStepIndex, currentStep?.id]);

  // ───────────────────────────────────────────────────────────────────────────
  // Render step indicator
  // ───────────────────────────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isComplete = index < currentStepIndex;

        return (
          <React.Fragment key={step.id}>
            {/* Step circle */}
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                transition-colors duration-200
                ${isActive
                  ? 'bg-primary text-primary-foreground'
                  : isComplete
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }
              `}
            >
              {isComplete ? '✓' : index + 1}
            </div>

            {/* Connector line (not after last step) */}
            {index < totalSteps - 1 && (
              <div
                className={`
                  w-12 h-0.5 transition-colors duration-200
                  ${index < currentStepIndex ? 'bg-primary/50' : 'bg-muted'}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render current step content
  // ───────────────────────────────────────────────────────────────────────────

  const renderStepContent = () => {
    if (!currentStep) return null;

    const commonProps = {
      onNext: goToNextStep,
      onBack: goToPreviousStep,
      isFirstStep,
      isLastStep,
    };

    switch (currentStep.id) {
      case 'welcome':
        return <WelcomeStep user={user} {...commonProps} />;

      case 'accounts':
        return <AccountsStep user={user} {...commonProps} />;

      case 'clients':
        return <ClientsStep user={user} {...commonProps} />;

      default:
        return null;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Step content card */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Step info */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        Step {currentStepIndex + 1} of {totalSteps}: {currentStep?.title}
      </p>
    </div>
  );
}
