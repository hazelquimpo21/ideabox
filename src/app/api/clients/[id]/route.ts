/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 🏢 Client Detail API Route
 *
 * Handles operations on a single client by ID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/clients/[id]
 *   Fetch a single client by ID
 *   Returns: Client object with email and action counts
 *
 * PATCH /api/clients/[id]
 *   Update client properties
 *   Body: { name?, company?, priority?, status?, ... }
 *   Returns: Updated client object
 *
 * DELETE /api/clients/[id]
 *   Archive a client (soft delete)
 *   Returns: Success confirmation
 *
 * @module app/api/clients/[id]/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { clientUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Client');

/** Route params type */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/clients/[id] - Get single client
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching client', { clientId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Fetch client
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Client not found', 404);
      }
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch client', 500);
    }

    // Fetch related counts (emails and actions)
    const [emailsResult, actionsResult] = await Promise.all([
      supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .eq('user_id', user.id),
      supabase
        .from('actions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ]);

    const clientWithStats = {
      ...client,
      email_count: emailsResult.count || 0,
      pending_actions_count: actionsResult.count || 0,
    };

    logger.success('Client fetched', { clientId: id });
    return apiResponse(clientWithStats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/clients/[id] - Update client
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Updating client', { clientId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate request body
    const bodyResult = await validateBody(request, clientUpdateSchema);
    if (bodyResult instanceof Response) return bodyResult;
    const updates = bodyResult;

    // Verify client exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return apiError('Client not found', 404);
    }

    // Update client
    const { data: client, error: updateError } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Update failed', { error: updateError.message });
      return apiError('Failed to update client', 500);
    }

    logger.success('Client updated', {
      clientId: id,
      fields: Object.keys(updates),
    });

    return apiResponse(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/clients/[id] - Archive client (soft delete)
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Archiving client', { clientId: id });

  try {
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Soft delete: mark as archived
    const { error } = await supabase
      .from('clients')
      .update({ status: 'archived' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError('Client not found', 404);
      }
      logger.error('Archive failed', { error: error.message });
      return apiError('Failed to archive client', 500);
    }

    logger.success('Client archived', { clientId: id });
    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
