/**
 * Campaign Emails API Route
 *
 * Lists all outbound emails for a specific campaign.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/campaigns/[id]/emails
 *   - Lists all emails sent as part of this campaign
 *   - Includes individual open/reply stats per email
 *   - Supports filtering by status and pagination
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUERY PARAMETERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - status: Filter by email status (sent, failed, queued, etc.)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 *
 * @module app/api/campaigns/[id]/emails/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, getPagination, paginatedResponse } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignEmailsAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid outbound email statuses.
 */
const emailStatusSchema = z.enum([
  'draft',
  'scheduled',
  'queued',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/campaigns/[id]/emails
 *
 * Lists all emails for a campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Fetching campaign emails', { campaignId: id.substring(0, 8) });

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
    // Step 2: Verify campaign exists and belongs to user
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      logger.warn('Campaign not found', {
        campaignId: id.substring(0, 8),
        error: campaignError?.message,
      });
      return createApiError('Campaign not found', 404, 'NOT_FOUND');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Parse query parameters
    // ─────────────────────────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const { page, limit, offset } = getPagination(request);

    // Validate status filter if provided
    if (statusFilter) {
      const statusResult = emailStatusSchema.safeParse(statusFilter);
      if (!statusResult.success) {
        return createApiError(
          `Invalid status. Must be one of: draft, scheduled, queued, sending, sent, failed, cancelled`,
          400,
          'INVALID_STATUS'
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Query outbound emails for this campaign
    // ─────────────────────────────────────────────────────────────────────────

    let query = supabase
      .from('outbound_emails')
      .select(`
        id,
        to_email,
        to_name,
        subject,
        status,
        sent_at,
        scheduled_at,
        open_count,
        first_opened_at,
        last_opened_at,
        has_reply,
        reply_received_at,
        error_message,
        error_code,
        created_at
      `, { count: 'exact' })
      .eq('campaign_id', id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: emails, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch campaign emails', { error: error.message });
      return createApiError('Failed to fetch emails', 500, 'DATABASE_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Calculate aggregated stats
    // ─────────────────────────────────────────────────────────────────────────

    // Get status breakdown
    const { data: statusBreakdown, error: statsError } = await supabase
      .from('outbound_emails')
      .select('status')
      .eq('campaign_id', id);

    const stats = {
      total: count || 0,
      sent: 0,
      failed: 0,
      pending: 0,
      opened: 0,
      replied: 0,
    };

    if (!statsError && statusBreakdown) {
      for (const email of statusBreakdown) {
        if (email.status === 'sent') stats.sent++;
        else if (email.status === 'failed') stats.failed++;
        else if (['scheduled', 'queued', 'sending'].includes(email.status)) stats.pending++;
      }
    }

    // Count opens and replies from fetched emails
    if (emails) {
      for (const email of emails) {
        if (email.open_count > 0) stats.opened++;
        if (email.has_reply) stats.replied++;
      }
    }

    logger.success('Fetched campaign emails', {
      campaignId: id.substring(0, 8),
      emailCount: emails?.length || 0,
      totalCount: count,
      statusFilter,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Return paginated response with stats
    // ─────────────────────────────────────────────────────────────────────────

    // Enrich response with stats
    const response = paginatedResponse(
      emails || [],
      { page, limit, offset },
      count || 0,
      request.url
    );

    // Add stats to the response
    const responseBody = await response.json();
    responseBody.stats = stats;

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(response.headers.entries()),
      },
    });
  } catch (error) {
    logger.error('Unexpected error in campaign emails GET', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
