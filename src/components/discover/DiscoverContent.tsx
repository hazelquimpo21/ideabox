/**
 * Discover Content Component
 *
 * Extracted from the discover page for use inside the Inbox tabbed UI.
 * Contains the full discovery dashboard (category cards, client insights,
 * quick actions) along with sync/analysis states.
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
import { StartAnalysisCard } from '@/components/discover/StartAnalysisCard';
import { SyncProgressCard } from '@/components/discover/SyncProgressCard';
import { useToast } from '@/components/ui/use-toast';
import { useInitialSyncProgress } from '@/hooks/useInitialSyncProgress';
import { createLogger } from '@/lib/utils/logger';
import { CATEGORY_DISPLAY } from '@/types/discovery';
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
      toast({ title: 'Analysis complete!', description: `Analyzed ${completedResult.stats.analyzed} emails` });
    },
    onError: (errorMsg) => {
      logger.error('Sync failed', { error: errorMsg });
      setError(errorMsg);
      setIsSyncing(false);
    },
  });

  const refreshResults = useCallback(async () => {
    logger.info('Refreshing results');
    try {
      const response = await fetch('/api/onboarding/sync-status', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' && data.result) {
          logger.success('Results refreshed', { categories: data.result.categories.length });
          setResult(data.result);
        }
      }
    } catch (err) {
      logger.warn('Failed to refresh results', { error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function fetchResult() {
      try {
        const response = await fetch('/api/onboarding/sync-status', { credentials: 'include' });
        if (!isMounted) return;
        if (!response.ok) { setNeedsSync(true); return; }
        const data = await response.json();
        if (!isMounted) return;
        if (data.status === 'completed' && data.result) { setResult(data.result); }
        else if (data.status === 'failed') { setError(data.error || 'Previous sync failed'); setNeedsSync(true); }
        else if (data.status === 'in_progress') { setIsSyncing(true); startPolling(); }
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

  const handleRetryFailures = async (failureIds: string[]) => {
    toast({ title: 'Retrying...', description: `Retrying ${failureIds.length} failed analyses` });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    toast({ title: 'Retry complete', description: 'Some emails may have been re-analyzed' });
  };

  const handleGoToInbox = () => { router.push('/inbox'); };

  const handleCategoryClick = (category: CategorySummary) => {
    logger.info('Opening category modal', { category: category.category });
    setSelectedCategory(category.category);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    router.replace('/inbox', { scroll: false });
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

  // ─── Needs Sync State ──────────────────────────────────────────────────────
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

  // ─── Success State ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <DiscoveryHero stats={result.stats} userName={user?.email?.split('@')[0]} />

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
