/**
 * User Context Onboarding Page
 *
 * This page displays the 7-step UserContextWizard for collecting user preferences
 * that personalize the AI email analysis.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * /onboarding/context
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User completes initial onboarding (account setup, sync config)
 * 2. User is redirected here to personalize their experience
 * 3. User completes 7 steps of context collection
 * 4. On completion, redirect to /discover dashboard
 *
 * This page is optional - users can skip it and configure later in Settings.
 *
 * @module app/onboarding/context/page
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { UserContextWizard } from '@/components/onboarding';
import { createLogger } from '@/lib/utils/logger';
import { Spinner } from '@/components/ui';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('OnboardingContextPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User Context Onboarding Page.
 *
 * Renders the UserContextWizard within the onboarding layout.
 * Handles authentication checks and redirects.
 */
export default function OnboardingContextPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles wizard completion.
   * Redirects to discover dashboard.
   */
  const handleComplete = React.useCallback(() => {
    logger.info('User context wizard completed, redirecting to discover');
    router.push('/discover');
  }, [router]);

  /**
   * Handles user skipping the wizard.
   * Still redirects to discover - they can configure later.
   */
  const handleSkip = React.useCallback(() => {
    logger.info('User skipped context wizard, redirecting to discover');
    router.push('/discover');
  }, [router]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading State
  // ─────────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Auth Check
  // ─────────────────────────────────────────────────────────────────────────────

  if (!user) {
    logger.warn('No authenticated user, redirecting to home');
    router.push('/');
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-8 px-4">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Personalize Your Experience</h1>
        <p className="text-muted-foreground max-w-md">
          Answer a few questions to help our AI better understand your priorities
          and deliver more relevant insights.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Wizard
          ───────────────────────────────────────────────────────────────────────── */}
      <UserContextWizard
        userId={user.id}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </div>
  );
}
