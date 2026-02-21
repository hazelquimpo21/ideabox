/**
 * Onboarding Page
 *
 * Entry point for the onboarding wizard. This page:
 * - Requires authentication (redirects to home if not logged in)
 * - Manages wizard state and step navigation
 * - On completion, triggers initial email sync + analysis with progress UI
 * - Shows real-time sync progress before redirecting to inbox
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
// SYNC PROGRESS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface SyncProgressInfo {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  discoveries: {
    actionItems: number;
    events: number;
    clientsDetected: string[];
  };
  error?: string;
}

function InitialSyncProgress({
  syncProgress,
  onRetry,
}: {
  syncProgress: SyncProgressInfo;
  onRetry: () => void;
}) {
  const { progress, currentStep, discoveries, status } = syncProgress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Setting up your inbox
          </h2>
          <p className="text-muted-foreground">
            {status === 'failed'
              ? 'Something went wrong during setup.'
              : 'Fetching and analyzing your emails...'}
          </p>
        </div>

        {/* Progress bar */}
        {status !== 'failed' && (
          <div className="mb-6">
            <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-sm">
              <span className="text-muted-foreground">{currentStep}</span>
              <span className="text-muted-foreground font-medium">{progress}%</span>
            </div>
          </div>
        )}

        {/* Discoveries - show what we've found so far */}
        {(discoveries.actionItems > 0 || discoveries.events > 0 || discoveries.clientsDetected.length > 0) && (
          <div className="rounded-lg border bg-muted/30 p-4 mb-6">
            <p className="text-sm font-medium text-foreground mb-2">Found so far:</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              {discoveries.actionItems > 0 && (
                <p>{discoveries.actionItems} action item{discoveries.actionItems !== 1 ? 's' : ''}</p>
              )}
              {discoveries.events > 0 && (
                <p>{discoveries.events} event{discoveries.events !== 1 ? 's' : ''}</p>
              )}
              {discoveries.clientsDetected.length > 0 && (
                <p>{discoveries.clientsDetected.length} client{discoveries.clientsDetected.length !== 1 ? 's' : ''} detected</p>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'failed' && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-6">
            <p className="text-sm text-destructive">
              {syncProgress.error || 'Sync failed. You can retry or skip to your inbox.'}
            </p>
          </div>
        )}

        {/* Actions for error state */}
        {status === 'failed' && (
          <div className="flex gap-3">
            <button
              onClick={onRetry}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Subtle loading indicator */}
        {status !== 'failed' && (
          <div className="flex justify-center">
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [syncProgress, setSyncProgress] = React.useState<SyncProgressInfo>({
    status: 'pending',
    progress: 0,
    currentStep: 'Starting...',
    discoveries: { actionItems: 0, events: 0, clientsDetected: [] },
  });
  const [lastSyncConfig, setLastSyncConfig] = React.useState<SyncConfig | undefined>();

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
  // NOTE: Sync progress polling removed — after onboarding, users are
  // redirected to /inbox immediately while sync runs in the background.
  // The EmailSyncBanner in the auth layout shows progress.
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // Handle wizard completion - trigger sync with progress
  // ───────────────────────────────────────────────────────────────────────────

  const triggerSync = React.useCallback(async (syncConfig?: SyncConfig) => {
    if (!user) return;

    setIsCompleting(true);
    setLastSyncConfig(syncConfig);

    logger.start('Completing onboarding', {
      userId: user.id,
      syncConfig,
    });

    try {
      // Mark onboarding as complete in user_profiles so auth context updates
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

      // Refresh session so auth context has onboarding_completed = true
      // (needed for ProtectedRoute to not redirect back to onboarding)
      await refreshSession();

      // Fire off the initial sync request (don't await — it runs in the background).
      // The server will continue processing even after we navigate away.
      // The EmailSyncBanner in the auth layout polls for progress.
      fetch('/api/onboarding/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxEmails: syncConfig?.initialEmailCount ?? 50,
          includeRead: syncConfig?.includeReadEmails ?? true,
        }),
      }).catch((err) => {
        logger.warn('Initial sync request failed (will retry from inbox)', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

      logger.info('Sync triggered, redirecting to inbox');

      // Redirect to inbox immediately — emails will appear as they sync
      router.replace('/inbox');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to complete onboarding', { error: message });

      setSyncProgress((prev: SyncProgressInfo) => ({
        ...prev,
        status: 'failed' as const,
        error: message,
      }));
    }
  }, [user, supabase, refreshSession, router]);

  const handleComplete = async (syncConfig?: SyncConfig) => {
    await triggerSync(syncConfig);
  };

  const handleRetry = () => {
    triggerSync(lastSyncConfig);
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
    // Show a brief loading state while we mark onboarding complete and redirect.
    // The actual sync progress is shown via EmailSyncBanner on the inbox page.
    return <FullPageLoader message="Setting up your inbox..." />;
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
