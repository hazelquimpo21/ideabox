/**
 * InboxEmailCard Component
 *
 * Card-style email display for the inbox card view.
 * Shows the same "at a glance" metadata as InboxEmailRow but in a
 * richer, more visual card layout with room for gist, key points,
 * topics, and action badges.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   Without thumbnail:
 *   ┌────────────────────────────────────────────────────┐
 *   │  [Avatar] [Sender] [Account tag]  ·· [Date] [Star] │
 *   │  [Subject line]              [Priority] [Category]  │
 *   │  "AI gist summary displayed in italics..."          │
 *   │  ─────────────────────────────────────────────────  │
 *   │  [Topic] [Topic] [Topic]          [Action badge]    │
 *   └────────────────────────────────────────────────────┘
 *
 *   With thumbnail (small square replaces category avatar):
 *   ┌────────────────────────────────────────────────────┐
 *   │  [IMG] [Sender] [Account tag]   ·· [Date] [Star]   │
 *   │  [Subject line]              [Priority] [Category]  │
 *   │  "AI gist summary..."                               │
 *   │  ─────────────────────────────────────────────────  │
 *   │  [Topic] [Topic] [Topic]          [Action badge]    │
 *   └────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ACCOUNT INDICATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When `accountMap` is provided, shows a small tag with the account email
 * (truncated to username portion) so users can tell which Gmail account
 * received the email at a glance.
 *
 * @module components/inbox/InboxEmailCard
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import {
  Star,
  MessageSquare,
  Eye,
  Calendar,
  Bookmark,
  Archive,
  BellOff,
  CornerUpRight,
  TrendingUp,
  Mail,
  Image as ImageIcon,
  Gem,
  Palette,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import {
  CATEGORY_SHORT_LABELS,
  CATEGORY_ACCENT_COLORS,
  CATEGORY_BADGE_COLORS,
} from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';
import type { Email, QuickActionDb } from '@/types/database';
import { CategoryIcon } from './CategoryIcon';
import { SenderLogo } from './SenderLogo';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxEmailCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxEmailCardProps {
  /** The email object to render */
  email: Email;
  /** Callback when the card is clicked (opens detail view) */
  onClick: (email: Email) => void;
  /** Callback when star is toggled */
  onToggleStar?: (email: Email) => void;
  /** Whether to show the category badge (default: true) */
  showCategory?: boolean;
  /**
   * Map of gmail_account_id → account email address.
   * When provided, displays a small account tag showing which
   * inbox the email belongs to. Useful for multi-account users.
   */
  accountMap?: Record<string, string>;
  /** Optional thumbnail image URL extracted from the email body */
  thumbnailUrl?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTION DISPLAY CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Display configuration for AI-suggested quick actions.
 * Matches the config in InboxEmailRow for visual consistency.
 */
