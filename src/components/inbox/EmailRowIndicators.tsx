/**
 * EmailRowIndicators — badge decision logic for email rows.
 * Implements the "max 2 indicators" rule from §2b of VIEW_REDESIGN_PLAN.md.
 *
 * Decision cascade (max 2 indicators):
 * 1. Star (if starred) — always shown
 * 2. One contextual icon in priority order:
 *    - must_reply → mail reply icon with "Reply needed" tooltip
 *    - golden_nugget_count > 0 → diamond icon with count tooltip
 *    - sender_type === 'broadcast' → newspaper icon
 *    - fallback → category badge via CategoryIcon
 *
 * @module components/inbox/EmailRowIndicators
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Star, Reply, Gem, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { CategoryIcon } from './CategoryIcon';
import type { EmailCategory } from '@/types/discovery';

export interface EmailRowIndicatorsProps {
  email: {
    is_starred?: boolean;
    reply_worthiness?: string | null;
    golden_nugget_count?: number;
    sender_type?: string | null;
    email_type?: string | null;
    category?: string | null;
  };
  /** Callback when star is toggled — if missing, star is display-only */
  onToggleStar?: () => void;
}

export const EmailRowIndicators = React.memo(function EmailRowIndicators({
  email,
  onToggleStar,
}: EmailRowIndicatorsProps) {
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.();
  };

  // Determine the single contextual indicator (cascade priority)
  const contextual = React.useMemo(() => {
    if (email.reply_worthiness === 'must_reply') {
      return (
        <Tooltip content="Reply needed" variant="info">
          <span className="inline-flex items-center text-red-500">
            <Reply className="h-3.5 w-3.5" />
          </span>
        </Tooltip>
      );
    }
    if (email.golden_nugget_count && email.golden_nugget_count > 0) {
      return (
        <Tooltip content={`${email.golden_nugget_count} golden nugget${email.golden_nugget_count !== 1 ? 's' : ''}`} variant="info">
          <span className="inline-flex items-center gap-0.5 text-purple-500">
            <Gem className="h-3.5 w-3.5" />
            {email.golden_nugget_count > 1 && (
              <span className="text-[10px] font-medium">{email.golden_nugget_count}</span>
            )}
          </span>
        </Tooltip>
      );
    }
    // Check for broadcast/newsletter sender type
    const isBroadcast = email.email_type === 'newsletter' || email.email_type === 'marketing';
    if (isBroadcast) {
      return (
        <Tooltip content="Newsletter / broadcast" variant="info">
          <span className="inline-flex items-center text-muted-foreground">
            <Newspaper className="h-3.5 w-3.5" />
          </span>
        </Tooltip>
      );
    }
    // Fallback: category badge
    if (email.category) {
      return <CategoryIcon category={email.category as EmailCategory} size="sm" />;
    }
    return null;
  }, [email.reply_worthiness, email.golden_nugget_count, email.email_type, email.category]);

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Star indicator */}
      {email.is_starred && (
        <button
          type="button"
          onClick={handleStarClick}
          className="p-0.5 rounded hover:bg-muted/80 transition-colors"
          aria-label="Unstar email"
        >
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        </button>
      )}

      {/* Single contextual indicator */}
      {contextual}
    </div>
  );
});

export default EmailRowIndicators;
