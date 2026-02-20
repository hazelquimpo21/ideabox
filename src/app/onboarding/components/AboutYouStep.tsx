/**
 * @deprecated — Replaced by MadLibsProfileStep.tsx (Phase 3, February 2026).
 *
 * This component is kept for rollback purposes only. The OnboardingWizard now
 * uses MadLibsProfileStep which provides an interactive "Mad Libs" fill-in-the-blank
 * card with AI-suggested values from the profile-suggestions endpoint.
 *
 * To revert: change the import in OnboardingWizard.tsx back to AboutYouStep.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * About You Step Component (DEPRECATED)
 *
 * A streamlined step in the onboarding wizard that collects essential user context
 * for AI personalization. This is a simplified version of the full UserContextWizard,
 * focusing on the most impactful fields.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTEXT COLLECTED
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Role & Company: Professional identity
 * - VIP Emails: High-priority contacts
 * - Top Priority: What matters most
 *
 * This data helps AI:
 * - Prioritize emails from VIPs
 * - Understand work context for categorization
 * - Rank priorities based on user preferences
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SKIP BEHAVIOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This step is optional. Users who skip can complete their profile later in
 * Settings → About Me tab. The Hub page shows a nudge when profile is <50% complete.
 *
 * @module app/onboarding/components/AboutYouStep
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Label, Badge } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import {
  User,
  Briefcase,
  Star,
  Target,
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Info,
} from 'lucide-react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AboutYouStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AboutYouStepProps {
  /** Current authenticated user */
  user: AuthUser;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AboutYouStep - Collects essential user context for AI personalization.
 *
 * This is a streamlined version focusing on the most impactful fields:
 * - Role & Company
 * - VIP Contacts
 * - Top Priority
 */
export function AboutYouStep({
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: AboutYouStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [role, setRole] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [vipInput, setVipInput] = React.useState('');
  const [vipEmails, setVipEmails] = React.useState<string[]>([]);
  const [topPriority, setTopPriority] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAddVip = () => {
    const email = vipInput.trim();
    if (email && !vipEmails.includes(email)) {
      setVipEmails([...vipEmails, email]);
      setVipInput('');
    }
  };

  const handleRemoveVip = (email: string) => {
    setVipEmails(vipEmails.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddVip();
    }
  };

  /**
   * Saves the context and proceeds to next step.
   * Data is saved to /api/user/context for AI personalization.
   */
  const handleContinue = async () => {
    setIsSaving(true);

    try {
      // Build context data
      const contextData: Record<string, unknown> = {};

      if (role.trim()) contextData.role = role.trim();
      if (company.trim()) contextData.company = company.trim();
      if (vipEmails.length > 0) contextData.vip_emails = vipEmails;
      if (topPriority.trim()) contextData.priorities = [topPriority.trim()];

      // Only save if user provided some data
      if (Object.keys(contextData).length > 0) {
        logger.info('Saving user context from onboarding', {
          fields: Object.keys(contextData),
        });

        const response = await fetch('/api/user/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contextData),
        });

        if (!response.ok) {
          logger.warn('Failed to save user context', {
            status: response.status,
          });
          // Don't block onboarding on context save failure
        } else {
          logger.success('User context saved from onboarding');
        }
      }

      onNext();
    } catch (error) {
      logger.error('Error saving user context', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Don't block onboarding on error
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Skips this step entirely.
   */
  const handleSkip = () => {
    logger.info('User skipped About You step');
    onNext();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Tell us about yourself</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Help AI understand your context for better email prioritization.
          This is optional—you can always update this in Settings.
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-5 max-w-md mx-auto">
        {/* Role & Company */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="role" className="flex items-center gap-1.5 text-sm">
              <Briefcase className="h-3.5 w-3.5" />
              Your Role
            </Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Product Manager"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company" className="text-sm">Company</Label>
            <Input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., Acme Corp"
            />
          </div>
        </div>

        {/* VIP Contacts */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Star className="h-3.5 w-3.5" />
            VIP Contacts
          </Label>
          <p className="text-xs text-muted-foreground">
            Emails from these addresses will be prioritized
          </p>
          <div className="flex gap-2">
            <Input
              value={vipInput}
              onChange={(e) => setVipInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter email address"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddVip}
              disabled={!vipInput.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {vipEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {vipEmails.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1">
                  {email}
                  <button
                    onClick={() => handleRemoveVip(email)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Top Priority */}
        <div className="space-y-2">
          <Label htmlFor="priority" className="flex items-center gap-1.5 text-sm">
            <Target className="h-3.5 w-3.5" />
            Top Priority
          </Label>
          <p className="text-xs text-muted-foreground">
            What matters most to you right now?
          </p>
          <Input
            id="priority"
            value={topPriority}
            onChange={(e) => setTopPriority(e.target.value)}
            placeholder="e.g., Closing Q1 deals, Product launch"
          />
        </div>
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg max-w-md mx-auto">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          You can add more details like work hours, projects, and interests later in{' '}
          <Link href="/settings?tab=about" className="text-primary hover:underline">
            Settings → About Me
          </Link>.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={isFirstStep}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
          <Button onClick={handleContinue} disabled={isSaving}>
            {isSaving ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                {isLastStep ? 'Finish Setup' : 'Continue'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AboutYouStep;
