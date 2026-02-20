/**
 * QuickActions Component
 *
 * Displays suggested quick actions the user can take after initial sync.
 * Actions include bulk archive, view urgent items, add clients, etc.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION (Jan 2026 Update)
 * ═══════════════════════════════════════════════════════════════════════════════
 * - view_urgent → /actions (the action items/tasks page)
 * - add_events → /events (the events calendar page)
 * - archive_category → calls onArchiveCategory callback
 * - add_client → calls onAddClient callback
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
import { createLogger } from '@/lib/utils/logger';
import type { SuggestedAction, SuggestedActionType } from '@/types/discovery';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('QuickActions');

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
      logger.debug('Action already completed, skipping', { actionId: action.id });
      return;
    }

    logger.info('Quick action triggered', {
      actionId: action.id,
      type: action.type,
      category: action.category,
      count: action.count,
    });

    setLoadingAction(action.id);

    try {
      switch (action.type) {
        // ─────────────────────────────────────────────────────────────────────────
        // View Urgent: Navigate to the tasks page to see urgent items
        // UPDATED (Feb 2026): /actions → /tasks per Navigation Redesign
        // ─────────────────────────────────────────────────────────────────────────
        case 'view_urgent':
          logger.info('Navigating to tasks page for urgent items');
          router.push('/tasks');
          break;

        // ─────────────────────────────────────────────────────────────────────────
        // Add Events: Navigate to the calendar page to review detected events
        // UPDATED (Feb 2026): /events → /calendar per Navigation Redesign
        // ─────────────────────────────────────────────────────────────────────────
        case 'add_events':
          logger.info('Navigating to calendar page');
          router.push('/calendar');
          break;

        // ─────────────────────────────────────────────────────────────────────────
        // Add Client: Call the provided callback to handle client addition
        // ─────────────────────────────────────────────────────────────────────────
        case 'add_client':
          if (onAddClient && action.clientName) {
            logger.info('Adding client', { clientName: action.clientName });
            onAddClient(action.clientName);
          }
          break;

        // ─────────────────────────────────────────────────────────────────────────
        // Archive Category: Bulk archive emails in a category
        // ─────────────────────────────────────────────────────────────────────────
        case 'archive_category':
          if (onArchiveCategory && action.category && action.count) {
            logger.info('Archiving category', {
              category: action.category,
              count: action.count,
            });
            await onArchiveCategory(action.category, action.count);
            setCompletedActions((prev) => new Set([...prev, action.id]));
            logger.success('Category archived', { category: action.category });
            toast({
              title: 'Archived!',
              description: `${action.count} emails have been archived.`,
            });
          }
          break;

        default:
          logger.warn('Unknown action type', { type: action.type });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      logger.error('Quick action failed', {
        actionId: action.id,
        type: action.type,
        error: message,
      });
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
