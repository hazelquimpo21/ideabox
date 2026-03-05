/**
 * EmailHoverActions — slide-in action tray for email rows on hover.
 * Implements §5b "Email Row Redesign" from VIEW_REDESIGN_PLAN.md.
 *
 * Positioned absolute-right inside the row. Uses CSS transform for
 * the slide animation (no JS measurement needed). Parent must have
 * `relative` and `group` classes for hover triggering.
 *
 * @module components/inbox/EmailHoverActions
 * @since Phase 2 — March 2026
 */

'use client';

import * as React from 'react';
import { Archive, Star, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Tooltip } from '@/components/ui/tooltip';

export interface EmailHoverActionsProps {
  emailId: string;
  isStarred: boolean;
  onArchive: (id: string) => void;
  onStar: (id: string) => void;
  onSnooze: (id: string) => void;
}

export const EmailHoverActions = React.memo(function EmailHoverActions({
  emailId,
  isStarred,
  onArchive,
  onStar,
  onSnooze,
}: EmailHoverActionsProps) {
  const handleClick = (e: React.MouseEvent, action: (id: string) => void) => {
    e.stopPropagation();
    action(emailId);
  };

  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 flex items-center gap-0.5 px-2',
        'bg-gradient-to-l from-background via-background to-transparent',
        'translate-x-full group-hover:translate-x-0',
        'transition-transform duration-200 ease-out',
      )}
    >
      <Tooltip content="Archive" variant="info">
        <button
          type="button"
          onClick={(e) => handleClick(e, onArchive)}
          className="p-1.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Archive"
        >
          <Archive className="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip content={isStarred ? 'Unstar' : 'Star'} variant="info">
        <button
          type="button"
          onClick={(e) => handleClick(e, onStar)}
          className="p-1.5 rounded-md hover:bg-muted/80 transition-colors"
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              isStarred
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground hover:text-yellow-400',
            )}
          />
        </button>
      </Tooltip>

      <Tooltip content="Snooze" variant="info">
        <button
          type="button"
          onClick={(e) => handleClick(e, onSnooze)}
          className="p-1.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Snooze"
        >
          <Clock className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
});

export default EmailHoverActions;
