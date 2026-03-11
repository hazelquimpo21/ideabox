/**
 * DateItemExpanded — slim expanded card for non-event date types.
 *
 * Shows title, date, description, source email chip, and a "Create task"
 * button that opens the CreateTaskFromEventDialog.
 *
 * Used by TimelineItem when the item's eventType is a non-event date type
 * (deadline, payment_due, expiration, follow_up, reminder, etc.).
 *
 * @module components/calendar/DateItemExpanded
 * @since March 2026
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { ListTodo } from 'lucide-react';
import { getEventTypeConfig } from '@/lib/utils/event-colors';
import { EventActions } from './EventActions';
import { CreateTaskFromEventDialog } from './CreateTaskFromEventDialog';
import { SourceChip } from '@/components/shared/SourceChip';
import type { CalendarItem } from './types';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('DateItemExpanded');

interface DateItemExpandedProps {
  item: CalendarItem;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
  /** Available projects for the task creation dialog */
  projects?: Array<{ id: string; name: string; color?: string | null }>;
}

export function DateItemExpanded({
  item,
  onDismiss,
  onSaveToCalendar,
  onSnooze,
  projects,
}: DateItemExpandedProps) {
  const config = getEventTypeConfig(item.eventType);
  const [showCreateTask, setShowCreateTask] = React.useState(false);

  const handleCreateTask = React.useCallback(() => {
    logger.info('Opening create task dialog from date item', { itemId: item.id.substring(0, 8) });
    setShowCreateTask(true);
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
        <SourceChip
          type="email"
          id={item.sourceEmailId}
          label={item.sourceEmailSubject || item.sourceEmailSender || 'View email'}
        />
      )}

      {/* Actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Create task button — opens dialog */}
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

      {/* Task creation dialog */}
      <CreateTaskFromEventDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        item={item}
        projects={projects}
      />
    </div>
  );
}
