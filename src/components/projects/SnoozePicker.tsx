/**
 * Snooze Duration Picker
 *
 * Dropdown menu for selecting a snooze duration. Replaces the single
 * "snooze 4 hours" button with preset options: 4 hours, tomorrow 9am,
 * next Monday, and 1 week.
 *
 * @module components/projects/SnoozePicker
 * @since March 2026
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { AlarmClock, Clock, Sun, Calendar, CalendarDays } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface SnoozeOption {
  label: string;
  minutes: number;
  icon: typeof Clock;
}

function getSnoozeOptions(): SnoozeOption[] {
  const now = new Date();

  // Tomorrow 9am
  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);
  const minutesUntilTomorrow9am = Math.round((tomorrow9am.getTime() - now.getTime()) / 60000);

  // Next Monday 9am
  const nextMonday = new Date(now);
  const dayOfWeek = nextMonday.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  const minutesUntilNextMonday = Math.round((nextMonday.getTime() - now.getTime()) / 60000);

  return [
    { label: '4 hours', minutes: 240, icon: Clock },
    { label: 'Tomorrow 9am', minutes: minutesUntilTomorrow9am, icon: Sun },
    { label: 'Next Monday', minutes: minutesUntilNextMonday, icon: Calendar },
    { label: '1 week', minutes: 7 * 24 * 60, icon: CalendarDays },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SnoozePickerProps {
  onSnooze: (minutes: number) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SnoozePicker({ onSnooze, className }: SnoozePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const options = React.useMemo(getSnoozeOptions, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        title="Snooze"
      >
        <AlarmClock className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="p-1">
            <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Snooze until
            </p>
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSnooze(option.minutes);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-left"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
