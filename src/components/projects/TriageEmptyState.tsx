/**
 * Triage Empty State
 *
 * Celebratory empty state shown when all triage items have been
 * processed. Displays a checkmark icon, congratulatory message,
 * and a link to navigate to the Board tab.
 *
 * @module components/projects/TriageEmptyState
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TriageEmptyState');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Celebration empty state for the Triage tab when all items
 * have been accepted, dismissed, or snoozed.
 *
 * @module components/projects/TriageEmptyState
 * @since March 2026
 */
export function TriageEmptyState() {
  logger.info('Triage zero reached');

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>

      <h3 className="text-lg font-semibold mb-1">You&apos;re all caught up!</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        No new items to triage. Check back later or head to the Board to see your active work.
      </p>

      <Link
        href="/tasks?tab=board"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Go to Board
      </Link>
    </div>
  );
}
