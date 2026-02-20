/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Type issues with logger metadata
/**
 * User Context Wizard Component
 *
 * A 7-step wizard that collects user context information for personalized AI analysis.
 * This wizard is typically shown after the initial account setup but before the
 * email sync process.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STEP FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Role & Company      - Professional identity
 * 2. Priorities          - What matters most (ordered)
 * 3. Projects            - Active project names
 * 4. VIPs                - Important contacts (emails/domains)
 * 5. Location            - City and metro area
 * 6. Interests           - Topics of interest
 * 7. Work Hours          - Schedule and work days
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA PERSISTENCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The wizard calls POST /api/user/context/onboarding after each step to save
 * progress incrementally. This ensures:
 * - Data isn't lost if user closes browser
 * - Progress can be resumed
 * - Each step's data is validated and stored immediately
 *
 * On completion, it calls PUT /api/user/context with onboarding_completed: true.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <UserContextWizard
 *   userId={user.id}
 *   initialData={existingContext}  // Optional: resume from saved data
 *   onComplete={() => router.push('/inbox')}
 *   onSkip={() => router.push('/inbox')}  // Optional: allow skipping
 * />
 * ```
 *
 * @module components/onboarding/UserContextWizard
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Card, CardContent, Button } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/components/ui/use-toast';

// Step components
import { RoleStep } from './RoleStep';
import { PrioritiesStep } from './PrioritiesStep';
import { ProjectsStep } from './ProjectsStep';
import { VIPsStep } from './VIPsStep';
import { LocationStep } from './LocationStep';
import { InterestsStep } from './InterestsStep';
import { WorkHoursStep } from './WorkHoursStep';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('UserContextWizard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete user context data collected by the wizard.
 */
export interface UserContextData {
  // Step 1: Role
  role: string;
  company: string;

  // Step 2: Priorities
  priorities: string[];

  // Step 3: Projects
  projects: string[];

  // Step 4: VIPs
  vipEmails: string[];
  vipDomains: string[];

  // Step 5: Location
  locationCity: string;
  locationMetro: string;

  // Step 6: Interests
  interests: string[];

  // Step 7: Work Hours
  workHoursStart: string;
  workHoursEnd: string;
  workDays: number[];
}

/**
 * Props for the UserContextWizard component.
 */
export interface UserContextWizardProps {
  /** User ID for saving context */
  userId: string;
  /** Initial data to pre-populate (for resuming) */
  initialData?: Partial<UserContextData>;
  /** Callback when wizard completes */
  onComplete: () => void;
  /** Optional callback to skip the wizard entirely */
  onSkip?: () => void;
}

/**
 * Step configuration for display.
 */
