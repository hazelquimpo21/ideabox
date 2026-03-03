/**
 * Smart Capture Bar
 *
 * A visually distinct section rendered inside the EmailDetail analysis card
 * that surfaces all capturable items (AI-extracted actions + idea sparks)
 * pre-filled and ready to save to the board with minimal friction.
 *
 * Each row shows: type icon, pre-filled title (editable), and a "Save" button
 * that opens a QuickAcceptPopover for project + priority selection.
 * Also includes a "+ Add your own" button for manual capture.
 *
 * @module components/email/SmartCaptureBar
 * @since March 2026
 */

'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import {
  Zap,
  Lightbulb,
  Plus,
  Check,
  ArrowRight,
  Loader2,
  Pencil,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { useProjects } from '@/hooks/useProjects';
import { useProjectItems } from '@/hooks/useProjectItems';
import type { ActionExtractionResult, IdeaSparkResult } from '@/hooks/useEmailAnalysis';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SmartCaptureBar');

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

interface CaptureItem {
  id: string;
  type: 'task' | 'idea';
  title: string;
  description?: string;
  /** Original action type if from actionExtraction */
  actionType?: string;
  /** Original idea type if from ideaSparks */
  ideaType?: string;
  /** Deadline from action extraction */
  deadline?: string;
  /** Confidence score */
  confidence?: number;
  /** Relevance text for ideas */
  relevance?: string;
}

export interface SmartCaptureBarProps {
  emailId: string;
  emailSubject?: string;
  emailGist?: string;
  actionExtraction?: ActionExtractionResult | null;
  ideaSparks?: IdeaSparkResult | null;
  /** Client-tagged contact ID for project inference */
  contactId?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE SAVE POPOVER — reusable mini-popover for each capture row
// ═══════════════════════════════════════════════════════════════════════════════

function InlineSavePopover({
  item,
  onSave,
  projects,
  contactId,
}: {
  item: CaptureItem;
  onSave: (item: CaptureItem, projectId: string, priority: string) => Promise<void>;
  projects: { id: string; name: string; status: string; contact_id?: string | null }[];
  contactId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const activeProjects = React.useMemo(
    () => projects.filter((p) => p.status === 'active' || p.status === 'on_hold'),
    [projects],
  );

  // Smart default: match contact project, then MRU, then first project
  const [projectId, setProjectId] = React.useState<string>(() => {
    if (contactId) {
      const contactProject = activeProjects.find((p) => p.contact_id === contactId);
      if (contactProject) return contactProject.id;
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MRU_PROJECT_KEY);
      if (stored && activeProjects.some((p) => p.id === stored)) return stored;
    }
    return activeProjects[0]?.id || '';
  });

  const [priority, setPriority] = React.useState<string>('medium');

  const handleSubmit = React.useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onSave(item, projectId, priority);
      if (projectId) localStorage.setItem(MRU_PROJECT_KEY, projectId);
      setOpen(false);
    } catch (err) {
      logger.error('Inline save failed', { error: err instanceof Error ? err.message : 'Unknown' });
    } finally {
      setIsSubmitting(false);
    }
  }, [item, projectId, priority, onSave]);

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={
      <div onClick={() => setOpen((prev) => !prev)}>
        <Button variant="default" size="sm" className="h-7 px-2.5 text-xs shrink-0">
          Save
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    } align="end">
      <div className="space-y-3 min-w-[240px]">
        <p className="text-xs text-muted-foreground truncate" title={item.title}>
          {item.title}
        </p>

        <div>
          <label htmlFor={`capture-project-${item.id}`} className="text-xs font-medium text-muted-foreground">
            Add to
          </label>
          <select
            id={`capture-project-${item.id}`}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No project</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <div className="flex gap-1 mt-1">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
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
      </div>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURE ROW — a single capturable item
// ═══════════════════════════════════════════════════════════════════════════════

