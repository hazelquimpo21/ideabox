/**
 * Interests Step Component
 *
 * Step 6 of 7 in the user context onboarding wizard.
 * Collects user's topics of interest.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Interests help the AI:
 * - Prioritize newsletters and content related to user's interests
 * - Apply relevant labels like 'educational', 'industry_news'
 * - Surface relevant learning opportunities
 * - Filter noise from unrelated topics
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERACTION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Users click to select interests from a predefined list
 * - Can also add custom interests via text input
 * - Multiple selections allowed (no strict limit)
 *
 * @module components/onboarding/InterestsStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Input, Badge } from '@/components/ui';
import { Lightbulb, Plus, X, Check } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('InterestsStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the InterestsStep component.
 */
export interface InterestsStepProps {
  /** Currently selected interests */
  interests: string[];
  /** Callback when interests change */
  onDataChange: (data: { interests: string[] }) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
}

/**
 * Interest category with predefined options.
 */
interface InterestCategory {
  name: string;
  options: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of interests allowed.
 */
const MAX_INTERESTS = 20;

/**
 * Predefined interest categories with options.
 */
const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    name: 'Technology',
    options: ['AI/ML', 'Web Development', 'Mobile Development', 'DevOps', 'Cloud Computing', 'Cybersecurity', 'Data Science'],
  },
  {
    name: 'Business',
    options: ['Startups', 'Marketing', 'Sales', 'Finance', 'Leadership', 'Product Management', 'Entrepreneurship'],
  },
  {
    name: 'Creative',
    options: ['Design', 'UX/UI', 'Photography', 'Writing', 'Video Production', 'Podcasting'],
  },
  {
    name: 'Personal',
    options: ['Local Events', 'Networking', 'Career Growth', 'Productivity', 'Health & Wellness', 'Personal Finance'],
  },
  {
    name: 'Industry',
    options: ['Tech News', 'Open Source', 'SaaS', 'E-commerce', 'Real Estate', 'Healthcare Tech'],
  },
];

/**
 * Flatten all predefined interests for easy lookup.
 */
const ALL_PREDEFINED_INTERESTS = INTEREST_CATEGORIES.flatMap((cat) => cat.options);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InterestsStep - Collects user's topics of interest.
 *
 * @example
 * ```tsx
 * <InterestsStep
 *   interests={data.interests}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={false}
 * />
 * ```
 */
export function InterestsStep({
  interests,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: InterestsStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const [customInput, setCustomInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Separate custom interests from predefined ones for display
  const customInterests = interests.filter((i) => !ALL_PREDEFINED_INTERESTS.includes(i));

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggles a predefined interest on/off.
   */
  const handleToggleInterest = React.useCallback(
    (interest: string) => {
      const isSelected = interests.includes(interest);

      if (isSelected) {
        // Remove
        const newInterests = interests.filter((i) => i !== interest);
        logger.debug('Interest removed', { interest, remaining: newInterests.length });
        onDataChange({ interests: newInterests });
      } else {
        // Add (check max)
        if (interests.length >= MAX_INTERESTS) {
          logger.debug('Max interests reached', { interest });
          setError(`Maximum ${MAX_INTERESTS} interests allowed`);
          return;
        }
        const newInterests = [...interests, interest];
        logger.debug('Interest added', { interest, total: newInterests.length });
        onDataChange({ interests: newInterests });
      }

      // Clear any error
      setError(null);
    },
    [interests, onDataChange]
  );

  /**
   * Adds a custom interest from the text input.
   */
  const handleAddCustom = React.useCallback(() => {
    const trimmed = customInput.trim();
    setError(null);

    if (!trimmed) {
      return;
    }

    if (trimmed.length > 100) {
      setError('Interest must be 100 characters or less');
      return;
    }

    if (interests.length >= MAX_INTERESTS) {
      setError(`Maximum ${MAX_INTERESTS} interests allowed`);
      return;
    }

    // Check for duplicates (case-insensitive)
    const normalizedNew = trimmed.toLowerCase();
    const isDuplicate = interests.some((i) => i.toLowerCase() === normalizedNew);
    if (isDuplicate) {
      setError('This interest is already in your list');
      return;
    }

    const newInterests = [...interests, trimmed];
    logger.debug('Custom interest added', { interest: trimmed, total: newInterests.length });
    onDataChange({ interests: newInterests });
    setCustomInput('');
  }, [customInput, interests, onDataChange]);

  /**
   * Handles Enter key in custom input.
   */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCustom();
      }
    },
    [handleAddCustom]
  );

  /**
   * Removes a custom interest.
   */
  const handleRemoveCustom = React.useCallback(
    (interest: string) => {
      const newInterests = interests.filter((i) => i !== interest);
      logger.debug('Custom interest removed', { interest });
      onDataChange({ interests: newInterests });
    },
    [interests, onDataChange]
  );

  /**
   * Handles continue button click.
   */
  const handleContinue = React.useCallback(() => {
    logger.info('InterestsStep completed', { interestCount: interests.length });
    onNext();
  }, [interests.length, onNext]);

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
          <Lightbulb className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">What interests you?</h2>
        <p className="text-muted-foreground">
          Select topics to help us surface relevant content.
          <br />
          <span className="text-sm">This step is optional.</span>
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Interest Categories
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {INTEREST_CATEGORIES.map((category) => (
          <div key={category.name} className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{category.name}</p>
            <div className="flex flex-wrap gap-2">
              {category.options.map((option) => {
                const isSelected = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleToggleInterest(option)}
                    className={`
                      px-3 py-1.5 rounded-full text-sm transition-all flex items-center gap-1
                      ${isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-foreground'}
                    `}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Custom Interest Input
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Add your own</p>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="e.g., Blockchain, Architecture, Gaming"
            value={customInput}
            onChange={(e) => {
              setCustomInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            maxLength={100}
            className={error ? 'border-destructive' : ''}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Custom Interests List
          ───────────────────────────────────────────────────────────────────────── */}
      {customInterests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Your custom interests</p>
          <div className="flex flex-wrap gap-2">
            {customInterests.map((interest) => (
              <Badge
                key={interest}
                variant="secondary"
                className="text-sm py-1 px-3 flex items-center gap-2"
              >
                {interest}
                <button
                  type="button"
                  onClick={() => handleRemoveCustom(interest)}
                  className="hover:text-destructive transition-colors"
                  aria-label={`Remove ${interest}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Selected Count
          ───────────────────────────────────────────────────────────────────────── */}
      <p className="text-sm text-center text-muted-foreground">
        {interests.length} of {MAX_INTERESTS} interests selected
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
        <div className="flex gap-2">
          {interests.length === 0 && (
            <Button variant="ghost" onClick={handleContinue}>
              Skip
            </Button>
          )}
          <Button onClick={handleContinue}>
            {isLastStep ? 'Finish' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default InterestsStep;
