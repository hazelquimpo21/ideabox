/**
 * Triage Empty State
 *
 * Warm, human empty state shown when all triage items have been
 * processed. Includes a time-of-day greeting, encouragement,
 * and a nudge to check the board or take a break.
 *
 * @module components/projects/TriageEmptyState
 * @since March 2026 — Phase 1 Tasks Page Redesign
 * @updated March 2026 — Enhanced with warmth and personality
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Coffee, Sun, Moon, Sunset } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('TriageEmptyState');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getTimeOfDay(): { greeting: string; icon: typeof Sun; suggestion: string } {
  const hour = new Date().getHours();
  if (hour < 12) return {
    greeting: 'Good morning',
    icon: Sun,
    suggestion: 'Great way to start the day.',
  };
  if (hour < 17) return {
    greeting: 'Good afternoon',
    icon: Sunset,
    suggestion: 'Solid progress today.',
  };
  if (hour < 21) return {
    greeting: 'Good evening',
    icon: Moon,
    suggestion: 'Wrapping up nicely.',
  };
  return {
    greeting: 'Late night session',
    icon: Coffee,
    suggestion: 'Don\'t forget to rest.',
  };
}

const ENCOURAGING_MESSAGES = [
  'Nothing slipping through the cracks.',
  'Your future self will thank you.',
  'Clean inbox, clear mind.',
  'Everything accounted for.',
  'Zero unprocessed items.',
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function TriageEmptyState() {
  logger.info('Triage zero reached');

  const timeOfDay = React.useMemo(getTimeOfDay, []);
  const TimeIcon = timeOfDay.icon;
  const encouragement = React.useMemo(
    () => ENCOURAGING_MESSAGES[Math.floor(Math.random() * ENCOURAGING_MESSAGES.length)],
    []
  );

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Celebration icon with soft glow */}
      <div className="relative mb-6">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/20 shadow-sm">
          <Sparkles className="h-9 w-9 text-green-600 dark:text-green-400" />
        </div>
        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Greeting */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
        <TimeIcon className="h-4 w-4" />
        <span>{timeOfDay.greeting}</span>
      </div>

      <h3 className="text-xl font-semibold mb-1.5">You&apos;re all caught up</h3>
      <p className="text-sm text-muted-foreground mb-1 max-w-xs">
        {encouragement}
      </p>
      <p className="text-xs text-muted-foreground/60 mb-8">
        {timeOfDay.suggestion}
      </p>

      <Link
        href="/tasks?tab=board"
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        See your board
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
