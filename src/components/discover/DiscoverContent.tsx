/**
 * Discover Content Component
 *
 * Extracted from the discover page for use inside the Inbox tabbed UI.
 * Contains the full discovery dashboard (category cards, client insights,
 * quick actions) along with sync/analysis states.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LIVE DATA FALLBACK (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The cached sync_progress result from onboarding can be stale or empty
 * (e.g., initial sync found 0 emails but background sync later fetched real
 * emails). When the cached result is empty/stale, this component now falls
 * back to live data from GET /api/emails/category-summary, which builds
 * category summaries directly from the emails table.
 *
 * This also fixes the "analysis loop" bug: after onboarding completes,
 * StartAnalysisCard is no longer shown (it would call initial-sync which
 * returns 409). Instead, onboarded users see live email data or a helpful
 * waiting state.
 *
 * @module components/discover/DiscoverContent
 * @since February 2026 — Phase 4 Navigation Redesign
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EMAIL_CATEGORIES_SET, isLegacyCategory } from '@/types/discovery';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
// Dialog imports removed — CategoryModal handles its own Dialog component
import {
  DiscoveryHero,
  CategoryCardGrid,
  ClientInsights,
  QuickActions,
  FailureSummary,
  CategoryModal,
} from '@/components/discover';
import { StartAnalysisCard } from '@/components/discover/StartAnalysisCard';
import { SyncProgressCard } from '@/components/discover/SyncProgressCard';
import { useToast } from '@/components/ui/use-toast';
import { useInitialSyncProgress } from '@/hooks/useInitialSyncProgress';
import { createLogger } from '@/lib/utils/logger';
import type { InitialSyncResponse, EmailCategory, CategorySummary } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DiscoverContent');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PendingArchive {
  category: EmailCategory;
  count: number;
  categoryLabel: string;
}

/** Response from GET /api/emails/category-summary */
interface LiveCategorySummaryResponse {
  categories: CategorySummary[];
  stats: { total: number; analyzed: number; unanalyzed: number };
  result: InitialSyncResponse;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a cached InitialSyncResponse is effectively empty
 * (i.e., 0 analyzed emails and 0 categories).
 */
function isCachedResultEmpty(result: InitialSyncResponse): boolean {
  return result.categories.length === 0 && result.stats.analyzed === 0;
}

/**
 * Empty InitialSyncResponse used as a placeholder so the dashboard layout
 * always renders (hero, category grid, etc.) even when no data exists yet.
 */
const EMPTY_RESULT: InitialSyncResponse = {
  success: true,
  stats: { totalFetched: 0, preFiltered: 0, analyzed: 0, failed: 0, totalTokensUsed: 0, estimatedCost: 0, processingTimeMs: 0 },
  categories: [],
  clientInsights: [],
  failures: [],
  suggestedActions: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DiscoverContent — full discovery dashboard content.
 * Extracted from DiscoverPage for use inside InboxTabs.
 */
export function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [result, setResult] = useState<InitialSyncResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStartingSync, setIsStartingSync] = useState(false);

  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasShownLegacyWarning = useRef(false);
  const [hasLegacyCategories, setHasLegacyCategories] = useState(false);

  // Live email counts from the category-summary API (used for empty-state decisions)
  const [liveEmailStats, setLiveEmailStats] = useState<{ total: number; analyzed: number; unanalyzed: number } | null>(null);

  // When true, polls for live email data every few seconds so categories
  // populate incrementally as emails are synced/analyzed in the background.
  const [isPollingForEmails, setIsPollingForEmails] = useState(false);

  const {
    progress: syncProgress,
    currentStep: syncStep,
    discoveries,
    startPolling,
    stopPolling,
  } = useInitialSyncProgress({
    pollInterval: 3000,
    onComplete: (completedResult) => {
      logger.success('Sync completed', {
        analyzed: completedResult.stats.analyzed,
        failed: completedResult.stats.failed,
        categories: completedResult.categories.length,
      });
      setResult(completedResult);
      setIsSyncing(false);
      toast({ title: 'Analysis complete!', description: `Analyzed ${completedResult.stats.analyzed} emails` });
    },
    onError: (errorMsg) => {
      logger.error('Sync failed', { error: errorMsg });
      setError(errorMsg);
      setIsSyncing(false);
      // Fall back — but only show StartAnalysisCard for non-onboarded users.
      // For onboarded users, fetchLiveCategories will handle it.
      setNeedsSync(true);
    },
  });

