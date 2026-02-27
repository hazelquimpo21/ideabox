/**
 * Create Item Dialog
 *
 * Modal dialog for creating a new project item (idea, task, or routine).
 * Supports due dates, date ranges, recurrence, tags, and priority.
 *
 * @module components/projects/CreateItemDialog
 * @since February 2026
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
  Badge,
} from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { ProjectItem, ProjectItemType, RecurrencePattern } from '@/types/database';

const logger = createLogger('CreateItemDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (item: Partial<ProjectItem> & { title: string }) => Promise<ProjectItem | null>;
  defaultType?: ProjectItemType;
  projectId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CreateItemDialog({
  open,
  onOpenChange,
  onCreate,
  defaultType = 'task',
  projectId,
}: CreateItemDialogProps) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [itemType, setItemType] = React.useState<ProjectItemType>(defaultType);
  const [priority, setPriority] = React.useState<string>('medium');
  const [dueDate, setDueDate] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [recurrencePattern, setRecurrencePattern] = React.useState<RecurrencePattern | ''>('');
  const [estimatedMinutes, setEstimatedMinutes] = React.useState('');
  const [tagInput, setTagInput] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset type when defaultType changes
  React.useEffect(() => {
    setItemType(defaultType);
  }, [defaultType]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags((prev) => [...prev, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    logger.start('Creating item', { title, type: itemType });

    const result = await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      item_type: itemType,
      priority,
      due_date: dueDate || null,
      start_date: startDate || null,
      end_date: endDate || null,
      recurrence_pattern: (recurrencePattern || null) as RecurrencePattern | null,
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      project_id: projectId || undefined,
    });

    setIsSubmitting(false);

    if (result) {
      logger.success('Item created via dialog', { id: result.id });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate('');
      setStartDate('');
      setEndDate('');
      setRecurrencePattern('');
      setEstimatedMinutes('');
      setTags([]);
      setTagInput('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item Type */}
          <div>
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2 mt-1">
              {(['idea', 'task', 'routine'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setItemType(t)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors capitalize ${
                    itemType === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="item-title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={itemType === 'idea' ? 'What\'s the idea?' : itemType === 'routine' ? 'e.g. Weekly review' : 'What needs to be done?'}
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="item-desc" className="text-sm font-medium">Description</label>
            <textarea
              id="item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-none"
              maxLength={2000}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium">Priority</label>
            <div className="flex gap-2 mt-1">
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors capitalize ${
                    priority === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-muted'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          {itemType !== 'idea' && (
            <div>
              <label htmlFor="item-due" className="text-sm font-medium">Due Date</label>
              <Input
                id="item-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          {/* Date Range (for tasks) */}
          {itemType === 'task' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="item-start" className="text-sm font-medium">Start</label>
                <Input
                  id="item-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="item-end" className="text-sm font-medium">End</label>
                <Input
                  id="item-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Recurrence (for routines) */}
          {itemType === 'routine' && (
            <div>
              <label className="text-sm font-medium">Repeats</label>
              <div className="flex gap-2 mt-1">
                {(['daily', 'weekly', 'biweekly', 'monthly'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecurrencePattern(recurrencePattern === r ? '' : r)}
                    className={`px-3 py-1 text-sm rounded-md border transition-colors capitalize ${
                      recurrencePattern === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-muted'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Estimated Time */}
          {itemType !== 'idea' && (
            <div>
              <label htmlFor="item-est" className="text-sm font-medium">Estimated (minutes)</label>
              <Input
                id="item-est"
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="30"
                min={1}
                max={9999}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label htmlFor="item-tags" className="text-sm font-medium">Tags</label>
            <Input
              id="item-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Press Enter to add tags"
              maxLength={50}
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs cursor-pointer"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  >
                    {tag} &times;
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isSubmitting}>
              {isSubmitting ? 'Creating...' : `Add ${itemType}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
