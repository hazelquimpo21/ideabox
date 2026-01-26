/**
 * Single Email Template API Route
 *
 * Manages operations on a specific email template.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/templates/[id]
 *   - Get a specific template by ID
 *
 * PATCH /api/templates/[id]
 *   - Update a template
 *
 * DELETE /api/templates/[id]
 *   - Delete a template
 *
 * @module app/api/templates/[id]/route
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

const logger = createLogger('TemplateAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update template request body schema.
 */
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  subjectTemplate: z.string().min(1).max(998).optional(),
  bodyHtmlTemplate: z.string().min(1).optional(),
  bodyTextTemplate: z.string().optional().nullable(),
  mergeFields: z.array(z.string()).optional(),
});

type UpdateTemplateRequest = z.infer<typeof updateTemplateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/templates/[id]
 *
 * Gets a specific template by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Fetching template', { templateId: id.substring(0, 8) });

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Fetch template
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !template) {
      logger.warn('Template not found', {
        templateId: id.substring(0, 8),
        userId: user.id.substring(0, 8),
      });
      return createApiError('Template not found', 404, 'NOT_FOUND');
    }

    logger.success('Fetched template', {
      templateId: id.substring(0, 8),
      name: template.name,
    });

    return createApiSuccess({ template });
  } catch (error) {
    logger.error('Unexpected error in template GET', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /api/templates/[id]
 *
 * Updates a template.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Updating template', { templateId: id.substring(0, 8) });

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Parse and validate request body
    let body: UpdateTemplateRequest;
    try {
      const rawBody = await request.json();
      body = updateTemplateSchema.parse(rawBody);
    } catch (error) {
      logger.warn('Invalid update request body', {
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return createApiError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    // Verify template exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('email_templates')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Template not found for update', {
        templateId: id.substring(0, 8),
      });
      return createApiError('Template not found', 404, 'NOT_FOUND');
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.subjectTemplate !== undefined) updateData.subject_template = body.subjectTemplate;
    if (body.bodyHtmlTemplate !== undefined) updateData.body_html_template = body.bodyHtmlTemplate;
    if (body.bodyTextTemplate !== undefined) updateData.body_text_template = body.bodyTextTemplate;

    // Re-extract merge fields if template content changed
    if (body.subjectTemplate || body.bodyHtmlTemplate) {
      // Need to get current values for fields not being updated
      const { data: current } = await supabase
        .from('email_templates')
        .select('subject_template, body_html_template')
        .eq('id', id)
        .single();

      const subjectForFields = body.subjectTemplate || current?.subject_template || '';
      const bodyForFields = body.bodyHtmlTemplate || current?.body_html_template || '';

      const allMergeFields = new Set([
        ...extractMergeFields(subjectForFields),
        ...extractMergeFields(bodyForFields),
        ...(body.mergeFields || []),
      ]);

      updateData.merge_fields = Array.from(allMergeFields);
    } else if (body.mergeFields) {
      updateData.merge_fields = body.mergeFields;
    }

    // Update template
    const { data: template, error: updateError } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update template', { error: updateError.message });
      return createApiError('Failed to update template', 500, 'DATABASE_ERROR');
    }

    logger.success('Updated template', {
      templateId: id.substring(0, 8),
      updatedFields: Object.keys(updateData),
    });

    return createApiSuccess({ template });
  } catch (error) {
    logger.error('Unexpected error in template PATCH', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * DELETE /api/templates/[id]
 *
 * Deletes a template.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  logger.start('Deleting template', { templateId: id.substring(0, 8) });

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Delete template (RLS will ensure user owns it)
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error('Failed to delete template', { error: error.message });
      return createApiError('Failed to delete template', 500, 'DATABASE_ERROR');
    }

    logger.success('Deleted template', { templateId: id.substring(0, 8) });

    return createApiSuccess({ deleted: true });
  } catch (error) {
    logger.error('Unexpected error in template DELETE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
