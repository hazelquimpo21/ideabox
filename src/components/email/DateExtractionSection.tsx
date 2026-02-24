/**
 * DateExtractionSection Component
 *
 * Renders extracted dates, deadlines, and time-sensitive items found in an email.
 * Designed for use inside the EmailDetail analysis card.
 *
 * @module components/email/DateExtractionSection
 * @since February 2026
 */

'use client';

import * as React from 'react';
import { Badge } from '@/components/ui';
import { CalendarDays, Clock, Repeat } from 'lucide-react';
import type { DateExtractionResult } from '@/hooks/useEmailAnalysis';

/**
 * Simplified date item for display — accepts data from either the analysis JSONB
 * or the extracted_dates table (which is where DateExtractor actually persists data).
 */
export interface ExtractedDateItem {
  dateType: string;
  date: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  title: string;
  description?: string;
  relatedEntity?: string;
  isRecurring: boolean;
  recurrencePattern?: string;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATE TYPE STYLING
// ═══════════════════════════════════════════════════════════════════════════════

const DATE_TYPE_STYLES: Record<string, { label: string; color: string }> = {
  deadline: { label: 'Deadline', color: 'text-red-600 bg-red-50' },
  event: { label: 'Event', color: 'text-purple-600 bg-purple-50' },
  appointment: { label: 'Appointment', color: 'text-blue-600 bg-blue-50' },
  payment_due: { label: 'Payment Due', color: 'text-orange-600 bg-orange-50' },
  expiration: { label: 'Expiration', color: 'text-red-600 bg-red-50' },
  follow_up: { label: 'Follow-up', color: 'text-teal-600 bg-teal-50' },
  birthday: { label: 'Birthday', color: 'text-pink-600 bg-pink-50' },
  anniversary: { label: 'Anniversary', color: 'text-pink-600 bg-pink-50' },
  recurring: { label: 'Recurring', color: 'text-indigo-600 bg-indigo-50' },
  reminder: { label: 'Reminder', color: 'text-amber-600 bg-amber-50' },
  other: { label: 'Date', color: 'text-gray-600 bg-gray-50' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDateString(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(time: string): string {
  try {
    const [hours, minutes] = time.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
  } catch {
    return time;
  }
}

function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + 'T00:00:00');
  return date < today;
}

function isDateSoon(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + 'T00:00:00');
  const diffMs = date.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface DateExtractionSectionProps {
  /** From useEmailAnalysis normalization (if date_extraction column exists) */
  extraction?: DateExtractionResult;
  /** From useExtractedDates hook (the actual extracted_dates table rows) */
  dates?: ExtractedDateItem[];
}

export function DateExtractionSection({ extraction, dates: rawDates }: DateExtractionSectionProps) {
  // Merge: prefer rawDates from extracted_dates table, fallback to analysis JSONB
  const items = rawDates && rawDates.length > 0
    ? rawDates
    : extraction?.dates ?? [];

  if (items.length === 0) {
    return null;
  }

  // Sort: upcoming dates first, then past dates
  const sortedDates = [...items].sort((a, b) => {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    return aDate.getTime() - bDate.getTime();
  });

  return (
    <div className="pt-3 border-t">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-medium">Dates &amp; Deadlines</span>
        <span className="text-xs text-muted-foreground">
          ({items.length})
        </span>
      </div>
      <div className="space-y-2 pl-6">
        {sortedDates.map((d, index) => {
          const style = DATE_TYPE_STYLES[d.dateType] || DATE_TYPE_STYLES.other;
          const past = isDateInPast(d.date);
          const soon = !past && isDateSoon(d.date);

          return (
            <div
              key={index}
              className={`flex items-start gap-2 p-2 rounded-md ${past ? 'opacity-60' : ''} ${soon ? 'bg-amber-50/50' : 'hover:bg-muted/50'} transition-colors`}
            >
              <Badge variant="outline" className={`text-[10px] shrink-0 mt-0.5 ${style.color}`}>
                {style.label}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{d.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className={`text-xs ${soon ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                    {formatDateString(d.date)}
                    {d.endDate && d.endDate !== d.date && ` — ${formatDateString(d.endDate)}`}
                  </span>
                  {d.time && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {formatTime(d.time)}
                      {d.endTime && ` — ${formatTime(d.endTime)}`}
                    </span>
                  )}
                  {d.isRecurring && (
                    <span className="text-xs text-indigo-500 flex items-center gap-0.5">
                      <Repeat className="h-3 w-3" />
                      {d.recurrencePattern || 'Recurring'}
                    </span>
                  )}
                  {past && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">Past</span>
                  )}
                  {soon && (
                    <span className="text-[10px] text-amber-600 bg-amber-100 px-1 py-0.5 rounded font-medium">Soon</span>
                  )}
                </div>
                {d.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                )}
                {d.relatedEntity && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Related: {d.relatedEntity}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DateExtractionSection;
