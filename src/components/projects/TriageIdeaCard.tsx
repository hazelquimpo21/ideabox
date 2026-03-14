/**
 * Triage Idea Card
 *
 * Renders a single AI-generated idea suggestion in the triage list.
 * Based on the IdeaSuggestion pattern from TriageTray.tsx, with an
 * added Snooze button between Accept/Save and Dismiss.
 *
 * @module components/projects/TriageIdeaCard
 * @since March 2026 — Phase 1 Tasks Page Redesign
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Lightbulb,
  Mail,
  Sparkles,
  ArrowUpRight,
  X,
  ExternalLink,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';
import { QuickAcceptPopover } from './QuickAcceptPopover';
import { SnoozePicker } from './SnoozePicker';
import { SourceChip } from '@/components/shared/SourceChip';
import type { TriageItem } from '@/hooks/useTriageItems';
import type { IdeaItem } from '@/hooks/useIdeas';
import type { Project } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TriageIdeaCard');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for TriageIdeaCard.
 *
 * @module components/projects/TriageIdeaCard
 * @since March 2026
 */
export interface TriageIdeaCardProps {
  item: TriageItem;
  onAccept: (item: TriageItem) => void;
  onDismiss: (item: TriageItem) => void;
  onSnooze: (item: TriageItem, minutes?: number) => void;
  /** Available projects for the QuickAcceptPopover dropdown */
  projects?: Project[];
  /** Create a project item — passed to QuickAcceptPopover */
  onCreateItem?: (projectId: string, priority: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Idea suggestion card for the triage list.
 * Displays idea text, type badge, confidence indicator, source email link,
 * and Save / Snooze / Dismiss action buttons.
 *
 * @module components/projects/TriageIdeaCard
 * @since March 2026
 */
export function TriageIdeaCard({ item, onAccept, onDismiss, onSnooze, projects, onCreateItem }: TriageIdeaCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const idea = item.raw as IdeaItem;

  const handleDismiss = React.useCallback(() => {
    logger.info('Idea dismissed', { itemId: item.id });
    setDismissed(true);
    setTimeout(() => onDismiss(item), 300);
  }, [item, onDismiss]);

  const handleAccept = React.useCallback(() => {
    logger.info('Idea accepted', { itemId: item.id });
    onAccept(item);
  }, [item, onAccept]);

  const handleSnooze = React.useCallback((minutes: number) => {
    logger.info('Idea snoozed', { itemId: item.id, minutes });
    onSnooze(item, minutes);
  }, [item, onSnooze]);

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Idea icon */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30">
        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm leading-relaxed">{item.title}</p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-[10px] font-medium capitalize">
            {item.subtitle}
          </span>

          {idea.confidence >= 0.7 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
              <Sparkles className="h-3 w-3" />
              High match
            </span>
          )}

          {item.sourceEmailId && (
            <SourceChip
              type="email"
              id={item.sourceEmailId}
              label={item.sourceEmailSubject || item.sourceEmailSender || 'Source email'}
            />
          )}
        </div>

        {idea.relevance && (
          <p className="text-[11px] text-muted-foreground/60 italic line-clamp-1">{idea.relevance}</p>
        )}
      </div>

      {/* Save / Snooze / Dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {projects && onCreateItem ? (
          <QuickAcceptPopover
            item={item}
            projects={projects}
            onAccept={onCreateItem}
            trigger={
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2.5 text-xs shadow-sm"
              >
                <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            }
          />
        ) : (
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2.5 text-xs shadow-sm"
            onClick={handleAccept}
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        )}
        {item.sourceEmailId && (
          <Link
            href={`/inbox?email=${item.sourceEmailId}`}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            title="View source email"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
        <SnoozePicker onSnooze={handleSnooze} />
        <button
          onClick={handleDismiss}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
