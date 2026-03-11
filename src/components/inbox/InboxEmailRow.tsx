/**
 * InboxEmailRow — redesigned email row with timeliness-driven accent.
 * Implements §5b "Email Row Redesign" from VIEW_REDESIGN_PLAN.md.
 *
 * New layout:
 *   Left border (3px) = timeliness accent via getTimelinessAccent()
 *   [Avatar 32px] [Sender · domain] [Subject + snippet] ··· [Time] [Indicators] [Hover tray]
 *
 * Unread: font-semibold + blue dot. No bg color change.
 * Max 2 indicators via EmailRowIndicators cascade.
 * Hover tray (Archive/Star/Snooze) slides in from right.
 *
 * @module components/inbox/InboxEmailRow
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { Star, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { getTimelinessAccent, type TimelinessNature } from '@/lib/utils/timeliness';
import type { Email } from '@/types/database';
import { SenderLogo } from './SenderLogo';
import { EmailRowIndicators } from './EmailRowIndicators';
import { EmailHoverActions } from './EmailHoverActions';
import { EmailHoverCard } from '@/components/email/EmailHoverCard';

const logger = createLogger('InboxEmailRow');

export interface InboxEmailRowProps {
  email: Email;
  onClick: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  onUpdate?: (emailId: string, updates: Partial<Email>) => void;
  showCategory?: boolean;
  compact?: boolean;
  accountMap?: Record<string, string>;
}

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

/** Extract timeliness nature from the email's timeliness JSONB field */
function getEmailTimelinessNature(email: Email): TimelinessNature {
  const timeliness = email.timeliness as Record<string, unknown> | null;
  if (timeliness?.nature && typeof timeliness.nature === 'string') {
    return timeliness.nature as TimelinessNature;
  }
  return 'reference'; // safe default — neutral slate border
}

/**
 * Extract timeliness date chips from the email's timeliness JSONB.
 * Returns up to one chip for late_after or expires (only future dates).
 */
