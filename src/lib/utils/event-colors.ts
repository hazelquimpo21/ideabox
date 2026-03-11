/**
 * Event Type Color Utility — consistent color mapping for calendar event types.
 * Implements §2b "Event Type Colors" from VIEW_REDESIGN_PLAN.md.
 *
 * Maps each event type to a color scheme with Tailwind classes for dot, background,
 * text, border, and shape (circle for events, diamond for deadlines/payments).
 *
 * @module lib/utils/event-colors
 */

import {
  Calendar,
  CalendarCheck,
  Clock,
  DollarSign,
  Cake,
  Heart,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Bell,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';

export type EventType =
  | 'event'
  | 'appointment'
  | 'deadline'
  | 'expiration'
  | 'birthday'
  | 'anniversary'
  | 'payment_due'
  | 'follow_up'
  | 'recurring'
  | 'reminder'
  | 'other';

export interface EventTypeConfig {
  /** Base color name, e.g. 'blue-500' */
  color: string;
  /** Background classes for light/dark */
  bg: string;
  /** Text color classes */
  text: string;
  /** Dot/accent background class */
  dot: string;
  /** Border color class */
  border: string;
  /** Shape for the timeline dot indicator */
  shape: 'circle' | 'diamond';
  /** Human-readable label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

/**
 * Color mapping per §2b of VIEW_REDESIGN_PLAN.md.
 * Deadlines, expirations, and payment_due use diamond shapes.
 * All others use circles.
 */
const EVENT_TYPE_MAP: Record<string, EventTypeConfig> = {
  event: {
    color: 'blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
    border: 'border-blue-500',
    shape: 'circle',
    label: 'Event',
    icon: Calendar,
  },
  appointment: {
    color: 'blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
    border: 'border-blue-500',
    shape: 'circle',
    label: 'Appointment',
    icon: Calendar,
  },
  deadline: {
    color: 'red-500',
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    border: 'border-red-500',
    shape: 'diamond',
    label: 'Deadline',
    icon: AlertTriangle,
  },
  expiration: {
    color: 'amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    border: 'border-amber-500',
    shape: 'diamond',
    label: 'Expiration',
    icon: Clock,
  },
  birthday: {
    color: 'pink-500',
    bg: 'bg-pink-50 dark:bg-pink-950/20',
    text: 'text-pink-600 dark:text-pink-400',
    dot: 'bg-pink-500',
    border: 'border-pink-500',
    shape: 'circle',
    label: 'Birthday',
    icon: Cake,
  },
  anniversary: {
    color: 'pink-500',
    bg: 'bg-pink-50 dark:bg-pink-950/20',
    text: 'text-pink-600 dark:text-pink-400',
    dot: 'bg-pink-500',
    border: 'border-pink-500',
    shape: 'circle',
    label: 'Anniversary',
    icon: Heart,
  },
  payment_due: {
    color: 'red-500',
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    border: 'border-red-500',
    shape: 'circle',
    label: 'Payment Due',
    icon: DollarSign,
  },
  follow_up: {
    color: 'amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    border: 'border-amber-500',
    shape: 'circle',
    label: 'Follow-up',
    icon: ArrowRight,
  },
  recurring: {
    color: 'indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-950/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-400',
    border: 'border-indigo-400',
    shape: 'circle',
    label: 'Recurring',
    icon: RefreshCw,
  },
  reminder: {
    color: 'purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    text: 'text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
    border: 'border-purple-500',
    shape: 'circle',
    label: 'Reminder',
    icon: Bell,
  },
  other: {
    color: 'slate-400',
    bg: 'bg-slate-50 dark:bg-slate-950/20',
    text: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-400',
    border: 'border-slate-400',
    shape: 'circle',
    label: 'Other',
    icon: CalendarClock,
  },
};

const FALLBACK_CONFIG = EVENT_TYPE_MAP.other!;

/**
 * Returns the color/style configuration for a given event type.
 * Falls back to slate-400 for unknown types.
 */
export function getEventTypeConfig(type: string): EventTypeConfig {
  return EVENT_TYPE_MAP[type] ?? FALLBACK_CONFIG;
}

/** All known type filter options for the calendar filter bar. */
export const TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'event', label: 'Events' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'payment_due', label: 'Payments' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'follow_up', label: 'Follow-ups' },
];

/** Snooze preset durations. */
export const SNOOZE_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

/** Calculate a snooze target date from today. */
export function getSnoozeDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
