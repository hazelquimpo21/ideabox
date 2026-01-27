/**
 * Email Campaigns Hook
 *
 * React hook for fetching, creating, and managing email campaigns.
 * Provides CRUD operations and campaign actions (start/pause/cancel).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Fetches campaigns with status filtering
 * - Provides progress tracking and stats
 * - Supports campaign lifecycle management (start/pause/cancel)
 * - Auto-refreshes when campaigns are modified
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * ```tsx
 * // Basic usage
 * const { campaigns, isLoading, createCampaign, startCampaign } = useCampaigns();
 *
 * // With status filter
 * const { campaigns } = useCampaigns({ status: 'in_progress' });
 * ```
 *
 * @module hooks/useCampaigns
 */

'use client';

import * as React from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Default number of campaigns to fetch */
const DEFAULT_LIMIT = 50;

/** Logger instance for this hook */
const logger = createLogger('useCampaigns');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid campaign statuses.
 */
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

/**
 * Campaign recipient data.
 */
export interface CampaignRecipient {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  [key: string]: string | undefined;
}

/**
 * Follow-up configuration.
 */
export interface FollowUpConfig {
  enabled: boolean;
  condition?: 'no_open' | 'no_reply' | 'both';
  delayHours?: number;
  subject?: string;
  bodyHtml?: string;
}

/**
 * Campaign data from the API.
 */
export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  gmail_account_id: string;
  template_id: string | null;
  subject_template: string;
  body_html_template: string;
  body_text_template: string | null;
  recipients: CampaignRecipient[];
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  reply_count: number;
  current_index: number;
  throttle_seconds: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  follow_up_enabled: boolean;
  follow_up_condition: string | null;
  follow_up_delay_hours: number;
  follow_up_subject: string | null;
  follow_up_body_html: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  gmail_accounts?: {
    id: string;
    email: string;
  };
}

/**
 * Campaign with computed stats.
 */
export interface CampaignWithStats extends Campaign {
  progressPercent: number;
  openRate: number;
  replyRate: number;
  remaining: number;
}

/**
 * Campaign statistics for dashboard.
 */
export interface CampaignStats {
  total: number;
  draft: number;
  inProgress: number;
  completed: number;
  paused: number;
}

/**
 * Options for filtering campaigns.
 */
export interface UseCampaignsOptions {
  /** Filter by campaign status */
  status?: CampaignStatus | 'all';
  /** Maximum number of campaigns to fetch */
  limit?: number;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
}

/**
 * Create campaign request data.
 */
export interface CreateCampaignData {
  name: string;
  description?: string;
  accountId: string;
  templateId?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate?: string;
  recipients: CampaignRecipient[];
  scheduledAt?: string;
  throttleSeconds?: number;
  followUp?: FollowUpConfig;
}

/**
 * Return value from the useCampaigns hook.
 */
export interface UseCampaignsReturn {
  /** Array of campaign objects */
  campaigns: CampaignWithStats[];
  /** Loading state */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Campaign statistics */
  stats: CampaignStats;
  /** Refetch campaigns */
  refetch: () => Promise<void>;
  /** Create a new campaign */
  createCampaign: (data: CreateCampaignData) => Promise<{ id: string } | null>;
  /** Start a campaign */
  startCampaign: (id: string) => Promise<boolean>;
  /** Pause a campaign */
  pauseCampaign: (id: string) => Promise<boolean>;
  /** Cancel a campaign */
  cancelCampaign: (id: string) => Promise<boolean>;
  /** Delete a campaign */
  deleteCampaign: (id: string) => Promise<boolean>;
  /** Get a single campaign */
  getCampaign: (id: string) => CampaignWithStats | undefined;
  /** Preview campaign email */
  previewCampaign: (id: string, recipientIndex?: number) => Promise<CampaignPreview | null>;
}

/**
 * Campaign preview result.
 */
