/**
 * CreateTaskFromEventDialog — lightweight dialog for creating tasks from events.
 *
 * Pre-populates task fields based on the source event/date item:
 * - Title from the event/date title
 * - Due date from the event date (or RSVP deadline if earlier)
 * - Description with "Prep for: {title} on {date}" + location
 * - Priority auto-set: today=urgent, this week=high, later=medium
 * - Project selector for organizing the task
 *
 * Submits via the project-items API with source_event_email_id linkage.
 *
 * @module components/calendar/CreateTaskFromEventDialog
 * @since March 2026 — Phase 2 Create Task From Event
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
} from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import { cn } from '@/lib/utils/cn';
import type { CalendarItem } from './types';

const logger = createLogger('CreateTaskFromEventDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateTaskFromEventDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to toggle dialog visibility */
  onOpenChange: (open: boolean) => void;
  /** The source calendar item to create a task from */
  item: CalendarItem;
  /** Available projects for the selector dropdown */
  projects?: Array<{ id: string; name: string; color?: string | null }>;
  /** Callback after successful task creation */
  onCreated?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-determine priority based on how soon the event is.
 * Today = urgent, this week = high, later = medium.
 */
function autoPriority(eventDate: Date): string {
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'urgent';
  if (diffDays <= 2) return 'high';
  if (diffDays <= 7) return 'high';
  return 'medium';
}

/**
 * Build a description string from event details.
 */
function buildDescription(item: CalendarItem): string {
  const parts: string[] = [];
  const dateStr = item.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  parts.push(`Prep for: ${item.title} on ${dateStr}`);
  if (item.location) parts.push(`Location: ${item.location}`);
  if (item.time) parts.push(`Time: ${item.time}`);
  return parts.join('\n');
}

/**
 * Determine the best due date — use RSVP deadline if it's earlier than the event.
 */
function bestDueDate(item: CalendarItem): string {
  const eventDate = item.dateString;
  if (item.rsvpDeadline) {
    const rsvp = new Date(item.rsvpDeadline);
    const event = new Date(eventDate);
    if (rsvp < event) {
      return item.rsvpDeadline.split('T')[0]!;
    }
  }
  return eventDate;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-600' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CreateTaskFromEventDialog({
  open,
  onOpenChange,
  item,
  projects,
  onCreated,
}: CreateTaskFromEventDialogProps) {
  // Pre-populated form state
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [priority, setPriority] = React.useState('medium');
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Re-populate when item changes or dialog opens
  React.useEffect(() => {
    if (open && item) {
      setTitle(item.title);
      setDescription(buildDescription(item));
      setDueDate(bestDueDate(item));
      setPriority(autoPriority(item.date));
      logger.info('Dialog opened with event data', {
        eventTitle: item.title,
        eventDate: item.dateString,
      });
    }
  }, [open, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    logger.start('Creating task from event', { title, eventId: item.id.substring(0, 8) });

    try {
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        item_type: 'task',
        status: 'pending',
        priority,
        due_date: dueDate || undefined,
        source_email_id: item.sourceEmailId || undefined,
        source_event_email_id: item.sourceEmailId || undefined,
        project_id: selectedProjectId || undefined,
      };

      const response = await fetch('/api/project-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Task creation failed', { error: error.error });
        return;
      }

      logger.success('Task created from event', { title });
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      logger.error('Task creation error', { error: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Task from Event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              maxLength={200}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="task-desc" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <label htmlFor="task-due" className="text-sm font-medium">
              Due Date
            </label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    priority === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                  onClick={() => setPriority(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project selector */}
          {projects && projects.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="task-project" className="text-sm font-medium">
                Project
              </label>
              <select
                id="task-project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
