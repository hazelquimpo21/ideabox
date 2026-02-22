/**
 * Home page component exports.
 *
 * @module components/home
 * @since February 2026 — Phase 2 Navigation Redesign
 */

export { DailyBriefingHeader } from './DailyBriefingHeader';
export { TodaySchedule } from './TodaySchedule';
export { PendingTasksList } from './PendingTasksList';
// NEW (Feb 2026): Two-tier system + idea generation
export { IdeaSparksCard } from './IdeaSparksCard';
export { DailyReviewCard } from './DailyReviewCard';

export type { DailyBriefingHeaderProps } from './DailyBriefingHeader';
export type { TodayScheduleProps, ScheduleItem } from './TodaySchedule';
export type { PendingTasksListProps } from './PendingTasksList';
export type { IdeaSparksCardProps } from './IdeaSparksCard';
export type { DailyReviewCardProps } from './DailyReviewCard';
