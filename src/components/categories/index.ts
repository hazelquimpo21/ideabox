/**
 * Category View Components Barrel Export
 *
 * Components for the Kanban-style category cards view.
 * Includes enhanced UI components for surfacing AI-analyzed email data.
 *
 * @module components/categories
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { EmailCard, type EmailCardProps } from './EmailCard';
export { CategoryColumn, type CategoryColumnProps } from './CategoryColumn';

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { UrgencyIndicator, type UrgencyIndicatorProps } from './UrgencyIndicator';
export { RelationshipHealth, aggregateSignals, type RelationshipHealthProps } from './RelationshipHealth';
export { EmailKeyPoints, type EmailKeyPointsProps } from './EmailKeyPoints';
export { EmailActions, extractActionsFromAnalysis, type EmailActionsProps, type EmailAction } from './EmailActions';
