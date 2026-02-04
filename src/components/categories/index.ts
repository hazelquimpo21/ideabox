/**
 * Email Display Components Barrel Export
 *
 * Reusable components for displaying email data with AI-analyzed insights.
 * Used by Discover views (modal, category pages, detail pages).
 *
 * @module components/categories
 *
 * @example
 * ```tsx
 * import { EmailCard, UrgencyIndicator, RelationshipHealth } from '@/components/categories';
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

export { EmailCard, type EmailCardProps } from './EmailCard';
export { EmailKeyPoints, type EmailKeyPointsProps } from './EmailKeyPoints';

// ═══════════════════════════════════════════════════════════════════════════════
// AI INSIGHT INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

export { UrgencyIndicator, type UrgencyIndicatorProps } from './UrgencyIndicator';
export { RelationshipHealth, aggregateSignals, type RelationshipHealthProps } from './RelationshipHealth';
