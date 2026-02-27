/**
 * Projects Components Barrel Export
 *
 * Central export for all project management components.
 *
 * @module components/projects
 * @since February 2026
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { ProjectsContent } from './ProjectsContent';
export { AllItemsContent } from './AllItemsContent';

// ═══════════════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { ProjectCard } from './ProjectCard';
export type { ProjectCardProps } from './ProjectCard';

export { ProjectItemRow } from './ProjectItemRow';
export type { ProjectItemRowProps } from './ProjectItemRow';

export { ProjectItemList } from './ProjectItemList';
export type { ProjectItemListProps } from './ProjectItemList';

export { ProjectDateRange } from './ProjectDateRange';
export type { ProjectDateRangeProps } from './ProjectDateRange';

// ═══════════════════════════════════════════════════════════════════════════════
// DIALOGS
// ═══════════════════════════════════════════════════════════════════════════════

export { CreateProjectDialog } from './CreateProjectDialog';
export type { CreateProjectDialogProps } from './CreateProjectDialog';

export { CreateItemDialog } from './CreateItemDialog';
export type { CreateItemDialogProps } from './CreateItemDialog';
