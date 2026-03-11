/**
 * EventActions — extracted action buttons for calendar items.
 *
 * Supports compact (icon-only with tooltips) and full (text + icon) modes.
 * Actions: Add to Calendar, Create Task, Dismiss, Snooze, View Email.
 *
 * Phase 2: Added "Create task" button that opens CreateTaskFromEventDialog.
 *
 * @module components/calendar/EventActions
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Tooltip } from '@/components/ui/tooltip';
import {
  CalendarPlus,
  X,
  AlarmClockOff,
  Mail,
  ListTodo,
} from 'lucide-react';
import { SNOOZE_PRESETS, getSnoozeDate } from '@/lib/utils/event-colors';
import { CreateTaskFromEventDialog } from './CreateTaskFromEventDialog';
import { createLogger } from '@/lib/utils/logger';
import type { CalendarItem } from './types';

const logger = createLogger('EventActions');

interface EventActionsProps {
  item: CalendarItem;
  onDismiss?: (id: string) => void;
  onSaveToCalendar?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
  onViewEmail?: (emailId: string) => void;
  /** Available projects for the task creation dialog */
  projects?: Array<{ id: string; name: string; color?: string | null }>;
  compact?: boolean;
}

export function EventActions({
  item,
  onDismiss,
  onSaveToCalendar,
  onSnooze,
  projects,
  compact = false,
}: EventActionsProps) {
  const [showSnooze, setShowSnooze] = React.useState(false);
  const [showCreateTask, setShowCreateTask] = React.useState(false);

  const handleDismiss = React.useCallback(() => {
    logger.info('Calendar action', { action: 'dismiss', itemId: item.id.substring(0, 8) });
    onDismiss?.(item.id);
  }, [item.id, onDismiss]);

  const handleSave = React.useCallback(() => {
    logger.info('Calendar action', { action: 'save', itemId: item.id.substring(0, 8) });
    onSaveToCalendar?.(item.id);
  }, [item.id, onSaveToCalendar]);

  const handleSnooze = React.useCallback((days: number) => {
    const dateStr = getSnoozeDate(days);
    logger.info('Calendar action', { action: 'snooze', itemId: item.id.substring(0, 8), days });
    onSnooze?.(item.id, new Date(dateStr + 'T00:00:00'));
    setShowSnooze(false);
  }, [item.id, onSnooze]);

  const handleCreateTask = React.useCallback(() => {
    logger.info('Calendar action', { action: 'create_task', itemId: item.id.substring(0, 8) });
    setShowCreateTask(true);
  }, [item.id]);

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-0.5">
          {onSaveToCalendar && (
            <Tooltip variant="info" content="Add to Calendar">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
                <CalendarPlus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          <Tooltip variant="info" content="Create Task">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreateTask}>
              <ListTodo className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          {onDismiss && (
            <Tooltip variant="info" content="Dismiss">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDismiss}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {item.sourceEmailId && (
            <Tooltip variant="info" content="View Email">
              <Link href={`/inbox?email=${item.sourceEmailId}`}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Mail className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </Tooltip>
          )}
        </div>

        {/* Task creation dialog (rendered outside compact div) */}
        <CreateTaskFromEventDialog
          open={showCreateTask}
          onOpenChange={setShowCreateTask}
          item={item}
          projects={projects}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {onSaveToCalendar && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSave}>
            <CalendarPlus className="h-3.5 w-3.5" />
            Add to Calendar
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCreateTask}>
          <ListTodo className="h-3.5 w-3.5" />
          Create task
        </Button>
        {onDismiss && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDismiss}>
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        )}
        {onSnooze && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowSnooze(!showSnooze)}
            >
              <AlarmClockOff className="h-3.5 w-3.5" />
              Snooze
            </Button>
            {showSnooze && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-lg p-1 min-w-[120px]">
                {SNOOZE_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded-sm"
                    onClick={() => handleSnooze(preset.days)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {item.sourceEmailId && (
          <Link href={`/inbox?email=${item.sourceEmailId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              View Email
            </Button>
          </Link>
        )}
      </div>

      {/* Task creation dialog */}
      <CreateTaskFromEventDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        item={item}
        projects={projects}
      />
    </>
  );
}
