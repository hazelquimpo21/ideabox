/**
 * Campaign Cancel API Route
 *
 * Cancels an email campaign permanently.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/campaigns/[id]/cancel
 *   - Transitions campaign to cancelled status
 *   - Cannot be resumed after cancellation
 *   - Optionally cancels any pending scheduled emails for this campaign
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE TRANSITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * draft       -> cancelled
 * scheduled   -> cancelled
 * in_progress -> cancelled
 * paused      -> cancelled
 *
 * GOTCHA: Emails that are already sent cannot be unsent. Cancellation
 * only prevents future sends. The sent emails remain in outbound_emails.
 *
 * @module app/api/campaigns/[id]/cancel/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignCancelAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Campaign statuses that allow cancellation.
 * Basically everything except already cancelled or completed.
 */
const CANCELLABLE_STATUSES = ['draft', 'scheduled', 'in_progress', 'paused'];

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/campaigns/[id]/cancel
 *
 * Cancels a campaign permanently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Cancelling campaign', { campaignId: id.substring(0, 8) });

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
      .select('id, name, status, sent_count, failed_count, total_recipients')
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
    // Step 3: Verify campaign can be cancelled
    // ─────────────────────────────────────────────────────────────────────────

    if (!CANCELLABLE_STATUSES.includes(campaign.status)) {
      logger.warn('Campaign cannot be cancelled in current status', {
        campaignId: id.substring(0, 8),
        status: campaign.status,
      });

      if (campaign.status === 'cancelled') {
        return createApiError(
          'Campaign is already cancelled',
          409,
          'CAMPAIGN_ALREADY_CANCELLED'
        );
      }

      if (campaign.status === 'completed') {
        return createApiError(
          'Campaign has already completed and cannot be cancelled',
          409,
          'CAMPAIGN_COMPLETED'
        );
      }

      return createApiError(
        `Cannot cancel campaign with status '${campaign.status}'`,
        409,
        'CAMPAIGN_NOT_CANCELLABLE'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Cancel any pending scheduled emails for this campaign
    // ─────────────────────────────────────────────────────────────────────────

    // Find and cancel any scheduled/queued outbound emails for this campaign
    const { data: cancelledEmails, error: cancelEmailsError } = await supabase
      .from('outbound_emails')
      .update({
        status: 'cancelled',
        error_message: 'Campaign was cancelled',
      })
      .eq('campaign_id', id)
      .in('status', ['scheduled', 'queued'])
      .select('id');

    if (cancelEmailsError) {
      // Log but don't fail - campaign cancellation is more important
      logger.warn('Failed to cancel some pending emails', {
        campaignId: id.substring(0, 8),
        error: cancelEmailsError.message,
      });
    } else {
      logger.info('Cancelled pending emails', {
        campaignId: id.substring(0, 8),
        cancelledCount: cancelledEmails?.length || 0,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Update campaign status to cancelled
    // ─────────────────────────────────────────────────────────────────────────

    const { data: updatedCampaign, error: updateError } = await supabase
      .from('email_campaigns')
      .update({
        status: 'cancelled',
        // Clear scheduled_at since it's no longer relevant
        scheduled_at: null,
      })
      .eq('id', id)
      .select('id, name, status, sent_count, failed_count, total_recipients')
      .single();

    if (updateError) {
      logger.error('Failed to cancel campaign', { error: updateError.message });
      return createApiError('Failed to cancel campaign', 500, 'DATABASE_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Calculate final stats
    // ─────────────────────────────────────────────────────────────────────────

    const notSent = campaign.total_recipients - campaign.sent_count - campaign.failed_count;

    logger.success('Campaign cancelled', {
      campaignId: id.substring(0, 8),
      name: campaign.name,
      previousStatus: campaign.status,
      sent: campaign.sent_count,
      failed: campaign.failed_count,
      notSent,
      pendingEmailsCancelled: cancelledEmails?.length || 0,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Return success response
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      campaign: updatedCampaign,
      message: 'Campaign cancelled successfully.',
      summary: {
        sent: campaign.sent_count,
        failed: campaign.failed_count,
        notSent,
        pendingEmailsCancelled: cancelledEmails?.length || 0,
      },
    });
  } catch (error) {
    logger.error('Unexpected error in campaign cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
