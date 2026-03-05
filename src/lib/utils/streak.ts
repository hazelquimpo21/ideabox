/**
 * Streak calculation utility — counts consecutive active days.
 * Implements §7 "Streak Indicator" from VIEW_REDESIGN_PLAN.md (Phase 4).
 *
 * Counts backward from today, looking for days where the user reviewed
 * at least one email OR completed at least one task.
 *
 * @module lib/utils/streak
 * @since Phase 4 — March 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface StreakResult {
  /** Number of consecutive weekdays with activity */
  currentStreak: number;
  /** Display string, null if streak < 3 */
  display: string | null;
  /** Fire emoji(s) matching streak tier */
  emoji: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns YYYY-MM-DD for a Date. */
function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Checks if a date falls on a weekend (Saturday=6 or Sunday=0).
 * WHY: Weekends don't break the streak but don't count toward it.
 * This keeps the feature friendly for users who don't work weekends.
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the user's current activity streak.
 *
 * @param reviewedDates - YYYY-MM-DD dates where user reviewed emails
 * @param taskCompletedDates - YYYY-MM-DD dates where user completed tasks
 * @returns StreakResult with count, display string, and emoji
 */
export function calculateStreak(
  reviewedDates: string[],
  taskCompletedDates: string[],
): StreakResult {
  // Merge all active dates into a Set for O(1) lookup
  const activeDays = new Set([...reviewedDates, ...taskCompletedDates]);

  let streak = 0;
  const cursor = new Date();
  // Start from today
  cursor.setHours(0, 0, 0, 0);

  // Walk backward day by day, up to 365 days max
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(cursor);

    if (isWeekend(cursor)) {
      // Skip weekends — they don't break or count toward the streak
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (activeDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // First weekday gap breaks the streak
      break;
    }
  }

  // Determine display tier
  if (streak < 3) {
    return { currentStreak: streak, display: null, emoji: '' };
  }

  if (streak < 7) {
    return {
      currentStreak: streak,
      display: `${streak}-day streak`,
      emoji: '🔥',
    };
  }

  if (streak < 14) {
    return {
      currentStreak: streak,
      display: `${Math.floor(streak / 7)}-week streak!`,
      emoji: '🔥🔥',
    };
  }

  return {
    currentStreak: streak,
    display: `${streak}-day streak!`,
    emoji: '🔥🔥🔥',
  };
}