export interface CampaignPreview {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  mergeFields: {
    detected: string[];
    unresolved: string[];
    provided: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adds computed stats to a campaign.
 */
function addCampaignStats(campaign: Campaign): CampaignWithStats {
  const totalRecipients = campaign.total_recipients || 0;
  const sentCount = campaign.sent_count || 0;
  const failedCount = campaign.failed_count || 0;
  const openCount = campaign.open_count || 0;
  const replyCount = campaign.reply_count || 0;

  return {
    ...campaign,
    progressPercent: totalRecipients > 0
      ? Math.round(((sentCount + failedCount) / totalRecipients) * 100)
      : 0,
    openRate: sentCount > 0
      ? Math.round((openCount / sentCount) * 100)
      : 0,
    replyRate: sentCount > 0
      ? Math.round((replyCount / sentCount) * 100)
      : 0,
    remaining: totalRecipients - sentCount - failedCount,
  };
}

/**
 * Calculates campaign statistics from an array of campaigns.
 */
function calculateStats(campaigns: Campaign[]): CampaignStats {
  return {
    total: campaigns.length,
    draft: campaigns.filter((c) => c.status === 'draft' || c.status === 'scheduled').length,
    inProgress: campaigns.filter((c) => c.status === 'in_progress').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
    paused: campaigns.filter((c) => c.status === 'paused').length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for fetching and managing email campaigns.
 *
 * @param options - Filtering and configuration options
 * @returns Campaign data, loading state, and control functions
 */
export function useCampaigns(options: UseCampaignsOptions = {}): UseCampaignsReturn {
  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  const [campaigns, setCampaigns] = React.useState<CampaignWithStats[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [stats, setStats] = React.useState<CampaignStats>({
    total: 0,
    draft: 0,
    inProgress: 0,
    completed: 0,
    paused: 0,
  });

  // Memoize the Supabase client
  const supabase = React.useMemo(() => createSupabaseClient(), []);

  // Destructure options with defaults
  const {
    status = 'all',
    limit = DEFAULT_LIMIT,
    refreshInterval = 0,
  } = options;

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch Campaigns
  // ───────────────────────────────────────────────────────────────────────────

  const fetchCampaigns = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    logger.start('Fetching campaigns', { status, limit });

    try {
      // Build the query URL
      let url = `/api/campaigns?limit=${limit}`;
      if (status !== 'all') {
        url += `&status=${status}`;
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch campaigns');
      }

      const fetchedCampaigns = (result.data || []).map(addCampaignStats);
      setCampaigns(fetchedCampaigns);
      setStats(calculateStats(result.data || []));

      logger.success('Campaigns fetched', { count: fetchedCampaigns.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch campaigns', { error: errorMessage });
      setError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [status, limit]);

  // ───────────────────────────────────────────────────────────────────────────
  // Create Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const createCampaign = React.useCallback(
    async (data: CreateCampaignData): Promise<{ id: string } | null> => {
      logger.start('Creating campaign', { name: data.name });

      try {
        const response = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to create campaign');
        }

        logger.success('Campaign created', { id: result.data.campaign.id });

        // Refetch to get updated list
        await fetchCampaigns();

        return { id: result.data.campaign.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to create campaign', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return null;
      }
    },
    [fetchCampaigns]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Start Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const startCampaign = React.useCallback(
    async (id: string): Promise<boolean> => {
      logger.start('Starting campaign', { id: id.substring(0, 8) });

      try {
        const response = await fetch(`/api/campaigns/${id}/start`, {
          method: 'POST',
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to start campaign');
        }

        logger.success('Campaign started', { id: id.substring(0, 8) });

        // Optimistic update
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === id ? addCampaignStats({ ...c, status: 'in_progress' }) : c
          )
        );

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to start campaign', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Pause Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const pauseCampaign = React.useCallback(
    async (id: string): Promise<boolean> => {
      logger.start('Pausing campaign', { id: id.substring(0, 8) });

      try {
        const response = await fetch(`/api/campaigns/${id}/pause`, {
          method: 'POST',
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to pause campaign');
        }

        logger.success('Campaign paused', { id: id.substring(0, 8) });

        // Optimistic update
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === id ? addCampaignStats({ ...c, status: 'paused' }) : c
          )
        );

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to pause campaign', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Cancel Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const cancelCampaign = React.useCallback(
    async (id: string): Promise<boolean> => {
      logger.start('Cancelling campaign', { id: id.substring(0, 8) });

      try {
        const response = await fetch(`/api/campaigns/${id}/cancel`, {
          method: 'POST',
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to cancel campaign');
        }

        logger.success('Campaign cancelled', { id: id.substring(0, 8) });

        // Optimistic update
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === id ? addCampaignStats({ ...c, status: 'cancelled' }) : c
          )
        );

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to cancel campaign', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Delete Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const deleteCampaign = React.useCallback(
    async (id: string): Promise<boolean> => {
      logger.start('Deleting campaign', { id: id.substring(0, 8) });

      try {
        const response = await fetch(`/api/campaigns/${id}`, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete campaign');
        }

        logger.success('Campaign deleted', { id: id.substring(0, 8) });

        // Optimistic removal
        setCampaigns((prev) => prev.filter((c) => c.id !== id));

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to delete campaign', { error: errorMessage });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return false;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Get Single Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const getCampaign = React.useCallback(
    (id: string): CampaignWithStats | undefined => {
      return campaigns.find((c) => c.id === id);
    },
    [campaigns]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Preview Campaign
  // ───────────────────────────────────────────────────────────────────────────

  const previewCampaign = React.useCallback(
    async (id: string, recipientIndex = 0): Promise<CampaignPreview | null> => {
      logger.start('Previewing campaign', { id: id.substring(0, 8), recipientIndex });

      try {
        const response = await fetch(`/api/campaigns/${id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientIndex }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to preview campaign');
        }

        logger.success('Campaign preview generated');

        return result.data.preview;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to preview campaign', { error: errorMessage });
        return null;
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Initial fetch
  React.useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Auto-refresh interval
  React.useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchCampaigns, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchCampaigns, refreshInterval]);

  // ───────────────────────────────────────────────────────────────────────────
  // Return
  // ───────────────────────────────────────────────────────────────────────────

  return {
    campaigns,
    isLoading,
    error,
    stats,
    refetch: fetchCampaigns,
    createCampaign,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    deleteCampaign,
    getCampaign,
    previewCampaign,
  };
}

export default useCampaigns;
