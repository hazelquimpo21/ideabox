/**
 * Campaign Pause API Route
 *
 * Pauses a running email campaign.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/campaigns/[id]/pause
 *   - Transitions campaign from in_progress to paused
 *   - Preserves current_index for later resumption
 *   - Sets paused_at timestamp
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE TRANSITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * in_progress -> paused
 *
 * GOTCHA: Emails that are already queued or sending may still complete.
 * Pausing only prevents new emails from being added to the queue.
 *
 * @module app/api/campaigns/[id]/pause/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignPauseAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/campaigns/[id]/pause
 *
 * Pauses a running campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Pausing campaign', { campaignId: id.substring(0, 8) });

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch campaign
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: fetchError } = await supabase
      .from('email_campaigns')
      .select('id, name, status, current_index, sent_count, total_recipients')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !campaign) {
      logger.warn('Campaign not found', {
        campaignId: id.substring(0, 8),
        error: fetchError?.message,
      });
      return createApiError('Campaign not found', 404, 'NOT_FOUND');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Verify campaign can be paused
    // ─────────────────────────────────────────────────────────────────────────

    if (campaign.status !== 'in_progress') {
      logger.warn('Campaign cannot be paused in current status', {
        campaignId: id.substring(0, 8),
        status: campaign.status,
      });

      if (campaign.status === 'paused') {
        return createApiError(
          'Campaign is already paused',
          409,
          'CAMPAIGN_ALREADY_PAUSED'
        );
      }

      if (campaign.status === 'completed') {
        return createApiError(
          'Campaign has already completed',
          409,
          'CAMPAIGN_COMPLETED'
        );
      }

      return createApiError(
        `Cannot pause campaign with status '${campaign.status}'. Only running campaigns can be paused.`,
        409,
        'CAMPAIGN_NOT_PAUSABLE'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Update campaign status to paused
    // ─────────────────────────────────────────────────────────────────────────

    const { data: updatedCampaign, error: updateError } = await supabase
      .from('email_campaigns')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, status, paused_at, current_index, sent_count, total_recipients')
      .single();

    if (updateError) {
      logger.error('Failed to pause campaign', { error: updateError.message });
      return createApiError('Failed to pause campaign', 500, 'DATABASE_ERROR');
    }

    logger.success('Campaign paused', {
      campaignId: id.substring(0, 8),
      name: campaign.name,
      sentSoFar: campaign.sent_count,
      remaining: campaign.total_recipients - campaign.current_index,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Return success response
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      campaign: updatedCampaign,
      message: 'Campaign paused successfully. Use the start endpoint to resume.',
      progress: {
        sent: campaign.sent_count,
        total: campaign.total_recipients,
        remaining: campaign.total_recipients - campaign.current_index,
      },
    });
  } catch (error) {
    logger.error('Unexpected error in campaign pause', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
