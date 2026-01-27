/**
 * Email Templates API Route
 *
 * Manages reusable email templates with merge field support.
 * Templates can be used for single emails or mail merge campaigns.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/templates
 *   - List all templates for the authenticated user
 *   - Optional filtering by category
 *
 * POST /api/templates
 *   - Create a new email template
 *   - Validates merge fields in template content
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MERGE FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Templates support merge fields with {{field_name}} syntax:
 * - {{first_name}} - Recipient's first name
 * - {{last_name}} - Recipient's last name
 * - {{email}} - Recipient's email
 * - {{company}} - Recipient's company
 * - Custom fields can be defined per template
 *
 * @module app/api/templates/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
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

const logger = createLogger('TemplatesAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create template request body schema.
 */
const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  subjectTemplate: z.string().min(1).max(998),
  bodyHtmlTemplate: z.string().min(1),
  bodyTextTemplate: z.string().optional(),
  mergeFields: z.array(z.string()).optional(),
});

type CreateTemplateRequest = z.infer<typeof createTemplateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/templates
 *
 * Lists all email templates for the authenticated user.
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching email templates');

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    // Build query
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: templates, error } = await query;

    if (error) {
      logger.error('Failed to fetch templates', { error: error.message });
      return createApiError('Failed to fetch templates', 500, 'DATABASE_ERROR');
    }

    logger.success('Fetched templates', {
      userId: user.id.substring(0, 8),
      count: templates?.length || 0,
    });

    return createApiSuccess({ templates: templates || [] });
  } catch (error) {
    logger.error('Unexpected error in templates GET', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * POST /api/templates
 *
 * Creates a new email template.
 */
export async function POST(request: NextRequest) {
  logger.start('Creating email template');

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Parse and validate request body
    let body: CreateTemplateRequest;
    try {
      const rawBody = await request.json();
      body = createTemplateSchema.parse(rawBody);
    } catch (error) {
      logger.warn('Invalid template request body', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    // Extract merge fields from template content if not provided
    const mergeFieldsFromSubject = extractMergeFields(body.subjectTemplate);
    const mergeFieldsFromBody = extractMergeFields(body.bodyHtmlTemplate);
    const allMergeFields = new Set([
      ...mergeFieldsFromSubject,
      ...mergeFieldsFromBody,
      ...(body.mergeFields || []),
    ]);

    logger.debug('Extracted merge fields', {
      fromSubject: mergeFieldsFromSubject,
      fromBody: mergeFieldsFromBody,
      provided: body.mergeFields,
      combined: Array.from(allMergeFields),
    });

    // Create template
    const { data: template, error } = await supabase
      .from('email_templates')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        category: body.category || null,
        subject_template: body.subjectTemplate,
        body_html_template: body.bodyHtmlTemplate,
        body_text_template: body.bodyTextTemplate || null,
        merge_fields: Array.from(allMergeFields),
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create template', { error: error.message });
      return createApiError('Failed to create template', 500, 'DATABASE_ERROR');
    }

    logger.success('Created template', {
      templateId: template.id.substring(0, 8),
      name: template.name,
      mergeFieldCount: allMergeFields.size,
    });

    return createApiSuccess({ template }, 201);
  } catch (error) {
    logger.error('Unexpected error in templates POST', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
