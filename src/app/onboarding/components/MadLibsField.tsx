/**
 * Mad Libs Field Component
 *
 * A reusable inline-editable "blank" that renders in two modes:
 * - **Display mode**: Shows value as styled underlined text (or pulsing placeholder if empty)
 * - **Edit mode**: Shows an inline input (text, time, days toggle, or chip list)
 *
 * Each field can optionally show an AI indicator (sparkle badge) when the value
 * came from the profile-suggestions endpoint. The indicator disappears once the
 * user edits the field.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * VISUAL BEHAVIOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Underlined text that looks like a fill-in-the-blank
 * - Small "AI" sparkle badge next to AI-suggested values
 * - Click -> transitions to inline input with subtle animation
 * - Enter or blur -> saves and transitions back to display mode
 * - Empty fields show placeholder text with gentle pulse animation
 * - High-confidence AI values (>0.8) appear slightly bolder
 * - Low-confidence values (<0.3) appear with lighter styling
 *
 * @module app/onboarding/components/MadLibsField
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Input, Badge } from '@/components/ui';
import { Sparkles, X, Plus } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('MadLibsField');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MadLibsFieldProps {
  /** Current value of the field */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder shown when value is empty */
  placeholder?: string;
  /** Whether this value came from AI suggestions */
  isAiSuggested?: boolean;
  /** Confidence score from AI (0-1), affects visual weight */
  confidence?: number;
  /** Field type determines the edit UI */
  type?: 'text' | 'time' | 'days' | 'chips';
  /** For chips type: the list of chip items */
  chipValues?: string[];
  /** For chips type: callback to add a chip */
  onChipAdd?: (value: string) => void;
  /** For chips type: callback to remove a chip */
  onChipRemove?: (value: string) => void;
  /** For days type: currently selected day numbers (1=Mon, 7=Sun) */
  selectedDays?: number[];
  /** For days type: callback when days change */
  onDaysChange?: (days: number[]) => void;
  /** Optional className for custom styling */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Day labels: index 0 is unused; 1=Mon through 7=Sun to match Postgres convention */
const DAY_LABELS: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/** Confidence thresholds for visual styling */
const HIGH_CONFIDENCE = 0.8;
const LOW_CONFIDENCE = 0.3;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats an array of day numbers into a human-readable string.
 * e.g., [1,2,3,4,5] -> "Mon-Fri", [1,3,5] -> "Mon, Wed, Fri"
 */
