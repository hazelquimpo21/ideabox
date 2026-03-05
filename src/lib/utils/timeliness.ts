/**
 * Timeliness Color Utility — maps timeliness nature to Tailwind classes.
 * Implements §2a from VIEW_REDESIGN_PLAN.md.
 *
 * The timeliness-driven accent system replaces priority score coloring.
 * Warm colors signal urgency, cool colors signal reference/evergreen.
 *
 * @module lib/utils/timeliness
 */

export type TimelinessNature =
  | 'ephemeral'
  | 'asap'
  | 'today'
  | 'upcoming'
  | 'reference'
  | 'evergreen';

interface TimelinessAccent {
  /** Full border class, e.g. "border-l-amber-500" */
  border: string;
  /** Background tint for light/dark, e.g. "bg-amber-50 dark:bg-amber-950/20" */
  bg: string;
  /** Text color for light/dark, e.g. "text-amber-600 dark:text-amber-400" */
  text: string;
  /** Dot/indicator color, e.g. "bg-amber-500" */
  dot: string;
}

/**
 * Color mapping per timeliness nature.
 * Warm → urgent, cool → calm. See §2a of VIEW_REDESIGN_PLAN.md.
 */
const TIMELINESS_ACCENTS: Record<TimelinessNature, TimelinessAccent> = {
  ephemeral: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  asap: {
    border: 'border-l-red-500',
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  today: {
    border: 'border-l-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    text: 'text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-400',
  },
  upcoming: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  reference: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-950/20',
    text: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
  evergreen: {
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-400',
  },
};

/**
 * Returns Tailwind class bundles for a given timeliness nature.
 *
 * @param nature - The timeliness classification
 * @returns Object with border, bg, text, and dot classes
 */
export function getTimelinessAccent(nature: TimelinessNature): TimelinessAccent {
  return TIMELINESS_ACCENTS[nature];
}

/** Human-readable labels for each timeliness nature. */
const TIMELINESS_LABELS: Record<TimelinessNature, string> = {
  ephemeral: 'Expires soon',
  asap: 'Needs action now',
  today: 'Relevant today',
  upcoming: 'Coming up',
  reference: 'For reference',
  evergreen: 'No time pressure',
};

/**
 * Returns a human-readable label for a timeliness nature.
 *
 * @param nature - The timeliness classification
 * @returns Display label like "Needs action now"
 */
export function getTimelinessLabel(nature: TimelinessNature): string {
  return TIMELINESS_LABELS[nature];
}
