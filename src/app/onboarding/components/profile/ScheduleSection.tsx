/**
 * Schedule Section — Work Hours, Priorities, VIP Contacts
 *
 * Refactored from the old Mad Libs profile step. Preserves the same
 * data collection (priorities, work hours, VIP emails) but in a form
 * layout instead of a fill-in-the-blank card.
 *
 * AI suggestions are used to pre-fill priorities and work hours.
 *
 * @module app/onboarding/components/profile/ScheduleSection
 */

'use client';

import * as React from 'react';
import {
  Button,
  Input,
  Label,
  Badge,
} from '@/components/ui';
import { Plus, X, Sparkles } from 'lucide-react';
import type { ProfileSuggestions } from '@/types/database';
import type { ProfileData } from '../ProfileStep';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ScheduleSectionProps {
  suggestions: ProfileSuggestions | null;
  existingContext: Record<string, unknown> | null;
}

const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ScheduleSection = React.forwardRef<
  { getData: () => Partial<ProfileData> },
  ScheduleSectionProps
>(function ScheduleSection({ suggestions, existingContext }, ref) {
  const [priorities, setPriorities] = React.useState<string[]>([]);
  const [priorityInput, setPriorityInput] = React.useState('');
  const [workStart, setWorkStart] = React.useState('09:00');
  const [workEnd, setWorkEnd] = React.useState('17:00');
  const [workDays, setWorkDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [vipEmails, setVipEmails] = React.useState<string[]>([]);
  const [vipInput, setVipInput] = React.useState('');
  const [vipError, setVipError] = React.useState<string | null>(null);

  // Initialize from existing context or AI suggestions
  React.useEffect(() => {
    const ctx = existingContext as Record<string, unknown> | null;

    // Priorities
    if (ctx?.priorities && (ctx.priorities as string[]).length > 0) {
      setPriorities(ctx.priorities as string[]);
    } else if (suggestions?.priorities && suggestions.priorities.length > 0) {
      setPriorities(
        suggestions.priorities
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 4)
          .map((p) => p.label)
      );
    }

    // Work hours
    if (ctx?.work_hours_start) {
      setWorkStart(ctx.work_hours_start as string);
    } else if (suggestions?.workHours?.start) {
      setWorkStart(suggestions.workHours.start);
    }

    if (ctx?.work_hours_end) {
      setWorkEnd(ctx.work_hours_end as string);
    } else if (suggestions?.workHours?.end) {
      setWorkEnd(suggestions.workHours.end);
    }

    if (ctx?.work_days && (ctx.work_days as number[]).length > 0) {
      setWorkDays(ctx.work_days as number[]);
    } else if (suggestions?.workHours?.days && suggestions.workHours.days.length > 0) {
      setWorkDays(suggestions.workHours.days);
    }

    // VIP emails
    if (ctx?.vip_emails && (ctx.vip_emails as string[]).length > 0) {
      setVipEmails(ctx.vip_emails as string[]);
    }
  }, [existingContext, suggestions]);

  // Expose data collector
  React.useImperativeHandle(ref, () => ({
    getData: (): Partial<ProfileData> => ({
      priorities: priorities.filter(Boolean),
      work_hours_start: workStart,
      work_hours_end: workEnd,
      work_days: workDays,
      vip_emails: vipEmails,
    }),
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Priority handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addPriority = () => {
    const trimmed = priorityInput.trim();
    if (!trimmed || priorities.includes(trimmed)) return;
    setPriorities((prev) => [...prev, trimmed]);
    setPriorityInput('');
  };

  const removePriority = (value: string) => {
    setPriorities((prev) => prev.filter((p) => p !== value));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // VIP handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const addVip = () => {
    const trimmed = vipInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      setVipError('Enter a valid email address');
      return;
    }
    if (vipEmails.includes(trimmed)) {
      setVipError('Already added');
      return;
    }
    setVipEmails((prev) => [...prev, trimmed]);
    setVipInput('');
    setVipError(null);
  };

  const removeVip = (email: string) => {
    setVipEmails((prev) => prev.filter((e) => e !== email));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Day toggle
  // ─────────────────────────────────────────────────────────────────────────────

  const toggleDay = (day: number) => {
    setWorkDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your work schedule and priorities help IdeaBox determine urgency and
        surface what matters most.
      </p>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* WORK SCHEDULE */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3">
        <Label className="text-base font-medium">Work Schedule</Label>

        {/* Days */}
        <div className="space-y-1">
          <Label className="text-xs">Work Days</Label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const isSelected = workDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`
                    px-2.5 py-1.5 text-xs rounded border transition-all
                    ${isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-dashed border-border text-muted-foreground hover:bg-accent'
                    }
                  `}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Start Time</Label>
            <Input
              type="time"
              value={workStart}
              onChange={(e) => setWorkStart(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Time</Label>
            <Input
              type="time"
              value={workEnd}
              onChange={(e) => setWorkEnd(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PRIORITIES */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3 pt-2 border-t border-border/30">
        <div className="flex items-center gap-2">
          <Label className="text-base font-medium">Priorities</Label>
          {suggestions?.priorities && suggestions.priorities.length > 0 && priorities.length > 0 && (
            <span title="AI-suggested from your email patterns">
              <Sparkles className="h-3.5 w-3.5 text-primary/60" />
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          What are you focused on right now? (e.g. &ldquo;Landing new clients&rdquo;, &ldquo;Kids&apos; school stuff&rdquo;)
        </p>

        <div className="flex flex-wrap gap-1.5">
          {priorities.map((p) => (
            <Badge key={p} variant="secondary" className="gap-1 py-1 px-2.5 text-sm font-normal">
              {p}
              <button
                onClick={() => removePriority(p)}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${p}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={priorityInput}
            onChange={(e) => setPriorityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPriority();
              }
            }}
            placeholder="Add a priority..."
            className="h-8 text-sm flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addPriority}
            disabled={!priorityInput.trim()}
            className="h-8"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* VIP CONTACTS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-3 pt-2 border-t border-border/30">
        <Label className="text-base font-medium">VIP Contacts</Label>
        <p className="text-xs text-muted-foreground">
          People you always want to hear from — their emails get boosted priority.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {vipEmails.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1 py-1 px-2.5 text-sm font-normal">
              {email}
              <button
                onClick={() => removeVip(email)}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              value={vipInput}
              onChange={(e) => {
                setVipInput(e.target.value);
                if (vipError) setVipError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addVip();
                }
              }}
              placeholder="Add VIP email..."
              className={`h-8 text-sm flex-1 ${vipError ? 'border-destructive' : ''}`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addVip}
              disabled={!vipInput.trim()}
              className="h-8"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {vipError && (
            <p className="text-xs text-destructive">{vipError}</p>
          )}
        </div>
      </div>
    </div>
  );
});

export default ScheduleSection;