const QUICK_ACTION_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  colors: string;
}> = {
  respond: {
    icon: MessageSquare,
    label: 'Reply',
    colors: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  },
  review: {
    icon: Eye,
    label: 'Review',
    colors: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
  },
  calendar: {
    icon: Calendar,
    label: 'Schedule',
    colors: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  },
  follow_up: {
    icon: CornerUpRight,
    label: 'Follow up',
    colors: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
  },
  save: {
    icon: Bookmark,
    label: 'Save',
    colors: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  },
  archive: {
    icon: Archive,
    label: 'Archive',
    colors: 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400',
  },
  unsubscribe: {
    icon: BellOff,
    label: 'Unsub',
    colors: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Compact relative date formatting */
function formatSmartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/** Extracts the first character for the avatar circle */
function getSenderInitial(email: Email): string {
  if (email.sender_name) return email.sender_name.charAt(0).toUpperCase();
  return email.sender_email.charAt(0).toUpperCase();
}

/** Deterministic avatar color based on sender email hash */
function getSenderAvatarColor(email: Email): string {
  const str = email.sender_email || email.sender_name || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  ];
  return colors[Math.abs(hash) % colors.length] || colors[0];
}

/**
 * Extracts the username portion of an email address.
 * "user@gmail.com" → "user"
 */
function getAccountUsername(email: string): string {
  return email.split('@')[0] || email;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const InboxEmailCard = React.memo(function InboxEmailCard({
  email,
  onClick,
  onToggleStar,
  showCategory = true,
  accountMap,
  thumbnailUrl,
}: InboxEmailCardProps) {
  const isUnread = !email.is_read;
  const category = email.category as EmailCategory | null;
  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const gist = email.gist || email.summary || email.snippet;

  // Quick action badge config
  const quickAction = email.quick_action as QuickActionDb | null;
  const actionConfig = quickAction && quickAction !== 'none'
    ? QUICK_ACTION_CONFIG[quickAction]
    : null;

  // Priority score — highlight for high-priority emails
  const priorityScore = email.priority_score;
  const showPriority = priorityScore !== null && priorityScore !== undefined && priorityScore >= 70;

  // Account indicator — resolve gmail_account_id to a display string
  const accountEmail = accountMap && email.gmail_account_id
    ? accountMap[email.gmail_account_id]
    : null;

  // Category badge styling
  const categoryLabel = category ? CATEGORY_SHORT_LABELS[category] : null;
  const categoryBadgeColor = category
    ? CATEGORY_BADGE_COLORS[category] || 'bg-gray-50 text-gray-600'
    : null;

  // Additional categories for multi-category display
  const additionalCategories = (email.additional_categories as string[] | null)?.filter(
    (c): c is EmailCategory => !!c && c !== category
  ) ?? [];

  // Event detection — check labels array for 'has_event' or quick_action 'calendar'
  const labels = email.labels as string[] | null;
  const isEvent = (labels && Array.isArray(labels) && labels.includes('has_event')) ||
    quickAction === 'calendar';

  // Golden nugget indicator — check key_points for deal/tip indicators
  // The actual nuggets live in the analysis JSONB, but key_points are denormalized
  const hasKeyPoints = email.key_points && Array.isArray(email.key_points) && email.key_points.length > 0;

  /** Isolate star click from card click */
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    logger.debug('Star toggled', { emailId: email.id });
    onToggleStar?.(email);
  };

  return (
    <Card
      onClick={() => {
        logger.debug('Card clicked', { emailId: email.id });
        onClick(email);
      }}
      className={cn(
        'cursor-pointer transition-all duration-200 overflow-hidden',
        'hover:shadow-md hover:border-border',
        'border-l-2',
        isUnread && 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10',
        !isUnread && 'border-l-transparent',
        isEvent && 'ring-1 ring-green-200 dark:ring-green-800/50',
      )}
    >
      <div className="p-3">
        {/* ── Row 1: Sender + Event/Account + Date + Star ──────────────── */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* Avatar area — thumbnail square replaces category icon when available */}
          {thumbnailUrl ? (
            <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-muted/30">
              <img
                src={thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  // On error, swap in the category icon fallback
                  const container = (e.target as HTMLImageElement).parentElement!;
                  container.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="relative shrink-0">
              <CategoryIcon category={email.category as EmailCategory | null} size="sm" />
              <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-px">
                <SenderLogo senderEmail={email.sender_email} size={12} className="rounded-full" />
              </div>
            </div>
          )}

          {/* Sender name */}
          <span
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {senderName}
          </span>

          {/* Event indicator badge */}
          {isEvent && (
            <span
              className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
              title="Contains event"
            >
              <Calendar className="h-2.5 w-2.5" />
              Event
            </span>
          )}

          {/* Account indicator — shows which inbox received this email */}
          {accountEmail && (
            <span
              className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted/60 text-muted-foreground/70"
              title={accountEmail}
            >
              <Mail className="h-2 w-2" />
              {getAccountUsername(accountEmail)}
            </span>
          )}

          {/* Image indicator (when no thumbnail shown but email has images) */}
          {!thumbnailUrl && email.labels && Array.isArray(email.labels) && email.labels.includes('has_images') && (
            <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground/50" title="Contains images" />
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Date */}
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>

          {/* Star */}
          <button
            type="button"
            onClick={handleStarClick}
            className="p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0"
            aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                email.is_starred
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/30 hover:text-yellow-400',
              )}
            />
          </button>
        </div>

        {/* ── Row 2: Subject + Priority + Category ─────────────────────── */}
        <div className="flex items-center gap-1.5 mb-1">
          <h4
            className={cn(
              'text-sm truncate flex-1',
              isUnread ? 'font-medium text-foreground' : 'text-foreground/80',
            )}
          >
            {email.subject || '(No subject)'}
          </h4>

          {/* Priority badge */}
          {showPriority && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums',
                priorityScore >= 80
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
              )}
              title={`Priority: ${priorityScore}`}
            >
              <TrendingUp className="h-2.5 w-2.5" />
              {priorityScore}
            </span>
          )}

          {/* Category badge(s) — primary + additional */}
          {showCategory && categoryLabel && categoryBadgeColor && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Badge
                className={cn('text-[10px] border-0 font-medium px-1.5 py-0', categoryBadgeColor)}
              >
                {categoryLabel}
              </Badge>
              {additionalCategories.slice(0, 1).map((addCat) => (
                <Badge
                  key={addCat}
                  className={cn(
                    'text-[9px] border-0 font-medium px-1 py-0 opacity-70',
                    CATEGORY_BADGE_COLORS[addCat] || 'bg-gray-50 text-gray-600',
                  )}
                >
                  {CATEGORY_SHORT_LABELS[addCat] || addCat}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* ── Row 3: AI Gist ───────────────────────────────────────────── */}
        {gist && (
          <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-1.5">
            {gist}
          </p>
        )}

        {/* ── Row 4: Topics + Action badge ─────────────────────────────── */}
        {(email.topics?.length || actionConfig || isEvent) && (
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/30">
            {/* Topics — show first 3 */}
            {email.topics && email.topics.length > 0 && (
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                {email.topics.slice(0, 3).map((topic, i) => (
                  <span
                    key={`${topic}-${i}`}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground truncate"
                  >
                    {topic}
                  </span>
                ))}
                {email.topics.length > 3 && (
                  <span className="text-[10px] text-muted-foreground/50">
                    +{email.topics.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Spacer if no topics */}
            {(!email.topics || email.topics.length === 0) && <span className="flex-1" />}

            {/* Quick action badge */}
            {actionConfig && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  actionConfig.colors,
                )}
              >
                <actionConfig.icon className="h-2.5 w-2.5" />
                {actionConfig.label}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
});

export default InboxEmailCard;