function getTimelinessDateChip(email: Email): { label: string; type: 'warn' | 'danger' } | null {
  const timeliness = email.timeliness as Record<string, unknown> | null;
  if (!timeliness) return null;

  const now = new Date();

  // Check expires first (higher priority)
  if (timeliness.expires && typeof timeliness.expires === 'string') {
    const expiresDate = new Date(timeliness.expires);
    if (expiresDate > now) {
      return {
        label: `Expires ${expiresDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        type: 'danger',
      };
    }
  }

  // Then late_after
  if (timeliness.late_after && typeof timeliness.late_after === 'string') {
    const lateDate = new Date(timeliness.late_after);
    if (lateDate > now) {
      return {
        label: `Stale after ${lateDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        type: 'warn',
      };
    }
  }

  return null;
}

/**
 * Extract a company-like name from the sender email domain.
 * Strips common email providers (gmail, yahoo, etc.) and returns
 * a capitalized domain name as a company proxy.
 * Returns null for personal email domains.
 */
function getSenderCompanyProxy(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Skip common personal email providers — not useful as company names
  const personalDomains = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
    'protonmail.com', 'proton.me', 'hey.com', 'fastmail.com',
  ]);
  if (personalDomains.has(domain)) return null;

  // Extract company name from domain (e.g., "acme.com" → "Acme")
  const parts = domain.split('.');
  if (parts.length < 2) return null;
  const name = parts[parts.length - 2]!;
  if (name.length < 2) return null;

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const InboxEmailRow = React.memo(function InboxEmailRow({
  email,
  onClick,
  onToggleStar,
  onUpdate,
  showCategory = true,
  compact = false,
  accountMap,
}: InboxEmailRowProps) {
  const isUnread = !email.is_read;
  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const senderDomain = email.sender_email.split('@')[1] || '';
  // Company proxy from domain (Phase 2 — replaces TODO for contact join)
  const senderCompany = getSenderCompanyProxy(email.sender_email);
  const gist = email.gist || email.summary || email.snippet;
  const timelinessChip = getTimelinessDateChip(email);

  // Timeliness accent for left border
  const nature = getEmailTimelinessNature(email);
  const accent = getTimelinessAccent(nature);

  // State change animation refs (Phase 4)
  const rowRef = React.useRef<HTMLButtonElement>(null);
  const [isStarAnimating, setIsStarAnimating] = React.useState(false);

  const handleStarClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsStarAnimating(true);
    setTimeout(() => setIsStarAnimating(false), 200);
    onToggleStar?.(email);
  }, [email, onToggleStar]);

  const handleArchive = React.useCallback((id: string) => {
    // Play slide-out animation, then perform the actual archive
    if (rowRef.current) {
      rowRef.current.classList.add('animate-slide-out-right');
      setTimeout(() => onUpdate?.(id, { is_archived: true }), 300);
    } else {
      onUpdate?.(id, { is_archived: true });
    }
  }, [onUpdate]);

  const handleStar = React.useCallback((_id: string) => {
    setIsStarAnimating(true);
    setTimeout(() => setIsStarAnimating(false), 200);
    onToggleStar?.(email);
  }, [email, onToggleStar]);

  const handleSnooze = React.useCallback((_id: string) => {
    logger.debug('Snooze action triggered', { emailId: email.id });
  }, [email.id]);

  return (
    <button
      ref={rowRef}
      type="button"
      data-email-row
      data-email-id={email.id}
      onClick={() => onClick(email)}
      className={cn(
        'group relative w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50',
        'border-b border-border/40',
        // Timeliness left border — always visible (3px)
        'border-l-[3px]',
        accent.border,
      )}
    >
      {/* Avatar (32px) */}
      <div className="shrink-0">
        <SenderLogo senderEmail={email.sender_email} size={32} className="rounded-full" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Sender line */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-label="Unread" />
          )}
          <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-foreground' : 'text-foreground/80')}>
            {senderName}
          </span>
          {senderCompany ? (
            <span className="text-xs text-muted-foreground/50 truncate hidden sm:inline">
              {senderCompany}
            </span>
          ) : senderDomain ? (
            <span className="text-xs text-muted-foreground/50 truncate hidden sm:inline">
              {senderDomain}
            </span>
          ) : null}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>
        </div>

        {/* Subject + snippet on one line */}
        {!compact && (
          <>
            <div className="flex items-center gap-2">
              <EmailHoverCard email={email}>
                <p className={cn('text-sm truncate', isUnread ? 'font-medium text-foreground' : 'text-foreground/80')}>
                  {email.subject || '(No subject)'}
                </p>
              </EmailHoverCard>
              {gist && (
                <span className="text-xs text-muted-foreground/60 truncate hidden sm:inline">
                  — {gist}
                </span>
              )}
            </div>

            {/* Timeliness date chip — shows late_after/expires dates */}
            {timelinessChip && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full',
                  timelinessChip.type === 'danger'
                    ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400',
                )}>
                  {timelinessChip.type === 'danger'
                    ? <AlertTriangle className="h-2.5 w-2.5" />
                    : <Clock className="h-2.5 w-2.5" />
                  }
                  {timelinessChip.label}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Indicators (max 2) */}
      <EmailRowIndicators
        email={email}
        onToggleStar={() => onToggleStar?.(email)}
      />

      {/* Star button (when not starred — starred state shown by indicators) */}
      {!email.is_starred && (
        <button
          type="button"
          onClick={handleStarClick}
          className="p-1 rounded hover:bg-muted/80 transition-colors shrink-0"
          aria-label="Star email"
        >
          <Star className={cn(
            'h-4 w-4 text-muted-foreground/30 hover:text-yellow-400 transition-colors',
            isStarAnimating && 'animate-star-spin',
          )} />
        </button>
      )}

      {/* Hover action tray — slides in from right */}
      <EmailHoverActions
        emailId={email.id}
        isStarred={email.is_starred}
        onArchive={handleArchive}
        onStar={handleStar}
        onSnooze={handleSnooze}
      />
    </button>
  );
});

export default InboxEmailRow;
