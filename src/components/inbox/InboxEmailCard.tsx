/**
 * InboxEmailCard — card-style email display with timeliness accent.
 * Implements §5b from VIEW_REDESIGN_PLAN.md.
 *
 * Uses Card component with accent prop for timeliness border.
 * Shows gist field when available, golden nuggets if present,
 * and always-visible action buttons (no hover needed in card view).
 * Sender name tooltip shows contact card preview (preview tier).
 *
 * @module components/inbox/InboxEmailCard
 * @since February 2026 — Inbox UI Redesign v2
 */

'use client';

import * as React from 'react';
import { Star, Gem, Reply, Archive, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { getTimelinessAccent, type TimelinessNature } from '@/lib/utils/timeliness';
import { Tooltip } from '@/components/ui/tooltip';
import type { Email } from '@/types/database';
import { EmailRowIndicators } from './EmailRowIndicators';
import { SenderLogo } from './SenderLogo';
import { EmailHoverCard } from '@/components/email/EmailHoverCard';

const logger = createLogger('InboxEmailCard');

export interface InboxEmailCardProps {
  email: Email;
  onClick: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  showCategory?: boolean;
  accountMap?: Record<string, string>;
  thumbnailUrl?: string | null;
}

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

function getEmailTimelinessNature(email: Email): TimelinessNature {
  const timeliness = email.timeliness as Record<string, unknown> | null;
  if (timeliness?.nature && typeof timeliness.nature === 'string') {
    return timeliness.nature as TimelinessNature;
  }
  return 'reference';
}

export const InboxEmailCard = React.memo(function InboxEmailCard({
  email,
  onClick,
  onToggleStar,
  showCategory = true,
  accountMap,
  thumbnailUrl,
}: InboxEmailCardProps) {
  const isUnread = !email.is_read;
  const senderName = email.sender_name || email.sender_email.split('@')[0];
  const gist = email.gist || email.summary || email.snippet;
  const nature = getEmailTimelinessNature(email);
  const accent = getTimelinessAccent(nature);

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(email);
  };

  // Sender tooltip content — contact card preview
  const senderPreview = React.useMemo(() => (
    <div className="space-y-1">
      <p className="font-medium text-sm">{senderName}</p>
      <p className="text-xs text-muted-foreground">{email.sender_email}</p>
      {email.email_type && (
        <p className="text-xs text-muted-foreground capitalize">{email.email_type.replace(/_/g, ' ')}</p>
      )}
    </div>
  ), [senderName, email.sender_email, email.email_type]);

  return (
    <Card
      onClick={() => onClick(email)}
      accent={accent.border.replace('border-l-', '')}
      accentPosition="left"
      interactive
      className="overflow-hidden"
    >
      <div className="p-3">
        {/* Row 1: Sender + Date + Star */}
        <div className="flex items-center gap-2 mb-1.5">
          <SenderLogo senderEmail={email.sender_email} size={28} className="rounded-full shrink-0" />
          <Tooltip content={senderPreview} variant="preview">
            <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {isUnread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />}
              {senderName}
            </span>
          </Tooltip>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatSmartDate(email.date)}
          </span>
          <button type="button" onClick={handleStarClick}
            className="p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0"
            aria-label={email.is_starred ? 'Unstar email' : 'Star email'}>
            <Star className={cn('h-3.5 w-3.5 transition-colors',
              email.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30 hover:text-yellow-400')} />
          </button>
        </div>

        {/* Row 2: Subject + Indicators */}
        <div className="flex items-center gap-1.5 mb-1">
          <EmailHoverCard email={email}>
            <h4 className={cn('text-sm truncate flex-1', isUnread ? 'font-medium text-foreground' : 'text-foreground/80')}>
              {email.subject || '(No subject)'}
            </h4>
          </EmailHoverCard>
          <EmailRowIndicators email={email} onToggleStar={() => onToggleStar?.(email)} />
        </div>

        {/* Row 3: Gist */}
        {gist && (
          <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-1.5">{gist}</p>
        )}

        {/* Golden nuggets */}
        {email.golden_nugget_count > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Gem className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] text-purple-500 font-medium">
              {email.golden_nugget_count} golden nugget{email.golden_nugget_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Action buttons — always visible in card view */}
        <div className="flex items-center gap-1 pt-1.5 border-t border-border/30">
          {email.reply_worthiness === 'must_reply' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <Reply className="h-2.5 w-2.5" /> Reply
            </span>
          )}
          <span className="flex-1" />
          <Tooltip content="Archive" variant="info">
            <button type="button" onClick={(e) => { e.stopPropagation(); }}
              className="p-1 rounded hover:bg-muted/80 transition-colors text-muted-foreground/50 hover:text-foreground">
              <Archive className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="Snooze" variant="info">
            <button type="button" onClick={(e) => { e.stopPropagation(); }}
              className="p-1 rounded hover:bg-muted/80 transition-colors text-muted-foreground/50 hover:text-foreground">
              <Clock className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
});

export default InboxEmailCard;
