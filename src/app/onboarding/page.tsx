/**
 * 🚀 Onboarding Page
 *
 * Entry point for the onboarding wizard. This page:
 * - Requires authentication (redirects to home if not logged in)
 * - Manages wizard state and step navigation
 * - Handles completion and redirect to inbox
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WIZARD STEPS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Welcome - Brief introduction and "Get Started" CTA
 * 2. Accounts - Shows connected Gmail, option to add more
 * 3. Clients - Optional client setup (can be skipped)
 *
 * @module app/onboarding/page
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { FullPageLoader, useToast } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { OnboardingWizard } from './components/OnboardingWizard';
import type { TableUpdate } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('OnboardingPage');

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function OnboardingPage() {
  const { user, isLoading, isAuthenticated, refreshSession } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const supabase = React.useMemo(() => createClient(), []);

  // Track completion state
  const [isCompleting, setIsCompleting] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle unauthenticated users
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      logger.info('Redirecting unauthenticated user from onboarding');
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle already-completed onboarding
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading && user?.onboardingCompleted) {
      logger.info('User already completed onboarding, redirecting to inbox');
      router.replace('/inbox');
    }
  }, [isLoading, user, router]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle wizard completion
  // ───────────────────────────────────────────────────────────────────────────

  const handleComplete = async () => {
    if (!user) return;

    setIsCompleting(true);
    logger.start('Completing onboarding', { userId: user.id });

    try {
      // Update user profile to mark onboarding as complete
      const updateData: TableUpdate<'user_profiles'> = {
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      // Using explicit any cast due to Supabase type inference limitations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Refresh auth context to get updated user data
      await refreshSession();

      logger.success('Onboarding completed', { userId: user.id });

      toast({
        title: 'Setup complete!',
        description: 'Welcome to IdeaBox. Your inbox is being synced.',
      });

      // Redirect to inbox
      router.replace('/inbox');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to complete onboarding', { error: message });

      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: 'Unable to complete setup. Please try again.',
      });

      setIsCompleting(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Loading states
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <FullPageLoader message="Loading..." />;
  }

  if (!isAuthenticated || !user) {
    return <FullPageLoader message="Redirecting..." />;
  }

  if (user.onboardingCompleted) {
    return <FullPageLoader message="Redirecting to inbox..." />;
  }

  if (isCompleting) {
    return <FullPageLoader message="Completing setup..." />;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render wizard
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <OnboardingWizard
      user={user}
      onComplete={handleComplete}
    />
  );
}
