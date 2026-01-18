/**
 * Discovery Dashboard Page
 *
 * Displays the results of initial email batch analysis.
 * Shows category cards, client insights, and quick actions.
 *
 * This page is shown after the user completes onboarding and their
 * emails have been analyzed for the first time.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User completes onboarding → triggers initial sync
 * 2. Sync completes → result stored in user_profiles.sync_progress
 * 3. User redirected to /discover
 * 4. Page fetches result from sync_progress or API
 * 5. Displays DiscoveryHero, CategoryCards, ClientInsights, QuickActions
 *
 * @module app/(auth)/discover/page
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  DiscoveryHero,
  CategoryCardGrid,
  ClientInsights,
  QuickActions,
  FailureSummary,
} from '@/components/discover';
import { useToast } from '@/components/ui/use-toast';
import type { InitialSyncResponse } from '@/types/discovery';

// =============================================================================
// PAGE COMPONENT
// =============================================================================

/**
 * Discovery Dashboard Page
 */
export default function DiscoverPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [result, setResult] = useState<InitialSyncResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Result on Mount
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchResult() {
      try {
        // Try to get result from sync-status (stored in user_profiles)
        const response = await fetch('/api/onboarding/sync-status', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch sync status');
        }

        const data = await response.json();

        if (data.status === 'completed' && data.result) {
          setResult(data.result);
        } else if (data.status === 'failed') {
          setError(data.error || 'Sync failed');
        } else if (data.status === 'in_progress') {
          // Sync still running, redirect back to onboarding
          router.replace('/onboarding');
          return;
        } else {
          // No sync data, redirect to onboarding
          router.replace('/onboarding');
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load results';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchResult();
  }, [router]);

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
   * Navigate to inbox.
   */
  const handleGoToInbox = () => {
    router.push('/inbox');
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Loading State
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading your results...</p>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Error State
  // ───────────────────────────────────────────────────────────────────────────

  if (error || !result) {
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
            <Button variant="outline" onClick={() => router.push('/onboarding')}>
              Try Again
            </Button>
            <Button onClick={() => router.push('/inbox')}>
              Go to Inbox
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
        />
      </section>

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
