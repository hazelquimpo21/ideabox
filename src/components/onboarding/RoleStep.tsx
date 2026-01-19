/**
 * Role Step Component
 *
 * Step 1 of 7 in the user context onboarding wizard.
 * Collects the user's professional identity: role and company.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This information helps personalize AI analysis:
 * - Role: Influences what types of emails are prioritized
 * - Company: Helps identify internal vs external emails
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User selects role from predefined options OR enters custom role
 * 2. User optionally enters company name
 * 3. On "Continue", data is passed to parent via onDataChange
 * 4. Parent saves to user_context table via API
 *
 * @module components/onboarding/RoleStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Label } from '@/components/ui';
import { Briefcase, Building2, CheckCircle2 } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('RoleStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the RoleStep component.
 * Follows the standard step interface for the onboarding wizard.
 */
export interface RoleStepProps {
  /** Current role value (for controlled input) */
  role: string;
  /** Current company value (for controlled input) */
  company: string;
  /** Callback when data changes */
  onDataChange: (data: { role: string; company: string }) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step (hides back button) */
  isFirstStep: boolean;
  /** Whether this is the last step (changes button text) */
  isLastStep: boolean;
}

/**
 * Role option configuration.
 */
interface RoleOption {
  /** Role value to save */
  value: string;
  /** Display label */
  label: string;
  /** Brief description */
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Predefined role options.
 * These cover common professional roles that benefit from personalized email handling.
 */
const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'developer',
    label: 'Developer / Engineer',
    description: 'Technical roles, code reviews, system notifications',
  },
  {
    value: 'entrepreneur',
    label: 'Entrepreneur / Founder',
    description: 'Business development, investor relations, operations',
  },
  {
    value: 'manager',
    label: 'Manager / Lead',
    description: 'Team coordination, reports, approvals',
  },
  {
    value: 'creative',
    label: 'Creative / Designer',
    description: 'Client feedback, project briefs, collaboration',
  },
  {
    value: 'sales',
    label: 'Sales / Marketing',
    description: 'Leads, campaigns, customer communications',
  },
  {
    value: 'consultant',
    label: 'Consultant / Freelancer',
    description: 'Client projects, proposals, invoicing',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RoleStep - Collects user's professional role and company.
 *
 * @example
 * ```tsx
 * <RoleStep
 *   role={data.role}
 *   company={data.company}
 *   onDataChange={(data) => setData(prev => ({ ...prev, ...data }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={true}
 *   isLastStep={false}
 * />
 * ```
 */
export function RoleStep({
  role,
  company,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: RoleStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State for custom role input
  // ─────────────────────────────────────────────────────────────────────────────
  const [showCustomRole, setShowCustomRole] = React.useState(false);
  const [customRole, setCustomRole] = React.useState('');

  // Check if current role matches a predefined option
  const isCustomRole = role && !ROLE_OPTIONS.some((opt) => opt.value === role);

  // Initialize custom role state if needed
  React.useEffect(() => {
    if (isCustomRole && !showCustomRole) {
      setShowCustomRole(true);
      setCustomRole(role);
    }
  }, [role, isCustomRole, showCustomRole]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles selection of a predefined role option.
   */
  const handleRoleSelect = React.useCallback(
    (selectedRole: string) => {
      logger.debug('Role selected', { role: selectedRole });

      // Clear custom role state if selecting predefined
      setShowCustomRole(false);
      setCustomRole('');

      onDataChange({ role: selectedRole, company });
    },
    [company, onDataChange]
  );

  /**
   * Handles "Other" button click to show custom input.
   */
  const handleOtherClick = React.useCallback(() => {
    logger.debug('Custom role mode activated');
    setShowCustomRole(true);
    onDataChange({ role: '', company });
  }, [company, onDataChange]);

  /**
   * Handles custom role input change.
   */
  const handleCustomRoleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCustomRole(value);
      onDataChange({ role: value, company });
    },
    [company, onDataChange]
  );

  /**
   * Handles company input change.
   */
  const handleCompanyChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      logger.debug('Company changed', { company: value });
      onDataChange({ role, company: value });
    },
    [role, onDataChange]
  );

  /**
   * Handles continue button click.
   * Validates that a role is selected before proceeding.
   */
  const handleContinue = React.useCallback(() => {
    if (!role.trim()) {
      logger.warn('Attempted to continue without role');
      return;
    }
    logger.info('RoleStep completed', { role, company: company || 'not set' });
    onNext();
  }, [role, company, onNext]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">What&apos;s your role?</h2>
        <p className="text-muted-foreground">
          This helps us understand what types of emails matter most to you.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Role Selection Grid
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label className="text-base">Select your primary role</Label>

        <div className="grid grid-cols-2 gap-3">
          {ROLE_OPTIONS.map((option) => {
            const isSelected = role === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRoleSelect(option.value)}
                className={`
                  p-4 rounded-lg border-2 text-left transition-all
                  ${isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'}
                `}
                aria-pressed={isSelected}
              >
                <div className="flex items-center gap-2 mb-1">
                  {isSelected && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <span className="font-semibold">{option.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}

          {/* "Other" option */}
          <button
            type="button"
            onClick={handleOtherClick}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              ${showCustomRole && !ROLE_OPTIONS.some((opt) => opt.value === role)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              {showCustomRole && !ROLE_OPTIONS.some((opt) => opt.value === role) && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
              <span className="font-semibold">Other</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter a custom role
            </p>
          </button>
        </div>

        {/* Custom role input (shown when "Other" selected) */}
        {showCustomRole && (
          <div className="pt-2">
            <Input
              type="text"
              placeholder="Enter your role (e.g., Product Manager)"
              value={customRole}
              onChange={handleCustomRoleChange}
              maxLength={100}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Company Input (Optional)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label htmlFor="company" className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Company name
          <span className="text-muted-foreground text-sm font-normal">(optional)</span>
        </Label>
        <Input
          id="company"
          type="text"
          placeholder="e.g., Acme Corp, Self-employed, Freelance"
          value={company}
          onChange={handleCompanyChange}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          Helps identify internal emails and colleagues.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4">
        {!isFirstStep ? (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : (
          <div /> // Spacer for alignment
        )}
        <Button onClick={handleContinue} disabled={!role.trim()}>
          {isLastStep ? 'Finish' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

export default RoleStep;
