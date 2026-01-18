/**
 * DiscoveryHero Component
 *
 * Hero section for the Discovery Dashboard showing summary stats
 * and a welcoming message after initial sync completes.
 *
 * @module components/discover/DiscoveryHero
 */

'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { SyncStats } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface DiscoveryHeroProps {
  /** Sync statistics */
  stats: SyncStats;
  /** User's name for personalization */
  userName?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format cost as currency.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '< $0.01';
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays the hero section with stats and welcome message.
 *
 * @example
 * ```tsx
 * <DiscoveryHero
 *   stats={result.stats}
 *   userName="Hazel"
 * />
 * ```
 */
export function DiscoveryHero({ stats, userName }: DiscoveryHeroProps) {
  const greeting = userName ? `Great news, ${userName}!` : 'Great news!';

  // Calculate success rate
  const totalProcessed = stats.analyzed + stats.failed;
  const successRate =
    totalProcessed > 0
      ? Math.round((stats.analyzed / totalProcessed) * 100)
      : 100;

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Hero Message */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
          <span className="text-3xl">✨</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-xl text-muted-foreground mt-2">
          Here&apos;s what we found in your last {stats.totalFetched} emails
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Emails Analyzed */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.analyzed}</p>
              <p className="text-sm text-blue-600/80">Emails Analyzed</p>
            </div>
          </CardContent>
        </Card>

        {/* Pre-filtered */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">{stats.preFiltered}</p>
              <p className="text-sm text-emerald-600/80">Auto-sorted</p>
            </div>
          </CardContent>
        </Card>

        {/* Processing Time */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">
                {formatDuration(stats.processingTimeMs)}
              </p>
              <p className="text-sm text-purple-600/80">Processing Time</p>
            </div>
          </CardContent>
        </Card>

        {/* Cost */}
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-600">
                {formatCost(stats.estimatedCost)}
              </p>
              <p className="text-sm text-amber-600/80">AI Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
        {stats.totalTokensUsed > 0 && (
          <span className="flex items-center gap-1">
            <span>🔢</span>
            {stats.totalTokensUsed.toLocaleString()} tokens used
          </span>
        )}
        {successRate < 100 && (
          <span className="flex items-center gap-1">
            <span>✓</span>
            {successRate}% success rate
          </span>
        )}
        {stats.failed > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span>⚠️</span>
            {stats.failed} couldn&apos;t be analyzed
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default DiscoveryHero;
