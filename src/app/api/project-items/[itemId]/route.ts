/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * Project Item Quick-Update API Route
 *
 * PATCH /api/project-items/[itemId] — Update any item by ID
 *   (for quick-complete from home page without knowing project)
 *
 * @module app/api/project-items/[itemId]/route
 * @since February 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, validateBody, requireAuth } from '@/lib/api/utils';
import { projectItemUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:ProjectItem:Quick');

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/project-items/[itemId]
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  logger.start('Quick-updating project item', { itemId });

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

    logger.success('Project item quick-updated', { itemId, fields: Object.keys(updates) });
    return apiResponse(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
