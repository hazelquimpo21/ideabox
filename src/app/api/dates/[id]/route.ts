/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Extracted Date Detail API Route
 *
 * Handles operations on a single extracted date by ID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/dates/[id]
 *   Fetch a single extracted date with related info
 *   Returns: Extracted date object with email and contact details
 *
 * POST /api/dates/[id]
 *   Perform an action on the date (acknowledge, snooze, hide)
 *   Body: { action: "acknowledge" | "snooze" | "hide", snooze_until?: "YYYY-MM-DD" }
 *   Returns: Updated extracted date object
 *
 * DELETE /api/dates/[id]
 *   Delete an extracted date (e.g., if incorrectly extracted)
 *   Returns: Success confirmation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Get date:
 *   GET /api/dates/123e4567-e89b-12d3-a456-426614174000
 *
 * Acknowledge date:
 *   POST /api/dates/[id]
 *   { "action": "acknowledge" }
 *
 * Snooze date:
 *   POST /api/dates/[id]
 *   { "action": "snooze", "snooze_until": "2026-01-25" }
 *
 * Hide date:
 *   POST /api/dates/[id]
 *   { "action": "hide" }
 *
 * @module app/api/dates/[id]/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { extractedDateActionSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:Date');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route params type for Next.js 15 App Router.
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/dates/[id] - Get single extracted date
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching extracted date', { dateId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized date request', { dateId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch extracted date with related data
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: extractedDate, error } = await supabase
      .from('extracted_dates')
      .select(`
        *,
        emails:email_id (
          id,
          subject,
          sender_name,
          sender_email,
          snippet,
          date
        ),
        contacts:contact_id (
          id,
          name,
          email,
          is_vip
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('Extracted date not found', { dateId: id.substring(0, 8) });
        return apiError('Date not found', 404);
      }
      logger.error('Database query failed', {
        error: error.message,
        dateId: id.substring(0, 8),
      });
      return apiError('Failed to fetch date', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Return extracted date
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Extracted date fetched', {
      dateId: id.substring(0, 8),
      type: extractedDate.date_type,
    });

    return apiResponse(extractedDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in GET /api/dates/[id]', {
      error: message,
      dateId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/dates/[id] - Perform action on date
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Performing action on extracted date', { dateId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized date action', { dateId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, extractedDateActionSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid date action body', { dateId: id.substring(0, 8) });
      return bodyResult;
    }
    const { action, snooze_until } = bodyResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Verify date exists and belongs to user
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('extracted_dates')
      .select('id, date_type, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Extracted date not found for action', { dateId: id.substring(0, 8) });
      return apiError('Date not found', 404);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Build update based on action
    // ─────────────────────────────────────────────────────────────────────────────
    let updates: Record<string, unknown> = {};

    switch (action) {
      case 'acknowledge':
        updates = {
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        };
        logger.debug('Acknowledging date', { dateId: id.substring(0, 8) });
        break;

      case 'snooze':
        // Snooze moves the date to the snooze_until date
        // We'll use a custom column or just update the priority to lower it
        updates = {
          // For now, we'll mark as acknowledged with the snooze date
          // A more sophisticated system would have a separate snooze mechanism
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          // Store snooze info in description or a metadata field
          // For simplicity, we'll add it to description
          description: `Snoozed until ${snooze_until}. Original: ${existing.title}`,
        };
        logger.debug('Snoozing date', { dateId: id.substring(0, 8), until: snooze_until });
        break;

      case 'hide':
        // Hide reduces priority to minimum so it won't appear in Hub
        updates = {
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          priority_score: 0, // Lowest priority
        };
        logger.debug('Hiding date', { dateId: id.substring(0, 8) });
        break;

      default:
        // This shouldn't happen due to schema validation
        logger.error('Unknown action', { action, dateId: id.substring(0, 8) });
        return apiError('Invalid action', 400);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Update the extracted date
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: updatedDate, error: updateError } = await supabase
      .from('extracted_dates')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Date action update failed', {
        error: updateError.message,
        dateId: id.substring(0, 8),
        action,
      });
      return apiError('Failed to perform action', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Return updated date
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Date action completed', {
      dateId: id.substring(0, 8),
      action,
    });

    return apiResponse(updatedDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in POST /api/dates/[id]', {
      error: message,
      dateId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/dates/[id] - Delete extracted date
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Deleting extracted date', { dateId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized date delete', { dateId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Verify date exists
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('extracted_dates')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Extracted date not found for delete', { dateId: id.substring(0, 8) });
      return apiError('Date not found', 404);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Delete the extracted date
    // ─────────────────────────────────────────────────────────────────────────────
    const { error: deleteError } = await supabase
      .from('extracted_dates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      logger.error('Date delete failed', {
        error: deleteError.message,
        dateId: id.substring(0, 8),
      });
      return apiError('Failed to delete date', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Return success
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Extracted date deleted', {
      dateId: id.substring(0, 8),
      title: existing.title,
    });

    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in DELETE /api/dates/[id]', {
      error: message,
      dateId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}
