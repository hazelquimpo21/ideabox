/**
 * Home page component exports.
 *
 * @module components/home
 * @since February 2026 — Phase 2 Navigation Redesign
 */

export { DailyBriefingHeader } from './DailyBriefingHeader';
export { TodaySchedule } from './TodaySchedule';
export { PendingTasksList } from './PendingTasksList';
// NEW (Feb 2026): Two-tier system + idea generation + insights + news
export { IdeaSparksCard } from './IdeaSparksCard';
export { DailyReviewCard } from './DailyReviewCard';
export { InsightsCard } from './InsightsCard';
export { NewsBriefCard } from './NewsBriefCard';
// NEW (Feb 2026): Deep URL intelligence from email content
export { SavedLinksCard } from './SavedLinksCard';
// NEW (Feb 2026): AI-synthesized email summary digest
export { EmailSummaryCard } from './EmailSummaryCard';
// NEW (Feb 2026): Active projects widget
export { ActiveProjectsWidget } from './ActiveProjectsWidget';
// NEW (Feb 2026): Email style inspiration card (Phase 2)
export { StyleInspirationCard } from './StyleInspirationCard';

export type { DailyBriefingHeaderProps } from './DailyBriefingHeader';
export type { TodayScheduleProps, ScheduleItem } from './TodaySchedule';
export type { PendingTasksListProps } from './PendingTasksList';
export type { IdeaSparksCardProps } from './IdeaSparksCard';
export type { DailyReviewCardProps } from './DailyReviewCard';
export type { SavedLinksCardProps } from './SavedLinksCard';
export type { EmailSummaryCardProps } from './EmailSummaryCard';
export type { ActiveProjectsWidgetProps } from './ActiveProjectsWidget';
