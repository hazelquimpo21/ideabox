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
} from 'lucide-react';
import { useActions } from '@/hooks/useActions';
import { useIdeas, type IdeaItem } from '@/hooks/useIdeas';
import type { ActionWithEmail, ProjectItem } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TriageTrayProps {
  /** Called when user promotes an action to a project item */
  onPromoteAction?: (action: ActionWithEmail) => void;
  /** Called when user wants to create an item from an idea */
  onAcceptIdea?: (idea: IdeaItem) => void;
  /** Whether the tray is expanded */
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

function getActionTypeBadge(type: string | null) {
  if (!type || type === 'none') return null;
  const labels: Record<string, string> = {
    respond: 'Reply',
    review: 'Review',
    create: 'Create',
    schedule: 'Schedule',
    decide: 'Decide',
    pay: 'Pay',
    submit: 'Submit',
    register: 'Register',
    book: 'Book',
    follow_up: 'Follow up',
  };
  return (
    <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal">
      {labels[type] || type}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION SUGGESTION CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionSuggestionProps {
  action: ActionWithEmail;
  onPromote?: (action: ActionWithEmail) => void;
  onDismiss: (id: string) => void;
}

function ActionSuggestion({ action, onPromote, onDismiss }: ActionSuggestionProps) {
  const deadline = action.deadline ? formatDeadline(action.deadline) : null;

  return (
    <div className="flex items-start gap-3 p-3 border border-border/50 rounded-md hover:bg-muted/30 transition-colors group">
      <CheckSquare className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{action.title}</span>
          {getActionTypeBadge(action.action_type)}
        </div>

        {action.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{action.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {deadline && (
            <span className={`flex items-center gap-0.5 ${deadline.isUrgent ? 'text-destructive font-medium' : ''}`}>
              {deadline.isUrgent ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {deadline.text}
            </span>
          )}

          {action.email_id && (
            <Link
              href={`/inbox?email=${action.email_id}`}
              className="flex items-center gap-0.5 hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{action.email_subject || action.email_sender || 'Source email'}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Accept / dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onPromote && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onPromote(action)}
            title="Add to tasks"
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Accept
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDismiss(action.id)}
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
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
  return (
    <div className="flex items-start gap-3 p-3 border border-border/50 rounded-md hover:bg-muted/30 transition-colors group">
      <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm">{idea.idea}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal capitalize">
            {idea.type.replace(/_/g, ' ')}
          </Badge>

          {idea.confidence >= 0.7 && (
            <span className="flex items-center gap-0.5 text-amber-600">
              <Sparkles className="h-3 w-3" />
              High confidence
            </span>
          )}

          {idea.emailId && (
            <Link
              href={`/inbox?email=${idea.emailId}`}
              className="flex items-center gap-0.5 hover:text-foreground transition-colors truncate max-w-[160px]"
              title="View source email"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{idea.emailSubject || idea.emailSender || 'Source email'}</span>
            </Link>
          )}
        </div>

        {idea.relevance && (
          <p className="text-xs text-muted-foreground/70 italic line-clamp-1">{idea.relevance}</p>
        )}
      </div>

      {/* Accept / dismiss actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onAccept && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onAccept(idea)}
            title="Save as idea"
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Accept
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDismiss(idea)}
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
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
        <div key={i} className="flex items-start gap-3 p-3 border border-border/50 rounded-md">
          <Skeleton className="h-4 w-4 rounded mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
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

  // Fetch pending actions (email-extracted, not yet completed)
  const { actions, isLoading: actionsLoading } = useActions({
    status: 'pending',
    limit: 20,
    sortBy: 'urgency',
  });

  // Fetch idea sparks
  const {
    items: ideas,
    isLoading: ideasLoading,
    saveIdea,
    dismissIdea,
  } = useIdeas({ limit: 15 });

  // Filter out dismissed actions
  const visibleActions = React.useMemo(
    () => actions.filter((a) => !dismissedActionIds.has(a.id)),
    [actions, dismissedActionIds]
  );

  const handleDismissAction = (id: string) => {
    setDismissedActionIds((prev) => new Set([...prev, id]));
  };

  const handleAcceptIdea = (idea: IdeaItem) => {
    if (onAcceptIdea) {
      onAcceptIdea(idea);
    }
    saveIdea(idea);
  };

  const totalSuggestions = visibleActions.length + ideas.length;
  const isLoading = actionsLoading || ideasLoading;

  return (
    <Card className="border-dashed">
      {/* Header — collapsible */}
      <CardHeader
        className="py-3 px-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Triage
            </CardTitle>
            {totalSuggestions > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalSuggestions} suggestions
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            From your emails
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4">
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-3 border-b border-border/50 pb-2">
            <button
              onClick={() => setActiveTab('actions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'actions'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Suggested Tasks
              {visibleActions.length > 0 && (
                <Badge variant={activeTab === 'actions' ? 'outline' : 'secondary'} className="text-xs h-4 min-w-[16px] px-1 ml-0.5">
                  {visibleActions.length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ideas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'ideas'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Idea Sparks
              {ideas.length > 0 && (
                <Badge variant={activeTab === 'ideas' ? 'outline' : 'secondary'} className="text-xs h-4 min-w-[16px] px-1 ml-0.5">
                  {ideas.length}
                </Badge>
              )}
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <TriageSkeleton />
          ) : activeTab === 'actions' ? (
            visibleActions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No pending tasks from emails</p>
                <p className="text-xs mt-1">Tasks extracted from your emails will appear here</p>
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
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No idea sparks right now</p>
              <p className="text-xs mt-1">AI-generated ideas from your emails will appear here</p>
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
