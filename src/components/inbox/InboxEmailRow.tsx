/**
 * InboxEmailRow Component
 *
 * Clean, scannable email row inspired by Gmail/Spark Mail.
 * Shows sender, subject, snippet, category badge, time, and star.
 * Designed for rapid scanning of large email lists.
 *
 * @module components/inbox/InboxEmailRow
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { EmailCategory } from '@/types/discovery';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxEmailRowProps {
  email: Email;
  onClick: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  showCategory?: boolean;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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

/** Short category labels for inline badges */
const SHORT_LABELS: Record<string, string> = {
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

/** Category dot colors for visual scanning */
const DOT_COLORS: Record<string, string> = {
  client_pipeline: 'bg-blue-500',
  business_work_general: 'bg-violet-500',
  family_kids_school: 'bg-amber-500',
  family_health_appointments: 'bg-rose-500',
  personal_friends_family: 'bg-pink-500',
  finance: 'bg-green-600',
  travel: 'bg-sky-500',
  shopping: 'bg-orange-500',
  local: 'bg-teal-500',
  newsletters_general: 'bg-emerald-500',
  news_politics: 'bg-slate-500',
  product_updates: 'bg-indigo-500',
};

function getSenderInitial(email: Email): string {
  if (email.sender_name) return email.sender_name.charAt(0).toUpperCase();
  return email.sender_email.charAt(0).toUpperCase();
}

function getSenderAvatarColor(email: Email) {
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
}: InboxEmailRowProps) {
  const isUnread = !email.is_read;
  const category = email.category as EmailCategory | null;
  const dotColor = category ? DOT_COLORS[category] : 'bg-gray-400';
  const categoryLabel = category ? SHORT_LABELS[category] : null;
  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const gist = email.gist || email.summary || email.snippet;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(email);
  };

  return (
    <button
      type="button"
      onClick={() => onClick(email)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/50 border-b border-border/40',
        'focus-visible:outline-none focus-visible:bg-muted/50',
        isUnread && 'bg-blue-50/40 dark:bg-blue-950/10',
      )}
    >
      {/* Sender Avatar */}
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold',
          getSenderAvatarColor(email),
        )}
      >
        {getSenderInitial(email)}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Sender + Date */}
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {senderName}
          </span>

          {/* Category dot + label */}
          {showCategory && categoryLabel && (
            <span className="flex items-center gap-1 shrink-0">
              <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                {categoryLabel}
              </span>
            </span>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Date */}
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>
        </div>

        {/* Row 2: Subject */}
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-medium text-foreground' : 'text-foreground/80',
            )}
          >
            {email.subject || '(No subject)'}
          </p>
        </div>

        {/* Row 3: Snippet/Gist */}
        {!compact && gist && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {gist}
          </p>
        )}
      </div>

      {/* Star */}
      <div className="shrink-0 flex items-center">
        <button
          type="button"
          onClick={handleStarClick}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          aria-label={email.is_starred ? 'Unstar' : 'Star'}
        >
          <Star
            className={cn(
              'h-4 w-4',
              email.is_starred
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/40 hover:text-yellow-400',
            )}
          />
        </button>
      </div>
    </button>
  );
});

export default InboxEmailRow;
