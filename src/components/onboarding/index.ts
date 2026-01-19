/**
 * Onboarding Components Barrel Export
 *
 * This module exports all onboarding-related components including:
 * - UserContextWizard: 7-step wizard for collecting user preferences
 * - Individual step components for the wizard
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * // Import the complete wizard
 * import { UserContextWizard } from '@/components/onboarding';
 *
 * // Or import individual steps (for custom implementations)
 * import { RoleStep, PrioritiesStep } from '@/components/onboarding';
 * ```
 *
 * @module components/onboarding
 * @version 1.0.0
 * @since January 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WIZARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export { UserContextWizard } from './UserContextWizard';

// ═══════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS (7 Steps)
// ═══════════════════════════════════════════════════════════════════════════════

// Step 1: Professional Identity
export { RoleStep } from './RoleStep';

// Step 2: Priority Ordering
export { PrioritiesStep } from './PrioritiesStep';

// Step 3: Active Projects
export { ProjectsStep } from './ProjectsStep';

// Step 4: VIP Contacts
export { VIPsStep } from './VIPsStep';

// Step 5: Location Info
export { LocationStep } from './LocationStep';

// Step 6: Topic Interests
export { InterestsStep } from './InterestsStep';

// Step 7: Work Schedule
export { WorkHoursStep } from './WorkHoursStep';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type { UserContextWizardProps, UserContextData } from './UserContextWizard';
export type { RoleStepProps } from './RoleStep';
export type { PrioritiesStepProps } from './PrioritiesStep';
export type { ProjectsStepProps } from './ProjectsStep';
export type { VIPsStepProps } from './VIPsStep';
export type { LocationStepProps } from './LocationStep';
export type { InterestsStepProps } from './InterestsStep';
export type { WorkHoursStepProps } from './WorkHoursStep';
