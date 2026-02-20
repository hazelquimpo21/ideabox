/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Type issues with logger metadata
/**
 * Onboarding Wizard Component
 *
 * Multi-step wizard for new user setup. Manages step state,
 * navigation, and collects user data across steps.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STEP FLOW (Updated Feb 2026 — Phase 4 Overhaul)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Welcome → 2. Accounts → 3. VIP Contacts → 4. About You (Mad Libs) →
 * 5. Sync Config ("Get Started") → Complete
 *
 * Phase 4 changes (Feb 2026):
 * - Removed Clients step (clients are auto-detected by ClientTaggerAnalyzer)
 * - Moved VIP Contacts earlier (right after Accounts) so VIP selections
 *   seed the Mad Libs Profile step
 * - Moved Sync Config to last position as the "Finish Setup" moment
 * - Added React.lazy() for steps 3+ to reduce initial bundle size
 * - Net effect: 6 steps → 5 steps, less friction, faster load
 *
 * The "VIP Contacts" step (Jan 2026) helps users identify important contacts:
 * - Imports contacts from Google (if permission granted)
 * - Shows starred contacts and frequent communicators
 * - Lets user select VIPs for email prioritization
 *
 * The "About You" step (Feb 2026 — Phase 3 overhaul) uses a "Mad Libs" profile
 * card that pre-fills AI suggestions from the user's emails. Replaces the old
 * form-based AboutYouStep with an interactive fill-in-the-blank experience:
 * - Role & Company (AI pre-filled from email signatures)
 * - Priorities (AI-suggested from email patterns)
 * - Work Schedule (statistically inferred from send times)
 * - VIP Contacts (carried from the VIP Contacts step)
 *
 * Users can:
 * - Navigate forward with "Next"/"Continue"
 * - Navigate back with "Back"
 * - Skip optional steps (VIP Contacts, About You)
 * - Configure initial sync settings (email count, read/unread)
 *
 * @module app/onboarding/components/OnboardingWizard
 */

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import { WelcomeStep } from './WelcomeStep';
import { AccountsStep } from './AccountsStep';
import type { SyncConfig } from './SyncConfigStep';

// Lazy load steps 3+ (VIP Contacts, Mad Libs Profile, Sync Config).
// The user won't see these until several seconds after page load, so deferring
// their bundles reduces the initial JS payload. Each component must have a
// `default` export for React.lazy to work.
const ContactImportStep = React.lazy(() => import('./ContactImportStep'));
const MadLibsProfileStep = React.lazy(() => import('./MadLibsProfileStep'));
const SyncConfigStep = React.lazy(() => import('./SyncConfigStep'));

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
  onComplete: (syncConfig?: SyncConfig) => void;
}

/**
 * Wizard step identifiers.
 * Updated Feb 2026 (Phase 4): Removed 'clients' — auto-detected by ClientTaggerAnalyzer.
 */
type WizardStep = 'welcome' | 'accounts' | 'vip-contacts' | 'about-you' | 'sync-config';

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
 *
 * Updated Feb 2026 (Phase 4):
 * - Removed 'clients' step (auto-detected by ClientTaggerAnalyzer from email patterns)
 * - Moved 'vip-contacts' to position 3 (right after accounts, seeds the Mad Libs step)
 * - Moved 'about-you' (MadLibsProfileStep) to position 4
 * - Moved 'sync-config' to position 5 (last step — the "Finish Setup" moment)
 * - Net effect: 6 steps → 5 steps
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
    id: 'vip-contacts',
    title: 'VIP Contacts',
    description: 'Select your most important contacts',
  },
  {
    id: 'about-you',
    title: 'About You',
    description: 'AI-powered profile card',
  },
  {
    id: 'sync-config',
    title: 'Get Started',
    description: 'Configure and launch email analysis',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING FALLBACK (for React.lazy Suspense boundary)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal loading fallback shown while a lazy-loaded step chunk is fetched.
 * Matches the card dimensions so the layout doesn't shift when the step loads.
 */
function StepLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading step...</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Onboarding wizard managing multi-step setup flow.
 */
export function OnboardingWizard({ user, onComplete }: OnboardingWizardProps) {
  const searchParams = useSearchParams();

  // If returning from OAuth contacts scope flow, jump to VIP Contacts step
  const initialStepIndex = React.useMemo(() => {
    if (searchParams.get('scope_added') === 'true') {
      const vipStepIndex = STEPS.findIndex((s) => s.id === 'vip-contacts');
      if (vipStepIndex >= 0) {
        logger.info('Returning from OAuth scope flow, jumping to VIP Contacts step');
        return vipStepIndex;
      }
    }
    return 0;
  }, [searchParams]);

  // Current step index (0-based)
  const [currentStepIndex, setCurrentStepIndex] = React.useState(initialStepIndex);

  // Sync configuration chosen by user
  const [syncConfig, setSyncConfig] = React.useState<SyncConfig>({
    initialEmailCount: 50,
    includeReadEmails: true,
  });

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
      logger.info('Wizard complete, triggering onComplete', { syncConfig });
      onComplete(syncConfig);
    } else {
      logger.info('Moving to next step', {
        from: currentStep?.id,
        to: STEPS[currentStepIndex + 1]?.id,
      });
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [isLastStep, currentStepIndex, currentStep?.id, onComplete, syncConfig]);

  const goToPreviousStep = React.useCallback(() => {
    if (!isFirstStep) {
      logger.info('Moving to previous step', {
        from: currentStep?.id,
        to: STEPS[currentStepIndex - 1]?.id,
      });
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [isFirstStep, currentStepIndex, currentStep?.id]);

  // Handler for sync config updates
  const handleSyncConfigUpdate = React.useCallback((config: SyncConfig) => {
    logger.debug('Sync config updated', config);
    setSyncConfig(config);
  }, []);

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
                  w-8 h-0.5 transition-colors duration-200
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

      case 'vip-contacts':
        return <ContactImportStep user={user} {...commonProps} />;

      case 'about-you':
        return <MadLibsProfileStep user={user} {...commonProps} />;

      case 'sync-config':
        return (
          <SyncConfigStep
            user={user}
            {...commonProps}
            onConfigUpdate={handleSyncConfigUpdate}
          />
        );

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

      {/* Step content card — Suspense boundary for lazy-loaded step components */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <React.Suspense fallback={<StepLoadingFallback />}>
            {renderStepContent()}
          </React.Suspense>
        </CardContent>
      </Card>

      {/* Step info */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        Step {currentStepIndex + 1} of {totalSteps}: {currentStep?.title}
      </p>
    </div>
  );
}
