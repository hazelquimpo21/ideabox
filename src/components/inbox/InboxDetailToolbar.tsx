/**
 * InboxDetailToolbar — action bar at the top of the detail panel.
 *
 * Provides star, archive, read/unread, and open-full-page actions.
 * On mobile, includes a back button to return to the list view.
 *
 * @module components/inbox/InboxDetailToolbar
 * @since March 2026 — Inbox Redesign v3 (Split Panel)
 */

'use client';

import * as React from 'react';
import {
  Star,
  Archive,
  Mail,
  MailOpen,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import type { Email } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InboxDetailToolbar');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InboxDetailToolbarProps {
  /** The email being displayed */
  email: Email;
  /** Toggle star on/off */
  onStar: () => void;
  /** Archive the email */
  onArchive: () => void;
  /** Toggle read/unread */
  onToggleRead: () => void;
  /** Mobile: go back to list view */
  onClose?: () => void;
  /** URL for the full-page email detail view */
  fullPageUrl?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function InboxDetailToolbar({
  email,
  onStar,
  onArchive,
  onToggleRead,
  onClose,
  fullPageUrl,
}: InboxDetailToolbarProps) {
  const handleAction = React.useCallback(
    (action: string, handler: () => void) => {
      logger.info('Detail toolbar action', { action, emailId: email.id });
      handler();
    },
    [email.id],
  );

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/60 bg-background shrink-0">
      {/* Back button — visible on mobile only */}
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="md:hidden mr-1"
          aria-label="Back to list"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Spacer pushes actions to the right */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {email.subject || '(No subject)'}
        </p>
      </div>

      {/* Action buttons */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleAction('star', onStar)}
        className={cn(
          'shrink-0',
          email.is_starred ? 'text-yellow-500' : 'text-muted-foreground',
        )}
        aria-label={email.is_starred ? 'Unstar' : 'Star'}
      >
        <Star className="h-4 w-4" fill={email.is_starred ? 'currentColor' : 'none'} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleAction('toggleRead', onToggleRead)}
        className="text-muted-foreground shrink-0"
        aria-label={email.is_read ? 'Mark unread' : 'Mark read'}
      >
        {email.is_read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleAction('archive', onArchive)}
        className="text-muted-foreground shrink-0"
        aria-label="Archive"
      >
        <Archive className="h-4 w-4" />
      </Button>

      {fullPageUrl && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            logger.info('Opening full page', { emailId: email.id, url: fullPageUrl });
            window.location.href = fullPageUrl;
          }}
          className="text-muted-foreground shrink-0"
          aria-label="Open full page"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default InboxDetailToolbar;
