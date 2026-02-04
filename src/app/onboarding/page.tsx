/**
 * 🚀 Onboarding Page
 *
 * Entry point for the onboarding wizard. This page:
 * - Requires authentication (redirects to home if not logged in)
 * - Manages wizard state and step navigation
 * - Triggers initial email analysis after wizard completion
 * - Redirects to Discovery Dashboard when analysis is complete
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WIZARD STEPS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Welcome - Brief introduction and "Get Started" CTA
 * 2. Accounts - Shows connected Gmail, option to add more
 * 3. Sync Config - Configure initial analysis (email count, read/unread)
 * 4. Clients - Optional client setup (can be skipped)
 * 5. Analysis - Loading screen showing real-time analysis progress
 *
 * @module app/onboarding/page
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { FullPageLoader, useToast, Card, CardContent, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import { OnboardingWizard } from './components/OnboardingWizard';
import { useInitialSyncProgress } from '@/hooks/useInitialSyncProgress';
import type { TableUpdate } from '@/types/database';
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

  // Track completion and sync state
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);

  // Progress tracking for initial sync
  const {
    status: syncStatus,
    progress: syncProgress,
    currentStep: syncStep,
    discoveries,
    result: syncResult,
    startPolling,
    stopPolling,
  } = useInitialSyncProgress({
    onComplete: async (result) => {
      logger.success('Initial sync completed', {
        stats: result.stats,
        categoryCount: result.categories.length,
      });
      // Refresh session to update onboardingCompleted flag in client state
      // This is critical - the orchestrator sets onboarding_completed=true in DB,
      // but the auth context needs to be refreshed to pick up the change
      try {
        await refreshSession();
      } catch (err) {
        logger.warn('Failed to refresh session after sync, redirecting anyway', {
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
      // Redirect to discover page
      router.replace('/discover');
    },
    onError: (error) => {
      logger.error('Initial sync failed', { error });
      setSyncError(error);
      setIsSyncing(false);
    },
  });

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
      logger.info('User already completed onboarding, redirecting to discover');
      router.replace('/discover');
    }
  }, [isLoading, user, router]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle wizard completion - triggers initial sync
  // ───────────────────────────────────────────────────────────────────────────

  const handleComplete = async (syncConfig?: SyncConfig) => {
    if (!user) return;

    setIsCompleting(true);
    setSyncError(null);
    logger.start('Completing onboarding and starting initial sync', {
      userId: user.id,
      syncConfig,
    });

    try {
      // Step 1: Trigger the initial sync API
      const syncResponse = await fetch('/api/onboarding/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxEmails: syncConfig?.initialEmailCount ?? 50,
          includeRead: syncConfig?.includeReadEmails ?? true,
        }),
      });

      // If sync started successfully, switch to syncing state and start polling
      if (syncResponse.ok) {
        setIsCompleting(false);
        setIsSyncing(true);
        startPolling();

        toast({
          title: 'Analyzing your emails...',
          description: 'This will take about a minute.',
        });

        logger.info('Initial sync started, polling for progress');
        return;
      }

      // Handle sync errors
      const errorData = await syncResponse.json().catch(() => ({}));
      const errorMessage = errorData.error || `Sync failed (${syncResponse.status})`;

      throw new Error(errorMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start initial sync', { error: message });

      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: message,
      });

      setIsCompleting(false);
      setSyncError(message);
    }
  };

  // Handle retry after sync failure
  const handleRetrySync = () => {
    setSyncError(null);
    handleComplete();
  };

  // Handle skip sync (go straight to inbox, trigger background sync)
  const handleSkipSync = async () => {
    try {
      // Mark onboarding as complete but flag for background sync
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('user_profiles')
        .update({
          onboarding_completed: true,
          initial_sync_pending: true, // Background job will pick this up
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      // Trigger background sync asynchronously (don't await)
      // This fires off the request but doesn't block the user
      fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxResults: 50,
          runAnalysis: true,
          analysisMaxEmails: 25, // Smaller batch for background
        }),
      }).catch((err) => {
        // Log but don't block - scheduled sync will catch it
        logger.warn('Background sync trigger failed, will retry via scheduler', { error: err });
      });

      toast({
        title: 'Setup skipped',
        description: 'Your emails will be analyzed in the background.',
      });

      await refreshSession();
      router.replace('/discover');
    } catch (error) {
      logger.error('Failed to skip sync', { error });
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
    return <FullPageLoader message="Starting email analysis..." />;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sync in progress UI
  // ───────────────────────────────────────────────────────────────────────────

  if (isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6">
            {/* Icon and Title */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <span className="text-3xl animate-pulse">✨</span>
              </div>
              <h2 className="text-2xl font-bold">Analyzing Your Emails</h2>
              <p className="text-muted-foreground mt-2">{syncStep}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Progress</span>
                <span>{syncProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>

            {/* Discoveries so far */}
            {(discoveries.actionItems > 0 ||
              discoveries.events > 0 ||
              discoveries.clientsDetected.length > 0) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Found so far:</p>
                <div className="flex flex-wrap gap-2">
                  {discoveries.actionItems > 0 && (
                    <Badge variant="secondary">
                      {discoveries.actionItems} action items
                    </Badge>
                  )}
                  {discoveries.events > 0 && (
                    <Badge variant="secondary">
                      {discoveries.events} events
                    </Badge>
                  )}
                  {discoveries.clientsDetected.map((client) => (
                    <Badge key={client} variant="outline">
                      Client: {client}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Estimated time */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              This usually takes 30-60 seconds
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sync error UI
  // ───────────────────────────────────────────────────────────────────────────

  if (syncError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <span className="text-3xl">😕</span>
              </div>
              <h2 className="text-2xl font-bold">Analysis Failed</h2>
              <p className="text-muted-foreground mt-2">{syncError}</p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRetrySync}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Try Again
              </button>
              <button
                onClick={handleSkipSync}
                className="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent"
              >
                Skip for Now
              </button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4">
              You can always run the analysis later from Settings
            </p>
          </CardContent>
        </Card>
      </div>
    );
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
