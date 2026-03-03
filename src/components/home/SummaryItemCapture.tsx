/**
 * Summary Item Capture Popover
 *
 * A lightweight inline popover that lets users save email summary items
 * as tasks or ideas. Appears on hover/click from the "+" button next
 * to each summary item row.
 *
 * Pre-fills the title from the summary text, defaults type to "Task"
 * if the item has action_needed, otherwise "Idea".
 *
 * @module components/home/SummaryItemCapture
 * @since March 2026
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { Plus, Check, ArrowRight } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { useProjects } from '@/hooks/useProjects';
import { useProjectItems } from '@/hooks/useProjectItems';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SummaryItemCapture');
const MRU_PROJECT_KEY = 'ideabox_last_project_id';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SummaryItemCaptureProps {
  /** The summary item text */
  text: string;
  /** Whether the summary item has action_needed flag */
  actionNeeded?: boolean;
  /** Source email ID, if available */
  emailId?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SummaryItemCapture({ text, actionNeeded, emailId }: SummaryItemCaptureProps) {
  const { projects } = useProjects({ status: 'all' });
  const { createItem } = useProjectItems();
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [type, setType] = React.useState<'task' | 'idea'>(actionNeeded ? 'task' : 'idea');
  const [title, setTitle] = React.useState(text);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const activeProjects = React.useMemo(
    () => projects.filter((p) => p.status === 'active' || p.status === 'on_hold'),
    [projects],
  );

  const [projectId, setProjectId] = React.useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem(MRU_PROJECT_KEY);
    if (stored && activeProjects.some((p) => p.id === stored)) return stored;
    return activeProjects[0]?.id || '';
  });

  const [priority, setPriority] = React.useState<string>(actionNeeded ? 'medium' : 'low');

  // Focus input when popover opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  const handleSubmit = React.useCallback(async () => {
    setIsSubmitting(true);
    try {
      await createItem({
        title: title || text,
        item_type: type,
        project_id: projectId || undefined,
        priority: priority as 'low' | 'medium' | 'high',
        source_email_id: emailId || undefined,
      });

      // Also save as idea if type is idea
      if (type === 'idea') {
        await fetch('/api/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea: title || text,
            ideaType: 'business',
            relevance: 'Captured from email summary',
            confidence: 0.7,
            emailId: emailId || undefined,
          }),
        });
      }

      if (projectId) localStorage.setItem(MRU_PROJECT_KEY, projectId);
      setSaved(true);
      setOpen(false);
      logger.info('Summary item saved', { type, title: (title || text).substring(0, 30) });
    } catch (err) {
      logger.error('Failed to save summary item', { error: err instanceof Error ? err.message : 'Unknown' });
    } finally {
      setIsSubmitting(false);
    }
  }, [title, text, type, projectId, priority, emailId, createItem]);

  if (saved) {
    return (
      <span className="inline-flex items-center text-green-600 dark:text-green-400 shrink-0">
        <Check className="h-3 w-3" />
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <div onClick={() => setOpen((prev) => !prev)}>
          <button
            type="button"
            className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all shrink-0"
            title="Save as task or idea"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      }
      align="end"
    >
      <div className="space-y-2.5 min-w-[240px]">
        {/* Type toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Save as:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setType('task')}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                type === 'task'
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-background border-input hover:bg-muted',
              )}
            >
              Task
            </button>
            <button
              type="button"
              onClick={() => setType('idea')}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                type === 'idea'
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-background border-input hover:bg-muted',
              )}
            >
              Idea
            </button>
          </div>
        </div>

        {/* Editable title */}
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-sm bg-transparent border-b border-input outline-none py-1 focus:border-primary/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') setOpen(false);
          }}
        />

        {/* Project dropdown */}
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">No project</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Priority */}
        <div className="flex gap-1">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPriority(opt.value)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-md border transition-colors',
                priority === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-input hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Save button */}
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : (
            <>
              Save
              <ArrowRight className="h-3 w-3 ml-1" />
            </>
          )}
        </Button>
      </div>
    </Popover>
  );
}

export default SummaryItemCapture;
