/**
 * 📋 Action Detail API Route
 *
 * Handles operations on a single action by ID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/actions/[id]
 *   Fetch a single action by ID
 *   Returns: Action object with related email/client info
 *
 * PATCH /api/actions/[id]
 *   Update action properties
 *   Body: { title?, status?, priority?, deadline?, ... }
 *   Returns: Updated action object
 *
 * DELETE /api/actions/[id]
 *   Permanently delete an action
 *   Returns: Success confirmation
 *
 * @module app/api/actions/[id]/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { actionUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Action');

/** Route params type */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/actions/[id] - Get single action
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching action', { actionId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Fetch action with related data
    const { data: action, error } = await supabase
      .from('actions')
      .select(`
        *,
        emails ( id, subject, sender_name, sender_email, date ),
        clients ( id, name, company )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Action not found', 404);
      }
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch action', 500);
    }

    logger.success('Action fetched', { actionId: id });
    return apiResponse(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/actions/[id] - Update action
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Updating action', { actionId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, actionUpdateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const updates = bodyResult;

    // Verify action exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('actions')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return apiError('Action not found', 404);
    }

    // If marking as completed, set completed_at timestamp
    const finalUpdates: Record<string, unknown> = { ...updates };
    if (updates.status === 'completed' && existing.status !== 'completed') {
      finalUpdates.completed_at = new Date().toISOString();
    } else if (updates.status && updates.status !== 'completed') {
      finalUpdates.completed_at = null;
    }

    // Update action
    const { data: action, error: updateError } = await supabase
      .from('actions')
      .update(finalUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Update failed', { error: updateError.message });
      return apiError('Failed to update action', 500);
    }

    logger.success('Action updated', {
      actionId: id,
      fields: Object.keys(updates),
    });

    return apiResponse(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/actions/[id] - Delete action
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Deleting action', { actionId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Delete action
    const { error } = await supabase
      .from('actions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Action not found', 404);
      }
      logger.error('Delete failed', { error: error.message });
      return apiError('Failed to delete action', 500);
    }

    logger.success('Action deleted', { actionId: id });
    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
