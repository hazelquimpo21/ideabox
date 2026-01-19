/**
 * Work Hours Step Component
 *
 * Step 7 of 7 (final step) in the user context onboarding wizard.
 * Collects user's work schedule (hours and days).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Work schedule helps the AI:
 * - Determine urgency based on user's working hours
 * - Schedule-aware deadline parsing (e.g., "end of day" means different things)
 * - Smart notification timing
 * - Priority adjustments for after-hours emails
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Work hours start: Time the workday begins (HH:MM format)
 * - Work hours end: Time the workday ends (HH:MM format)
 * - Work days: Days of the week the user works (0=Sun, 1=Mon, etc.)
 *
 * @module components/onboarding/WorkHoursStep
 * @version 1.0.0
 * @since January 2026
 */

'use client';

import * as React from 'react';
import { Button, Label } from '@/components/ui';
import { Clock, Calendar, Check } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('WorkHoursStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the WorkHoursStep component.
 */
export interface WorkHoursStepProps {
  /** Work start time (HH:MM) */
  workHoursStart: string;
  /** Work end time (HH:MM) */
  workHoursEnd: string;
  /** Work days (0=Sun, 1=Mon, ..., 6=Sat) */
  workDays: number[];
  /** Callback when work schedule changes */
  onDataChange: (data: {
    workHoursStart: string;
    workHoursEnd: string;
    workDays: number[];
  }) => void;
  /** Callback to proceed to next step / finish */
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
 * Days of the week with their numeric values.
 */
const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', fullLabel: 'Sunday' },
  { value: 1, label: 'Mon', fullLabel: 'Monday' },
  { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, label: 'Thu', fullLabel: 'Thursday' },
  { value: 5, label: 'Fri', fullLabel: 'Friday' },
  { value: 6, label: 'Sat', fullLabel: 'Saturday' },
];

/**
 * Common work hour options for start time.
 */
const START_TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
  '09:00', '09:30', '10:00', '10:30', '11:00',
];

/**
 * Common work hour options for end time.
 */
const END_TIME_OPTIONS = [
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00',
];

/**
 * Quick presets for common work schedules.
 */
const SCHEDULE_PRESETS = [
  {
    name: '9 to 5',
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5],
  },
  {
    name: 'Early bird',
    start: '07:00',
    end: '15:00',
    days: [1, 2, 3, 4, 5],
  },
  {
    name: 'Late starter',
    start: '10:00',
    end: '18:00',
    days: [1, 2, 3, 4, 5],
  },
  {
    name: 'Extended hours',
    start: '08:00',
    end: '20:00',
    days: [1, 2, 3, 4, 5, 6],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats time for display (12-hour format).
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WorkHoursStep - Collects user's work schedule.
 *
 * @example
 * ```tsx
 * <WorkHoursStep
 *   workHoursStart={data.workHoursStart}
 *   workHoursEnd={data.workHoursEnd}
 *   workDays={data.workDays}
 *   onDataChange={(d) => setData(prev => ({ ...prev, ...d }))}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   isFirstStep={false}
 *   isLastStep={true}
 * />
 * ```
 */
export function WorkHoursStep({
  workHoursStart,
  workHoursEnd,
  workDays,
  onDataChange,
  onNext,
  onBack,
  isFirstStep,
  isLastStep,
}: WorkHoursStepProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles start time selection.
   */
  const handleStartChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      logger.debug('Start time changed', { start: value });
      onDataChange({ workHoursStart: value, workHoursEnd, workDays });
    },
    [workHoursEnd, workDays, onDataChange]
  );

  /**
   * Handles end time selection.
   */
  const handleEndChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      logger.debug('End time changed', { end: value });
      onDataChange({ workHoursStart, workHoursEnd: value, workDays });
    },
    [workHoursStart, workDays, onDataChange]
  );

  /**
   * Toggles a day on/off.
   */
  const handleDayToggle = React.useCallback(
    (day: number) => {
      const isSelected = workDays.includes(day);
      let newDays: number[];

      if (isSelected) {
        newDays = workDays.filter((d) => d !== day);
      } else {
        newDays = [...workDays, day].sort((a, b) => a - b);
      }

      logger.debug('Work day toggled', { day, selected: !isSelected, days: newDays });
      onDataChange({ workHoursStart, workHoursEnd, workDays: newDays });
    },
    [workHoursStart, workHoursEnd, workDays, onDataChange]
  );

  /**
   * Applies a schedule preset.
   */
  const handlePresetClick = React.useCallback(
    (preset: typeof SCHEDULE_PRESETS[0]) => {
      logger.debug('Schedule preset applied', { preset: preset.name });
      onDataChange({
        workHoursStart: preset.start,
        workHoursEnd: preset.end,
        workDays: preset.days,
      });
    },
    [onDataChange]
  );

  /**
   * Handles finish button click.
   */
  const handleFinish = React.useCallback(() => {
    logger.info('WorkHoursStep completed (final step)', {
      start: workHoursStart,
      end: workHoursEnd,
      daysCount: workDays.length,
    });
    onNext();
  }, [workHoursStart, workHoursEnd, workDays.length, onNext]);

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
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">When do you work?</h2>
        <p className="text-muted-foreground">
          This helps us understand urgency relative to your schedule.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Quick Presets
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Quick presets</Label>
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_PRESETS.map((preset) => {
            const isActive =
              preset.start === workHoursStart &&
              preset.end === workHoursEnd &&
              JSON.stringify(preset.days) === JSON.stringify(workDays);

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm transition-all border
                  ${isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary/50'}
                `}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Work Hours Selection
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-time" className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Start time
          </Label>
          <select
            id="start-time"
            value={workHoursStart}
            onChange={handleStartChange}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {START_TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="end-time" className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            End time
          </Label>
          <select
            id="end-time"
            value={workHoursEnd}
            onChange={handleEndChange}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {END_TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Work Days Selection
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Work days
        </Label>
        <div className="flex gap-2 justify-center">
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = workDays.includes(day.value);

            return (
              <button
                key={day.value}
                type="button"
                onClick={() => handleDayToggle(day.value)}
                className={`
                  w-12 h-12 rounded-lg text-sm font-medium transition-all
                  flex flex-col items-center justify-center
                  ${isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-foreground'}
                `}
                title={day.fullLabel}
                aria-pressed={isSelected}
              >
                {isSelected && <Check className="h-3 w-3 mb-0.5" />}
                <span>{day.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          Summary
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm">
          <span className="font-medium">{formatTime(workHoursStart)}</span>
          {' to '}
          <span className="font-medium">{formatTime(workHoursEnd)}</span>
          {' on '}
          <span className="font-medium">
            {workDays.length === 0
              ? 'no days'
              : workDays.length === 7
                ? 'all days'
                : DAYS_OF_WEEK.filter((d) => workDays.includes(d.value))
                    .map((d) => d.label)
                    .join(', ')}
          </span>
        </p>
      </div>

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
        <Button onClick={handleFinish} size="lg">
          {isLastStep ? 'Finish Setup' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

export default WorkHoursStep;
