/**
 * DateItemExpanded — slim expanded card for non-event date types.
 * Shows title, date, description, source email link, and a placeholder
 * "Create task" button (to be wired up in Phase 2).
 *
 * Used by TimelineItem when the item's eventType is a non-event date type
 * (deadline, payment_due, expiration, follow_up, reminder, etc.).
 *
 * @module components/calendar/DateItemExpanded
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Mail, ListTodo } from 'lucide-react';
import { getEventTypeConfig } from '@/lib/utils/event-colors';
import { EventActions } from './EventActions';
import type { CalendarItem } from './types';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('DateItemExpanded');

interface DateItemExpandedProps {
  item: CalendarItem;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
}

export function DateItemExpanded({
  item,
  onDismiss,
  onSaveToCalendar,
  onSnooze,
}: DateItemExpandedProps) {
  const config = getEventTypeConfig(item.eventType);

  const handleCreateTask = React.useCallback(() => {
    logger.info('Create task from date item (placeholder)', { itemId: item.id.substring(0, 8) });
    // Phase 2: wire up task creation from date items
  }, [item.id]);

  return (
    <div className="px-3 pb-4 pt-1 space-y-3">
      {/* Description */}
      {item.description && (
        <p className="text-sm text-muted-foreground">{item.description}</p>
      )}

      {/* Summary */}
      {item.summary && !item.description && (
        <p className="text-sm text-muted-foreground">{item.summary}</p>
      )}

      {/* Source email chip */}
      {item.sourceEmailId && (
        <Link
          href={`/inbox?email=${item.sourceEmailId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[200px]">
            {item.sourceEmailSubject || item.sourceEmailSender || 'View email'}
          </span>
        </Link>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Create task placeholder button */}
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', config.text)}
          onClick={handleCreateTask}
        >
          <ListTodo className="h-3.5 w-3.5" />
          Create task
        </Button>

        {/* Standard event actions (dismiss, snooze, view email) */}
        <EventActions
          item={item}
          onDismiss={onDismiss}
          onSaveToCalendar={onSaveToCalendar}
          onSnooze={onSnooze}
        />
      </div>
    </div>
  );
}
