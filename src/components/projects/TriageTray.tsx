/**
 * Triage Tray Component
 *
 * Unified inbox of suggested items from email analysis:
 * - Email-extracted actions (from useActions hook)
 * - AI-generated idea sparks (from useIdeas hook)
 *
 * Users can accept (promote to project item), dismiss, or view the
 * source email for each suggestion. Acts as a staging area before
 * items enter the Kanban board.
 *
 * @module components/projects/TriageTray
 * @since March 2026
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Inbox,
  Mail,
  Lightbulb,
  CheckSquare,
  ArrowUpRight,
  X,
  Clock,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useActions } from '@/hooks/useActions';
import { useIdeas, type IdeaItem } from '@/hooks/useIdeas';
import type { ActionWithEmail, ProjectItem } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TriageTrayProps {
  onPromoteAction?: (action: ActionWithEmail) => void;
  onAcceptIdea?: (idea: IdeaItem) => void;
  defaultExpanded?: boolean;
}

type TriageTab = 'actions' | 'ideas';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDeadline(dateStr: string): { text: string; isUrgent: boolean } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Overdue', isUrgent: true };
  if (diffDays === 0) return { text: 'Today', isUrgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `${diffDays}d`, isUrgent: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isUrgent: false };
}

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  respond: { label: 'Reply', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  review: { label: 'Review', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  create: { label: 'Create', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  schedule: { label: 'Schedule', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  decide: { label: 'Decide', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  pay: { label: 'Pay', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  submit: { label: 'Submit', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  register: { label: 'Register', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  book: { label: 'Book', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  follow_up: { label: 'Follow up', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION SUGGESTION CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionSuggestionProps {
  action: ActionWithEmail;
  onPromote?: (action: ActionWithEmail) => void;
  onDismiss: (id: string) => void;
}

function ActionSuggestion({ action, onPromote, onDismiss }: ActionSuggestionProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const deadline = action.deadline ? formatDeadline(action.deadline) : null;
  const typeInfo = action.action_type ? ACTION_TYPE_LABELS[action.action_type] : null;

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(() => onDismiss(action.id), 300);
  };

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Type icon with colored background */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
        <CheckSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{action.title}</span>
          {typeInfo && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', typeInfo.color)}>
              {typeInfo.label}
            </span>
          )}
        </div>

        {action.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{action.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {deadline && (
            <span className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full',
              deadline.isUrgent
                ? 'bg-destructive/10 text-destructive font-medium'
                : 'bg-muted/60',
            )}>
              {deadline.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {deadline.text}
            </span>
          )}

          {action.email_id && (
            <Link
              href={`/inbox?email=${action.email_id}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{action.email_subject || action.email_sender || 'Source email'}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Accept / dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {onPromote && (
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2.5 text-xs shadow-sm"
            onClick={() => onPromote(action)}
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Accept
          </Button>
        )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// IDEA SUGGESTION CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface IdeaSuggestionProps {
  idea: IdeaItem;
  onAccept?: (idea: IdeaItem) => void;
  onDismiss: (idea: IdeaItem) => void;
}

function IdeaSuggestion({ idea, onAccept, onDismiss }: IdeaSuggestionProps) {
  const [dismissed, setDismissed] = React.useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(() => onDismiss(idea), 300);
  };

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-border/50 group',
      'transition-all duration-300 ease-out',
      'hover:border-border hover:shadow-sm hover:bg-card',
      dismissed && 'opacity-0 scale-95 -translate-x-2 h-0 !p-0 !m-0 overflow-hidden border-0',
    )}>
      {/* Idea icon with colored background */}
      <div className="mt-0.5 shrink-0 p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30">
        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm leading-relaxed">{idea.idea}</p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-[10px] font-medium capitalize">
            {idea.type.replace(/_/g, ' ')}
          </span>

          {idea.confidence >= 0.7 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
              <Sparkles className="h-3 w-3" />
              High match
            </span>
          )}

          {idea.emailId && (
            <Link
              href={`/inbox?email=${idea.emailId}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{idea.emailSubject || idea.emailSender || 'Source email'}</span>
            </Link>
          )}
        </div>

        {idea.relevance && (
          <p className="text-[11px] text-muted-foreground/60 italic line-clamp-1">{idea.relevance}</p>
        )}
      </div>

      {/* Accept / dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {onAccept && (
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2.5 text-xs shadow-sm"
            onClick={() => onAccept(idea)}
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════════════════════════════════

function TriageSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/50">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TriageTray({
  onPromoteAction,
  onAcceptIdea,
  defaultExpanded = true,
}: TriageTrayProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [activeTab, setActiveTab] = React.useState<TriageTab>('actions');
  const [dismissedActionIds, setDismissedActionIds] = React.useState<Set<string>>(new Set());

  const { actions, isLoading: actionsLoading } = useActions({
    status: 'pending',
    limit: 20,
    sortBy: 'urgency',
  });

  const {
    items: ideas,
    isLoading: ideasLoading,
    saveIdea,
    dismissIdea,
  } = useIdeas({ limit: 15 });

  const visibleActions = React.useMemo(
    () => actions.filter((a) => !dismissedActionIds.has(a.id)),
    [actions, dismissedActionIds],
  );

  const handleDismissAction = (id: string) => {
    setDismissedActionIds((prev) => new Set([...prev, id]));
  };

  const handleAcceptIdea = (idea: IdeaItem) => {
    if (onAcceptIdea) onAcceptIdea(idea);
    saveIdea(idea);
  };

  const totalSuggestions = visibleActions.length + ideas.length;
  const isLoading = actionsLoading || ideasLoading;

  return (
    <Card className={cn(
      'border-dashed transition-all duration-300',
      expanded ? 'border-border' : 'border-border/50 hover:border-border',
    )}>
      {/* Header */}
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors rounded-t-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              'p-1 rounded-md transition-colors',
              totalSuggestions > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
            )}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
            <Zap className={cn(
              'h-4 w-4',
              totalSuggestions > 0 ? 'text-amber-500' : 'text-muted-foreground',
            )} />
            <CardTitle className="text-sm font-medium">Triage</CardTitle>
            {totalSuggestions > 0 && (
              <Badge variant="default" className="text-xs h-5 px-2 animate-in fade-in slide-in-from-left-1 duration-300">
                {totalSuggestions}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Suggestions from your emails
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-3 pb-2 border-b border-border/40">
            <button
              onClick={() => setActiveTab('actions')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all duration-200',
                activeTab === 'actions'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Suggested Tasks
              {visibleActions.length > 0 && (
                <span className={cn(
                  'text-[10px] h-4 min-w-[16px] px-1 rounded-full inline-flex items-center justify-center',
                  activeTab === 'actions'
                    ? 'bg-primary-foreground/20'
                    : 'bg-muted-foreground/20',
                )}>
                  {visibleActions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ideas')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all duration-200',
                activeTab === 'ideas'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Idea Sparks
              {ideas.length > 0 && (
                <span className={cn(
                  'text-[10px] h-4 min-w-[16px] px-1 rounded-full inline-flex items-center justify-center',
                  activeTab === 'ideas'
                    ? 'bg-primary-foreground/20'
                    : 'bg-muted-foreground/20',
                )}>
                  {ideas.length}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <TriageSkeleton />
          ) : activeTab === 'actions' ? (
            visibleActions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted/40 mb-3">
                  <CheckSquare className="h-6 w-6 opacity-40" />
                </div>
                <p className="text-sm font-medium">All caught up</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Tasks extracted from emails will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleActions.map((action) => (
                  <ActionSuggestion
                    key={action.id}
                    action={action}
                    onPromote={onPromoteAction}
                    onDismiss={handleDismissAction}
                  />
                ))}
              </div>
            )
          ) : ideas.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted/40 mb-3">
                <Lightbulb className="h-6 w-6 opacity-40" />
              </div>
              <p className="text-sm font-medium">No sparks yet</p>
              <p className="text-xs mt-1 text-muted-foreground/70">AI-generated ideas from your emails will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ideas.map((idea, i) => (
                <IdeaSuggestion
                  key={`${idea.emailId}-${idea.type}-${i}`}
                  idea={idea}
                  onAccept={onAcceptIdea ? handleAcceptIdea : undefined}
                  onDismiss={dismissIdea}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
