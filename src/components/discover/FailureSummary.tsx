/**
 * FailureSummary Component
 *
 * Displays emails that failed AI analysis during initial sync.
 * Provides transparency about partial failures and option to retry.
 *
 * @module components/discover/FailureSummary
 */

'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AnalysisFailure } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface FailureSummaryProps {
  /** Array of analysis failures */
  failures: AnalysisFailure[];
  /** Callback when retry is requested */
  onRetry?: (failureIds: string[]) => Promise<void>;
  /** Whether to start collapsed */
  defaultCollapsed?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays failed analysis emails with retry option.
 *
 * @example
 * ```tsx
 * <FailureSummary
 *   failures={result.failures}
 *   onRetry={async (ids) => {
 *     await retryAnalysis(ids);
 *   }}
 * />
 * ```
 */
export function FailureSummary({
  failures,
  onRetry,
  defaultCollapsed = true,
}: FailureSummaryProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isRetrying, setIsRetrying] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleRetry = async () => {
    if (!onRetry) return;

    const retryableIds = failures
      .filter((f) => f.canRetry)
      .map((f) => f.emailId);

    if (retryableIds.length === 0) return;

    setIsRetrying(true);
    try {
      await onRetry(retryableIds);
    } finally {
      setIsRetrying(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (failures.length === 0) {
    return null; // Don't show anything if no failures
  }

  // Count retryable failures
  const retryableCount = failures.filter((f) => f.canRetry).length;

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>⚠️</span>
              Analysis Issues
              <Badge variant="outline" className="text-amber-700 border-amber-300">
                {failures.length}
              </Badge>
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? 'Show details' : 'Hide'}
          </Button>
        </div>
        <CardDescription className="text-amber-700">
          {failures.length === 1
            ? '1 email couldn\'t be analyzed'
            : `${failures.length} emails couldn't be analyzed`}
          . These are saved but uncategorized.
        </CardDescription>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-3">
          {/* Failure List */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {failures.map((failure) => (
              <div
                key={failure.emailId}
                className="flex items-start gap-2 p-2 bg-white rounded border border-amber-200"
              >
                <span className="text-amber-500 mt-0.5">
                  {failure.canRetry ? '🔄' : '❌'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={failure.subject}>
                    {failure.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    From: {failure.sender}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {failure.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Retry Button */}
          {retryableCount > 0 && onRetry && (
            <div className="flex items-center justify-between pt-2 border-t border-amber-200">
              <p className="text-xs text-muted-foreground">
                {retryableCount} can be retried (may use additional tokens)
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={isRetrying}
                onClick={handleRetry}
                className="border-amber-300"
              >
                {isRetrying ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Retrying...
                  </>
                ) : (
                  <>
                    🔄 Retry {retryableCount}
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default FailureSummary;
