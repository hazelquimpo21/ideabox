/**
 * Campaign Start API Route
 *
 * Starts or resumes an email campaign.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/campaigns/[id]/start
 *   - Transitions campaign from draft/scheduled/paused to in_progress
 *   - Validates user has quota remaining
 *   - Validates all merge fields are present in recipients
 *   - Sets started_at timestamp (first start only)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE TRANSITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * draft       -> in_progress  (first start)
 * scheduled   -> in_progress  (manual early start)
 * paused      -> in_progress  (resume)
 *
 * @module app/api/campaigns/[id]/start/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import { extractMergeFields } from '@/lib/gmail/gmail-send-service';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignStartAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Campaign statuses that allow starting.
 */
const STARTABLE_STATUSES = ['draft', 'scheduled', 'paused'];

/**
 * Minimum quota required to start a campaign.
 * This ensures we can send at least a few emails before hitting limits.
 */
const MIN_QUOTA_REQUIRED = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/campaigns/[id]/start
 *
 * Starts or resumes a campaign.
 *
 * GOTCHA: This endpoint performs full validation including:
 * - Gmail account has send scope
 * - User has quota remaining
 * - All recipients have required merge fields (unless overridden)
 *
 * If validation fails, the campaign remains in its current state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Starting campaign', { campaignId: id.substring(0, 8) });

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

    logger.debug('User authenticated', { userId: user.id.substring(0, 8) });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch campaign with account info
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: fetchError } = await supabase
      .from('email_campaigns')
      .select(`
        *,
        gmail_accounts!inner (
          id,
          email,
          has_send_scope
        )
      `)
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
    // Step 3: Verify campaign can be started
    // ─────────────────────────────────────────────────────────────────────────

    if (!STARTABLE_STATUSES.includes(campaign.status)) {
      logger.warn('Campaign cannot be started in current status', {
        campaignId: id.substring(0, 8),
        status: campaign.status,
      });

      if (campaign.status === 'in_progress') {
        return createApiError(
          'Campaign is already running',
          409,
          'CAMPAIGN_ALREADY_RUNNING'
        );
      }

      if (campaign.status === 'completed') {
        return createApiError(
          'Campaign has already completed. Create a new campaign to send more emails.',
          409,
          'CAMPAIGN_COMPLETED'
        );
      }

      return createApiError(
        `Cannot start campaign with status '${campaign.status}'`,
        409,
        'CAMPAIGN_NOT_STARTABLE'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Verify Gmail account has send scope
    // ─────────────────────────────────────────────────────────────────────────

    const gmailAccount = campaign.gmail_accounts;
    if (!gmailAccount.has_send_scope) {
      logger.warn('Gmail account lacks send scope', {
        campaignId: id.substring(0, 8),
        accountId: gmailAccount.id.substring(0, 8),
      });
      return createApiError(
        'Send permission not granted for this Gmail account. Please authorize email sending first.',
        403,
        'SEND_SCOPE_REQUIRED'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Check user's daily quota
    // ─────────────────────────────────────────────────────────────────────────

    const { data: remainingQuota } = await supabase.rpc('get_remaining_quota', {
      p_user_id: user.id,
    });

    if (remainingQuota < MIN_QUOTA_REQUIRED) {
      logger.warn('Insufficient quota to start campaign', {
        campaignId: id.substring(0, 8),
        remainingQuota,
        minRequired: MIN_QUOTA_REQUIRED,
      });
      return createApiError(
        `Insufficient daily quota. You have ${remainingQuota} emails remaining, but need at least ${MIN_QUOTA_REQUIRED} to start a campaign.`,
        429,
        'INSUFFICIENT_QUOTA'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Validate merge fields (for first start only)
    // ─────────────────────────────────────────────────────────────────────────

    // Only validate on first start, not on resume
    const isFirstStart = campaign.status === 'draft' || campaign.status === 'scheduled';

    if (isFirstStart) {
      // Extract merge fields from templates
      const subjectFields = extractMergeFields(campaign.subject_template || '');
      const bodyFields = extractMergeFields(campaign.body_html_template || '');
      const requiredFields = [...new Set([...subjectFields, ...bodyFields])];

      if (requiredFields.length > 0) {
        const recipients = campaign.recipients as Array<Record<string, unknown>>;
        const errors: string[] = [];

        // Check first 3 recipients for issues
        for (let i = 0; i < Math.min(3, recipients.length); i++) {
          const recipient = recipients[i];
          const missingFields: string[] = [];

          for (const field of requiredFields) {
            if (field === 'email') continue;
            const value = recipient[field];
            if (value === undefined || value === null || value === '') {
              missingFields.push(field);
            }
          }

          if (missingFields.length > 0) {
            errors.push(`Recipient ${i + 1} (${recipient.email}): missing ${missingFields.join(', ')}`);
          }
        }

        // Count total recipients with issues
        let totalErrors = 0;
        for (const recipient of recipients) {
          for (const field of requiredFields) {
            if (field === 'email') continue;
            const value = recipient[field];
            if (value === undefined || value === null || value === '') {
              totalErrors++;
              break; // Count each recipient once
            }
          }
        }

        if (totalErrors > 0) {
          const errorRate = totalErrors / recipients.length;

          // Block if more than 25% of recipients have issues
          if (errorRate > 0.25) {
            logger.warn('Too many recipients missing merge fields', {
              campaignId: id.substring(0, 8),
              totalErrors,
              totalRecipients: recipients.length,
              requiredFields,
            });
            return createApiError(
              `${totalErrors} of ${recipients.length} recipients are missing required fields. Sample issues: ${errors.join('; ')}`,
              400,
              'MERGE_FIELDS_MISSING'
            );
          }

          // Log warning but allow start
          logger.warn('Some recipients missing merge fields (under threshold)', {
            campaignId: id.substring(0, 8),
            totalErrors,
            errorRate: Math.round(errorRate * 100) + '%',
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Update campaign status to in_progress
    // ─────────────────────────────────────────────────────────────────────────

    const updateData: Record<string, unknown> = {
      status: 'in_progress',
      paused_at: null, // Clear paused timestamp
    };

    // Set started_at only on first start
    if (isFirstStart) {
      updateData.started_at = new Date().toISOString();
    }

    const { data: updatedCampaign, error: updateError } = await supabase
      .from('email_campaigns')
      .update(updateData)
      .eq('id', id)
      .select('id, name, status, started_at, current_index, total_recipients')
      .single();

    if (updateError) {
      logger.error('Failed to start campaign', { error: updateError.message });
      return createApiError('Failed to start campaign', 500, 'DATABASE_ERROR');
    }

    logger.success('Campaign started', {
      campaignId: id.substring(0, 8),
      name: campaign.name,
      isResume: !isFirstStart,
      currentIndex: campaign.current_index,
      totalRecipients: campaign.total_recipients,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Return success response
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      campaign: updatedCampaign,
      message: isFirstStart
        ? 'Campaign started successfully. Emails will be sent by the background processor.'
        : 'Campaign resumed successfully.',
      quotaRemaining: remainingQuota,
    });
  } catch (error) {
    logger.error('Unexpected error in campaign start', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
