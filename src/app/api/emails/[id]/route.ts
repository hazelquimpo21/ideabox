/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 📧 Email Detail API Route
 *
 * Handles operations on a single email by ID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/emails/[id]
 *   Fetch a single email by ID
 *   Returns: Email object with analysis data
 *
 * PATCH /api/emails/[id]
 *   Update email properties (read, starred, archived, category, client)
 *   Body: { is_read?, is_starred?, is_archived?, category?, client_id? }
 *   Returns: Updated email object
 *
 * DELETE /api/emails/[id]
 *   Archive an email (soft delete)
 *   Returns: Success confirmation
 *
 * @module app/api/emails/[id]/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { emailUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Email');

/** Route params type */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/emails/[id] - Get single email
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching email', { emailId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Fetch email with analysis data
    const { data: email, error } = await supabase
      .from('emails')
      .select(`
        *,
        email_analyses (*)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Email not found', 404);
      }
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch email', 500);
    }

    logger.success('Email fetched', { emailId: id });
    return apiResponse(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/emails/[id] - Update email
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Updating email', { emailId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, emailUpdateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const updates = bodyResult;

    // Verify email exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('emails')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return apiError('Email not found', 404);
    }

    // Update email
    const { data: email, error: updateError } = await supabase
      .from('emails')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Update failed', { error: updateError.message });
      return apiError('Failed to update email', 500);
    }

    logger.success('Email updated', {
      emailId: id,
      fields: Object.keys(updates),
    });

    return apiResponse(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/emails/[id] - Archive email (soft delete)
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Archiving email', { emailId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Soft delete: mark as archived
    const { error } = await supabase
      .from('emails')
      .update({ is_archived: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Email not found', 404);
      }
      logger.error('Archive failed', { error: error.message });
      return apiError('Failed to archive email', 500);
    }

    logger.success('Email archived', { emailId: id });
    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