function CaptureRow({
  item,
  onSave,
  saved,
  projects,
  contactId,
}: {
  item: CaptureItem;
  onSave: (item: CaptureItem, projectId: string, priority: string) => Promise<void>;
  saved: boolean;
  projects: { id: string; name: string; status: string; contact_id?: string | null }[];
  contactId?: string | null;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(item.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const editableItem = React.useMemo(
    () => ({ ...item, title: editedTitle }),
    [item, editedTitle],
  );

  return (
    <div className={cn(
      'flex items-center gap-2.5 p-2 rounded-md transition-all',
      saved ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-muted/50',
    )}>
      {/* Type icon */}
      <div className={cn(
        'shrink-0 p-1 rounded',
        item.type === 'task'
          ? 'bg-blue-100 dark:bg-blue-900/30'
          : 'bg-amber-100 dark:bg-amber-900/30',
      )}>
        {item.type === 'task' ? (
          <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        ) : (
          <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        )}
      </div>

      {/* Title — editable on click */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsEditing(false);
              if (e.key === 'Escape') {
                setEditedTitle(item.title);
                setIsEditing(false);
              }
            }}
            className="w-full text-sm bg-transparent border-b border-primary/30 outline-none py-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => !saved && setIsEditing(true)}
            className={cn(
              'text-sm text-left truncate w-full group/title flex items-center gap-1',
              saved ? 'text-muted-foreground' : 'hover:text-foreground',
            )}
            title={saved ? editedTitle : 'Click to edit'}
          >
            <span className="truncate">{editedTitle}</span>
            {!saved && (
              <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Type badge */}
      <span className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
        item.type === 'task'
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
          : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
      )}>
        {item.type === 'task' ? (item.actionType || 'Task') : (item.ideaType?.replace(/_/g, ' ') || 'Idea')}
      </span>

      {/* Save button or saved state */}
      {saved ? (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      ) : (
        <InlineSavePopover
          item={editableItem}
          onSave={onSave}
          projects={projects}
          contactId={contactId}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD YOUR OWN — manual capture row
// ═══════════════════════════════════════════════════════════════════════════════

function AddYourOwnRow({
  emailId,
  emailSubject,
  onSave,
  projects,
  contactId,
}: {
  emailId: string;
  emailSubject?: string;
  onSave: (item: CaptureItem, projectId: string, priority: string) => Promise<void>;
  projects: { id: string; name: string; status: string; contact_id?: string | null }[];
  contactId?: string | null;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<'task' | 'idea'>('task');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 w-full p-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add your own task or idea
      </button>
    );
  }

  const captureItem: CaptureItem = {
    id: `custom-${Date.now()}`,
    type,
    title: title || emailSubject || 'New item',
  };

  return (
    <div className="space-y-2 p-2 rounded-md bg-muted/30">
      <div className="flex items-center gap-2">
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
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={emailSubject || 'What do you want to capture?'}
          className="flex-1 text-sm bg-transparent border-b border-input outline-none py-0.5 focus:border-primary/50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              setTitle('');
            }
          }}
        />
        <InlineSavePopover
          item={captureItem}
          onSave={onSave}
          projects={projects}
          contactId={contactId}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SmartCaptureBar({
  emailId,
  emailSubject,
  emailGist,
  actionExtraction,
  ideaSparks,
  contactId,
}: SmartCaptureBarProps) {
  const { projects } = useProjects({ status: 'all' });
  const { createItem } = useProjectItems();
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());

  // Build capturable items from AI analysis
  const captureItems = React.useMemo<CaptureItem[]>(() => {
    const items: CaptureItem[] = [];

    // Actions → tasks
    if (actionExtraction?.hasAction && actionExtraction.actions?.length) {
      actionExtraction.actions.forEach((action, i) => {
        items.push({
          id: `action-${i}`,
          type: 'task',
          title: action.title,
          description: action.description,
          actionType: action.type,
          deadline: action.deadline,
          confidence: action.confidence,
        });
      });
    } else if (actionExtraction?.hasAction && actionExtraction.actionTitle) {
      // Legacy single-action fallback
      items.push({
        id: 'action-legacy',
        type: 'task',
        title: actionExtraction.actionTitle,
        description: actionExtraction.actionDescription,
        actionType: actionExtraction.actionType,
        deadline: actionExtraction.deadline,
        confidence: actionExtraction.confidence,
      });
    }

    // Idea sparks → ideas
    if (ideaSparks?.hasIdeas && ideaSparks.ideas?.length) {
      ideaSparks.ideas.forEach((idea, i) => {
        items.push({
          id: `idea-${i}`,
          type: 'idea',
          title: idea.idea,
          ideaType: idea.type,
          confidence: idea.confidence,
          relevance: idea.relevance,
        });
      });
    }

    return items;
  }, [actionExtraction, ideaSparks]);

  // Handle saving a capture item to the board
  const handleSave = React.useCallback(async (
    item: CaptureItem,
    projectId: string,
    priority: string,
  ) => {
    logger.start('Saving capture item', { type: item.type, title: item.title });

    try {
      // Create project_item
      await createItem({
        title: item.title,
        description: item.description || item.relevance || undefined,
        item_type: item.type,
        project_id: projectId || undefined,
        priority: priority as 'low' | 'medium' | 'high',
        source_email_id: emailId,
        due_date: item.deadline || undefined,
      });

      // Also persist ideas to email_ideas table
      if (item.type === 'idea') {
        await fetch('/api/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea: item.title,
            ideaType: item.ideaType || 'business',
            relevance: item.relevance || `Saved from email`,
            confidence: item.confidence || 0.7,
            emailId,
          }),
        });
      }

      setSavedIds((prev) => new Set(prev).add(item.id));
      logger.success('Capture item saved', { id: item.id, type: item.type });
    } catch (err) {
      logger.error('Failed to save capture item', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      throw err;
    }
  }, [emailId, createItem]);

  const hasItems = captureItems.length > 0;

  return (
    <div className="pt-3 border-t">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Quick Capture</span>
        {hasItems && (
          <span className="text-[10px] text-muted-foreground">
            {captureItems.length} item{captureItems.length !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      <div className="space-y-1 pl-2">
        {captureItems.map((item) => (
          <CaptureRow
            key={item.id}
            item={item}
            onSave={handleSave}
            saved={savedIds.has(item.id)}
            projects={projects}
            contactId={contactId}
          />
        ))}

        <AddYourOwnRow
          emailId={emailId}
          emailSubject={emailSubject}
          onSave={handleSave}
          projects={projects}
          contactId={contactId}
        />
      </div>
    </div>
  );
}

export default SmartCaptureBar;
