/**
 * Email Components Module
 *
 * Re-exports all email-related components for convenient importing.
 *
 * @module components/email
 * @version 1.0.0
 *
 * @example
 * ```tsx
 * import { EmailDetail } from '@/components/email';
 *
 * function EmailView({ email }) {
 *   return <EmailDetail email={email} onClose={handleClose} />;
 * }
 * ```
 */

export { EmailDetail, default as EmailDetailDefault } from './EmailDetail';
export type { EmailDetailProps } from './EmailDetail';

export { EventDetailsCard, default as EventDetailsCardDefault } from './EventDetailsCard';
export type { EventDetailsCardProps } from './EventDetailsCard';

export { EventPreview, default as EventPreviewDefault } from './EventPreview';
export type { EventPreviewProps } from './EventPreview';

export { SyncStatusBanner, default as SyncStatusBannerDefault } from './SyncStatusBanner';
export type { SyncStatusBannerProps, SyncStatus, SyncStatusInfo } from './SyncStatusBanner';

export { InboxFilterBar, default as InboxFilterBarDefault } from './InboxFilterBar';
export type {
  InboxFilterBarProps,
  QuickActionStats,
  CategoryStats,
} from './InboxFilterBar';
