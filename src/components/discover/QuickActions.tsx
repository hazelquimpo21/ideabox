/**
 * QuickActions Component
 *
 * Displays suggested quick actions the user can take after initial sync.
 * Actions include bulk archive, view urgent items, add clients, etc.
 *
 * @module components/discover/QuickActions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import type { SuggestedAction, SuggestedActionType } from '@/types/discovery';

// =============================================================================
// TYPES
// =============================================================================

export interface QuickActionsProps {
  /** Array of suggested actions */
  actions: SuggestedAction[];
  /** Callback when archive action is triggered */
  onArchiveCategory?: (category: string, count: number) => Promise<void>;
  /** Callback when add client action is triggered */
  onAddClient?: (clientName: string) => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get icon and style for action type.
 */
function getActionDisplay(type: SuggestedActionType): {
  icon: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
} {
  switch (type) {
    case 'view_urgent':
      return { icon: '⚡', variant: 'destructive' };
    case 'add_events':
      return { icon: '📅', variant: 'default' };
    case 'add_client':
      return { icon: '👤', variant: 'secondary' };
    case 'archive_category':
      return { icon: '📦', variant: 'outline' };
    default:
      return { icon: '✨', variant: 'secondary' };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Displays actionable suggestions as buttons.
 *
 * @example
 * ```tsx
 * <QuickActions
 *   actions={result.suggestedActions}
 *   onArchiveCategory={async (cat, count) => {
 *     await archiveEmails(cat);
 *   }}
 *   onAddClient={(name) => openAddClientModal(name)}
 * />
 * ```
 */
export function QuickActions({
  actions,
  onArchiveCategory,
  onAddClient,
}: QuickActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleAction = async (action: SuggestedAction) => {
    // Skip if already completed
    if (completedActions.has(action.id)) {
      return;
    }

    setLoadingAction(action.id);

    try {
      switch (action.type) {
        case 'view_urgent':
          router.push('/inbox?category=action_required&urgency=high');
          break;

        case 'add_events':
          router.push('/inbox?category=event');
          break;

        case 'add_client':
          if (onAddClient && action.clientName) {
            onAddClient(action.clientName);
          }
          break;

        case 'archive_category':
          if (onArchiveCategory && action.category && action.count) {
            await onArchiveCategory(action.category, action.count);
            setCompletedActions((prev) => new Set([...prev, action.id]));
            toast({
              title: 'Archived!',
              description: `${action.count} emails have been archived.`,
            });
          }
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingAction(null);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Empty State
  // ───────────────────────────────────────────────────────────────────────────

  if (actions.length === 0) {
    return null; // Don't show anything if no actions
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>⚡</span>
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {actions.map((action) => {
            const display = getActionDisplay(action.type);
            const isLoading = loadingAction === action.id;
            const isCompleted = completedActions.has(action.id);

            return (
              <Button
                key={action.id}
                variant={display.variant}
                size="sm"
                disabled={isLoading || isCompleted}
                onClick={() => handleAction(action)}
                className={`
                  relative
                  ${isCompleted ? 'opacity-50 line-through' : ''}
                  ${action.priority === 'high' ? 'ring-2 ring-red-300' : ''}
                `}
              >
                {isLoading ? (
                  <span className="animate-spin mr-2">⏳</span>
                ) : (
                  <span className="mr-2">{display.icon}</span>
                )}
                {action.label}
                {action.count && (
                  <Badge
                    variant="secondary"
                    className="ml-2 text-xs"
                  >
                    {action.count}
                  </Badge>
                )}
                {isCompleted && (
                  <span className="ml-2">✓</span>
                )}
              </Button>
            );
          })}
        </div>

        {/* Description for first action */}
        {actions[0] && (
          <p className="text-xs text-muted-foreground mt-3">
            {actions[0].description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default QuickActions;
