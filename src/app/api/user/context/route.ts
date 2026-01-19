/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issues with new tables
/**
 * User Context API Route
 *
 * Handles fetching and updating user context data for personalized AI analysis.
 * User context includes VIPs, location, priorities, work schedule, etc.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/user/context
 *   Fetches the user's context data.
 *   Returns: Full user_context row or empty defaults if not set up.
 *
 * PUT /api/user/context
 *   Updates user context fields (partial update supported).
 *   Body: Partial UserContextUpdate object.
 *   Returns: Updated user_context row.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Get context:
 *   GET /api/user/context
 *   Response: { success: true, data: { role: "Developer", ... } }
 *
 * Update priorities:
 *   PUT /api/user/context
 *   { "priorities": ["Work", "Family", "Learning"] }
 *
 * Add VIP email:
 *   PUT /api/user/context
 *   { "vip_emails": ["boss@company.com", "client@important.com"] }
 *
 * Update location:
 *   PUT /api/user/context
 *   { "location_city": "Milwaukee, WI", "location_metro": "Milwaukee metro" }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - 401: Not authenticated
 * - 400: Invalid request body (validation failed)
 * - 500: Database or server error
 *
 * @module app/api/user/context/route
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
import { userContextUpdateSchema } from '@/lib/api/schemas';
import {
  getUserContextRow,
  updateUserContext,
  createUserContext,
  invalidateContextCache,
} from '@/services/user-context';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:UserContext');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/user/context - Fetch user context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches the authenticated user's context data.
 *
 * Returns the full user_context row if it exists, or creates a new
 * empty record if this is the user's first time accessing their context.
 *
 * @param request - Next.js request object
 * @returns JSON response with user context data
 *
 * @example Response (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "user_id": "uuid",
 *     "role": "Developer",
 *     "company": "Acme Corp",
 *     "location_city": "Milwaukee, WI",
 *     "priorities": ["Work", "Family"],
 *     "vip_emails": ["boss@company.com"],
 *     "onboarding_completed": true,
 *     ...
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching user context');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized access attempt to user context');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch user context from database
    // ─────────────────────────────────────────────────────────────────────────
    let contextRow = await getUserContextRow(user.id);

    // If no context exists, create one with defaults
    if (!contextRow) {
      logger.info('No context found, creating new record', {
        userId: user.id.substring(0, 8),
      });

      const newContext = await createUserContext(user.id);
      if (!newContext) {
        logger.error('Failed to create user context', {
          userId: user.id.substring(0, 8),
        });
        return apiError('Failed to create user context', 500);
      }

      // Fetch the newly created row
      contextRow = await getUserContextRow(user.id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Return response
    // ─────────────────────────────────────────────────────────────────────────
    logger.success('User context fetched', {
      userId: user.id.substring(0, 8),
      onboardingCompleted: contextRow?.onboarding_completed ?? false,
      hasRole: !!contextRow?.role,
      hasLocation: !!contextRow?.location_city,
    });

    return apiResponse(contextRow);
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────
    // Error handling: Log and return generic error
    // ─────────────────────────────────────────────────────────────────────────
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching user context', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/user/context - Update user context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Updates the authenticated user's context data.
 *
 * Supports partial updates - only fields provided in the request body
 * will be updated. Other fields remain unchanged.
 *
 * @param request - Next.js request object with JSON body
 * @returns JSON response with updated user context data
 *
 * @example Request body:
 * ```json
 * {
 *   "priorities": ["Work", "Family", "Learning"],
 *   "vip_emails": ["boss@company.com", "client@vip.com"]
 * }
 * ```
 *
 * @example Response (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "priorities": ["Work", "Family", "Learning"],
 *     "vip_emails": ["boss@company.com", "client@vip.com"],
 *     ...
 *   }
 * }
 * ```
 */
export async function PUT(request: NextRequest) {
  logger.start('Updating user context');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized access attempt to update user context');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, userContextUpdateSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid request body for user context update', {
        userId: user.id.substring(0, 8),
      });
      return bodyResult;
    }
    const updateData = bodyResult;

    // Check that at least one field is provided
    if (Object.keys(updateData).length === 0) {
      logger.warn('Empty update request for user context', {
        userId: user.id.substring(0, 8),
      });
      return apiError('At least one field must be provided', 400);
    }

    logger.debug('Updating user context fields', {
      userId: user.id.substring(0, 8),
      fields: Object.keys(updateData),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Update context via service
    // ─────────────────────────────────────────────────────────────────────────
    // Note: The service handles upsert (creates if doesn't exist)
    const updatedContext = await updateUserContext(user.id, updateData);

    if (!updatedContext) {
      logger.error('Failed to update user context', {
        userId: user.id.substring(0, 8),
        fields: Object.keys(updateData),
      });
      return apiError('Failed to update user context', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Fetch and return the updated row
    // ─────────────────────────────────────────────────────────────────────────
    // We fetch the row again to return the full database format
    const contextRow = await getUserContextRow(user.id);

    logger.success('User context updated', {
      userId: user.id.substring(0, 8),
      fieldsUpdated: Object.keys(updateData).length,
    });

    return apiResponse(contextRow);
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────
    // Error handling: Log and return generic error
    // ─────────────────────────────────────────────────────────────────────────
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error updating user context', { error: message });
    return apiError('Internal server error', 500);
  }
}
