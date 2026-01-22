/**
 * EmailActions Component
 *
 * Displays action buttons for all detected actions from email analysis.
 * Unlike the simple quick_action badge, this shows ALL actions extracted
 * from the email, making it easier for users to take action directly.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Shows all detected actions (not just primary)
 * - Action-type specific icons and colors
 * - Click to complete action
 * - Overflow handling (+N more)
 * - Accessible with keyboard navigation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage with actions array
 * <EmailActions
 *   actions={[
 *     { type: 'respond', title: 'Reply to Sarah' },
 *     { type: 'review', title: 'Review proposal' }
 *   ]}
 *   onActionClick={(action) => handleAction(action)}
 * />
 *
 * // Compact mode for email cards
 * <EmailActions actions={actions} compact maxVisible={2} />
 * ```
 *
 * @module components/categories/EmailActions
 */

'use client';

import * as React from 'react';
import {
  Reply,
  FileText,
  Calendar,
  Clock,
  Plus,
  HelpCircle,
  CheckCircle2,
  MoreHorizontal,
  Bookmark,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActionType } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailActions');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailAction {
  /** Type of action */
  type: ActionType | string;
  /** Title/description of the action */
  title: string;
  /** Optional deadline for the action */
  deadline?: string;
  /** Priority level (1 = highest) */
  priority?: number;
  /** Whether this action has been completed */
  isCompleted?: boolean;
  /** Action ID for tracking */
  id?: string;
}