  // ─── Fetch live category data from the emails table ───────────────────────
  const fetchLiveCategories = useCallback(async (): Promise<boolean> => {
    logger.info('Fetching live category data from emails table');
    try {
      const response = await fetch('/api/emails/category-summary', { credentials: 'include' });
      if (!response.ok) return false;
      const data: LiveCategorySummaryResponse = await response.json();
      setLiveEmailStats(data.stats);

      if (data.stats.analyzed > 0 && data.categories.length > 0) {
        logger.success('Live category data loaded', {
          categories: data.categories.length,
          analyzed: data.stats.analyzed,
        });
        setResult(data.result);
        setNeedsSync(false);
        return true;
      }
      return false;
    } catch (err) {
      logger.warn('Failed to fetch live categories', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return false;
    }
  }, []);

  const refreshResults = useCallback(async () => {
    logger.info('Refreshing results');
    try {
      // Try live data first (always reflects actual DB state)
      const gotLive = await fetchLiveCategories();
      if (gotLive) return;

      // Fall back to cached sync-status
      const response = await fetch('/api/onboarding/sync-status', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' && data.result) {
          logger.success('Results refreshed from cache', { categories: data.result.categories.length });
          setResult(data.result);
        }
      }
    } catch (err) {
      logger.warn('Failed to refresh results', { error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [fetchLiveCategories]);

  useEffect(() => {
    let isMounted = true;
    async function fetchResult() {
      try {
        const response = await fetch('/api/onboarding/sync-status', { credentials: 'include' });
        if (!isMounted) return;
        if (!response.ok) { setNeedsSync(true); return; }
        const data = await response.json();
        if (!isMounted) return;

        if (data.status === 'completed' && data.result) {
          // Cached result exists — but it may be stale (0 categories from
          // an initial sync that found no emails). Check if it's empty and
          // try live data instead.
          if (isCachedResultEmpty(data.result) && user?.onboardingCompleted) {
            logger.info('Cached sync result is empty, trying live email data');
            const gotLive = await fetchLiveCategories();
            if (!isMounted) return;
            if (!gotLive) {
              // No live data yet — show the dashboard with an inline banner
              // and start polling so categories populate incrementally.
              setResult(data.result);
              setIsPollingForEmails(true);
            }
          } else {
            setResult(data.result);
          }
        }
        else if (data.status === 'failed') {
          // Sync failed — for onboarded users, try live data before falling
          // back to error state. Show dashboard layout either way.
          if (user?.onboardingCompleted) {
            const gotLive = await fetchLiveCategories();
            if (!isMounted) return;
            if (!gotLive) {
              // Show dashboard with inline banner + start polling
              setResult(EMPTY_RESULT);
              setIsPollingForEmails(true);
            }
          } else {
            setError(data.error || 'Previous sync failed');
            setNeedsSync(true);
          }
        }
        else if (data.status === 'in_progress') { setIsSyncing(true); startPolling(true); }
        else if (data.status === 'pending' && user?.onboardingCompleted) {
          // Sync hasn't started yet — don't waste requests polling sync-status.
          // Just show the dashboard with an inline banner and poll for live
          // category data so categories appear as emails arrive.
          logger.info('Sync pending after onboarding, showing dashboard with live poll');
          const gotLive = await fetchLiveCategories();
          if (!isMounted) return;
          if (!gotLive) {
            setResult(EMPTY_RESULT);
            setIsPollingForEmails(true);
          }
        }
        else if (user?.onboardingCompleted) {
          // Onboarding done but no cached sync data — show dashboard with
          // inline banner and poll for live data so categories appear as
          // emails are synced and analyzed.
          logger.info('No cached sync data for onboarded user, starting live poll');
          const gotLive = await fetchLiveCategories();
          if (!isMounted) return;
          if (!gotLive) {
            setResult(EMPTY_RESULT);
            setIsPollingForEmails(true);
          }
        }
        else { setNeedsSync(true); }
      } catch {
        if (!isMounted) return;
        setNeedsSync(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchResult();
    return () => { isMounted = false; stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Polling: incrementally populate categories as emails are analyzed ──────
  useEffect(() => {
    if (!isPollingForEmails) return;

    let isMounted = true;
    const POLL_INTERVAL = 5000; // 5 seconds
    const MAX_POLLS = 60; // 5 minutes max
    let pollCount = 0;

    const poll = async () => {
      if (!isMounted || pollCount >= MAX_POLLS) {
        setIsPollingForEmails(false);
        return;
      }
      pollCount++;
      const gotData = await fetchLiveCategories();
      if (gotData) {
        // Data arrived — stop polling, result is already set by fetchLiveCategories
        logger.success('Polling found email data, stopping poll');
        setIsPollingForEmails(false);
      }
    };

    // Run immediately once, then on interval
    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isPollingForEmails, fetchLiveCategories]);

  useEffect(() => {
    if (!result?.categories || hasShownLegacyWarning.current) return;
    const legacyCategories = result.categories.filter((cat) => isLegacyCategory(cat.category));
    if (legacyCategories.length > 0) {
      logger.warn('Legacy categories detected in cached sync results', {
        legacyCategories: legacyCategories.map((c) => c.category).join(', '),
        totalLegacy: legacyCategories.length,
        totalCategories: result.categories.length,
      });
      setHasLegacyCategories(true);
      hasShownLegacyWarning.current = true;
      toast({ title: 'Outdated email categories detected', description: 'Some categories need to be refreshed. Click "Re-analyze" to update.', duration: 8000 });
    }
  }, [result, toast]);

  const handleStartAnalysis = useCallback(async (emailCount: number) => {
    setIsStartingSync(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/initial-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ maxEmails: emailCount, includeRead: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start analysis');
      }
      setNeedsSync(false);
      setIsSyncing(true);
      startPolling();
      toast({ title: 'Analyzing your emails...', description: `Scanning your last ${emailCount} emails` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start';
      setError(message);
      toast({ variant: 'destructive', title: 'Failed to start analysis', description: message });
    } finally {
      setIsStartingSync(false);
    }
  }, [startPolling, toast]);

  const handleArchiveCategory = async (category: string, count: number) => {
    try {
      const response = await fetch('/api/emails/bulk-archive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }), credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to archive emails');
      toast({ title: 'Success', description: `Archived ${count} ${category} emails` });
      if (result) {
        setResult({
          ...result,
          categories: result.categories.map((c) => c.category === category ? { ...c, count: 0, unreadCount: 0 } : c),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Archive failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  };

  const handleAddClient = (clientName: string) => {
    router.push(`/contacts?tab=clients&add=${encodeURIComponent(clientName)}`);
  };

  /**
   * Retry AI analysis for emails that previously failed.
   * Calls the real POST /api/emails/retry-analysis endpoint.
   */
  const handleRetryFailures = async (failureIds: string[]) => {
    logger.info('Retrying failed analyses', { count: failureIds.length, emailIds: failureIds });
    setIsRetrying(true);
    toast({ title: 'Retrying...', description: `Re-analyzing ${failureIds.length} failed email${failureIds.length !== 1 ? 's' : ''}` });

    try {
      const response = await fetch('/api/emails/retry-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emailIds: failureIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Retry failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      const summary = data.data?.summary || data.summary || {};

      logger.success('Retry analysis complete', {
        succeeded: summary.succeeded,
        failed: summary.failed,
        totalTokens: summary.totalTokensUsed,
      });

      toast({
        title: 'Retry complete',
        description: `${summary.succeeded || 0} succeeded, ${summary.failed || 0} failed`,
      });

      // Refresh the dashboard to reflect updated analysis results
      await refreshResults();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retry failed';
      logger.error('Retry analysis failed', { error: message });
      toast({ variant: 'destructive', title: 'Retry failed', description: message });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleGoToInbox = () => { router.push('/inbox'); };

  const handleCategoryClick = (category: CategorySummary) => {
    logger.info('Opening category modal', { category: category.category });
    setSelectedCategory(category.category);
    setIsModalOpen(true);
  };

  /**
   * Close the category modal.
   *
   * Only cleans up the `?modal=` query param if we're staying on the inbox
   * page. If the modal is closing because the user clicked an email (which
   * triggers router.push to the detail page), we must NOT call
   * router.replace — that would overwrite the pending navigation and strand
   * the user on /inbox instead of going to the email detail.
   *
   * We detect the "navigating away" case by checking a ref that
   * handleEmailClick sets before calling onClose.
   */
  const isNavigatingToEmailRef = useRef(false);

  const handleModalClose = () => {
    setIsModalOpen(false);

    // Only replace the URL to clean up ?modal= if we're NOT navigating
    // to an email detail page. If we are, the router.push from
    // handleEmailClick will handle the URL change.
    if (!isNavigatingToEmailRef.current) {
      router.replace('/inbox', { scroll: false });
    }
    isNavigatingToEmailRef.current = false;

    setTimeout(() => setSelectedCategory(null), 200);
  };

  useEffect(() => {
    const modalCategory = searchParams.get('modal');
    if (modalCategory && EMAIL_CATEGORIES_SET.has(modalCategory) && result) {
      logger.info('Opening modal from URL parameter', { category: modalCategory });
      setSelectedCategory(modalCategory as EmailCategory);
      setIsModalOpen(true);
    }
  }, [searchParams, result]);

  // ─── Redirect onboarded users away from needsSync ──────────────────────────
  // For onboarded users: NEVER show StartAnalysisCard (calling initial-sync
  // after onboarding returns 409, creating a confusing error loop).
  // Instead, show the dashboard with an inline banner and poll for live data.
  // NOTE: Must be above early returns to satisfy Rules of Hooks.
  useEffect(() => {
    if (needsSync && !isSyncing && user?.onboardingCompleted && !result) {
      setResult(EMPTY_RESULT);
      setIsPollingForEmails(true);
      setNeedsSync(false);
    }
  }, [needsSync, isSyncing, user?.onboardingCompleted, result]);

  // ─── Loading State ─────────────────────────────────────────────────────────
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

  // ─── Needs Sync State (non-onboarded users only) ──────────────────────────
  if (needsSync && !isSyncing && !user?.onboardingCompleted) {
    return (
      <StartAnalysisCard
        error={error}
        isStartingSync={isStartingSync}
        onStartAnalysis={handleStartAnalysis}
        onSkip={handleGoToInbox}
      />
    );
  }

  // ─── Syncing State ─────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <SyncProgressCard
        progress={syncProgress}
        currentStep={syncStep}
        discoveries={discoveries}
      />
    );
  }

  // ─── Error State ───────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-3xl">:(</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-6">
            {error || 'We couldn\'t load your analysis results.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setNeedsSync(true)}>Try Again</Button>
            <Button onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success State ──────────────────────────────────────────────────────────
  // Always render the full dashboard layout. When result is empty, the inline
  // banner shows a helpful message while polling fills in categories.
  return (
    <div className="space-y-8">
      {/* Show hero only when we have actual data */}
      {result.stats.analyzed > 0 && (
        <DiscoveryHero stats={result.stats} userName={user?.email?.split('@')[0]} />
      )}

      {/* Inline banner when emails are still being synced/analyzed */}
      {(isPollingForEmails || isCachedResultEmpty(result)) && user?.onboardingCompleted && (
        <InlineSyncBanner liveEmailStats={liveEmailStats} isPolling={isPollingForEmails} />
      )}

      {hasLegacyCategories && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">!</span>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Email categories need updating</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Your email analysis uses an older category system. Re-run the analysis to get more accurate categorization with the new life-bucket categories.</p>
            </div>
            <Button variant="outline" size="sm" className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30" onClick={() => { setNeedsSync(true); setHasLegacyCategories(false); }}>Re-analyze</Button>
          </div>
        </div>
      )}

      {result.suggestedActions.length > 0 && (
        <QuickActions actions={result.suggestedActions} onArchiveCategory={handleArchiveCategory} onAddClient={handleAddClient} />
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">Your Emails by Category</h2>
        <CategoryCardGrid categories={result.categories} hideEmpty={false} onCategoryClick={handleCategoryClick} />
      </section>

      <CategoryModal
        category={selectedCategory}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onEmailArchived={() => { refreshResults(); }}
        onEmailClick={(email) => {
          // Signal that we're navigating to an email detail page so
          // handleModalClose doesn't overwrite the navigation with router.replace.
          isNavigatingToEmailRef.current = true;
          const urlCategory = selectedCategory || email.category || 'uncategorized';
          logger.info('Navigating to email from modal', { emailId: email.id, category: urlCategory });
          router.push(`/inbox/${urlCategory}/${email.id}?from=categories`);
          // Close modal state so it doesn't reopen on back-navigation
          handleModalClose();
        }}
      />

      {result.clientInsights.length > 0 && (
        <section><ClientInsights insights={result.clientInsights} onAddClient={handleAddClient} /></section>
      )}

      {result.failures.length > 0 && (
        <section><FailureSummary failures={result.failures} onRetry={handleRetryFailures} defaultCollapsed={result.failures.length < 3} /></section>
      )}

      <p className="text-center text-sm text-muted-foreground pb-8">
        Your emails will continue to sync automatically every hour.
        <br />
        You can always come back to this view from Settings.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE SYNC BANNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compact inline banner shown while emails are being synced/analyzed.
 * Lives within the normal dashboard layout so users can explore the app.
 * Categories will populate incrementally as polling finds new data.
 */
function InlineSyncBanner({
  liveEmailStats,
  isPolling,
}: {
  liveEmailStats: { total: number; analyzed: number; unanalyzed: number } | null;
  isPolling: boolean;
}) {
  const hasUnanalyzedEmails = liveEmailStats && liveEmailStats.unanalyzed > 0;
  const hasNoEmails = !liveEmailStats || liveEmailStats.total === 0;

  let message: string;
  if (hasNoEmails) {
    message = 'Syncing emails from Gmail — categories will appear here shortly.';
  } else if (hasUnanalyzedEmails) {
    message = `${liveEmailStats.total} email${liveEmailStats.total !== 1 ? 's' : ''} synced, ${liveEmailStats.unanalyzed} being analyzed — categories will fill in automatically.`;
  } else {
    message = 'Your inbox is connected. New emails will be fetched and categorized automatically.';
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
      <div className="flex items-center gap-3">
        {isPolling && <Spinner size="sm" className="text-blue-600 shrink-0" />}
        <p className="text-sm text-blue-700 dark:text-blue-300">{message}</p>
      </div>
    </div>
  );
}
