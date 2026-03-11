/**
 * InboxEmailRow — compact email row for the split-panel inbox.
 *
 * Layout (compact mode for split panel):
 *   [Avatar 36px] [Sender · company] ··· [Time]
 *                 [Subject]
 *                 [Snippet (1 line)]
 *
 * Supports:
 *   - isSelected: highlighted background when active in detail panel
 *   - compact: tighter padding for split-panel layout (default: true)
 *   - Unread: blue dot + bold sender + bold subject
 *   - Star button with animation
 *   - Keyboard focus ring via data-email-row
 *
 * Performance:
 *   - React.memo prevents re-renders when props haven't changed
 *   - Handlers use useCallback with stable deps
 *   - formatSmartDate and getSenderCompanyProxy are pure functions (no allocation on re-render)
 *
 * @module components/inbox/InboxEmailRow
 * @since February 2026 — Inbox UI Redesign v2
 * @updated March 2026 — Split Panel Redesign (isSelected, compact, removed hover tray)
 */

'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { Email } from '@/types/database';
import { SenderLogo } from './SenderLogo';
import { EmailHoverCard } from '@/components/email/EmailHoverCard';

const logger = createLogger('InboxEmailRow');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxEmailRowProps {
  email: Email;
  onClick: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  onUpdate?: (emailId: string, updates: Partial<Email>) => void;
  showCategory?: boolean;
  /** Compact mode — tighter padding for split-panel layout (default: true) */
  compact?: boolean;
  /** Highlight when this email is selected in the detail panel */
  isSelected?: boolean;
  accountMap?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS (pure functions — no allocations on re-render)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string into compact relative time.
 * "now" → "5m" → "3h" → "Yesterday" → "Mon" → "Jan 15"
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

/** Personal email domains that don't make useful company names */
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'protonmail.com', 'proton.me', 'hey.com', 'fastmail.com',
]);

/**
 * Extract a company-like name from the sender email domain.
 * Returns null for personal email providers.
 */
function getSenderCompanyProxy(emailAddr: string): string | null {
  const domain = emailAddr.split('@')[1]?.toLowerCase();
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null;

  const parts = domain.split('.');
  if (parts.length < 2) return null;
  const name = parts[parts.length - 2]!;
  if (name.length < 2) return null;

  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const InboxEmailRow = React.memo(function InboxEmailRow({
  email,
  onClick,
  onToggleStar,
  showCategory = true,
  compact = true,
  isSelected = false,
  accountMap,
}: InboxEmailRowProps) {
  const isUnread = !email.is_read;
  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const senderCompany = getSenderCompanyProxy(email.sender_email);
  const snippet = email.gist || email.summary || email.snippet;

  // Star animation
  const [isStarAnimating, setIsStarAnimating] = React.useState(false);

  const handleStarClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsStarAnimating(true);
    setTimeout(() => setIsStarAnimating(false), 200);
    onToggleStar?.(email);
  }, [email, onToggleStar]);

  return (
    <div
      role="button"
      tabIndex={0}
      data-email-row
      data-email-id={email.id}
      onClick={() => onClick(email)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(email); } }}
      className={cn(
        'group relative w-full flex items-start gap-3 text-left transition-colors cursor-pointer',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30',
        'border-b border-border/30',
        // Compact vs normal padding
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
        // Selected state — subtle highlight with left accent
        isSelected
          ? 'bg-accent/60 border-l-2 border-l-primary'
          : 'border-l-2 border-l-transparent',
      )}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <SenderLogo senderEmail={email.sender_email} size={36} className="rounded-full" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Sender + time */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {isUnread && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" aria-label="Unread" />
          )}
          <span className={cn(
            'text-sm truncate',
            isUnread ? 'font-semibold text-foreground' : 'text-foreground/80',
          )}>
            {senderName}
          </span>
          {senderCompany && (
            <span className="text-[11px] text-muted-foreground/50 truncate">
              {senderCompany}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>
        </div>

        {/* Row 2: Subject */}
        <EmailHoverCard email={email}>
          <p className={cn(
            'text-[13px] truncate leading-snug',
            isUnread ? 'font-medium text-foreground' : 'text-foreground/70',
          )}>
            {email.subject || '(No subject)'}
          </p>
        </EmailHoverCard>

        {/* Row 3: Snippet */}
        {snippet && (
          <p className="text-xs text-muted-foreground/50 truncate mt-0.5 leading-relaxed">
            {snippet}
          </p>
        )}
      </div>

      {/* Star button — visible on hover or when starred */}
      <button
        type="button"
        onClick={handleStarClick}
        className={cn(
          'p-1 rounded transition-colors shrink-0 mt-0.5',
          email.is_starred
            ? 'text-yellow-500'
            : 'text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-yellow-400',
        )}
        aria-label={email.is_starred ? 'Unstar' : 'Star email'}
      >
        <Star
          className={cn(
            'h-3.5 w-3.5',
            isStarAnimating && 'animate-star-spin',
          )}
          fill={email.is_starred ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  );
});

export default InboxEmailRow;