export interface EmailActionsProps {
  /** Array of detected actions */
  actions: EmailAction[];
  /** Maximum number of action buttons to show (default: 3) */
  maxVisible?: number;
  /** Compact mode - smaller buttons */
  compact?: boolean;
  /** Show as badges instead of buttons */
  asBadges?: boolean;
  /** Callback when an action button is clicked */
  onActionClick?: (action: EmailAction) => void;
  /** Callback when an action is marked complete */
  onActionComplete?: (action: EmailAction) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Action type configuration
 */
interface ActionConfig {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  hoverColor: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action type configurations with icons and styling
 */
const ACTION_CONFIG: Record<string, ActionConfig> = {
  respond: {
    icon: Reply,
    label: 'Reply',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    hoverColor: 'hover:bg-blue-200 dark:hover:bg-blue-900/50',
  },
  review: {
    icon: FileText,
    label: 'Review',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    hoverColor: 'hover:bg-purple-200 dark:hover:bg-purple-900/50',
  },
  create: {
    icon: Plus,
    label: 'Create',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    hoverColor: 'hover:bg-green-200 dark:hover:bg-green-900/50',
  },
  schedule: {
    icon: Calendar,
    label: 'Schedule',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    hoverColor: 'hover:bg-indigo-200 dark:hover:bg-indigo-900/50',
  },
  decide: {
    icon: HelpCircle,
    label: 'Decide',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    hoverColor: 'hover:bg-amber-200 dark:hover:bg-amber-900/50',
  },
  follow_up: {
    icon: Clock,
    label: 'Follow up',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    hoverColor: 'hover:bg-orange-200 dark:hover:bg-orange-900/50',
  },
  save: {
    icon: Bookmark,
    label: 'Save',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    hoverColor: 'hover:bg-teal-200 dark:hover:bg-teal-900/50',
  },
  archive: {
    icon: Archive,
    label: 'Archive',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    hoverColor: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  none: {
    icon: CheckCircle2,
    label: 'Done',
    color: 'text-gray-500 dark:text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    hoverColor: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  },
};

/**
 * Get action configuration, with fallback for unknown types
 */
function getActionConfig(type: string): ActionConfig {
  return ACTION_CONFIG[type] || {
    icon: MoreHorizontal,
    label: type,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    hoverColor: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays action buttons for email actions.
 *
 * @example
 * ```tsx
 * // In an email card
 * <EmailActions
 *   actions={[
 *     { type: 'respond', title: 'Reply to client' },
 *     { type: 'review', title: 'Review attachment' },
 *   ]}
 *   onActionClick={(action) => setSelectedAction(action)}
 * />
 * ```
 */
export function EmailActions({
  actions,
  maxVisible = 3,
  compact = false,
  asBadges = false,
  onActionClick,
  onActionComplete,
  className,
}: EmailActionsProps) {
  // ───────────────────────────────────────────────────────────────────────────
  // Filter and sort actions
  // ───────────────────────────────────────────────────────────────────────────

  const validActions = React.useMemo(() => {
    // Filter out 'none' type and completed actions
    const filtered = actions.filter(
      (a) => a.type !== 'none' && !a.isCompleted
    );
    // Sort by priority (lower number = higher priority)
    return filtered.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }, [actions]);

  // ───────────────────────────────────────────────────────────────────────────
  // Debug logging
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (validActions.length > 0) {
      logger.debug('Rendering email actions', {
        totalActions: actions.length,
        validActions: validActions.length,
        maxVisible,
      });
    }
  }, [actions.length, validActions.length, maxVisible]);

  // ───────────────────────────────────────────────────────────────────────────
  // Early return if no actions
  // ───────────────────────────────────────────────────────────────────────────

  if (validActions.length === 0) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Calculate visibility
  // ───────────────────────────────────────────────────────────────────────────

  const visibleActions = validActions.slice(0, maxVisible);
  const overflowCount = validActions.length - maxVisible;

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleActionClick = (action: EmailAction, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    logger.info('Action clicked', { type: action.type, title: action.title });
    onActionClick?.(action);
  };

  const handleComplete = (action: EmailAction, e: React.MouseEvent) => {
    e.stopPropagation();
    logger.info('Action completed', { type: action.type, title: action.title });
    onActionComplete?.(action);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Badges variant
  // ───────────────────────────────────────────────────────────────────────────

  if (asBadges) {
    return (
      <div
        className={cn('flex items-center gap-1 flex-wrap', className)}
        role="list"
        aria-label="Email actions"
      >
        {visibleActions.map((action, index) => {
          const config = getActionConfig(action.type);
          const Icon = config.icon;

          return (
            <Badge
              key={`action-${index}-${action.type}`}
              variant="secondary"
              className={cn(
                'gap-1 cursor-pointer transition-colors',
                config.bgColor,
                config.color,
                config.hoverColor,
                compact && 'text-[10px] px-1.5 py-0'
              )}
              onClick={(e) => handleActionClick(action, e)}
              role="listitem"
              title={action.title}
            >
              <Icon className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
              <span className="truncate max-w-[80px]">
                {action.title.length > 15
                  ? `${action.title.substring(0, 15)}...`
                  : action.title}
              </span>
            </Badge>
          );
        })}

        {overflowCount > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              'cursor-pointer text-muted-foreground',
              compact && 'text-[10px] px-1.5 py-0'
            )}
            title={`${overflowCount} more action${overflowCount > 1 ? 's' : ''}`}
          >
            +{overflowCount}
          </Badge>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Buttons variant (default)
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('flex items-center gap-1.5 flex-wrap', className)}
      role="list"
      aria-label="Email actions"
    >
      {visibleActions.map((action, index) => {
        const config = getActionConfig(action.type);
        const Icon = config.icon;

        return (
          <Button
            key={`action-${index}-${action.type}`}
            variant="ghost"
            size={compact ? 'sm' : 'default'}
            className={cn(
              'gap-1.5',
              config.color,
              config.bgColor,
              config.hoverColor,
              compact && 'h-7 px-2 text-xs'
            )}
            onClick={(e) => handleActionClick(action, e)}
            role="listitem"
            title={action.title}
          >
            <Icon className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            <span className="truncate max-w-[100px]">
              {compact && action.title.length > 12
                ? `${action.title.substring(0, 12)}...`
                : action.title.length > 20
                  ? `${action.title.substring(0, 20)}...`
                  : action.title}
            </span>
          </Button>
        );
      })}

      {overflowCount > 0 && (
        <Button
          variant="ghost"
          size={compact ? 'sm' : 'default'}
          className={cn(
            'text-muted-foreground',
            compact && 'h-7 px-2 text-xs'
          )}
          title={`${overflowCount} more action${overflowCount > 1 ? 's' : ''}`}
        >
          <MoreHorizontal className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
          <span>+{overflowCount}</span>
        </Button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTION - Extract actions from email analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts actions from action_extraction JSONB column.
 * Use this to prepare data for the EmailActions component.
 *
 * @example
 * ```typescript
 * const analysis = await getEmailAnalysis(emailId);
 * const actions = extractActionsFromAnalysis(analysis.action_extraction);
 * ```
 */
export function extractActionsFromAnalysis(
  actionExtraction: Record<string, unknown> | null | undefined
): EmailAction[] {
  if (!actionExtraction) {
    return [];
  }

  try {
    // Check if there's an actions array (multiple actions)
    if (Array.isArray(actionExtraction.actions)) {
      return (actionExtraction.actions as Array<{
        type?: string;
        title?: string;
        deadline?: string;
        priority?: number;
      }>).map((a, index) => ({
        type: a.type || 'none',
        title: a.title || `Action ${index + 1}`,
        deadline: a.deadline,
        priority: a.priority || index + 1,
      }));
    }

    // Single action format
    if (actionExtraction.has_action && actionExtraction.action_type) {
      return [{
        type: actionExtraction.action_type as string,
        title: (actionExtraction.title as string) || 'Action required',
        deadline: actionExtraction.deadline as string | undefined,
        priority: 1,
      }];
    }

    return [];
  } catch (error) {
    logger.error('Failed to extract actions from analysis', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default EmailActions;
