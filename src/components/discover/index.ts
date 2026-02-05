/**
 * Discovery Dashboard Components Barrel Export
 *
 * Components for displaying the Discovery Dashboard after initial sync.
 *
 * @module components/discover
 *
 * @example
 * ```tsx
 * import {
 *   DiscoveryHero,
 *   CategoryCardGrid,
 *   ClientInsights,
 *   QuickActions,
 *   FailureSummary,
 * } from '@/components/discover';
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

export { CategoryCard, default as CategoryCardDefault } from './CategoryCard';
export type { CategoryCardProps } from './CategoryCard';

export { CategoryCardGrid, default as CategoryCardGridDefault } from './CategoryCardGrid';
export type { CategoryCardGridProps } from './CategoryCardGrid';

export { ClientInsights, default as ClientInsightsDefault } from './ClientInsights';
export type { ClientInsightsProps } from './ClientInsights';

export { QuickActions, default as QuickActionsDefault } from './QuickActions';
export type { QuickActionsProps } from './QuickActions';

export { FailureSummary, default as FailureSummaryDefault } from './FailureSummary';
export type { FailureSummaryProps } from './FailureSummary';

export { DiscoveryHero, default as DiscoveryHeroDefault } from './DiscoveryHero';
export type { DiscoveryHeroProps } from './DiscoveryHero';

export { CategoryModal, default as CategoryModalDefault } from './CategoryModal';
export type { CategoryModalProps } from './CategoryModal';

export { ModalBulkActions, default as ModalBulkActionsDefault } from './ModalBulkActions';
export type { ModalBulkActionsProps } from './ModalBulkActions';

export { ModalEmailItem, default as ModalEmailItemDefault } from './ModalEmailItem';
export type { ModalEmailItemProps } from './ModalEmailItem';

export { CategoryPageHeader, default as CategoryPageHeaderDefault } from './CategoryPageHeader';
export type { CategoryPageHeaderProps } from './CategoryPageHeader';

export { CategoryPageToolbar, default as CategoryPageToolbarDefault } from './CategoryPageToolbar';
export type { CategoryPageToolbarProps } from './CategoryPageToolbar';
