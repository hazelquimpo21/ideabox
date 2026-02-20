/**
 * Calendar Page — Events, Deadlines, and Dates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAVIGATION REDESIGN — Phase 1 (February 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This page replaces both:
 *   - Events page (/events)
 *   - Timeline page (/timeline)
 *
 * Currently a thin wrapper that renders the existing EventsPage component.
 * Phase 2 will build out the unified CalendarPage with:
 *   - Calendar grid view (from Timeline's CalendarView)
 *   - List view (grouped events from Events + Timeline)
 *   - Type filters (events, deadlines, birthdays, payments, etc.)
 *
 * Route: /calendar
 * Redirects:
 *   /events   → /calendar (configured in next.config.mjs)
 *   /timeline → /calendar (configured in next.config.mjs)
 *
 * Query Parameters (preserved from Events page):
 *   - highlight: Event ID to scroll to and highlight
 *   - showPast:  'true' to include past events
 *   - filter:    'maybe' to show only maybe events
 *
 * @module app/(auth)/calendar/page
 * @since February 2026
 * @see NAVIGATION_REDESIGN_PLAN.md for full context
 */

'use client';

import { createLogger } from '@/lib/utils/logger';
import EventsPage from '@/app/(auth)/events/page';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CalendarPage');

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calendar page — thin wrapper around the existing EventsPage.
 *
 * Phase 1: Renders EventsPage as-is to maintain feature parity.
 *          All query params (highlight, showPast, filter) are passed through
 *          automatically via useSearchParams() in EventsPage.
 *
 * Phase 2: Will replace with unified CalendarPage that merges Events + Timeline
 *          views with calendar grid, list view, and type filtering.
 */
export default function CalendarPage() {
  logger.info('Rendering Calendar page (thin wrapper around EventsPage)');
  return <EventsPage />;
}
