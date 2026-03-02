/**
 * Quick Accept Popover
 *
 * Lightweight 2-step alternative to PromoteActionDialog. Appears as a
 * popover anchored to the Accept button on triage cards. Users select
 * a project and priority, then click "Add to Board" to promote the
 * item with minimal friction.
 *
 * Layout:
 * ┌────────────────────────────────┐
 * │  Add to:  [Project dropdown ▾] │
 * │  Priority: ● Low ● Med ● High │
 * │          [Add to Board →]      │
 * │        More options...         │
 * └────────────────────────────────┘
 *
 * @module components/projects/QuickAcceptPopover
 * @since March 2026 — Phase 2 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { ArrowRight } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import type { TriageItem } from '@/hooks/useTriageItems';
import type { Project, ProjectItem } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('QuickAcceptPopover');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MRU_PROJECT_KEY = 'ideabox_last_project_id';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for QuickAcceptPopover.
 *
 * @module components/projects/QuickAcceptPopover
 * @since March 2026
 */
export interface QuickAcceptPopoverProps {
  /** The triage item to accept */
  item: TriageItem;
  /** Available projects for the dropdown */
  projects: Project[];
  /** Create a project item — from useProjectItems.createItem */
  onAccept: (projectId: string, priority: string) => Promise<void>;
  /** Optional fallback to open the full PromoteActionDialog */
  onFallbackToDialog?: () => void;
  /** The Accept button itself — rendered as the popover trigger */
  trigger: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * QuickAcceptPopover — 2-step promote flow for triage items.
 *
 * Renders a popover anchored to the Accept button. Users pick a project
 * and priority, then click "Add to Board" to create a project_item.
 * MRU project is persisted in localStorage.
 *
 * @module components/projects/QuickAcceptPopover
 * @since March 2026
 */
export function QuickAcceptPopover({
  item,
  projects,
  onAccept,
  onFallbackToDialog,
  trigger,
}: QuickAcceptPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Read MRU project from localStorage in state initializer (no effect)
  const [projectId, setProjectId] = React.useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem(MRU_PROJECT_KEY);
    // Verify stored project still exists in the project list — done after render
    return stored || '';
  });

  // Default priority from item's raw data or 'medium'
  const [priority, setPriority] = React.useState<string>(() => {
    const raw = item.raw as unknown as Record<string, unknown>;
    return (typeof raw.priority === 'string' && raw.priority) || 'medium';
  });

  // Validate MRU project exists in current projects list
  const activeProjects = React.useMemo(
    () => projects.filter((p) => p.status === 'active' || p.status === 'on_hold'),
    [projects],
  );

  // If stored MRU doesn't match any active project, default to first one
  React.useEffect(() => {
    if (projectId && !activeProjects.some((p) => p.id === projectId)) {
      setProjectId(activeProjects[0]?.id || '');
    }
  }, [activeProjects, projectId]);

  const handleProjectChange = React.useCallback((newProjectId: string) => {
    logger.info('Project selected', { projectId: newProjectId });
    setProjectId(newProjectId);
    if (newProjectId) {
      localStorage.setItem(MRU_PROJECT_KEY, newProjectId);
    }
  }, []);

  const handlePriorityChange = React.useCallback((newPriority: string) => {
    logger.info('Priority changed', { priority: newPriority });
    setPriority(newPriority);
  }, []);

  const handleSubmit = React.useCallback(async () => {
    logger.info('Quick accept', {
      type: item.type,
      itemId: item.id,
      projectId,
      priority,
    });

    setIsSubmitting(true);
    try {
      await onAccept(projectId, priority);
      logger.info('Quick accept succeeded', { itemId: item.id });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Quick accept failed', { error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }, [item, projectId, priority, onAccept]);

  const handleMoreOptions = React.useCallback(() => {
    setOpen(false);
    onFallbackToDialog?.();
  }, [onFallbackToDialog]);

  const triggerWithClick = (
    <div onClick={() => setOpen((prev) => !prev)}>
      {trigger}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={triggerWithClick} align="end">
      <div className="space-y-3 min-w-[260px]">
        {/* Title preview */}
        <p className="text-xs text-muted-foreground truncate" title={item.title}>
          {item.title}
        </p>

        {/* Project dropdown */}
        <div>
          <label htmlFor="quick-project" className="text-xs font-medium text-muted-foreground">
            Add to
          </label>
          <select
            id="quick-project"
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No project</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority radio buttons */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <div className="flex gap-1 mt-1">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePriorityChange(opt.value)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  priority === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Adding...' : (
            <>
              Add to Board
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>

        {/* More options link */}
        {onFallbackToDialog && (
          <button
            onClick={handleMoreOptions}
            className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            More options...
          </button>
        )}
      </div>
    </Popover>
  );
}
