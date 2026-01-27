/**
 * Single Campaign API Route
 *
 * Manages operations on a specific email campaign.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/campaigns/[id]
 *   - Get campaign details with aggregated stats
 *   - Includes gmail account info
 *
 * PATCH /api/campaigns/[id]
 *   - Update campaign (only if status is 'draft')
 *   - Cannot modify campaigns that have started
 *
 * DELETE /api/campaigns/[id]
 *   - Delete campaign (only if draft or cancelled)
 *   - In-progress campaigns must be cancelled first
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATUS RESTRICTIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Action | Allowed Statuses |
 * |--------|------------------|
 * | PATCH  | draft, scheduled |
 * | DELETE | draft, cancelled |
 *
 * @module app/api/campaigns/[id]/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import { extractMergeFields } from '@/lib/gmail/gmail-send-service';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single recipient schema.
 */
const recipientSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
}).passthrough();

/**
 * Follow-up configuration schema.
 */
const followUpSchema = z.object({
  enabled: z.boolean(),
  condition: z.enum(['no_open', 'no_reply', 'both']).optional(),
  delayHours: z.number().min(1).max(168).default(48),
  subject: z.string().max(998).optional(),
  bodyHtml: z.string().optional(),
}).optional();

/**
 * Update campaign request body schema.
 *
 * GOTCHA: accountId cannot be changed after creation.
 * This prevents confusing situations where emails are
 * partially sent from different accounts.
 */
const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  subjectTemplate: z.string().min(1).max(998).optional(),
  bodyHtmlTemplate: z.string().min(1).optional(),
  bodyTextTemplate: z.string().optional().nullable(),
  recipients: z.array(recipientSchema).min(1).max(10000).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  throttleSeconds: z.number().min(10).max(300).optional(),
  followUp: followUpSchema,
});

type UpdateCampaignRequest = z.infer<typeof updateCampaignSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Campaign statuses that allow updates.
 */
const EDITABLE_STATUSES = ['draft', 'scheduled'];

/**
 * Campaign statuses that allow deletion.
 */
