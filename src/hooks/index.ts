/**
 * 🪝 Hooks Barrel Export
 *
 * Central export for all custom React hooks.
 * Import hooks from this file for cleaner imports:
 *
 * ```tsx
 * import { useEmails, useActions, useClients } from '@/hooks';
 * ```
 *
 * @module hooks
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE TYPES (Re-exported for convenience)
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  Email,
  EmailCategory,
  Action,
  ActionType,
  ActionPriority,
  ActionStatus,
  Client,
  ClientStatus,
  ClientPriority,
  UserSettings,
  CostUsageSummary,
  Project,
  ProjectItem,
  ProjectStatus,
  ProjectPriority,
  ProjectItemType,
  ProjectItemStatus,
  RecurrencePattern,
} from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// DATA HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export { useEmails, default as useEmailsDefault } from './useEmails';
export type {
  UseEmailsOptions,
  UseEmailsReturn,
  EmailStats,
  EventPreviewData,
  // NEW (Jan 2026): Stats types for the interactive filter bar
  QuickActionStats,
  CategoryStats,
} from './useEmails';

export { useActions, default as useActionsDefault } from './useActions';
export type {
  UseActionsOptions,
  UseActionsReturn,
  ActionStats,
} from './useActions';

// useClients removed — clients table archived in migration 030.
// Use useContacts with isClient filter instead.

export { useSyncStatus, default as useSyncStatusDefault } from './useSyncStatus';
export type {
  SyncStatus,
  SyncResult,
  SyncStatusInfo,
  UseSyncStatusReturn,
} from './useSyncStatus';

export { useSettings, default as useSettingsDefault } from './useSettings';
export type {
  UsageData,
  UseSettingsReturn,
} from './useSettings';

export { useEmailAnalysis, default as useEmailAnalysisDefault } from './useEmailAnalysis';
export type {
  UseEmailAnalysisReturn,
  NormalizedAnalysis,
  CategorizationResult,
  ActionExtractionResult,
  ClientTaggingResult,
  EventDetectionResult,
  IdeaSparkResult,
} from './useEmailAnalysis';

export { useSidebarData, default as useSidebarDataDefault } from './useSidebarData';
export type {
  UseSidebarDataReturn,
  CategoryCounts,
  SidebarClient,
  UpcomingEventsSummary,
} from './useSidebarData';

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING & DISCOVERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export { useInitialSyncProgress, default as useInitialSyncProgressDefault } from './useInitialSyncProgress';
export type {
  UseInitialSyncProgressOptions,
  UseInitialSyncProgressReturn,
} from './useInitialSyncProgress';

// ═══════════════════════════════════════════════════════════════════════════════
// HUB HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export { useHubPriorities, default as useHubPrioritiesDefault } from './useHubPriorities';
export type {
  UseHubPrioritiesOptions,
  UseHubPrioritiesReturn,
} from './useHubPriorities';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS & TIMELINE HOOKS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export { useContacts, default as useContactsDefault } from './useContacts';
export type {
  UseContactsOptions,
  UseContactsReturn,
  Contact,
  ContactRelationshipType,
  ContactStats,
} from './useContacts';

export { useExtractedDates, default as useExtractedDatesDefault } from './useExtractedDates';
export type {
  UseExtractedDatesOptions,
  UseExtractedDatesReturn,
  ExtractedDate,
  DateType,
  DateStats,
  GroupedDates,
  RelatedEmail,
  RelatedContact,
} from './useExtractedDates';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS HOOKS (NEW - Jan 2026)
// Specialized hook for event management, wrapping useExtractedDates
// ═══════════════════════════════════════════════════════════════════════════════

export { useEvents, default as useEventsDefault } from './useEvents';
export type {
  UseEventsOptions,
  UseEventsReturn,
  EventData,
  EventMetadata,
  GroupedEvents,
  EventStats,
  EventsSummary,
} from './useEvents';

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT & CONTEXT HOOKS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export { useCategoryPreviews, default as useCategoryPreviewsDefault } from './useCategoryPreviews';
export type {
  CategoryPreview,
  UseCategoryPreviewsReturn,
} from './useCategoryPreviews';

export { useGmailAccounts, default as useGmailAccountsDefault } from './useGmailAccounts';
export type {
  GmailAccountDisplay,
  UseGmailAccountsReturn,
} from './useGmailAccounts';

export { useUserContext, default as useUserContextDefault } from './useUserContext';
export type {
  UserContext,
  UserContextUpdate,
  UseUserContextReturn,
} from './useUserContext';

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL CAMPAIGNS & TEMPLATES HOOKS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export { useCampaigns, default as useCampaignsDefault } from './useCampaigns';
export type {
  UseCampaignsOptions,
  UseCampaignsReturn,
  Campaign,
  CampaignWithStats,
  CampaignStatus,
  CampaignRecipient,
  CampaignStats,
  CampaignPreview,
  CreateCampaignData,
  FollowUpConfig,
} from './useCampaigns';

export { useTemplates, default as useTemplatesDefault } from './useTemplates';
export type {
  UseTemplatesOptions,
  UseTemplatesReturn,
  Template,
  TemplateStats,
  CreateTemplateData,
  UpdateTemplateData,
} from './useTemplates';

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX UI HOOKS (NEW - Feb 2026)
// ═══════════════════════════════════════════════════════════════════════════════

export { useEmailThumbnails, default as useEmailThumbnailsDefault } from './useEmailThumbnails';
export type { UseEmailThumbnailsReturn } from './useEmailThumbnails';

// ═══════════════════════════════════════════════════════════════════════════════
// IDEAS & REVIEW QUEUE HOOKS (NEW - Feb 2026)
// Supports the two-tier task system: Review Queue + Real Tasks
// ═══════════════════════════════════════════════════════════════════════════════

export { useIdeas, default as useIdeasDefault } from './useIdeas';
export type {
  UseIdeasOptions,
  UseIdeasReturn,
  IdeaItem,
  IdeasStats,
} from './useIdeas';

export { useInsights, default as useInsightsDefault } from './useInsights';
export type {
  UseInsightsOptions,
  UseInsightsReturn,
  InsightItem,
  InsightsStats,
} from './useInsights';

export { useLinks, default as useLinksDefault } from './useLinks';
export type {
  UseLinksOptions,
  UseLinksReturn,
  LinkItem,
  LinksStats,
} from './useLinks';

export { useNews, default as useNewsDefault } from './useNews';
export type {
  UseNewsOptions,
  UseNewsReturn,
  NewsItemDisplay,
  NewsStats,
  TopicCount,
} from './useNews';

export { useReviewQueue, default as useReviewQueueDefault } from './useReviewQueue';
export type {
  UseReviewQueueOptions,
  UseReviewQueueReturn,
  ReviewQueueItem,
  ReviewQueueStats,
} from './useReviewQueue';

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SUMMARIES HOOK (NEW - Feb 2026)
// AI-synthesized narrative digest, generated on-demand when stale
// ═══════════════════════════════════════════════════════════════════════════════

export { useSummary, default as useSummaryDefault } from './useSummary';
export type {
  UseSummaryOptions,
  UseSummaryReturn,
} from './useSummary';

export { useSummaryHistory, default as useSummaryHistoryDefault } from './useSummaryHistory';
export type {
  UseSummaryHistoryOptions,
  UseSummaryHistoryReturn,
} from './useSummaryHistory';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTS HOOKS (NEW - Feb 2026)
// Project management with ideas, tasks, and routines
// ═══════════════════════════════════════════════════════════════════════════════

export { useProjects, default as useProjectsDefault } from './useProjects';
export type {
  UseProjectsOptions,
  UseProjectsReturn,
  ProjectStats,
} from './useProjects';

export { useProjectItems, default as useProjectItemsDefault } from './useProjectItems';
export type {
  UseProjectItemsOptions,
  UseProjectItemsReturn,
  ProjectItemStats,
} from './useProjectItems';
