/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Event State API Route
 *
 * Manages user decisions about events: dismiss, save to maybe, track calendar saves.
 * This endpoint provides CRUD operations for the user_event_states table.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This API allows users to:
 * - Dismiss events they're not interested in
 * - Save events to a "maybe" watch list
 * - Track when they've added events to their calendar
 * - Remove any of these states (un-dismiss, remove from maybe, etc.)
 *
 * The states are stored separately from the AI analysis data, keeping user
 * preferences distinct from generated content.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/events/[id]/state
 *   Get all states for a specific event (dismissed, maybe, saved_to_calendar)
 *
 * POST /api/events/[id]/state
 *   Add a state to an event
 *   Body: { state: 'dismissed' | 'maybe' | 'saved_to_calendar', notes?: string }
 *
 * DELETE /api/events/[id]/state
 *   Remove a state from an event
 *   Body: { state: 'dismissed' | 'maybe' | 'saved_to_calendar' }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dismiss an event:
 *   POST /api/events/abc123/state
 *   { "state": "dismissed" }
 *
 * Save to maybe list:
 *   POST /api/events/abc123/state
 *   { "state": "maybe", "notes": "Check schedule first" }
 *
 * Track calendar save:
 *   POST /api/events/abc123/state
 *   { "state": "saved_to_calendar" }
 *
 * Un-dismiss an event:
 *   DELETE /api/events/abc123/state
 *   { "state": "dismissed" }
 *
 * @module app/api/events/[id]/state/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:EventState');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid event state values.
 * - dismissed: User doesn't want to see this event
 * - maybe: User is interested but not committed
 * - saved_to_calendar: User has added to their calendar
 */
type EventState = 'dismissed' | 'maybe' | 'saved_to_calendar';

/**
 * Event state record from the database.
 */