const DELETABLE_STATUSES = ['draft', 'cancelled'];

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/campaigns/[id]
 *
 * Gets a specific campaign by ID with full details and stats.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Fetching campaign', { campaignId: id.substring(0, 8) });

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
    // Step 2: Fetch campaign with related data
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error } = await supabase
      .from('email_campaigns')
      .select(`
        *,
        gmail_accounts!inner (
          id,
          email,
          has_send_scope
        ),
        email_templates (
          id,
          name
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !campaign) {
      logger.warn('Campaign not found', {
        campaignId: id.substring(0, 8),
        userId: user.id.substring(0, 8),
        error: error?.message,
      });
      return createApiError('Campaign not found', 404, 'NOT_FOUND');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Calculate additional stats
    // ─────────────────────────────────────────────────────────────────────────

    const totalRecipients = campaign.total_recipients || 0;
    const sentCount = campaign.sent_count || 0;
    const failedCount = campaign.failed_count || 0;
    const openCount = campaign.open_count || 0;
    const replyCount = campaign.reply_count || 0;

    // Calculate rates (avoid division by zero)
    const progressPercent = totalRecipients > 0
      ? Math.round(((sentCount + failedCount) / totalRecipients) * 100)
      : 0;

    const openRate = sentCount > 0
      ? Math.round((openCount / sentCount) * 100)
      : 0;

    const replyRate = sentCount > 0
      ? Math.round((replyCount / sentCount) * 100)
      : 0;

    // Extract merge fields from templates
    const mergeFieldsInSubject = extractMergeFields(campaign.subject_template || '');
    const mergeFieldsInBody = extractMergeFields(campaign.body_html_template || '');
    const allMergeFields = [...new Set([...mergeFieldsInSubject, ...mergeFieldsInBody])];

    logger.success('Fetched campaign', {
      campaignId: id.substring(0, 8),
      name: campaign.name,
      status: campaign.status,
      progress: progressPercent,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Return campaign with computed fields
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      campaign: {
        ...campaign,
        // Add computed stats
        stats: {
          progressPercent,
          openRate,
          replyRate,
          remaining: totalRecipients - sentCount - failedCount,
        },
        // Add extracted merge fields
        mergeFields: allMergeFields,
        // Simplify nested relations for UI
        gmailAccount: campaign.gmail_accounts,
        template: campaign.email_templates,
      },
    });
  } catch (error) {
    logger.error('Unexpected error in campaign GET', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /api/campaigns/[id]
 *
 * Updates a campaign. Only allowed when status is 'draft' or 'scheduled'.
 *
 * GOTCHA: If recipients array is provided, it completely replaces
 * the existing recipients. Partial recipient updates are not supported.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Updating campaign', { campaignId: id.substring(0, 8) });

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
    // Step 2: Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────

    let body: UpdateCampaignRequest;
    try {
      const rawBody = await request.json();
      body = updateCampaignSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        logger.warn('Update validation failed', { errors: formattedErrors });
        return createApiError(
          `Validation failed: ${formattedErrors.join('; ')}`,
          400,
          'VALIDATION_ERROR'
        );
      }
      logger.warn('Invalid update request body', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    // Check if any fields provided
    if (Object.keys(body).length === 0) {
      return createApiError('No fields to update', 400, 'EMPTY_UPDATE');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Verify campaign exists, belongs to user, and is editable
    // ─────────────────────────────────────────────────────────────────────────

    const { data: existing, error: fetchError } = await supabase
      .from('email_campaigns')
      .select('id, status, subject_template, body_html_template')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Campaign not found for update', {
        campaignId: id.substring(0, 8),
      });
      return createApiError('Campaign not found', 404, 'NOT_FOUND');
    }

    // Check if campaign can be edited
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      logger.warn('Campaign cannot be edited in current status', {
        campaignId: id.substring(0, 8),
        status: existing.status,
      });
      return createApiError(
        `Cannot edit campaign with status '${existing.status}'. Only draft or scheduled campaigns can be edited.`,
        409,
        'CAMPAIGN_NOT_EDITABLE'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Build update data
    // ─────────────────────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.subjectTemplate !== undefined) updateData.subject_template = body.subjectTemplate;
    if (body.bodyHtmlTemplate !== undefined) updateData.body_html_template = body.bodyHtmlTemplate;
    if (body.bodyTextTemplate !== undefined) updateData.body_text_template = body.bodyTextTemplate;
    if (body.throttleSeconds !== undefined) updateData.throttle_seconds = body.throttleSeconds;

    // Handle recipients update
    if (body.recipients !== undefined) {
      updateData.recipients = body.recipients;
      updateData.total_recipients = body.recipients.length;
      // Reset progress counters since recipients changed
      updateData.current_index = 0;
      updateData.sent_count = 0;
      updateData.failed_count = 0;
      updateData.open_count = 0;
      updateData.reply_count = 0;
    }

    // Handle scheduling update
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null) {
        // Clear scheduling - revert to draft
        updateData.scheduled_at = null;
        updateData.status = 'draft';
      } else {
        const scheduledAt = new Date(body.scheduledAt);
        if (scheduledAt > new Date()) {
          updateData.scheduled_at = scheduledAt.toISOString();
          updateData.status = 'scheduled';
        } else {
          // Past date - keep as draft
          updateData.scheduled_at = null;
          updateData.status = 'draft';
        }
      }
    }

    // Handle follow-up update
    if (body.followUp !== undefined) {
      if (body.followUp === null) {
        updateData.follow_up_enabled = false;
        updateData.follow_up_condition = null;
        updateData.follow_up_delay_hours = 48;
        updateData.follow_up_subject = null;
        updateData.follow_up_body_html = null;
      } else {
        updateData.follow_up_enabled = body.followUp.enabled;
        updateData.follow_up_condition = body.followUp.condition || null;
        updateData.follow_up_delay_hours = body.followUp.delayHours || 48;
        updateData.follow_up_subject = body.followUp.subject || null;
        updateData.follow_up_body_html = body.followUp.bodyHtml || null;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Update campaign
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: updateError } = await supabase
      .from('email_campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update campaign', { error: updateError.message });
      return createApiError('Failed to update campaign', 500, 'DATABASE_ERROR');
    }

    logger.success('Updated campaign', {
      campaignId: id.substring(0, 8),
      updatedFields: Object.keys(updateData),
    });

    return createApiSuccess({ campaign });
  } catch (error) {
    logger.error('Unexpected error in campaign PATCH', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /api/campaigns/[id]
 *
 * Deletes a campaign. Only allowed when status is 'draft' or 'cancelled'.
 *
 * GOTCHA: Deleting a campaign does NOT delete the outbound emails
 * that were already sent. Those remain in the outbound_emails table
 * with campaign_id set to NULL (via ON DELETE SET NULL).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Deleting campaign', { campaignId: id.substring(0, 8) });

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
    // Step 2: Verify campaign exists, belongs to user, and can be deleted
    // ─────────────────────────────────────────────────────────────────────────

    const { data: existing, error: fetchError } = await supabase
      .from('email_campaigns')
      .select('id, status, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Campaign not found for deletion', {
        campaignId: id.substring(0, 8),
      });
      return createApiError('Campaign not found', 404, 'NOT_FOUND');
    }

    // Check if campaign can be deleted
    if (!DELETABLE_STATUSES.includes(existing.status)) {
      logger.warn('Campaign cannot be deleted in current status', {
        campaignId: id.substring(0, 8),
        status: existing.status,
      });
      return createApiError(
        `Cannot delete campaign with status '${existing.status}'. Please cancel the campaign first.`,
        409,
        'CAMPAIGN_NOT_DELETABLE'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Delete campaign
    // ─────────────────────────────────────────────────────────────────────────

    const { error: deleteError } = await supabase
      .from('email_campaigns')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      logger.error('Failed to delete campaign', { error: deleteError.message });
      return createApiError('Failed to delete campaign', 500, 'DATABASE_ERROR');
    }

    logger.success('Deleted campaign', {
      campaignId: id.substring(0, 8),
      name: existing.name,
    });

    return createApiSuccess({ deleted: true });
  } catch (error) {
    logger.error('Unexpected error in campaign DELETE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
