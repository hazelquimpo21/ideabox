/**
 * Campaign Preview API Route
 *
 * Previews a merged email for a campaign recipient.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/campaigns/[id]/preview
 *   - Merges template with recipient data
 *   - Returns preview HTML for display
 *   - Optionally specify recipient index (default: first recipient)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUEST BODY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "recipientIndex": 0  // Optional, defaults to 0
 * }
 * ```
 *
 * Or use custom merge data:
 * ```json
 * {
 *   "mergeData": {
 *     "first_name": "John",
 *     "company": "Acme Corp"
 *   }
 * }
 * ```
 *
 * @module app/api/campaigns/[id]/preview/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import { mergeTemplate, extractMergeFields } from '@/lib/gmail/gmail-send-service';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignPreviewAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Preview request body schema.
 */
const previewRequestSchema = z.object({
  // Use specific recipient from list
  recipientIndex: z.number().int().min(0).optional(),
  // Or use custom merge data
  mergeData: z.record(z.string()).optional(),
}).optional();

type PreviewRequest = z.infer<typeof previewRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/campaigns/[id]/preview
 *
 * Previews a merged email for a campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Generating campaign preview', { campaignId: id.substring(0, 8) });

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
    // Step 2: Parse request body (optional)
    // ─────────────────────────────────────────────────────────────────────────

    let body: PreviewRequest;
    try {
      const rawBody = await request.json().catch(() => ({}));
      body = previewRequestSchema.parse(rawBody);
    } catch (error) {
      logger.warn('Invalid preview request', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Fetch campaign
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: fetchError } = await supabase
      .from('email_campaigns')
      .select(`
        id,
        name,
        subject_template,
        body_html_template,
        recipients,
        gmail_accounts!inner (
          email
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
    // Step 4: Get merge data from recipient or custom data
    // ─────────────────────────────────────────────────────────────────────────

    const recipients = campaign.recipients as Array<Record<string, string>>;
    let mergeData: Record<string, string>;

    if (body?.mergeData) {
      // Use provided custom merge data
      mergeData = body.mergeData;
      logger.debug('Using custom merge data', { fields: Object.keys(mergeData) });
    } else {
      // Use recipient from list
      const recipientIndex = body?.recipientIndex ?? 0;

      if (recipientIndex >= recipients.length) {
        return createApiError(
          `Recipient index ${recipientIndex} is out of range. Campaign has ${recipients.length} recipients.`,
          400,
          'INVALID_RECIPIENT_INDEX'
        );
      }

      mergeData = recipients[recipientIndex];
      logger.debug('Using recipient data', {
        recipientIndex,
        email: mergeData.email,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Merge templates with data
    // ─────────────────────────────────────────────────────────────────────────

    const mergedSubject = mergeTemplate(campaign.subject_template, mergeData);
    const mergedBody = mergeTemplate(campaign.body_html_template, mergeData);

    // Extract detected merge fields for UI display
    const subjectFields = extractMergeFields(campaign.subject_template);
    const bodyFields = extractMergeFields(campaign.body_html_template);
    const allMergeFields = [...new Set([...subjectFields, ...bodyFields])];

    // Check for any unresolved merge fields (indicates missing data)
    const unresolvedInSubject = extractMergeFields(mergedSubject);
    const unresolvedInBody = extractMergeFields(mergedBody);
    const unresolvedFields = [...new Set([...unresolvedInSubject, ...unresolvedInBody])];

    if (unresolvedFields.length > 0) {
      logger.warn('Preview has unresolved merge fields', {
        campaignId: id.substring(0, 8),
        unresolvedFields,
      });
    }

    logger.success('Generated preview', {
      campaignId: id.substring(0, 8),
      recipientEmail: mergeData.email,
      mergeFieldsUsed: allMergeFields.length,
      unresolvedCount: unresolvedFields.length,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Return preview
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      preview: {
        from: campaign.gmail_accounts.email,
        to: mergeData.email || 'recipient@example.com',
        subject: mergedSubject,
        bodyHtml: mergedBody,
      },
      mergeFields: {
        detected: allMergeFields,
        unresolved: unresolvedFields,
        provided: Object.keys(mergeData),
      },
      recipient: {
        index: body?.recipientIndex ?? 0,
        email: mergeData.email,
        data: mergeData,
      },
    });
  } catch (error) {
    logger.error('Unexpected error in campaign preview', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