interface EventStateRecord {
  id: string;
  user_id: string;
  email_id: string;
  state: EventState;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema for POST request body.
 * Validates state value and optional notes.
 */
const addStateSchema = z.object({
  state: z.enum(['dismissed', 'maybe', 'saved_to_calendar'], {
    errorMap: () => ({
      message: 'State must be one of: dismissed, maybe, saved_to_calendar',
    }),
  }),
  notes: z
    .string()
    .max(500, 'Notes must be 500 characters or less')
    .optional(),
});

/**
 * Schema for DELETE request body.
 * Only requires the state to remove.
 */
const removeStateSchema = z.object({
  state: z.enum(['dismissed', 'maybe', 'saved_to_calendar'], {
    errorMap: () => ({
      message: 'State must be one of: dismissed, maybe, saved_to_calendar',
    }),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the event ID from the route params.
 * The event ID is actually an email ID in the current implementation.
 *
 * @param params - Route parameters
 * @returns Event/Email ID
 */
function getEventId(params: { id: string }): string {
  return params.id;
}

/**
 * Validates that the email exists and belongs to the user.
 * This prevents users from adding states to emails they don't own.
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param emailId - Email/Event ID
 * @returns true if valid, error response if not
 */
async function validateEmailOwnership(
  supabase: any,
  userId: string,
  emailId: string
): Promise<true | Response> {
  logger.debug('Validating email ownership', {
    userId: userId.substring(0, 8),
    emailId: emailId.substring(0, 8),
  });

  const { data: email, error } = await supabase
    .from('emails')
    .select('id')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single();

  if (error || !email) {
    logger.warn('Email not found or not owned by user', {
      userId: userId.substring(0, 8),
      emailId: emailId.substring(0, 8),
      error: error?.message,
    });
    return apiError('Event not found', 404);
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/events/[id]/state - Get all states for an event
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all states for a specific event.
 *
 * Returns an array of state names (e.g., ['dismissed', 'maybe']) along with
 * the full state records including notes and timestamps.
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "eventId": "abc123",
 *     "states": ["maybe", "saved_to_calendar"],
 *     "records": [
 *       { "state": "maybe", "notes": "Check schedule", "created_at": "..." },
 *       { "state": "saved_to_calendar", "notes": null, "created_at": "..." }
 *     ]
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const resolvedParams = await params;
  const eventId = getEventId(resolvedParams);

  logger.start('Getting event states', { eventId: eventId.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized GET request', { eventId: eventId.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    logger.debug('User authenticated', {
      userId: user.id.substring(0, 8),
      eventId: eventId.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch states from database
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: records, error } = await supabase
      .from('user_event_states')
      .select('*')
      .eq('user_id', user.id)
      .eq('email_id', eventId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to fetch event states', {
        eventId: eventId.substring(0, 8),
        error: error.message,
        code: error.code,
      });
      return apiError(`Failed to fetch states: ${error.message}`, 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Format and return response
    // ─────────────────────────────────────────────────────────────────────────────
    const states = (records || []).map((r: EventStateRecord) => r.state);

    const durationMs = Date.now() - startTime;
    logger.success('Event states retrieved', {
      eventId: eventId.substring(0, 8),
      stateCount: states.length,
      states,
      durationMs,
    });

    return apiResponse({
      eventId,
      states,
      records: records || [],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in GET /api/events/[id]/state', {
      eventId: eventId.substring(0, 8),
      error: message,
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/events/[id]/state - Add a state to an event
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a state to an event.
 *
 * If the state already exists, returns 409 Conflict.
 * Otherwise, creates the state and returns 201 Created.
 *
 * @example Request:
 * POST /api/events/abc123/state
 * { "state": "maybe", "notes": "Check schedule first" }
 *
 * @example Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "...",
 *     "state": "maybe",
 *     "notes": "Check schedule first",
 *     "created_at": "..."
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const resolvedParams = await params;
  const eventId = getEventId(resolvedParams);

  logger.start('Adding event state', { eventId: eventId.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized POST request', { eventId: eventId.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    logger.debug('User authenticated for state add', {
      userId: user.id.substring(0, 8),
      eventId: eventId.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, addStateSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid request body', { eventId: eventId.substring(0, 8) });
      return bodyResult;
    }
    const { state, notes } = bodyResult;

    logger.debug('Request body validated', {
      eventId: eventId.substring(0, 8),
      state,
      hasNotes: !!notes,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Validate email ownership
    // ─────────────────────────────────────────────────────────────────────────────
    const ownershipResult = await validateEmailOwnership(supabase, user.id, eventId);
    if (ownershipResult !== true) {
      return ownershipResult;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Check if state already exists
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existingState } = await supabase
      .from('user_event_states')
      .select('id')
      .eq('user_id', user.id)
      .eq('email_id', eventId)
      .eq('state', state)
      .single();

    if (existingState) {
      logger.warn('State already exists', {
        eventId: eventId.substring(0, 8),
        state,
      });
      return apiError(`Event already has state: ${state}`, 409);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Insert new state
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: newState, error } = await supabase
      .from('user_event_states')
      .insert({
        user_id: user.id,
        email_id: eventId,
        state,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to insert event state', {
        eventId: eventId.substring(0, 8),
        state,
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return apiError(`Failed to add state: ${error.message}`, 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Return success response
    // ─────────────────────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    logger.success('Event state added', {
      eventId: eventId.substring(0, 8),
      state,
      stateId: newState.id.substring(0, 8),
      durationMs,
    });

    return apiResponse(newState, 201);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in POST /api/events/[id]/state', {
      eventId: eventId.substring(0, 8),
      error: message,
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/events/[id]/state - Remove a state from an event
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Remove a state from an event.
 *
 * If the state doesn't exist, returns 404 Not Found.
 * Otherwise, deletes the state and returns 200 OK.
 *
 * @example Request:
 * DELETE /api/events/abc123/state
 * { "state": "dismissed" }
 *
 * @example Response (200):
 * {
 *   "success": true,
 *   "data": { "removed": "dismissed" }
 * }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const resolvedParams = await params;
  const eventId = getEventId(resolvedParams);

  logger.start('Removing event state', { eventId: eventId.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized DELETE request', { eventId: eventId.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    logger.debug('User authenticated for state removal', {
      userId: user.id.substring(0, 8),
      eventId: eventId.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, removeStateSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid request body for deletion', { eventId: eventId.substring(0, 8) });
      return bodyResult;
    }
    const { state } = bodyResult;

    logger.debug('Delete request validated', {
      eventId: eventId.substring(0, 8),
      state,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Delete the state
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: deletedState, error } = await supabase
      .from('user_event_states')
      .delete()
      .eq('user_id', user.id)
      .eq('email_id', eventId)
      .eq('state', state)
      .select()
      .single();

    if (error) {
      // Check if it's a "not found" error vs actual error
      if (error.code === 'PGRST116') {
        logger.warn('State not found for deletion', {
          eventId: eventId.substring(0, 8),
          state,
        });
        return apiError(`Event does not have state: ${state}`, 404);
      }

      logger.error('Failed to delete event state', {
        eventId: eventId.substring(0, 8),
        state,
        error: error.message,
        code: error.code,
      });
      return apiError(`Failed to remove state: ${error.message}`, 500);
    }

    if (!deletedState) {
      logger.warn('No state found to delete', {
        eventId: eventId.substring(0, 8),
        state,
      });
      return apiError(`Event does not have state: ${state}`, 404);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Return success response
    // ─────────────────────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    logger.success('Event state removed', {
      eventId: eventId.substring(0, 8),
      state,
      durationMs,
    });

    return apiResponse({ removed: state });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in DELETE /api/events/[id]/state', {
      eventId: eventId.substring(0, 8),
      error: message,
    });
    return apiError('Internal server error', 500);
  }
}
