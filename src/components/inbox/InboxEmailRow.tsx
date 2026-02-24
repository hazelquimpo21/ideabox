/**
 * InboxEmailRow Component
 *
 * Enhanced email row designed for rapid "at a glance" scanning.
 * Each row surfaces the most important metadata inline so users
 * can triage without opening the email:
 *
 *   - AI gist (one-line summary) replaces raw snippet
 *   - Quick-action badge (respond, review, calendar, etc.)
 *   - Priority score indicator for high-priority emails
 *   - Signal strength dot (high/medium/low/noise)
 *   - Unread state with subtle left accent border
 *
 * Layout (3-row structure):
 *   Row 1: [Avatar] [Sender] [Category pill] ··· [Date]
 *   Row 2: [Subject]                          ··· [Priority badge]
 *   Row 3: [Gist]  [Action badge] [Signal dot]    [Star]
 *
 * Performance: Wrapped in React.memo to prevent re-renders when
 * sibling rows change. Star click is isolated via stopPropagation.
 *
 * @module components/inbox/InboxEmailRow
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { Star, Mail, MessageSquare, Eye, Calendar, Bookmark, Archive, BellOff, CornerUpRight, TrendingUp, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { CATEGORY_SHORT_LABELS, CATEGORY_ACCENT_COLORS } from '@/types/discovery';
import type { EmailCategory } from '@/types/discovery';
import type { Email, QuickActionDb } from '@/types/database';
import { CategoryIcon } from './CategoryIcon';
import { SenderLogo } from './SenderLogo';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxEmailRow');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxEmailRowProps {
  /** The email object to render */
  email: Email;
  /** Callback when the row is clicked (opens detail view) */
  onClick: (email: Email) => void;
  /** Callback when star is toggled */
  onToggleStar?: (email: Email) => void;
  /** Whether to show the category indicator (default: true) */
  showCategory?: boolean;
  /** Compact mode hides gist line and action badges (default: false) */
  compact?: boolean;
  /**
   * Map of gmail_account_id → account email address.
   * When provided, shows a small account tag so multi-account users
   * can tell which inbox received the email.
   */
  accountMap?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string into a compact, human-friendly relative time.
 * Progressively coarsens: "now" → "5m" → "3h" → "Yesterday" → "Mon" → "Jan 15" → "Jan 15, '24"
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY DISPLAY — uses centralized constants from @/types/discovery
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTION DISPLAY CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Display configuration for each AI-suggested quick action.
 * icon: Lucide icon component, label: short text, colors: badge styling.
 * The `none` action is excluded — we only show actionable badges.
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
// SIGNAL STRENGTH DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tiny colored dot indicating AI-assessed signal strength.
 * High = green, medium = yellow, low = slate, noise = hidden.
 */
const SIGNAL_DOT_COLORS: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
};

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Extracts the first character for the avatar circle */
function getSenderInitial(email: Email): string {
  if (email.sender_name) return email.sender_name.charAt(0).toUpperCase();
  return email.sender_email.charAt(0).toUpperCase();
}

