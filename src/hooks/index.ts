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
