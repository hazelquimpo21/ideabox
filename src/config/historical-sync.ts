/**
 * Historical Sync Configuration
 *
 * Configuration settings for metadata-only historical email sync.
 * This sync populates contact communication history without AI costs.
 *
 * @module config/historical-sync
 * @see docs/HISTORICAL_SYNC_PLAN.md
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HistoricalSyncConfig {
  /** How many months back to sync by default */
  defaultMonthsBack: number;

  /** Maximum months back allowed (prevents excessive syncs) */
  maxMonthsBack: number;

  /** Batch size for Gmail messages.list API (max 500) */
  listBatchSize: number;

  /** Batch size for concurrent Gmail messages.get requests */
  getBatchSize: number;

  /** Max requests per minute (stay well under Gmail limits) */
  requestsPerMinute: number;

  /** Save progress to database every N emails */
  saveProgressEvery: number;

  /** Gmail query to exclude unwanted mail */
  excludeQuery: string;

  /** Labels to exclude from historical sync */
  excludeLabels: string[];

  /** Timeout for entire sync operation (ms) */
  timeoutMs: number;

  /** Delay between batches to avoid rate limits (ms) */
  batchDelayMs: number;
}

export type HistoricalSyncStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface HistoricalSyncProgress {
  status: HistoricalSyncStatus;
  emailsProcessed: number;
  emailsTotal: number | null; // null = unknown/estimating
  contactsUpdated: number;
  oldestEmailDate: string | null;
  currentAccountEmail: string | null;
  pageToken: string | null;
  startedAt: string | null;
  error: string | null;
}

export interface HistoricalSyncResult {
  success: boolean;
  emailsSynced: number;
  contactsUpdated: number;
  oldestEmailDate: string | null;
  durationMs: number;
  error?: string;
}

export interface AccountHistoricalSyncStatus {
  accountId: string;
  accountEmail: string;
  status: HistoricalSyncStatus;
  emailCount: number;
  contactsUpdated: number;
  oldestDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  hasPageToken: boolean;
  error: string | null;
}

// =============================================================================
// MAIN CONFIGURATION
// =============================================================================

/**
 * Default configuration for historical sync.
 * Can be overridden via environment variables or request parameters.
 */
export const HISTORICAL_SYNC_CONFIG: HistoricalSyncConfig = {
  // ─────────────────────────────────────────────────────────────────────────
  // Time Range
  // ─────────────────────────────────────────────────────────────────────────

  /** Default: sync last 12 months of email history */
  defaultMonthsBack: parseInt(
    process.env.HISTORICAL_SYNC_MONTHS_BACK || '12',
    10
  ),

  /** Maximum: 3 years of history */
  maxMonthsBack: 36,

  // ─────────────────────────────────────────────────────────────────────────
  // Batch Sizes
  // ─────────────────────────────────────────────────────────────────────────

  /** Gmail messages.list returns up to 500 IDs per call */
  listBatchSize: 500,

  /** Fetch metadata for 50 emails at a time */
  getBatchSize: 50,

  // ─────────────────────────────────────────────────────────────────────────
  // Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────

  /** Stay well under Gmail's 250 requests/second limit */
  requestsPerMinute: 200,

  /** Delay between batches (ms) */
  batchDelayMs: 300,

  // ─────────────────────────────────────────────────────────────────────────
  // Progress Tracking
  // ─────────────────────────────────────────────────────────────────────────

  /** Save page token and progress to DB every 100 emails */
  saveProgressEvery: 100,

  // ─────────────────────────────────────────────────────────────────────────
  // Filters
  // ─────────────────────────────────────────────────────────────────────────

  /** Exclude spam, trash, drafts */
  excludeQuery: '-in:spam -in:trash -in:draft',

  /** Labels to skip */
  excludeLabels: ['SPAM', 'TRASH', 'DRAFT'],

  // ─────────────────────────────────────────────────────────────────────────
  // Timeouts
  // ─────────────────────────────────────────────────────────────────────────

  /** 30 minutes max for entire sync (can resume if interrupted) */
  timeoutMs: 30 * 60 * 1000,
};

// =============================================================================
// PROGRESS MESSAGES
// =============================================================================

/**
 * Human-readable messages for historical sync progress.
 * Shown in the progress banner during sync.
 */
export const HISTORICAL_SYNC_MESSAGES = {
  starting: 'Preparing to sync contact history...',
  estimating: 'Estimating email count...',
  syncing: (current: number, total: number | null, account: string) =>
    total
      ? `Syncing history from ${account} (${current.toLocaleString()} of ~${total.toLocaleString()} emails)`
      : `Syncing history from ${account} (${current.toLocaleString()} emails)`,
  processingBatch: (current: number) =>
    `Processing emails (${current.toLocaleString()} synced)...`,
  updatingContacts: 'Updating contact statistics...',
  completing: 'Finishing up...',
  completed: (emails: number, contacts: number) =>
    `Synced ${emails.toLocaleString()} emails, updated ${contacts.toLocaleString()} contacts`,
  failed: (error: string) => `Sync failed: ${error}`,
  resuming: 'Resuming previous sync...',
};

// =============================================================================
// USER-FACING OPTIONS
// =============================================================================

/**
 * Options shown to user when starting historical sync.
 */
export const HISTORICAL_SYNC_OPTIONS = {
  monthsBackChoices: [
    { value: 3, label: '3 months', description: 'Quick sync (~500-1,500 emails)' },
    { value: 6, label: '6 months', description: 'Recent history (~1,000-3,000 emails)' },
    {
      value: 12,
      label: '12 months',
      description: 'Full year (recommended, ~2,000-6,000 emails)',
      recommended: true,
    },
    { value: 24, label: '2 years', description: 'Extended history (~4,000-12,000 emails)' },
    { value: 36, label: '3 years', description: 'Maximum history (~6,000-18,000 emails)' },
  ],
};

// =============================================================================
// EXPORTS
// =============================================================================

export default HISTORICAL_SYNC_CONFIG;
