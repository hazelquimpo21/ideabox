/**
 * EmailCard Component for Category Cards View (Enhanced)
 *
 * Displays a single email as a compact card with AI-generated intelligence.
 * Designed for the Kanban-style category view where emails are grouped
 * by category in vertical "piles".
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES (Enhanced Jan 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 * - AI-generated summary prominently displayed
 * - Expandable key points section
 * - Urgency score indicator (visual)
 * - Quick action badge(s) from analysis
 * - Topics/tags display
 * - Compact sender and subject display
 * - Unread indicator + Star toggle
 * - Click to view full email details
 *
 * @module components/categories/EmailCard
 */

'use client';

import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Star,
  Mail,
  MailOpen,
  Clock,
  Reply,
  Calendar,
  BookmarkCheck,
  Archive,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Lightbulb,
  Signal,
  TrendingUp,
  Gem,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { EmailKeyPoints } from './EmailKeyPoints';
import type { Email, QuickActionDb } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailCardProps {
  /** Email data to display */
  email: Email;
  /** Click handler for viewing email details */
  onClick?: (email: Email) => void;
  /** Star toggle handler */
  onToggleStar?: (email: Email) => void;
  /** Whether the card is currently selected */
  isSelected?: boolean;
  /** Show enhanced features (key points, urgency, topics) */
  enhanced?: boolean;
  /** Default expanded state for key points */
  defaultExpanded?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick action display configuration.
 * Maps quick_action values to icons and colors for visual indication.
 */
const QUICK_ACTION_CONFIG: Record<QuickActionDb, {
  icon: React.ElementType;
  label: string;
  className: string;
}> = {
  respond: {
    icon: Reply,
    label: 'Reply',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  review: {
    icon: BookmarkCheck,
    label: 'Review',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  calendar: {
    icon: Calendar,
    label: 'Calendar',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  follow_up: {
    icon: Clock,
    label: 'Follow up',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  save: {
    icon: BookmarkCheck,
    label: 'Save',
    className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  },
  archive: {
    icon: Archive,
    label: 'Archive',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
  unsubscribe: {
    icon: Archive,
    label: 'Unsubscribe',
    className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  },
  none: {
    icon: Mail,
    label: 'Done',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500',
  },
};

/**
 * Get urgency styling based on score
 */
function getUrgencyStyle(score: number | null | undefined): {
  className: string;
  label: string;
  show: boolean;
} {
  if (!score || score < 3) {
    return { className: '', label: '', show: false };
  }
  if (score >= 8) {
    return {
      className: 'text-red-600 dark:text-red-400',
      label: 'Urgent',
      show: true,
    };
  }
  if (score >= 5) {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      label: 'Important',
      show: true,
    };
  }
  return {
    className: 'text-yellow-600 dark:text-yellow-400',
    label: 'Moderate',
    show: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays an email as a compact card with AI intelligence.
 *
 * @example
 * ```tsx
 * <EmailCard
 *   email={email}
 *   onClick={(e) => setSelectedEmail(e)}
 *   onToggleStar={(e) => handleStar(e)}
 *   enhanced
 * />
 * ```
 */
/**
 * Memoized to prevent re-renders of all list items when a single item
 * changes (e.g., toggling a star). Without memo, any parent state change
 * re-renders all 15-50 EmailCards in the list.
 *
 * @see INBOX_PERFORMANCE_AUDIT.md — P3
 */
export const EmailCard = React.memo(function EmailCard({
  email,
  onClick,
  onToggleStar,
  isSelected = false,
  enhanced = true,
  defaultExpanded = false,
}: EmailCardProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived State
  // ───────────────────────────────────────────────────────────────────────────

  const quickAction = email.quick_action as QuickActionDb | null;
  const actionConfig = quickAction ? QUICK_ACTION_CONFIG[quickAction] : null;
  const ActionIcon = actionConfig?.icon;

  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const timeAgo = email.date
    ? formatDistanceToNow(new Date(email.date), { addSuffix: true })
    : '';

  const urgencyStyle = getUrgencyStyle(email.urgency_score);
  const hasKeyPoints = enhanced && email.key_points && email.key_points.length > 0;
  const hasTopics = enhanced && email.topics && email.topics.length > 0;

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    logger.info('Email card clicked', { emailId: email.id });
    onClick?.(email);
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    logger.info('Star toggled', { emailId: email.id, wasStarred: email.is_starred });
    onToggleStar?.(email);
  };

  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    logger.debug('Card expansion toggled', { emailId: email.id, isExpanded: !isExpanded });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card
      onClick={handleClick}
      className={cn(
        'p-3 cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:scale-[1.01]',
        'border-l-4',
        !email.is_read && 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
        email.is_read && 'border-l-transparent',
        isSelected && 'ring-2 ring-primary shadow-md',
      )}
    >
      {/* ─────────────────────────────────────────────────────────────────────
          HEADER: Sender + Urgency + Time + Star
      ───────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Unread indicator */}
          {!email.is_read ? (
            <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          ) : (
            <MailOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}

          {/* Sender name */}
          <span className={cn(
            'text-sm truncate',
            !email.is_read && 'font-semibold',
          )}>
            {senderName}
          </span>

          {/* Signal strength indicator (enhanced mode) */}
          {enhanced && email.signal_strength === 'high' && (
            <Signal className="h-3 w-3 text-emerald-500 shrink-0" title="High signal" />
          )}

          {/* Reply worthiness indicator */}
          {enhanced && (email.reply_worthiness === 'must_reply' || email.reply_worthiness === 'should_reply') && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1 py-0',
                email.reply_worthiness === 'must_reply'
                  ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                  : 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
              )}
            >
              <Reply className="h-2.5 w-2.5 mr-0.5" />
              {email.reply_worthiness === 'must_reply' ? 'Reply' : 'Reply?'}
            </Badge>
          )}

          {/* Urgency indicator (enhanced mode) */}
          {enhanced && urgencyStyle.show && (
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1 py-0', urgencyStyle.className)}
            >
              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
              {email.urgency_score}/10
            </Badge>
          )}

          {/* Golden nugget count badge */}
          {email.golden_nugget_count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-purple-500" aria-label={`${email.golden_nugget_count} golden nuggets`}>
              <Gem className="h-3 w-3" />
              <span className="text-[10px] font-medium">{email.golden_nugget_count}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Time */}
          <span className="text-xs text-muted-foreground">{timeAgo}</span>

          {/* Star */}
          <button
            onClick={handleStarClick}
            className="p-1 hover:bg-muted rounded-sm transition-colors"
            aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                email.is_starred
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground hover:text-yellow-400'
              )}
            />
          </button>

          {/* Expand/collapse toggle (if has key points) */}
          {hasKeyPoints && (
            <button
              onClick={handleExpandToggle}
              className="p-1 hover:bg-muted rounded-sm transition-colors"
              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            >
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SUBJECT
      ───────────────────────────────────────────────────────────────────── */}
      <h4 className={cn(
        'text-sm mb-2 line-clamp-1',
        !email.is_read && 'font-medium',
      )}>
        {email.subject || '(No subject)'}
      </h4>

      {/* ─────────────────────────────────────────────────────────────────────
          AI SUMMARY / GIST
      ───────────────────────────────────────────────────────────────────── */}
      {(email.gist || email.summary) && (
        <p className={cn(
          'text-sm text-muted-foreground mb-2 italic',
          isExpanded ? 'line-clamp-none' : 'line-clamp-2'
        )}>
          &ldquo;{email.gist || email.summary}&rdquo;
        </p>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          KEY POINTS (Enhanced, Expandable)
      ───────────────────────────────────────────────────────────────────── */}
      {hasKeyPoints && isExpanded && (
        <div className="mt-2 pt-2 border-t border-dashed">
          <EmailKeyPoints
            points={email.key_points!}
            maxVisible={3}
            compact
            defaultExpanded
          />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          TOPICS / TAGS (Enhanced)
      ───────────────────────────────────────────────────────────────────── */}
      {hasTopics && (
        <div className="flex flex-wrap gap-1 mt-2">
          {email.topics!.slice(0, 3).map((topic, index) => (
            <Badge
              key={`topic-${index}-${topic}`}
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-muted/50"
            >
              {topic}
            </Badge>
          ))}
          {email.topics!.length > 3 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 text-muted-foreground"
            >
              +{email.topics!.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          ADDITIONAL CATEGORIES (multi-bucket classification)
      ───────────────────────────────────────────────────────────────────── */}
      {enhanced && email.additional_categories && Array.isArray(email.additional_categories) && email.additional_categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {(email.additional_categories as string[]).slice(0, 2).map((cat, index) => (
            <Badge
              key={`addcat-${index}-${cat}`}
              variant="outline"
              className="text-[9px] px-1 py-0 border-dashed text-muted-foreground/70"
            >
              {cat.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          FOOTER: Quick Action Badge
      ───────────────────────────────────────────────────────────────────── */}
      {actionConfig && quickAction !== 'none' && quickAction !== 'archive' && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          <Badge
            variant="secondary"
            className={cn('text-xs gap-1', actionConfig.className)}
          >
            {ActionIcon && <ActionIcon className="h-3 w-3" />}
            {actionConfig.label}
          </Badge>

          <div className="flex items-center gap-1.5">
            {/* Idea spark indicator — only show for high/medium signal emails (noise doesn't generate sparks) */}
            {enhanced && email.analyzed_at && email.signal_strength && email.signal_strength !== 'noise' && email.signal_strength !== 'low' && (
              <Lightbulb
                className="h-3.5 w-3.5 text-amber-400"
                title="Has idea sparks — click to view"
              />
            )}

            {/* Relationship signal indicator (positive + negative) */}
            {enhanced && email.relationship_signal === 'positive' && (
              <TrendingUp
                className="h-3.5 w-3.5 text-green-500"
                title="Positive relationship signal"
              />
            )}
            {enhanced && email.relationship_signal === 'negative' && (
              <TrendingUp
                className="h-3.5 w-3.5 text-red-500 rotate-180"
                title="This sender may need extra attention"
              />
            )}
          </div>
        </div>
      )}
    </Card>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default EmailCard;
