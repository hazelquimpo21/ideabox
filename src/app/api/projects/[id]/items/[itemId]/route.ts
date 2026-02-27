/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Project Item Detail API Route
 *
 * GET /api/projects/[id]/items/[itemId] — Fetch a single item
 * PATCH /api/projects/[id]/items/[itemId] — Update item properties
 * DELETE /api/projects/[id]/items/[itemId] — Delete item
 *
 * @module app/api/projects/[id]/items/[itemId]/route
 * @since February 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, validateBody, requireAuth } from '@/lib/api/utils';
import { projectItemUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:ProjectItem');

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/projects/[id]/items/[itemId]
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  logger.start('Fetching project item', { itemId });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const { data: item, error } = await supabase
      .from('project_items')
      .select('*, projects ( id, name, color )')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiError('Item not found', 404);
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch item', 500);
    }

    logger.success('Project item fetched', { itemId });
    return apiResponse(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/projects/[id]/items/[itemId]
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  logger.start('Updating project item', { itemId });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const bodyResult = await validateBody(request, projectItemUpdateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const updates = bodyResult;

    // Check existing status for completed_at logic
    const { data: existing } = await supabase
      .from('project_items')
      .select('id, status')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (!existing) return apiError('Item not found', 404);

    const finalUpdates: Record<string, unknown> = { ...updates };
    if (updates.status === 'completed' && existing.status !== 'completed') {
      finalUpdates.completed_at = new Date().toISOString();
    } else if (updates.status && updates.status !== 'completed') {
      finalUpdates.completed_at = null;
    }

    const { data: item, error } = await supabase
      .from('project_items')
      .update(finalUpdates)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      logger.error('Update failed', { error: error.message });
      return apiError('Failed to update item', 500);
    }

    logger.success('Project item updated', { itemId, fields: Object.keys(updates) });
    return apiResponse(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/projects/[id]/items/[itemId]
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  logger.start('Deleting project item', { itemId });

  try {
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    const { error } = await supabase
      .from('project_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (error) {
      logger.error('Delete failed', { error: error.message });
      return apiError('Failed to delete item', 500);
    }

    logger.success('Project item deleted', { itemId });
    return apiResponse({ success: true, id: itemId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
