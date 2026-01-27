/**
 * Email Campaigns API Route
 *
 * Manages email campaigns for mail merge / bulk sending.
 * Campaigns allow sending personalized emails to multiple recipients
 * with merge field support and throttling.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/campaigns
 *   - List all campaigns for the authenticated user
 *   - Optional filtering by status
 *   - Includes progress stats
 *
 * POST /api/campaigns
 *   - Create a new campaign
 *   - Validates recipients and merge fields
 *   - Returns created campaign with ID
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CAMPAIGN WORKFLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Create campaign (POST /api/campaigns) -> status: 'draft'
 * 2. Start campaign (POST /api/campaigns/[id]/start) -> status: 'in_progress'
 * 3. Background job processes recipients (campaign-processor Edge Function)
 * 4. Campaign completes -> status: 'completed'
 *
 * Campaigns can be paused/resumed or cancelled at any point.
 *
 * @module app/api/campaigns/route
 * @see docs/GMAIL_CAMPAIGNS_PHASE_4_PLAN.md
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess, getPagination, paginatedResponse } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import { extractMergeFields } from '@/lib/gmail/gmail-send-service';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignsAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid campaign statuses for filtering.
 */
const campaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
]);

/**
 * Follow-up configuration for campaign emails.
 */
const followUpSchema = z.object({
  enabled: z.boolean(),
  condition: z.enum(['no_open', 'no_reply', 'both']).optional(),
  delayHours: z.number().min(1).max(168).default(48), // 1 hour to 7 days
  subject: z.string().max(998).optional(),
  bodyHtml: z.string().optional(),
}).optional();

/**
 * Single recipient schema with merge fields.
 *
 * GOTCHA: Email is required, but all other fields are optional.
 * The template defines what merge fields are expected - validation
 * happens when the campaign starts, not at creation time.
 */
const recipientSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  // Allow arbitrary custom fields for flexibility
}).passthrough();

/**
 * Create campaign request body schema.
 *
 * GOTCHA: Recipients are stored as JSONB in the database.
 * For very large recipient lists (10K+), consider splitting
 * into a separate campaign_recipients table.
 */
const createCampaignSchema = z.object({
  // Required: Campaign identity
  name: z.string().min(1, 'Campaign name is required').max(200),
  description: z.string().max(1000).optional(),

  // Required: Gmail account to send from
  accountId: z.string().uuid('Invalid Gmail account ID'),

  // Template content (can also reference a saved template)
  templateId: z.string().uuid().optional(),
  subjectTemplate: z.string().min(1, 'Subject is required').max(998),
  bodyHtmlTemplate: z.string().min(1, 'Email body is required'),
  bodyTextTemplate: z.string().optional(),

  // Required: Recipients (at least one)
  recipients: z.array(recipientSchema)
    .min(1, 'At least one recipient is required')
    .max(10000, 'Maximum 10,000 recipients per campaign'),

  // Optional: Scheduling
  scheduledAt: z.string().datetime().optional(),

  // Optional: Throttling (default 25 seconds between sends)
  throttleSeconds: z.number().min(10).max(300).default(25),

  // Optional: Follow-up configuration
  followUp: followUpSchema,
});

type CreateCampaignRequest = z.infer<typeof createCampaignSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates that all recipients have the required merge fields.
 *
 * @param recipients - Array of recipient objects
 * @param requiredFields - Fields extracted from template
 * @returns Object with isValid and missing fields per recipient
 */