interface StepConfig {
  id: string;
  title: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default values for user context.
 */
const DEFAULT_DATA: UserContextData = {
  role: '',
  company: '',
  priorities: [],
  projects: [],
  vipEmails: [],
  vipDomains: [],
  locationCity: '',
  locationMetro: '',
  interests: [],
  workHoursStart: '09:00',
  workHoursEnd: '17:00',
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
};

/**
 * Step configuration.
 */
const STEPS: StepConfig[] = [
  { id: 'role', title: 'Role', description: 'Your professional identity' },
  { id: 'priorities', title: 'Priorities', description: 'What matters most' },
  { id: 'projects', title: 'Projects', description: 'Active projects' },
  { id: 'vips', title: 'VIPs', description: 'Important contacts' },
  { id: 'location', title: 'Location', description: 'Where you are' },
  { id: 'interests', title: 'Interests', description: 'Topics you follow' },
  { id: 'schedule', title: 'Schedule', description: 'Work hours' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * UserContextWizard - 7-step wizard for collecting user context.
 */
export function UserContextWizard({
  userId,
  initialData,
  onComplete,
  onSkip,
}: UserContextWizardProps) {
  const { toast } = useToast();

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Current step index (0-6).
   */
  const [currentStep, setCurrentStep] = React.useState(0);

  /**
   * User context data being collected.
   */
  const [data, setData] = React.useState<UserContextData>({
    ...DEFAULT_DATA,
    ...initialData,
  });

  /**
   * Loading state for API calls.
   */
  const [isSaving, setIsSaving] = React.useState(false);

  // Step navigation helpers
  const totalSteps = STEPS.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const currentStepConfig = STEPS[currentStep];

  // ─────────────────────────────────────────────────────────────────────────────
  // API Functions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Saves the current step's data to the server.
   * This is called after each step to ensure progress is persisted.
   *
   * @param stepNumber - The step number (1-7)
   * @param stepData - The data to save for this step
   * @returns true if save succeeded, false otherwise
   */
  const saveStepData = React.useCallback(
    async (stepNumber: number, stepData: Partial<UserContextData>): Promise<boolean> => {
      logger.start('Saving step data', { step: stepNumber, fields: Object.keys(stepData) });

      try {
        // Transform data to API format (camelCase -> snake_case)
        const apiData = transformToApiFormat(stepData);

        const response = await fetch('/api/user/context/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: stepNumber,
            data: apiData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          logger.error('Failed to save step data', {
            step: stepNumber,
            status: response.status,
            error: errorData.error || 'Unknown error',
          });

          toast({
            variant: 'destructive',
            title: 'Save failed',
            description: 'Unable to save your progress. Please try again.',
          });

          return false;
        }

        logger.success('Step data saved', { step: stepNumber });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Network error saving step', { step: stepNumber, error: message });

        toast({
          variant: 'destructive',
          title: 'Connection error',
          description: 'Please check your internet connection and try again.',
        });

        return false;
      }
    },
    [toast]
  );

  /**
   * Completes the onboarding process by setting onboarding_completed to true.
   */
  const completeOnboarding = React.useCallback(async (): Promise<boolean> => {
    logger.start('Completing onboarding', { userId: userId.substring(0, 8) });

    try {
      const response = await fetch('/api/user/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_completed: true,
          onboarding_step: 7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Failed to complete onboarding', {
          status: response.status,
          error: errorData.error || 'Unknown error',
        });
        return false;
      }

      logger.success('Onboarding completed');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Network error completing onboarding', { error: message });
      return false;
    }
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles advancing to the next step.
   * Saves current step data before proceeding.
   */
  const handleNext = React.useCallback(async () => {
    setIsSaving(true);

    try {
      // Get the data for the current step
      const stepData = getStepData(currentStep, data);

      // Save to server
      const saved = await saveStepData(currentStep + 1, stepData);

      if (!saved) {
        // Save failed, don't proceed
        setIsSaving(false);
        return;
      }

      if (isLastStep) {
        // Final step - complete onboarding
        const completed = await completeOnboarding();
        if (completed) {
          logger.info('User context wizard completed', { userId: userId.substring(0, 8) });
          onComplete();
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to complete setup. Please try again.',
          });
        }
      } else {
        // Move to next step
        logger.debug('Moving to next step', {
          from: currentStepConfig?.id,
          to: STEPS[currentStep + 1]?.id,
        });
        setCurrentStep((prev) => prev + 1);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    currentStep,
    data,
    isLastStep,
    currentStepConfig,
    saveStepData,
    completeOnboarding,
    onComplete,
    userId,
    toast,
  ]);

  /**
   * Handles going back to the previous step.
   */
  const handleBack = React.useCallback(() => {
    if (!isFirstStep) {
      logger.debug('Moving to previous step', {
        from: currentStepConfig?.id,
        to: STEPS[currentStep - 1]?.id,
      });
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep, currentStep, currentStepConfig]);

  /**
   * Handles skipping the entire wizard.
   */
  const handleSkip = React.useCallback(async () => {
    if (!onSkip) return;

    logger.info('User skipping onboarding wizard');

    // Still mark onboarding as "seen" even if skipped
    setIsSaving(true);
    try {
      await fetch('/api/user/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_step: 0, // Mark as seen but not completed
        }),
      });
    } catch (error) {
      // Ignore errors for skip
      logger.warn('Failed to save skip state', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsSaving(false);
      onSkip();
    }
  }, [onSkip]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Update Handler
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Updates the data state when a step component reports changes.
   */
  const handleDataChange = React.useCallback((updates: Partial<UserContextData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Step Content
  // ─────────────────────────────────────────────────────────────────────────────

  const renderStep = () => {
    const commonProps = {
      onNext: handleNext,
      onBack: handleBack,
      isFirstStep,
      isLastStep,
    };

    switch (currentStep) {
      case 0:
        return (
          <RoleStep
            role={data.role}
            company={data.company}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 1:
        return (
          <PrioritiesStep
            priorities={data.priorities}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 2:
        return (
          <ProjectsStep
            projects={data.projects}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 3:
        return (
          <VIPsStep
            vipEmails={data.vipEmails}
            vipDomains={data.vipDomains}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 4:
        return (
          <LocationStep
            locationCity={data.locationCity}
            locationMetro={data.locationMetro}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 5:
        return (
          <InterestsStep
            interests={data.interests}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      case 6:
        return (
          <WorkHoursStep
            workHoursStart={data.workHoursStart}
            workHoursEnd={data.workHoursEnd}
            workDays={data.workDays}
            onDataChange={handleDataChange}
            {...commonProps}
          />
        );
      default:
        return null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Step Indicator
  // ─────────────────────────────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((step, index) => {
        const isActive = index === currentStep;
        const isComplete = index < currentStep;

        return (
          <React.Fragment key={step.id}>
            {/* Step dot */}
            <div
              className={`
                w-2.5 h-2.5 rounded-full transition-all
                ${isActive
                  ? 'bg-primary scale-125'
                  : isComplete
                    ? 'bg-primary/50'
                    : 'bg-muted'}
              `}
              title={`${step.title}: ${step.description}`}
            />
            {/* Connector (not after last) */}
            {index < totalSteps - 1 && (
              <div
                className={`
                  w-4 h-0.5 transition-all
                  ${index < currentStep ? 'bg-primary/50' : 'bg-muted'}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Skip button (if allowed) */}
      {onSkip && isFirstStep && (
        <div className="text-right mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={isSaving}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
        </div>
      )}

      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Step content card */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          {isSaving ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            renderStep()
          )}
        </CardContent>
      </Card>

      {/* Step info */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        Step {currentStep + 1} of {totalSteps}
        {currentStepConfig && `: ${currentStepConfig.title}`}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets the relevant data for a specific step.
 *
 * @param stepIndex - The step index (0-6)
 * @param data - Complete user context data
 * @returns The subset of data relevant to that step
 */
function getStepData(stepIndex: number, data: UserContextData): Partial<UserContextData> {
  switch (stepIndex) {
    case 0:
      return { role: data.role, company: data.company };
    case 1:
      return { priorities: data.priorities };
    case 2:
      return { projects: data.projects };
    case 3:
      return { vipEmails: data.vipEmails, vipDomains: data.vipDomains };
    case 4:
      return { locationCity: data.locationCity, locationMetro: data.locationMetro };
    case 5:
      return { interests: data.interests };
    case 6:
      return {
        workHoursStart: data.workHoursStart,
        workHoursEnd: data.workHoursEnd,
        workDays: data.workDays,
      };
    default:
      return {};
  }
}

/**
 * Transforms user context data to API format (camelCase -> snake_case).
 *
 * @param data - Data in camelCase format
 * @returns Data in snake_case format for API
 */
function transformToApiFormat(data: Partial<UserContextData>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Map camelCase to snake_case
  const mapping: Record<string, string> = {
    role: 'role',
    company: 'company',
    priorities: 'priorities',
    projects: 'projects',
    vipEmails: 'vip_emails',
    vipDomains: 'vip_domains',
    locationCity: 'location_city',
    locationMetro: 'location_metro',
    interests: 'interests',
    workHoursStart: 'work_hours_start',
    workHoursEnd: 'work_hours_end',
    workDays: 'work_days',
  };

  for (const [key, value] of Object.entries(data)) {
    const apiKey = mapping[key];
    if (apiKey && value !== undefined) {
      result[apiKey] = value;
    }
  }

  return result;
}

export default UserContextWizard;
