/**
 * Promote Action Dialog
 *
 * Bridges the email-extracted action system with the project management system.
 * Lets users "promote" an action into a project item, pre-filling data from
 * the source action. Supports project selection, type/priority/date overrides,
 * and optional completion of the original action.
 *
 * @module components/projects/PromoteActionDialog
 * @since February 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Checkbox,
  Badge,
} from '@/components/ui';
import { Mail } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { ActionWithEmail } from '@/types/database';
import type { Project, ProjectItem, ProjectItemType } from '@/types/database';

const logger = createLogger('PromoteActionDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromoteActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ActionWithEmail | null;
  projects: Project[];
  onCreateItem: (item: Partial<ProjectItem> & { title: string }) => Promise<ProjectItem | null>;
  onCompleteAction?: (actionId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract date-only string from ISO datetime */
function extractDateFromDeadline(deadline?: string | null): string {
  if (!deadline) return '';
  try {
    return new Date(deadline).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function PromoteActionDialog({
  open,
  onOpenChange,
  action,
  projects,
  onCreateItem,
  onCompleteAction,
}: PromoteActionDialogProps) {
  // ─── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [itemType, setItemType] = React.useState<ProjectItemType>('task');
  const [priority, setPriority] = React.useState('medium');
  const [dueDate, setDueDate] = React.useState('');
  const [estimatedMinutes, setEstimatedMinutes] = React.useState('');
  const [projectId, setProjectId] = React.useState<string>('');
  const [markCompleted, setMarkCompleted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // ─── Pre-fill from action when it changes ──────────────────────────────────
  React.useEffect(() => {
    if (action) {
      setTitle(action.title || '');
      setDescription(action.description || '');
      setPriority(action.priority || 'medium');
      setDueDate(extractDateFromDeadline(action.deadline));
      setEstimatedMinutes(action.estimated_minutes ? String(action.estimated_minutes) : '');
      setItemType('task');
      setProjectId('');
      setMarkCompleted(false);
    }
  }, [action]);

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !action) return;

    setIsSubmitting(true);
    logger.start('Promoting action to project item', {
      actionId: action.id,
      projectId: projectId || 'none',
    });

    const result = await onCreateItem({
      title: title.trim(),
      description: description.trim() || undefined,
      item_type: itemType,
      priority,
      due_date: dueDate || null,
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
      source_action_id: action.id,
      source_email_id: action.email_id || undefined,
      contact_id: action.contact_id || undefined,
      project_id: projectId || null,
    });

    if (result) {
      logger.success('Action promoted', { itemId: result.id, actionId: action.id });

      if (markCompleted && onCompleteAction) {
        await onCompleteAction(action.id);
        logger.success('Source action marked completed', { actionId: action.id });
      }

      onOpenChange(false);
    }

    setIsSubmitting(false);
  };

  if (!action) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Promote to Project Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Source action + email reference */}
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 space-y-1">
            <div>
              Promoting action: <span className="font-medium text-foreground">{action.title}</span>
            </div>
            {action.email_id && (
              <Link
                href={`/inbox?email=${action.email_id}`}
                className="flex items-center gap-1 hover:text-foreground transition-colors w-fit"
                title="View source email"
              >
                <Mail className="h-3 w-3" />
                {action.email_subject || action.email_sender || 'View source email'}
              </Link>
            )}
          </div>

          {/* Project selection */}
          <div>
            <label htmlFor="promote-project" className="text-sm font-medium">
              Project
            </label>
            <select
              id="promote-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No project (standalone item)</option>
              {projects
                .filter((p) => p.status === 'active' || p.status === 'on_hold')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Item type */}
          <div>
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2 mt-1">
              {(['task', 'idea', 'routine'] as const).map((t) => (
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
            <label htmlFor="promote-title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              id="promote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="promote-desc" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="promote-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-none"
              maxLength={2000}
            />
          </div>

          {/* Priority + Due Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Priority</label>
              <div className="flex gap-1 mt-1">
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors capitalize ${
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
            <div>
              <label htmlFor="promote-due" className="text-sm font-medium">Due Date</label>
              <Input
                id="promote-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Estimated time */}
          <div>
            <label htmlFor="promote-est" className="text-sm font-medium">
              Estimated (minutes)
            </label>
            <Input
              id="promote-est"
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="30"
              min={1}
              max={9999}
            />
          </div>

          {/* Mark original as completed */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="promote-complete"
              checked={markCompleted}
              onCheckedChange={(checked) => setMarkCompleted(checked === true)}
            />
            <label htmlFor="promote-complete" className="text-sm text-muted-foreground cursor-pointer">
              Mark original action as completed
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isSubmitting}>
              {isSubmitting ? 'Promoting...' : 'Promote to Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