function validateRecipientMergeFields(
  recipients: Array<Record<string, unknown>>,
  requiredFields: string[]
): { isValid: boolean; errors: Array<{ index: number; email: string; missingFields: string[] }> } {
  const errors: Array<{ index: number; email: string; missingFields: string[] }> = [];

  recipients.forEach((recipient, index) => {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      // Skip 'email' as it's always required and validated by schema
      if (field === 'email') continue;

      const value = recipient[field];
      // Field is missing if undefined, null, or empty string
      if (value === undefined || value === null || value === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      errors.push({
        index,
        email: recipient.email as string,
        missingFields,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/campaigns
 *
 * Lists all campaigns for the authenticated user.
 * Supports filtering by status and pagination.
 *
 * Query Parameters:
 * - status: Filter by campaign status (draft, in_progress, completed, etc.)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching campaigns list');

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

    logger.debug('User authenticated for campaigns list', {
      userId: user.id.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Parse query parameters
    // ─────────────────────────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const { page, limit, offset } = getPagination(request);

    // Validate status filter if provided
    if (statusFilter) {
      const statusResult = campaignStatusSchema.safeParse(statusFilter);
      if (!statusResult.success) {
        logger.warn('Invalid status filter', { status: statusFilter });
        return createApiError(
          `Invalid status. Must be one of: draft, scheduled, in_progress, paused, completed, cancelled`,
          400,
          'INVALID_STATUS'
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Query campaigns with count
    // ─────────────────────────────────────────────────────────────────────────

    let query = supabase
      .from('email_campaigns')
      .select(`
        id,
        name,
        description,
        status,
        total_recipients,
        sent_count,
        failed_count,
        open_count,
        reply_count,
        current_index,
        scheduled_at,
        started_at,
        completed_at,
        paused_at,
        created_at,
        updated_at,
        gmail_accounts!inner (
          id,
          email
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: campaigns, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch campaigns', { error: error.message });
      return createApiError('Failed to fetch campaigns', 500, 'DATABASE_ERROR');
    }

    logger.success('Fetched campaigns', {
      userId: user.id.substring(0, 8),
      count: campaigns?.length || 0,
      totalCount: count,
      statusFilter,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Return paginated response
    // ─────────────────────────────────────────────────────────────────────────

    return paginatedResponse(
      campaigns || [],
      { page, limit, offset },
      count || 0,
      request.url
    );
  } catch (error) {
    logger.error('Unexpected error in campaigns GET', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * POST /api/campaigns
 *
 * Creates a new email campaign.
 *
 * The campaign is created in 'draft' status and must be started
 * separately via POST /api/campaigns/[id]/start.
 *
 * If scheduledAt is provided:
 * - Campaign will be set to 'scheduled' status
 * - Background job will start it at the scheduled time
 *
 * GOTCHA: Merge field validation is optional at creation time.
 * Full validation happens when the campaign starts. This allows
 * users to create drafts and fix recipient data later.
 */
export async function POST(request: NextRequest) {
  logger.start('Creating new campaign');

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

    logger.debug('User authenticated for campaign creation', {
      userId: user.id.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────

    let body: CreateCampaignRequest;
    try {
      const rawBody = await request.json();
      body = createCampaignSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod errors nicely
        const formattedErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        logger.warn('Campaign validation failed', { errors: formattedErrors });
        return createApiError(
          `Validation failed: ${formattedErrors.join('; ')}`,
          400,
          'VALIDATION_ERROR'
        );
      }
      logger.warn('Invalid request body', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    logger.info('Campaign request validated', {
      name: body.name,
      recipientCount: body.recipients.length,
      hasSchedule: !!body.scheduledAt,
      hasFollowUp: !!body.followUp?.enabled,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Verify Gmail account belongs to user and has send scope
    // ─────────────────────────────────────────────────────────────────────────

    const { data: account, error: accountError } = await supabase
      .from('gmail_accounts')
      .select('id, email, has_send_scope')
      .eq('id', body.accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      logger.warn('Gmail account not found or not owned by user', {
        userId: user.id.substring(0, 8),
        accountId: body.accountId.substring(0, 8),
      });
      return createApiError('Gmail account not found', 404, 'ACCOUNT_NOT_FOUND');
    }

    // GOTCHA: Check send scope now rather than when campaign starts
    // This provides early feedback to the user
    if (!account.has_send_scope) {
      logger.warn('Gmail account lacks send scope', {
        accountId: body.accountId.substring(0, 8),
      });
      return createApiError(
        'Send permission not granted for this Gmail account. Please authorize email sending first.',
        403,
        'SEND_SCOPE_REQUIRED'
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Extract and validate merge fields (optional at creation)
    // ─────────────────────────────────────────────────────────────────────────

    // Extract merge fields from subject and body templates
    const subjectFields = extractMergeFields(body.subjectTemplate);
    const bodyFields = extractMergeFields(body.bodyHtmlTemplate);
    const allMergeFields = [...new Set([...subjectFields, ...bodyFields])];

    logger.debug('Extracted merge fields from templates', {
      subjectFields,
      bodyFields,
      allMergeFields,
    });

    // Warn (but don't error) if recipients are missing merge fields
    // This allows creating drafts that can be fixed later
    if (allMergeFields.length > 0) {
      const validation = validateRecipientMergeFields(body.recipients, allMergeFields);

      if (!validation.isValid) {
        // Log warning but don't block creation
        const sampleErrors = validation.errors.slice(0, 3);
        logger.warn('Some recipients missing merge fields', {
          totalErrors: validation.errors.length,
          sampleErrors,
          requiredFields: allMergeFields,
        });

        // If more than 50% of recipients have issues, return error
        const errorRate = validation.errors.length / body.recipients.length;
        if (errorRate > 0.5) {
          return createApiError(
            `${validation.errors.length} of ${body.recipients.length} recipients are missing required merge fields: ${allMergeFields.join(', ')}`,
            400,
            'MERGE_FIELDS_MISSING'
          );
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Check for duplicate emails in recipients
    // ─────────────────────────────────────────────────────────────────────────

    const emailSet = new Set<string>();
    const duplicates: string[] = [];

    for (const recipient of body.recipients) {
      const email = recipient.email.toLowerCase();
      if (emailSet.has(email)) {
        duplicates.push(email);
      }
      emailSet.add(email);
    }

    if (duplicates.length > 0) {
      logger.warn('Duplicate emails found in recipients', {
        duplicateCount: duplicates.length,
        sampleDuplicates: duplicates.slice(0, 5),
      });
      // Don't block - just log. Duplicates will be sent to twice which may be intentional
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Determine campaign status
    // ─────────────────────────────────────────────────────────────────────────

    const isScheduled = !!body.scheduledAt;
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    // If scheduled time is in the past, treat as immediate start
    const shouldSchedule = scheduledAt && scheduledAt > new Date();
    const initialStatus = shouldSchedule ? 'scheduled' : 'draft';

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Create campaign in database
    // ─────────────────────────────────────────────────────────────────────────

    const { data: campaign, error: insertError } = await supabase
      .from('email_campaigns')
      .insert({
        user_id: user.id,
        gmail_account_id: body.accountId,
        name: body.name,
        description: body.description || null,
        template_id: body.templateId || null,
        subject_template: body.subjectTemplate,
        body_html_template: body.bodyHtmlTemplate,
        body_text_template: body.bodyTextTemplate || null,
        recipients: body.recipients,
        status: initialStatus,
        scheduled_at: shouldSchedule ? scheduledAt.toISOString() : null,
        throttle_seconds: body.throttleSeconds,
        total_recipients: body.recipients.length,
        // Follow-up settings
        follow_up_enabled: body.followUp?.enabled || false,
        follow_up_condition: body.followUp?.condition || null,
        follow_up_delay_hours: body.followUp?.delayHours || 48,
        follow_up_subject: body.followUp?.subject || null,
        follow_up_body_html: body.followUp?.bodyHtml || null,
      })
      .select('id, name, status, total_recipients, scheduled_at, created_at')
      .single();

    if (insertError || !campaign) {
      logger.error('Failed to create campaign', { error: insertError?.message });
      return createApiError('Failed to create campaign', 500, 'DATABASE_ERROR');
    }

    logger.success('Campaign created', {
      campaignId: campaign.id.substring(0, 8),
      name: campaign.name,
      status: campaign.status,
      recipientCount: campaign.total_recipients,
      isScheduled: shouldSchedule,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Return created campaign
    // ─────────────────────────────────────────────────────────────────────────

    return createApiSuccess({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.total_recipients,
        scheduledAt: campaign.scheduled_at,
        createdAt: campaign.created_at,
        mergeFieldsDetected: allMergeFields,
        duplicateEmailsDetected: duplicates.length,
      },
    }, 201);
  } catch (error) {
    logger.error('Unexpected error in campaigns POST', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
