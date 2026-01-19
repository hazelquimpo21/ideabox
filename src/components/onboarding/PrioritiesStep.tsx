/**
 * Priorities Step Component
 *
 * Step 2 of 7 in the user context onboarding wizard.
 * Collects user's priorities in order of importance.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Priorities help the AI:
 * - Score email importance based on user's stated priorities
 * - Surface relevant emails in the Hub "Next 3-5 Things" view
 * - Provide better quick action suggestions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERACTION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Users select up to 5 priorities from a predefined list
 * - Selected items appear in a numbered list showing their rank
 * - Order matters: #1 priority influences scoring more than #5
 * - Click selected item again to remove it
 *
 * @module components/onboarding/PrioritiesStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Badge } from '@/components/ui';
import { Target, X, GripVertical } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('PrioritiesStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the PrioritiesStep component.
 */
export interface PrioritiesStepProps {
  /** Currently selected priorities (ordered) */
  priorities: string[];
  /** Callback when priorities change */
  onDataChange: (data: { priorities: string[] }) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of priorities that can be selected.
 */
const MAX_PRIORITIES = 5;

/**
 * Available priority options.
 * These are common focus areas that affect how emails should be prioritized.
 */
const PRIORITY_OPTIONS = [
  { value: 'client_work', label: 'Client Work', emoji: '💼' },
  { value: 'business_development', label: 'Business Development', emoji: '📈' },
  { value: 'team_management', label: 'Team Management', emoji: '👥' },
  { value: 'product_development', label: 'Product Development', emoji: '🛠️' },
  { value: 'learning_growth', label: 'Learning & Growth', emoji: '📚' },
  { value: 'family_personal', label: 'Family & Personal', emoji: '👨‍👩‍👧' },
  { value: 'community', label: 'Community Involvement', emoji: '🤝' },
  { value: 'side_projects', label: 'Side Projects', emoji: '🚀' },
  { value: 'networking', label: 'Networking', emoji: '🔗' },
  { value: 'health_wellness', label: 'Health & Wellness', emoji: '🏃' },
  { value: 'finances', label: 'Finances & Admin', emoji: '💰' },
  { value: 'creative_work', label: 'Creative Work', emoji: '🎨' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PrioritiesStep - Collects user's priorities in order of importance.
 *
 * @example
 * ```tsx
 * <PrioritiesStep
 *   priorities={data.priorities}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={false}
 * />
 * ```
 */
export function PrioritiesStep({
  priorities,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: PrioritiesStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles clicking on a priority option.
   * - If already selected: removes it
   * - If not selected and under max: adds it to the end
   */
  const handlePriorityToggle = React.useCallback(
    (value: string) => {
      const isSelected = priorities.includes(value);

      if (isSelected) {
        // Remove from list
        const newPriorities = priorities.filter((p) => p !== value);
        logger.debug('Priority removed', { value, remaining: newPriorities.length });
        onDataChange({ priorities: newPriorities });
      } else if (priorities.length < MAX_PRIORITIES) {
        // Add to end of list
        const newPriorities = [...priorities, value];
        logger.debug('Priority added', { value, total: newPriorities.length });
        onDataChange({ priorities: newPriorities });
      } else {
        // Already at max
        logger.debug('Max priorities reached, cannot add', { value });
      }
    },
    [priorities, onDataChange]
  );

  /**
   * Handles removing a priority from the selected list.
   */
  const handleRemovePriority = React.useCallback(
    (value: string) => {
      const newPriorities = priorities.filter((p) => p !== value);
      logger.debug('Priority removed via X button', { value });
      onDataChange({ priorities: newPriorities });
    },
    [priorities, onDataChange]
  );

  /**
   * Handles moving a priority up in the list.
   */
  const handleMoveUp = React.useCallback(
    (index: number) => {
      if (index === 0) return; // Already at top

      const newPriorities = [...priorities];
      [newPriorities[index - 1], newPriorities[index]] = [
        newPriorities[index],
        newPriorities[index - 1],
      ];

      logger.debug('Priority moved up', { value: priorities[index], newIndex: index - 1 });
      onDataChange({ priorities: newPriorities });
    },
    [priorities, onDataChange]
  );

  /**
   * Handles moving a priority down in the list.
   */
  const handleMoveDown = React.useCallback(
    (index: number) => {
      if (index === priorities.length - 1) return; // Already at bottom

      const newPriorities = [...priorities];
      [newPriorities[index], newPriorities[index + 1]] = [
        newPriorities[index + 1],
        newPriorities[index],
      ];

      logger.debug('Priority moved down', { value: priorities[index], newIndex: index + 1 });
      onDataChange({ priorities: newPriorities });
    },
    [priorities, onDataChange]
  );

  /**
   * Handles continue button click.
   */
  const handleContinue = React.useCallback(() => {
    logger.info('PrioritiesStep completed', { priorityCount: priorities.length });
    onNext();
  }, [priorities.length, onNext]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get option details by value.
   */
  const getOption = (value: string) =>
    PRIORITY_OPTIONS.find((opt) => opt.value === value);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">What are your priorities?</h2>
        <p className="text-muted-foreground">
          Select up to {MAX_PRIORITIES} in order of importance.
          This helps us prioritize your emails.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Selected Priorities (Ordered List)
          ───────────────────────────────────────────────────────────────────────── */}
      {priorities.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Your priorities (click arrows to reorder):
          </p>
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            {priorities.map((value, index) => {
              const option = getOption(value);
              if (!option) return null;

              return (
                <div
                  key={value}
                  className="flex items-center gap-2 bg-background rounded-md p-2 border"
                >
                  {/* Rank number */}
                  <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center">
                    {index + 1}
                  </Badge>

                  {/* Move buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <GripVertical className="h-3 w-3 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === priorities.length - 1}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <GripVertical className="h-3 w-3 -rotate-90" />
                    </button>
                  </div>

                  {/* Label */}
                  <span className="flex-1 text-sm">
                    {option.emoji} {option.label}
                  </span>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemovePriority(value)}
                    className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${option.label}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Available Options
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          {priorities.length >= MAX_PRIORITIES
            ? 'Maximum priorities selected. Remove one to add another.'
            : `Select ${MAX_PRIORITIES - priorities.length} more:`}
        </p>

        <div className="flex flex-wrap gap-2">
          {PRIORITY_OPTIONS.map((option) => {
            const isSelected = priorities.includes(option.value);
            const isDisabled = !isSelected && priorities.length >= MAX_PRIORITIES;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePriorityToggle(option.value)}
                disabled={isDisabled}
                className={`
                  px-3 py-2 rounded-lg border text-sm transition-all
                  ${isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isDisabled
                      ? 'opacity-40 cursor-not-allowed border-border'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'}
                `}
              >
                {option.emoji} {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Helper Text
          ───────────────────────────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground text-center">
        Don&apos;t worry, you can update these later in Settings.
      </p>

      {/* ─────────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-4">
        {!isFirstStep ? (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button onClick={handleContinue}>
          {isLastStep ? 'Finish' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

export default PrioritiesStep;
