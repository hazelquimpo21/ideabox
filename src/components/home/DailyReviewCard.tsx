/**
 * Daily Review Card Component
 *
 * Displays the daily review queue on the Home page — emails worth scanning
 * today that don't need individual task items.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEW (FEB 2026): Two-Tier Task System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Part of the two-tier task system:
 * - Tier 1: Review Queue (this component) — scan-worthy emails, no tasks created
 * - Tier 2: Real Tasks (PendingTasksList) — concrete action items (pay, submit, etc.)
 *
 * The review queue surfaces emails that are:
 * 1. Not archived
 * 2. Signal strength = high or medium
 * 3. Not yet reviewed (or reviewed > 24h ago for daily cycling)
 * 4. From the last 7 days
 *
 * Users can:
 * - Click an email to read it in the inbox
 * - Mark it as "reviewed" (removes from queue for 24h)
 * - See signal/reply indicators at a glance
 *
 * @module components/home/DailyReviewCard
 * @since February 2026
 */

'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import {
  Inbox,
  ArrowRight,
  Check,
  Mail,
  MailOpen,
  Reply,
  Signal,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { ReviewQueueItem } from '@/hooks/useReviewQueue';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('DailyReviewCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyReviewCardProps {
  /** Array of review queue items */
  items: ReviewQueueItem[];
  /** Whether data is still loading */
  isLoading: boolean;
  /** Callback to mark an email as reviewed */
  onMarkReviewed: (emailId: string) => Promise<void>;
  /** Total number of items in the queue (may be more than displayed) */
  totalInQueue?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string to a relative time like "2h ago", "Yesterday", etc.
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Extracts display-friendly sender name from sender_name or sender_email.
 * "John Smith" → "John Smith"
 * "john.smith@company.com" → "john.smith"
 */
function formatSender(name: string | null, email: string): string {
  if (name) return name;
  return email.split('@')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Daily Review Card — shows the daily review queue on the Home page.
 *
 * Displays up to 8 emails worth scanning today, with signal/reply indicators
 * and a "mark as reviewed" button for each.
 */
export function DailyReviewCard({
  items,
  isLoading,
  onMarkReviewed,
  totalInQueue,
}: DailyReviewCardProps) {
  logger.debug('Rendering DailyReviewCard', { itemCount: items.length, isLoading });

  /**
   * Handle marking an email as reviewed.
   */
  const handleMarkReviewed = async (emailId: string, subject: string | null) => {
    logger.info('User marking email as reviewed', {
      emailId: emailId.substring(0, 8),
      subject: subject?.substring(0, 30),
    });
    try {
      await onMarkReviewed(emailId);
      logger.success('Email marked as reviewed');
    } catch (error) {
      logger.error('Failed to mark as reviewed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Show count of remaining items if there are more than displayed
  const remainingCount = (totalInQueue || 0) - items.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Inbox className="h-5 w-5 text-blue-500" />
            Daily Review
            {totalInQueue && totalInQueue > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {totalInQueue}
              </Badge>
            )}
          </CardTitle>
          <Link href="/inbox">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              Inbox
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // ─── Loading State ──────────────────────────────────────────────────
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          // ─── Empty State ────────────────────────────────────────────────────
          <p className="text-sm text-muted-foreground py-4 text-center">
            Review queue is clear — all caught up!
          </p>
        ) : (
          // ─── Review Queue List ──────────────────────────────────────────────
          <div className="space-y-1">
            {items.map((email) => (
              <div
                key={email.id}
                className="group flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                {/* Read/unread indicator */}
                <div className="mt-1 shrink-0">
                  {email.is_read ? (
                    <MailOpen className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Mail className="h-4 w-4 text-blue-500" />
                  )}
                </div>

                {/* Email info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/inbox?email=${email.id}`}
                      className="text-sm font-medium truncate hover:underline"
                    >
                      {email.subject || '(no subject)'}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {formatSender(email.sender_name, email.sender_email)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(email.date)}
                    </span>

                    {/* Signal indicators */}
                    {email.signal_strength === 'high' && (
                      <Signal className="h-3 w-3 text-emerald-500" title="High signal" />
                    )}
                    {(email.reply_worthiness === 'must_reply' || email.reply_worthiness === 'should_reply') && (
                      <Reply className="h-3 w-3 text-orange-500" title="Needs reply" />
                    )}
                  </div>
                  {/* Gist/summary if available */}
                  {email.gist && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {email.gist}
                    </p>
                  )}
                </div>

                {/* Mark as reviewed button (visible on hover) */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => handleMarkReviewed(email.id, email.subject)}
                  title="Mark as reviewed"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {/* Remaining count */}
            {remainingCount > 0 && (
              <div className="pt-2 text-center">
                <Link href="/inbox">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                    +{remainingCount} more in review queue
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DailyReviewCard;
