/**
 * Onboarding Components Barrel Export
 *
 * @module app/onboarding/components
 */

export { OnboardingWizard } from './OnboardingWizard';
export { WelcomeStep } from './WelcomeStep';
export { AccountsStep } from './AccountsStep';
export { ClientsStep } from './ClientsStep';
export { SyncConfigStep } from './SyncConfigStep';

// Re-export types
export type { OnboardingWizardProps } from './OnboardingWizard';
export type { StepProps } from './WelcomeStep';
export type { SyncConfig, SyncConfigStepProps } from './SyncConfigStep';