function formatDays(days: number[]): string {
  if (days.length === 0) return '';

  const sorted = [...days].sort((a, b) => a - b);

  // Check for contiguous ranges (Mon-Fri, Mon-Sat, etc.)
  const isContiguous = sorted.every(
    (day, i) => i === 0 || day === sorted[i - 1] + 1
  );

  if (isContiguous && sorted.length >= 3) {
    return `${DAY_LABELS[sorted[0]]}-${DAY_LABELS[sorted[sorted.length - 1]]}`;
  }

  // Non-contiguous: list individually
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

/**
 * Formats a 24h time string (e.g. "09:00") into a display-friendly format (e.g. "9am").
 */
function formatTime(time: string): string {
  if (!time) return '';
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr ?? '0', 10);

  if (isNaN(hour)) return time;

  const period = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  if (minute > 0) {
    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`;
  }
  return `${displayHour}${period}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MadLibsField — An inline-editable "blank" for the Mad Libs profile card.
 *
 * Renders as underlined text in display mode. Clicking transitions to an
 * inline input. Pressing Enter or blurring saves and returns to display mode.
 */
export function MadLibsField({
  value,
  onChange,
  placeholder = 'click to fill in',
  isAiSuggested = false,
  confidence,
  type = 'text',
  chipValues = [],
  onChipAdd,
  onChipRemove,
  selectedDays = [],
  onDaysChange,
  className = '',
}: MadLibsFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);
  const [chipInput, setChipInput] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync editValue when value prop changes externally
  React.useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Select all text for easy replacement
      inputRef.current.select();
    }
  }, [isEditing]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Enter edit mode on click */
  const handleClick = () => {
    // Chips and days have their own inline UI, no need for a separate edit mode
    if (type === 'chips' || type === 'days') return;
    logger.debug('MadLibsField: entering edit mode', { type, value });
    setIsEditing(true);
  };

  /** Save value and exit edit mode */
  const handleSave = () => {
    const trimmed = editValue.trim();
    logger.debug('MadLibsField: saving value', { type, oldValue: value, newValue: trimmed });
    onChange(trimmed);
    setIsEditing(false);
  };

  /** Handle key events in the inline input */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      // Revert to original value
      setEditValue(value);
      setIsEditing(false);
    }
  };

  /** Add a chip value (for the chips type) */
  const handleChipAdd = () => {
    const trimmed = chipInput.trim();
    if (trimmed && onChipAdd) {
      logger.debug('MadLibsField: adding chip', { value: trimmed });
      onChipAdd(trimmed);
      setChipInput('');
    }
  };

  /** Handle Enter key in chip input */
  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChipAdd();
    }
  };

  /** Toggle a day in the days selector */
  const handleDayToggle = (day: number) => {
    if (!onDaysChange) return;
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    logger.debug('MadLibsField: toggling day', { day, newDays });
    onDaysChange(newDays);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed styles based on confidence
  // ─────────────────────────────────────────────────────────────────────────────

  const confidenceStyles = React.useMemo(() => {
    if (!isAiSuggested || confidence === undefined) return '';
    if (confidence >= HIGH_CONFIDENCE) return 'font-semibold';
    if (confidence < LOW_CONFIDENCE) return 'opacity-70';
    return '';
  }, [isAiSuggested, confidence]);

  const isEmpty = !value && chipValues.length === 0 && selectedDays.length === 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Chips type
  // ─────────────────────────────────────────────────────────────────────────────

  if (type === 'chips') {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
        {chipValues.map((chip) => (
          <Badge
            key={chip}
            variant="secondary"
            className="gap-1 py-0.5 px-2 text-sm font-normal"
          >
            {chip}
            {onChipRemove && (
              <button
                onClick={() => {
                  logger.debug('MadLibsField: removing chip', { value: chip });
                  onChipRemove(chip);
                }}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${chip}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {/* Inline add input */}
        <span className="inline-flex items-center gap-1">
          <Input
            ref={inputRef}
            value={chipInput}
            onChange={(e) => setChipInput(e.target.value)}
            onKeyDown={handleChipKeyDown}
            placeholder="add email..."
            className="h-7 w-36 text-sm px-2 border-dashed"
          />
          <button
            onClick={handleChipAdd}
            disabled={!chipInput.trim()}
            className="inline-flex items-center justify-center h-7 w-7 rounded border
                       border-dashed border-border hover:bg-accent
                       disabled:opacity-40 transition-colors"
            aria-label="Add contact"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </span>
        {/* AI indicator for chips (show if any AI-suggested chips present) */}
        {isAiSuggested && chipValues.length > 0 && (
          <span className="inline-flex items-center text-primary/60 ml-1" title="From your VIP contacts">
            <Sparkles className="h-3 w-3" />
          </span>
        )}
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Days type (inline toggle buttons)
  // ─────────────────────────────────────────────────────────────────────────────

  if (type === 'days') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const isSelected = selectedDays.includes(day);
          return (
            <button
              key={day}
              onClick={() => handleDayToggle(day)}
              className={`
                px-1.5 py-0.5 text-xs rounded border transition-all duration-200
                ${isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-dashed border-border text-muted-foreground hover:bg-accent'
                }
              `}
              aria-label={`Toggle ${DAY_LABELS[day]}`}
            >
              {DAY_LABELS[day]}
            </button>
          );
        })}
        {/* AI indicator for days */}
        {isAiSuggested && selectedDays.length > 0 && (
          <span className="inline-flex items-center text-primary/60 ml-1" title="AI-suggested from your email patterns">
            <Sparkles className="h-3 w-3" />
          </span>
        )}
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Edit mode (text and time types)
  // ─────────────────────────────────────────────────────────────────────────────

  if (isEditing) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Input
          ref={inputRef}
          type={type === 'time' ? 'time' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="h-7 text-sm px-2 py-0 w-auto min-w-[80px] max-w-[200px]
                     border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30
                     transition-all duration-200"
          style={{
            // Dynamic width based on content length
            width: `${Math.max(80, Math.min(200, (editValue.length + 2) * 8))}px`,
          }}
          placeholder={placeholder}
        />
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Display mode (text and time types)
  // ─────────────────────────────────────────────────────────────────────────────

  // Format display value
  let displayValue = value;
  if (type === 'time' && value) {
    displayValue = formatTime(value);
  }

  return (
    <span
      onClick={handleClick}
      className={`
        inline-flex items-center gap-1 cursor-pointer group
        transition-all duration-200
        ${className}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={isEmpty ? `Fill in: ${placeholder}` : `Edit: ${displayValue}`}
    >
      {/* The blank value */}
      <span
        className={`
          border-b-2 border-dashed px-1 py-0.5 min-w-[60px] text-center
          transition-all duration-200
          ${isEmpty
            ? 'border-muted-foreground/40 text-muted-foreground/50 animate-pulse'
            : `border-primary/40 text-foreground group-hover:border-primary/70 ${confidenceStyles}`
          }
        `}
      >
        {displayValue || placeholder}
      </span>

      {/* AI sparkle indicator — only shown when AI-suggested and value present */}
      {isAiSuggested && value && (
        <span
          className="inline-flex items-center text-primary/60 opacity-80
                     group-hover:opacity-100 transition-opacity"
          title={`AI-suggested (${Math.round((confidence ?? 0) * 100)}% confident)`}
        >
          <Sparkles className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { formatDays, formatTime };
export default MadLibsField;