/**
 * Deterministic avatar background color based on sender email hash.
 * Ensures the same sender always gets the same color across sessions.
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const InboxEmailRow = React.memo(function InboxEmailRow({
  email,
  onClick,
  onToggleStar,
  showCategory = true,
  compact = false,
  accountMap,
}: InboxEmailRowProps) {
  const isUnread = !email.is_read;
  const category = email.category as EmailCategory | null;
  const dotColor = category ? CATEGORY_ACCENT_COLORS[category] || 'bg-gray-400' : 'bg-gray-400';
  const categoryLabel = category ? CATEGORY_SHORT_LABELS[category] || null : null;
  const senderName = email.sender_name || email.sender_email.split('@')[0];

  // Additional categories — show secondary category dots for multi-category emails
  const additionalCategories = (email.additional_categories as string[] | null)?.filter(
    (c): c is EmailCategory => !!c && c !== category
  ) ?? [];

  // Prefer AI gist over raw summary/snippet for the preview line
  const gist = email.gist || email.summary || email.snippet;

  // Account indicator — resolve gmail_account_id to display string
  const accountEmail = accountMap && email.gmail_account_id
    ? accountMap[email.gmail_account_id]
    : null;

  // Quick action badge — only show actionable ones (skip 'none')
  const quickAction = email.quick_action as QuickActionDb | null;
  const actionConfig = quickAction && quickAction !== 'none'
    ? QUICK_ACTION_CONFIG[quickAction]
    : null;

  // Signal strength indicator
  const signalStrength = email.signal_strength;
  const signalDot = signalStrength ? SIGNAL_DOT_COLORS[signalStrength] : null;

  // Priority score — only highlight for high-priority emails (≥70)
  const priorityScore = email.priority_score;
  const showPriority = priorityScore !== null && priorityScore !== undefined && priorityScore >= 70;

  // Event detection — check labels array for 'has_event' or quick_action 'calendar'
  const emailLabels = email.labels as string[] | null;
  const isEvent = (emailLabels && Array.isArray(emailLabels) && emailLabels.includes('has_event')) ||
    quickAction === 'calendar';

  /** Isolate star click from row click */
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    logger.debug('Star toggled', { emailId: email.id, newState: !email.is_starred });
    onToggleStar?.(email);
  };

  return (
    <button
      type="button"
      onClick={() => onClick(email)}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50',
        'border-b border-border/40',
        // Unread: subtle left accent + tinted background
        isUnread && 'bg-blue-50/30 dark:bg-blue-950/10 border-l-2 border-l-blue-500',
        !isUnread && 'border-l-2 border-l-transparent',
      )}
    >
      {/* ── Category Icon Avatar ─────────────────────────────────────── */}
      <div className="relative shrink-0 mt-0.5">
        <CategoryIcon category={category} size="md" />
        {/* Sender logo overlay — bottom-right corner */}
        <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-px">
          <SenderLogo senderEmail={email.sender_email} size={14} className="rounded-full" />
        </div>
      </div>

      {/* ── Main Content (3 rows) ────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Sender + Category + Date */}
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {senderName}
          </span>

          {/* Account indicator — which inbox received this email */}
          {accountEmail && (
            <span
              className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted/60 text-muted-foreground/60"
              title={accountEmail}
            >
              <Mail className="h-2 w-2" />
              {accountEmail.split('@')[0]}
            </span>
          )}

          {/* Category dot + label + additional category dots */}
          {showCategory && categoryLabel && (
            <span className="flex items-center gap-1 shrink-0">
              <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} aria-hidden="true" />
              {additionalCategories.map((addCat) => (
                <span
                  key={addCat}
                  className={cn('w-1 h-1 rounded-full opacity-60', CATEGORY_ACCENT_COLORS[addCat] || 'bg-gray-400')}
                  aria-hidden="true"
                  title={CATEGORY_SHORT_LABELS[addCat] || addCat}
                />
              ))}
              <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                {categoryLabel}
                {additionalCategories.length > 0 && (
                  <span className="text-muted-foreground/50"> +{additionalCategories.length}</span>
                )}
              </span>
            </span>
          )}

          {/* Event indicator badge */}
          {isEvent && (
            <span
              className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
              title="Contains event"
            >
              <Calendar className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">Event</span>
            </span>
          )}

          {/* Signal strength dot */}
          {signalDot && (
            <span
              className={cn('w-1.5 h-1.5 rounded-full shrink-0', signalDot)}
              title={`Signal: ${signalStrength}`}
              aria-label={`Signal strength: ${signalStrength}`}
            />
          )}

          {/* Spacer pushes date to far right */}
          <span className="flex-1" />

          {/* Date */}
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>
        </div>

        {/* Row 2: Subject + Priority badge */}
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-medium text-foreground' : 'text-foreground/80',
            )}
          >
            {email.subject || '(No subject)'}
          </p>

          {/* Priority badge — only for high-priority emails */}
          {showPriority && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums',
                priorityScore >= 80
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
              )}
              title={`Priority score: ${priorityScore}`}
            >
              <TrendingUp className="h-2.5 w-2.5" />
              {priorityScore}
            </span>
          )}
        </div>

        {/* Row 3: Gist + Action badge */}
        {!compact && (
          <div className="flex items-center gap-2 mt-0.5">
            {/* AI gist line — the key "at a glance" feature */}
            {gist && (
              <p className="text-xs text-muted-foreground/70 truncate flex-1">
                {gist}
              </p>
            )}

            {/* Quick action badge */}
            {actionConfig && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  actionConfig.colors,
                )}
              >
                <actionConfig.icon className="h-2.5 w-2.5" />
                <span className="hidden sm:inline">{actionConfig.label}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Star Button ──────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center mt-0.5">
        <button
          type="button"
          onClick={handleStarClick}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              email.is_starred
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30 hover:text-yellow-400',
            )}
          />
        </button>
      </div>
    </button>
  );
});

export default InboxEmailRow;
