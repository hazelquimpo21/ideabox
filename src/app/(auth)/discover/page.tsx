/**
 * Discovery Dashboard Page
 *
 * Displays the results of initial email batch analysis.
 * Shows category cards, client insights, and quick actions.
 *
 * This page handles multiple states:
 * - No sync yet: Shows "Start Analysis" UI to trigger a quick scan
 * - Sync in progress: Shows progress UI with real-time updates
 * - Sync completed: Shows full Discovery Dashboard with results
 * - Sync failed: Shows error with retry option
 *
 * UPDATED (Feb 2026): Added legacy category detection and auto-refresh.
 * If cached sync results contain old category values (action_required, newsletter,
 * etc.), the page will prompt for a re-sync to get fresh data with correct categories.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User visits /discover
 * 2. If no sync data → show "Start Analysis" UI
 * 3. User clicks "Start Analysis" → triggers sync with chosen email count
 * 4. Shows progress UI while syncing
 * 5. Sync completes → shows Discovery Dashboard
 * 6. If legacy categories detected → show info toast and prompt for re-analysis
 *
 * @module app/(auth)/discover/page
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EMAIL_CATEGORIES_SET, isLegacyCategory } from '@/types/discovery';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DiscoveryHero,
  CategoryCardGrid,
  ClientInsights,
  QuickActions,
  FailureSummary,
  CategoryModal,
} from '@/components/discover';
import { useToast } from '@/components/ui/use-toast';
import { useInitialSyncProgress } from '@/hooks/useInitialSyncProgress';
import { StartAnalysisCard, SyncProgressCard } from './components';
import { createLogger } from '@/lib/utils/logger';
import { CATEGORY_DISPLAY } from '@/types/discovery';
import type { InitialSyncResponse, EmailCategory, CategorySummary } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DiscoverPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Pending archive action awaiting confirmation */
interface PendingArchive {
  category: EmailCategory;
  count: number;
  categoryLabel: string;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

/**
 * Discovery Dashboard Page
 */
export default function DiscoverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // State for initial fetch
  const [result, setResult] = useState<InitialSyncResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStartingSync, setIsStartingSync] = useState(false);

  // State for confirmation dialog
  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // State for retry
  const [isRetrying, setIsRetrying] = useState(false);

  // State for category modal
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy Category Detection
  // ───────────────────────────────────────────────────────────────────────────
  // Track whether we've already shown the legacy category warning to avoid spam
  const hasShownLegacyWarning = useRef(false);
  const [hasLegacyCategories, setHasLegacyCategories] = useState(false);

  // Progress tracking for sync
  const {
    progress: syncProgress,
    currentStep: syncStep,
    discoveries,
    startPolling,
    stopPolling,
  } = useInitialSyncProgress({
    onComplete: (completedResult) => {
      logger.success('Sync completed', {
        analyzed: completedResult.stats.analyzed,
        failed: completedResult.stats.failed,
        categories: completedResult.categories.length,
      });
      setResult(completedResult);
      setIsSyncing(false);
      toast({
        title: 'Analysis complete!',
        description: `Analyzed ${completedResult.stats.analyzed} emails`,
      });
    },
    onError: (errorMsg) => {
      logger.error('Sync failed', { error: errorMsg });
      setError(errorMsg);
      setIsSyncing(false);
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Refresh Results Function
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Refresh the sync results from the server.
   * Called after actions complete to get fresh data.
   */
  const refreshResults = useCallback(async () => {
    logger.info('Refreshing results');
    try {
      const response = await fetch('/api/onboarding/sync-status', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' && data.result) {
          logger.success('Results refreshed', {
            categories: data.result.categories.length,
          });
          setResult(data.result);
        }
      }
    } catch (err) {
      logger.warn('Failed to refresh results', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      // Don't show error to user - the stale data is still usable
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Result on Mount
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    async function fetchResult() {
      try {
        const response = await fetch('/api/onboarding/sync-status', {
          credentials: 'include',
        });

        if (!isMounted) return;

        if (!response.ok) {
          // If the API fails, show the "start analysis" UI instead of error
          setNeedsSync(true);
          return;
        }

        const data = await response.json();

        if (!isMounted) return;

        if (data.status === 'completed' && data.result) {
          setResult(data.result);
        } else if (data.status === 'failed') {
          setError(data.error || 'Previous sync failed');
          setNeedsSync(true); // Allow retry
        } else if (data.status === 'in_progress') {
          // Sync still running, show progress UI
          setIsSyncing(true);
          startPolling();
        } else {
          // No sync data yet - show "Start Analysis" UI
          setNeedsSync(true);
        }
      } catch {
        if (!isMounted) return;
        // On error, show "Start Analysis" UI
        setNeedsSync(true);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchResult();

    return () => {
      isMounted = false;
      stopPolling();
    };
    // Only run on mount - startPolling/stopPolling are stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy Category Detection Effect
  // ───────────────────────────────────────────────────────────────────────────
  // Check if cached sync results contain old category values. If so, show a
  // warning toast and set state so we can prompt user to re-analyze.

  useEffect(() => {
    if (!result?.categories || hasShownLegacyWarning.current) {
      return;
    }

    // Check if any categories in the result are legacy (old) values
    const legacyCategories = result.categories.filter(
      (cat) => isLegacyCategory(cat.category)
    );

    if (legacyCategories.length > 0) {
      // Found legacy categories in cached data
      const legacyNames = legacyCategories.map((c) => c.category).join(', ');

      logger.warn('Legacy categories detected in cached sync results', {
        legacyCategories: legacyNames,
        totalLegacy: legacyCategories.length,
        totalCategories: result.categories.length,
        hint: 'Run migration 028_category_cleanup_and_cache_clear.sql to fix database',
      });

      setHasLegacyCategories(true);
      hasShownLegacyWarning.current = true;

      // Show info toast to user
      toast({
        title: 'Outdated email categories detected',
        description: 'Some categories need to be refreshed. Click "Re-analyze" to update.',
        duration: 8000,
      });
    }
  }, [result, toast]);

  // ───────────────────────────────────────────────────────────────────────────
  // Start Analysis Handler
  // ───────────────────────────────────────────────────────────────────────────

  const handleStartAnalysis = useCallback(async (emailCount: number) => {
    setIsStartingSync(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxEmails: emailCount,
          includeRead: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start analysis');
      }

      // Sync started, switch to progress UI
      setNeedsSync(false);
      setIsSyncing(true);
      startPolling();

      toast({
        title: 'Analyzing your emails...',
        description: `Scanning your last ${emailCount} emails`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start';
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Failed to start analysis',
        description: message,
      });
    } finally {
      setIsStartingSync(false);
    }
  }, [startPolling, toast]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Handle bulk archive for a category.
   */
  const handleArchiveCategory = async (category: string, count: number) => {
    try {
      const response = await fetch('/api/emails/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to archive emails');
      }

      toast({
        title: 'Success',
        description: `Archived ${count} ${category} emails`,
      });

      // Refresh the result to update counts
      // For now, just update locally
      if (result) {
        setResult({
          ...result,
          categories: result.categories.map((c) =>
            c.category === category
              ? { ...c, count: 0, unreadCount: 0 }
              : c
          ),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Archive failed';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      throw err; // Re-throw so QuickActions knows it failed
    }
  };

  /**
   * Handle add client.
   */
  const handleAddClient = (clientName: string) => {
    // Navigate to clients page with pre-filled name
    router.push(`/clients?add=${encodeURIComponent(clientName)}`);
  };

  /**
   * Handle retry failures.
   */
  const handleRetryFailures = async (failureIds: string[]) => {
    toast({
      title: 'Retrying...',
      description: `Retrying ${failureIds.length} failed analyses`,
    });

    // TODO: Implement retry endpoint
    // For now, just show a message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    toast({
      title: 'Retry complete',
      description: 'Some emails may have been re-analyzed',
    });
  };

  /**
   * Navigate to inbox (legacy - now redirects to discover).
   */
  const handleGoToInbox = () => {
    router.push('/discover');
  };

  /**
   * Open modal for a category.
   */
  const handleCategoryClick = (category: CategorySummary) => {
    logger.info('Opening category modal', { category: category.category });
    setSelectedCategory(category.category);
    setIsModalOpen(true);
  };

  /**
   * Close the category modal.
   */
  const handleModalClose = () => {
    setIsModalOpen(false);
    // Clear the URL parameter
    router.replace('/discover', { scroll: false });
    // Delay clearing the category so the close animation can finish
    setTimeout(() => setSelectedCategory(null), 200);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // URL Parameter Effect: Open modal from ?modal=category
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const modalCategory = searchParams.get('modal');
    if (modalCategory && EMAIL_CATEGORIES_SET.has(modalCategory) && result) {
      logger.info('Opening modal from URL parameter', { category: modalCategory });
      setSelectedCategory(modalCategory as EmailCategory);
      setIsModalOpen(true);
    }
  }, [searchParams, result]);

  // ───────────────────────────────────────────────────────────────────────────
  // Loading State
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Needs Sync State - Show "Start Analysis" UI
  // ───────────────────────────────────────────────────────────────────────────

  if (needsSync && !isSyncing) {
    return (
      <StartAnalysisCard
        error={error}
        isStartingSync={isStartingSync}
        onStartAnalysis={handleStartAnalysis}
        onSkip={handleGoToInbox}
      />
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Syncing State - Show Progress UI
  // ───────────────────────────────────────────────────────────────────────────

  if (isSyncing) {
    return (
      <SyncProgressCard
        progress={syncProgress}
        currentStep={syncStep}
        discoveries={discoveries}
      />
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Error State (only if not needsSync - otherwise handled above)
  // ───────────────────────────────────────────────────────────────────────────

  if (!result) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-6">
            {error || 'We couldn\'t load your analysis results.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setNeedsSync(true)}>
              Try Again
            </Button>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Success State
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Hero Section */}
      <DiscoveryHero
        stats={result.stats}
        userName={user?.email?.split('@')[0]}
      />

      {/* Legacy Categories Warning Banner */}
      {hasLegacyCategories && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                Email categories need updating
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Your email analysis uses an older category system. Re-run the analysis
                to get more accurate categorization with the new life-bucket categories.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
              onClick={() => {
                setNeedsSync(true);
                setHasLegacyCategories(false);
              }}
            >
              Re-analyze
            </Button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {result.suggestedActions.length > 0 && (
        <QuickActions
          actions={result.suggestedActions}
          onArchiveCategory={handleArchiveCategory}
          onAddClient={handleAddClient}
        />
      )}

      {/* Category Cards */}
      <section>
        <h2 className="text-xl font-semibold mb-4">
          Your Emails by Category
        </h2>
        <CategoryCardGrid
          categories={result.categories}
          hideEmpty={false}
          onCategoryClick={handleCategoryClick}
        />
      </section>

      {/* Category Modal for quick triage */}
      <CategoryModal
        category={selectedCategory}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onEmailArchived={() => {
          // Refresh results after archiving
          refreshResults();
        }}
      />

      {/* Client Insights */}
      {result.clientInsights.length > 0 && (
        <section>
          <ClientInsights
            insights={result.clientInsights}
            onAddClient={handleAddClient}
          />
        </section>
      )}

      {/* Failures (if any) */}
      {result.failures.length > 0 && (
        <section>
          <FailureSummary
            failures={result.failures}
            onRetry={handleRetryFailures}
            defaultCollapsed={result.failures.length < 3}
          />
        </section>
      )}

      {/* Call to Action */}
      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={handleGoToInbox}
          className="min-w-[200px]"
        >
          Go to Inbox
          <span className="ml-2">→</span>
        </Button>
      </div>

      {/* Footer Note */}
      <p className="text-center text-sm text-muted-foreground pb-8">
        Your emails will continue to sync automatically every hour.
        <br />
        You can always come back to this view from Settings.
      </p>
    </div>
  );
}
