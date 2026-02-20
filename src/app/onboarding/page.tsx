/**
 * Onboarding Page
 *
 * Entry point for the onboarding wizard. This page:
 * - Requires authentication (redirects to home if not logged in)
 * - Manages wizard state and step navigation
 * - On completion, triggers initial email analysis in the background
 * - Redirects to inbox immediately (no loading screen)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WIZARD STEPS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Welcome - Brief introduction and "Get Started" CTA
 * 2. Accounts - Shows connected Gmail, option to add more
 * 3. Sync Config - Configure initial analysis (email count, read/unread)
 * 4. Clients - Optional client setup (can be skipped)
 * 5. VIP Contacts - Select important contacts (optional)
 * 6. About You - User context for AI personalization (optional)
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
import type { SyncConfig } from './components/SyncConfigStep';

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

  const handleComplete = async (syncConfig?: SyncConfig) => {
    if (!user) return;

    setIsCompleting(true);
    logger.start('Completing onboarding', {
      userId: user.id,
      syncConfig,
    });

    try {
      // Mark onboarding as complete immediately so user isn't blocked
      // Update both user_profiles (used by AuthContext) and user_context (used by AI/APIs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      await sb
        .from('user_profiles')
        .update({
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      // Keep user_context in sync (best-effort, don't block on failure)
      sb.from('user_context')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .then(() => logger.debug('user_context onboarding flag synced'))
        .catch(() => logger.warn('Failed to sync user_context onboarding flag'));

      // Fire off initial sync in the background (don't await)
      // The orchestrator will mark initial_sync_completed_at when done
      fetch('/api/onboarding/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxEmails: syncConfig?.initialEmailCount ?? 50,
          includeRead: syncConfig?.includeReadEmails ?? true,
        }),
      }).catch((err) => {
        logger.warn('Background initial sync trigger failed, will retry via scheduler', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

      logger.info('Onboarding complete, redirecting to inbox with background sync');

      toast({
        title: 'Welcome! Your inbox is being set up.',
        description: 'Email analysis is running in the background.',
      });

      await refreshSession();
      router.replace('/inbox');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to complete onboarding', { error: message });

      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: message,
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
    return <FullPageLoader message="Finishing setup..." />;
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
