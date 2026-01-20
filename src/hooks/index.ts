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
} from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// DATA HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export { useEmails, default as useEmailsDefault } from './useEmails';
export type {
  UseEmailsOptions,
  UseEmailsReturn,
  EmailStats,
} from './useEmails';

export { useActions, default as useActionsDefault } from './useActions';
export type {
  UseActionsOptions,
  UseActionsReturn,
  ActionStats,
} from './useActions';

export { useClients, default as useClientsDefault } from './useClients';
export type {
  UseClientsOptions,
  UseClientsReturn,
  ClientWithStats,
  ClientStats,
} from './useClients';

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
} from './useEmailAnalysis';

export { useSidebarData, default as useSidebarDataDefault } from './useSidebarData';
export type {
  UseSidebarDataReturn,
  CategoryCounts,
  SidebarClient,
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
// ACCOUNT & CONTEXT HOOKS (NEW - Jan 2026)
// ═══════════════════════════════════════════════════════════════════════════════

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
