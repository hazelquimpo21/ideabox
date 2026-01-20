/**
 * Profile Completion Nudge Component
 *
 * A gentle reminder shown on the Hub page when a user's profile is incomplete.
 * This helps users who skipped the "About You" step during onboarding
 * to provide context that improves AI prioritization.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * VISIBILITY RULES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Only shown when profile completion < 50%
 * - Shows progress bar and list of missing sections
 * - Links to Settings → About Me tab
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Users who skip onboarding still get value from IdeaBox, but AI prioritization
 * works better with context (VIPs, priorities, work schedule, etc.). This nudge
 * encourages completion without being intrusive.
 *
 * @module components/hub/ProfileCompletionNudge
 * @since January 2026
 */

'use client';

import Link from 'next/link';
import { Card, CardContent, Button } from '@/components/ui';
import { User, ChevronRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProfileCompletionNudgeProps {
  /** Current completion percentage (0-100) */
  completionPercent: number;
  /** List of sections that need to be filled */
  incompleteSections: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Displays a friendly nudge to complete profile when below 50% complete.
 * Returns null if profile is 50% or more complete.
 */
export function ProfileCompletionNudge({
  completionPercent,
  incompleteSections,
}: ProfileCompletionNudgeProps) {
  // Only show if profile is less than 50% complete
  if (completionPercent >= 50) return null;

  return (
    <Card className="mb-6 border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <User className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">
                Complete your profile for better priorities
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Help AI understand your context to prioritize what matters most.
                Your profile is {completionPercent}% complete.
              </p>
              {incompleteSections.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Add: {incompleteSections.slice(0, 3).join(', ')}
                  {incompleteSections.length > 3 && ` +${incompleteSections.length - 3} more`}
                </p>
              )}
            </div>
          </div>
          <Link href="/settings?tab=about">
            <Button size="sm" variant="outline" className="gap-1 shrink-0">
              Complete
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        {/* Progress bar */}
        <div className="mt-3 w-full bg-amber-200/50 dark:bg-amber-900/30 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-amber-500 transition-all"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default ProfileCompletionNudge;
