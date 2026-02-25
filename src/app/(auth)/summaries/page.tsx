/**
 * Summary History Page
 *
 * Browsable history of AI-synthesized email summaries.
 * Shows summaries grouped by date with expandable details.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Date-grouped list: "Today", "Yesterday", then by date
 * - Expandable summaries: click to reveal themed sections
 * - Pagination: 10 summaries per page with prev/next navigation
 * - Links back to Home for the latest summary
 *
 * Route: /summaries
 *
 * @module app/(auth)/summaries/page
 * @since February 2026
 */

'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout';
import { SummaryHistoryList } from '@/components/summaries/SummaryHistoryList';
import { Button } from '@/components/ui';
import { useSummaryHistory } from '@/hooks/useSummaryHistory';
import { ArrowLeft, FileText } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('SummariesPage');

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SummariesPage() {
  logger.debug('Rendering Summaries history page');

  const {
    items,
    total,
    page,
    hasMore,
    isLoading,
    error,
    nextPage,
    prevPage,
  } = useSummaryHistory({ limit: 10 });

  return (
    <div>
      {/* ─── Page Header ──────────────────────────────────────────────── */}
      <PageHeader
        title="Summary History"
        description="Browse past AI-synthesized email summaries."
        breadcrumbs={[
          { label: 'Home', href: '/home' },
          { label: 'Summaries' },
        ]}
        actions={
          <Link href="/home">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        }
      />

      {/* ─── Summary count badge ───────────────────────────────────────── */}
      {!isLoading && total > 0 && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{total} summaries generated</span>
        </div>
      )}

      {/* ─── Summary history list ──────────────────────────────────────── */}
      <SummaryHistoryList
        items={items}
        total={total}
        page={page}
        hasMore={hasMore}
        isLoading={isLoading}
        error={error}
        onPrevPage={prevPage}
        onNextPage={nextPage}
      />
    </div>
  );
}
