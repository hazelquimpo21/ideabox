/**
 * Work Hours Analyzer — Statistical Inference from Email Send Times
 *
 * Analyzes the timestamps of a user's sent emails to infer their typical
 * work schedule (start hour, end hour, and active days of the week).
 *
 * This is a PURE STATISTICAL function — no AI/LLM calls. It works by:
 * 1. Bucketing sent email timestamps by hour-of-day
 * 2. Finding the contiguous block of hours containing 80%+ of emails
 * 3. Determining which days of the week are active (>10% of total emails)
 *
 * EDGE CASES:
 * - If user sends emails 24/7 → confidence is low, defaults to 9-5 Mon-Fri
 * - If sample size is too small (<5 emails) → returns null
 * - If no clear pattern emerges → returns default schedule with low confidence
 *
 * @module services/onboarding/work-hours-analyzer
 */

import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('WorkHoursAnalyzer');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of work hours inference from email send-time patterns.
 */
export interface WorkHoursResult {
  /** Start of typical work day, e.g. "09:00" */
  start: string;
  /** End of typical work day, e.g. "17:00" */
  end: string;
  /** Active work days as ISO day numbers: 1=Mon, 2=Tue, ..., 7=Sun */
  days: number[];
  /** Confidence in the inference (0.0-1.0) */
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimum number of sent emails needed for meaningful analysis */
const MIN_EMAILS_FOR_ANALYSIS = 5;

/** Percentage of emails that should fall within the detected work block */
const WORK_BLOCK_THRESHOLD = 0.8;

/** Minimum percentage of total emails a day must have to count as "active" */
const ACTIVE_DAY_THRESHOLD = 0.10;

/** Default work hours returned when confidence is too low */
const DEFAULT_WORK_HOURS: WorkHoursResult = {
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
  confidence: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Infers typical work hours from a set of sent email timestamps.
 *
 * Algorithm:
 * 1. Count emails per hour-of-day (0-23) in the user's timezone
 * 2. Find the shortest contiguous block of hours containing >= 80% of emails
 *    - Try all possible start hours, wrap around midnight if needed
 *    - Pick the block with the fewest hours (tightest schedule)
 * 3. Count emails per day-of-week (Mon-Sun)
 *    - Days with >10% of total emails are considered "active"
 * 4. Calculate confidence based on sample size and distribution clarity
 *
 * @param sentEmailDates - Array of Date objects for sent emails
 * @param timezone - IANA timezone string (e.g., "America/Chicago"). Defaults to UTC.
 * @returns Work hours result with start, end, days, and confidence
 *
 * @example
 * ```typescript
 * const dates = emails.map(e => new Date(e.date));
 * const workHours = inferWorkHours(dates, 'America/Chicago');
 * // { start: "08:00", end: "18:00", days: [1,2,3,4,5], confidence: 0.85 }
 * ```
 */
export function inferWorkHours(
  sentEmailDates: Date[],
  timezone?: string
): WorkHoursResult | null {
  logger.info('Inferring work hours from sent email timestamps', {
    emailCount: sentEmailDates.length,
    timezone: timezone ?? 'UTC',
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Guard: not enough data
  // ─────────────────────────────────────────────────────────────────────────────
  if (sentEmailDates.length < MIN_EMAILS_FOR_ANALYSIS) {
    logger.info('Not enough sent emails for work hours inference', {
      emailCount: sentEmailDates.length,
      minimumRequired: MIN_EMAILS_FOR_ANALYSIS,
    });
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1: Bucket emails by hour-of-day and day-of-week
  // ─────────────────────────────────────────────────────────────────────────────
  const hourCounts = new Array(24).fill(0) as number[];
  // ISO day-of-week: 1=Mon, 2=Tue, ..., 7=Sun
  const dayCounts = new Array(7).fill(0) as number[];

  for (const date of sentEmailDates) {
    const { hour, dayOfWeek } = getLocalTimeParts(date, timezone);
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    dayCounts[dayOfWeek - 1] = (dayCounts[dayOfWeek - 1] ?? 0) + 1;
  }

  const totalEmails = sentEmailDates.length;

  logger.debug('Email distribution by hour', {
    hourCounts: hourCounts.map((c, h) => `${h}:${c}`).filter(s => !s.endsWith(':0')).join(', '),
  });
  logger.debug('Email distribution by day', {
    dayCounts: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      .map((d, i) => `${d}:${dayCounts[i]}`)
      .join(', '),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: Find the tightest contiguous hour block containing >= 80% of emails
  // ─────────────────────────────────────────────────────────────────────────────
  const targetCount = Math.ceil(totalEmails * WORK_BLOCK_THRESHOLD);
  let bestBlock = { start: 9, length: 8 }; // Default: 9am-5pm (8 hours)
  let bestBlockFound = false;

  // Try every possible start hour and find the minimum-length window
  // that captures >= 80% of emails
  for (let startHour = 0; startHour < 24; startHour++) {
    let accumulated = 0;

    for (let length = 1; length <= 24; length++) {
      const hour = (startHour + length - 1) % 24;
      accumulated += hourCounts[hour] ?? 0;

      if (accumulated >= targetCount) {
        // Found a valid block — check if it's shorter than our best
        if (!bestBlockFound || length < bestBlock.length) {
          bestBlock = { start: startHour, length };
          bestBlockFound = true;
        }
        break;
      }
    }
  }

  const workStart = bestBlock.start;
  const workEnd = (bestBlock.start + bestBlock.length) % 24;

  logger.debug('Detected work hour block', {
    startHour: workStart,
    endHour: workEnd,
    blockLength: bestBlock.length,
    blockFound: bestBlockFound,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 3: Determine active work days (>10% threshold)
  // ─────────────────────────────────────────────────────────────────────────────
  const activeDays: number[] = [];
  for (let i = 0; i < 7; i++) {
    if ((dayCounts[i] ?? 0) / totalEmails >= ACTIVE_DAY_THRESHOLD) {
      activeDays.push(i + 1); // Convert back to 1-indexed ISO day
    }
  }

  // Fallback: if no days meet the threshold (very small sample), default to Mon-Fri
  if (activeDays.length === 0) {
    activeDays.push(1, 2, 3, 4, 5);
    logger.debug('No days met active threshold, defaulting to Mon-Fri');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 4: Calculate confidence
  // ─────────────────────────────────────────────────────────────────────────────
  const confidence = calculateConfidence(
    totalEmails,
    bestBlock.length,
    bestBlockFound,
    hourCounts
  );

  // If confidence is extremely low, return the default schedule
  if (confidence < 0.1) {
    logger.info('Work hours confidence too low, returning defaults', {
      confidence,
      blockLength: bestBlock.length,
    });
    return { ...DEFAULT_WORK_HOURS, confidence };
  }

  const result: WorkHoursResult = {
    start: formatHour(workStart),
    end: formatHour(workEnd),
    days: activeDays,
    confidence,
  };

  logger.success('Work hours inferred', {
    start: result.start,
    end: result.end,
    days: result.days.join(','),
    confidence: result.confidence,
    emailsAnalyzed: totalEmails,
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the hour (0-23) and ISO day-of-week (1=Mon, 7=Sun) from a Date,
 * optionally converting to a specific timezone.
 *
 * Uses Intl.DateTimeFormat to get locale-aware hour/day without external deps.
 */
function getLocalTimeParts(
  date: Date,
  timezone?: string
): { hour: number; dayOfWeek: number } {
  try {
    if (timezone) {
      // Use Intl to get hour in target timezone
      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      });
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: timezone,
      });

      const hourStr = hourFormatter.format(date);
      // Intl can return "24" for midnight in some locales; normalize to 0
      const hour = parseInt(hourStr, 10) % 24;

      const dayStr = dayFormatter.format(date);
      const dayOfWeek = dayStringToIsoDay(dayStr);

      return { hour, dayOfWeek };
    }
  } catch {
    // Timezone not supported — fall through to UTC
    logger.debug('Timezone not supported, falling back to UTC', { timezone });
  }

  // Fallback: UTC
  const hour = date.getUTCHours();
  const jsDay = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert to ISO: 1=Mon, 7=Sun
  return { hour, dayOfWeek };
}

/**
 * Converts a short day string ("Mon", "Tue", etc.) to ISO day number (1-7).
 */
function dayStringToIsoDay(dayStr: string): number {
  const mapping: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return mapping[dayStr] ?? 1;
}

/**
 * Formats an hour (0-23) as a time string "HH:00".
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

/**
 * Calculates confidence score (0-1) for work hours inference.
 *
 * Factors:
 * - Sample size: More emails → higher confidence (up to 0.3 bonus)
 * - Block tightness: Shorter work block → higher confidence (up to 0.3 bonus)
 * - Distribution clarity: How peaked the distribution is (up to 0.4 bonus)
 *
 * A user who sends 20 emails between 9am-5pm Mon-Fri gets ~0.85 confidence.
 * A user who sends 5 emails scattered across 24 hours gets ~0.15 confidence.
 */
function calculateConfidence(
  totalEmails: number,
  blockLength: number,
  blockFound: boolean,
  hourCounts: number[]
): number {
  // Factor 1: Sample size (0-0.3)
  // 5 emails = 0.05, 10 = 0.15, 20+ = 0.3
  const sampleFactor = Math.min(0.3, (totalEmails / 20) * 0.3);

  // Factor 2: Block tightness (0-0.3)
  // 8 hours = full score, 12 hours = half, 24 hours = zero
  let tightnessFactor = 0;
  if (blockFound) {
    // Tighter blocks (fewer hours) score higher
    tightnessFactor = Math.max(0, 0.3 * (1 - (blockLength - 6) / 18));
  }

  // Factor 3: Distribution peakedness (0-0.4)
  // Use coefficient of variation — high variance in hourly counts = clearer pattern
  const mean = totalEmails / 24;
  if (mean > 0) {
    const variance = hourCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / 24;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // Coefficient of variation
    // CV of 2+ = very peaked (good), CV of 0.5 = flat (bad)
    const peakFactor = Math.min(0.4, (cv / 3) * 0.4);
    return Math.round((sampleFactor + tightnessFactor + peakFactor) * 100) / 100;
  }

  return Math.round((sampleFactor + tightnessFactor) * 100) / 100;
}
