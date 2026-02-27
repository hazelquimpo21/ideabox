/**
 * Edit Project Dialog
 *
 * Modal dialog for editing an existing project's name, description,
 * status, priority, color, and date range.
 *
 * @module components/projects/EditProjectDialog
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
} from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import type { Project, ProjectStatus } from '@/types/database';

const logger = createLogger('EditProjectDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onUpdate: (id: string, updates: Partial<Project>) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLOR_OPTIONS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280',
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EditProjectDialog({ open, onOpenChange, project, onUpdate }: EditProjectDialogProps) {
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description || '');
  const [status, setStatus] = React.useState<ProjectStatus>(project.status as ProjectStatus);
  const [priority, setPriority] = React.useState<'low' | 'medium' | 'high'>(
    project.priority as 'low' | 'medium' | 'high'
  );
  const [color, setColor] = React.useState(project.color || COLOR_OPTIONS[0]);
  const [startDate, setStartDate] = React.useState(project.start_date || '');
  const [endDate, setEndDate] = React.useState(project.end_date || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset form when project changes
  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setStatus(project.status as ProjectStatus);
    setPriority(project.priority as 'low' | 'medium' | 'high');
    setColor(project.color || COLOR_OPTIONS[0]);
    setStartDate(project.start_date || '');
    setEndDate(project.end_date || '');
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    logger.start('Updating project', { id: project.id });

    await onUpdate(project.id, {
      name: name.trim(),
      description: description.trim() || null,
      status,
      priority,
      color,
      start_date: startDate || null,
      end_date: endDate || null,
    });

    setIsSubmitting(false);
    logger.success('Project updated via dialog', { id: project.id });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="edit-project-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-project-desc" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="edit-project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
              maxLength={2000}
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    status === s.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium">Priority</label>
            <div className="flex gap-2 mt-1">
              {(['low', 'medium', 'high'] as const).map((p) => (
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

          {/* Color */}
          <div>
            <label className="text-sm font-medium">Color</label>
            <div className="flex gap-2 mt-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-start-date" className="text-sm font-medium">Start Date</label>
              <Input
                id="edit-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-end-date" className="text-sm font-medium">End Date</label>
              <Input
                id="edit-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
