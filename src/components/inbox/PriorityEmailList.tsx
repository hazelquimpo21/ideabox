/**
 * Priority Email List Component
 *
 * Displays emails ranked by AI priority score. Fetches emails directly from
 * Supabase ordered by `priority_score` descending to surface the most
 * important emails first.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA SOURCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Supabase: `emails` table ordered by `priority_score` DESC
 * - Shows: sender, subject, priority score badge, category badge, date
 * - Click navigates to `/inbox/[category]/[emailId]`
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```tsx
 * <PriorityEmailList />
 * ```
 *
 * @module components/inbox/PriorityEmailList
 * @since February 2026 — Phase 2 Navigation Redesign
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PriorityEmailList');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Subset of email fields needed for the priority list display. */
interface PriorityEmail {
  id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  category: string | null;
  priority_score: number | null;
  date: string;
  snippet: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum number of emails to fetch for the priority list. */
const MAX_EMAILS = 50;

/**
 * Category badge color mapping for all 12 life-bucket categories.
 * Each category gets a distinct color for visual differentiation in the
 * priority list. Colors are consistent with the design system.
 */
const CATEGORY_COLORS: Record<string, string> = {
  // Work & Business
  client_pipeline: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  business_work_general: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  // Family & Personal
  family_kids_school: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  family_health_appointments: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  personal_friends_family: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  // Life Admin
  finance: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  travel: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  shopping: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  local: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  // Information
  newsletters_general: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  news_politics: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
  product_updates: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400',
};

/** Friendly category labels. */
const CATEGORY_LABELS: Record<string, string> = {
  client_pipeline: 'Client',
  business_work_general: 'Work',
  family_kids_school: 'School',
  family_health_appointments: 'Health',
  personal_friends_family: 'Personal',
  finance: 'Finance',
  travel: 'Travel',
  shopping: 'Shopping',
  local: 'Local',
  newsletters_general: 'Newsletter',
  news_politics: 'News',
  product_updates: 'Updates',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a color class based on priority score.
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (score >= 60) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (score >= 40) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

/**
 * Formats a date string relative to today.
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Priority Email List — emails ranked by AI priority score.
 *
 * Fetches emails from Supabase sorted by priority_score descending.
 * Each row shows sender, subject, priority score badge, category, and date.
 * Clicking a row navigates to the email detail view.
 */
export function PriorityEmailList() {
  const [emails, setEmails] = React.useState<PriorityEmail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  /**
   * Fetch priority-ranked emails from Supabase.
   */
  const fetchEmails = React.useCallback(async () => {
    logger.start('Fetching priority-ranked emails', { limit: MAX_EMAILS });
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('emails')
        .select('id, sender_name, sender_email, subject, category, priority_score, date, snippet')
        .not('priority_score', 'is', null)
        .order('priority_score', { ascending: false })
        .limit(MAX_EMAILS);

      if (queryError) {
        throw new Error(queryError.message);
      }

      const results = (data || []) as PriorityEmail[];
      setEmails(results);
      logger.success('Fetched priority emails', { count: results.length });
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch emails');
      logger.error('Failed to fetch priority emails', { error: fetchError.message });
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-0">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border/50">
            <Skeleton className="h-6 w-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Failed to load priority emails</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{error.message}</p>
          <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────────
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No scored emails yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Emails will appear here once they have been analyzed and scored by AI.
          Run an analysis from the Categories tab to get started.
        </p>
      </div>
    );
  }

  // ─── Email List ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {emails.length} emails ranked by AI priority
        </p>
        <Button variant="outline" size="sm" onClick={fetchEmails} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {emails.map((email) => {
            const category = email.category || 'uncategorized';
            const categoryColor = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
            const categoryLabel = CATEGORY_LABELS[category] || category.replace(/_/g, ' ');

            return (
              <Link
                key={email.id}
                href={`/inbox/${category}/${email.id}?from=priority`}
                className="flex items-center gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors last:border-b-0"
              >
                {/* Priority Score Badge */}
                {email.priority_score !== null && (
                  <Badge className={`shrink-0 gap-1 ${getScoreColor(email.priority_score)}`}>
                    <TrendingUp className="h-3 w-3" />
                    {email.priority_score}
                  </Badge>
                )}

                {/* Email Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">
                      {email.sender_name || email.sender_email}
                    </span>
                  </div>
                  <p className="text-sm truncate">
                    {email.subject || '(No subject)'}
                  </p>
                  {email.snippet && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {email.snippet}
                    </p>
                  )}
                </div>

                {/* Category Badge */}
                <Badge className={`text-xs shrink-0 border-0 ${categoryColor}`}>
                  {categoryLabel}
                </Badge>

                {/* Date */}
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatRelativeDate(email.date)}
                </span>

                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default PriorityEmailList;
