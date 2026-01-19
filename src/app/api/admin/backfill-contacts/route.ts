/**
 * Admin API: Backfill Contacts from Emails
 *
 * POST /api/admin/backfill-contacts
 *
 * This endpoint triggers the contact backfill process for a user. It populates
 * the contacts table from existing email data, enabling contact intelligence
 * features for users who signed up before the contacts feature existed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Backfill for current authenticated user:
 *    POST /api/admin/backfill-contacts
 *    Body: {}
 *
 * 2. Backfill for a specific user (admin only):
 *    POST /api/admin/backfill-contacts
 *    Body: { "userId": "uuid-of-user-to-backfill" }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Requires authentication
 * - Users can only backfill their own contacts (unless admin role added later)
 * - Uses Supabase RPC to call the database function with RLS
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT IT DOES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Aggregates all unique sender emails from the user's emails table
 * 2. Creates or updates contact records with:
 *    - email (lowercase normalized)
 *    - name (from email headers)
 *    - email_count (total emails)
 *    - first_seen_at (earliest email)
 *    - last_seen_at (most recent email)
 *    - received_count (emails received from contact)
 * 3. Uses ON CONFLICT to merge with existing contacts
 *
 * @module api/admin/backfill-contacts
 * @since January 2026
 * @see supabase/migrations/012_contacts.sql for the backfill_contacts_from_emails function
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:BackfillContacts');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request body for backfill endpoint.
 */
interface BackfillRequest {
  /** Optional user ID - if not provided, uses authenticated user */
  userId?: string;
}

/**
 * Response from the backfill operation.
 */
interface BackfillResponse {
  success: boolean;
  data?: {
    contactsProcessed: number;
    userId: string;
    message: string;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/backfill-contacts
 *
 * Triggers the contact backfill process for a user.
 *
 * @param request - Next.js request object
 * @returns JSON response with backfill results
 */
export async function POST(request: NextRequest): Promise<NextResponse<BackfillResponse>> {
  const operationId = `backfill-${Date.now()}`;

  logger.start('Contact backfill requested', { operationId });

  try {
    // =========================================================================
    // STEP 1: Authenticate user
    // =========================================================================
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      logger.error('Authentication failed', {
        operationId,
        errorMessage: authError.message,
        errorCode: authError.code,
      });
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    if (!user) {
      logger.warn('No authenticated user', { operationId });
      return NextResponse.json(
        { success: false, error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    logger.debug('User authenticated', { operationId, userId: user.id });

    // =========================================================================
    // STEP 2: Parse request body
    // =========================================================================
    let requestBody: BackfillRequest = {};

    try {
      const rawBody = await request.text();
      if (rawBody && rawBody.trim()) {
        requestBody = JSON.parse(rawBody);
      }
    } catch (parseError) {
      logger.warn('Failed to parse request body, using defaults', {
        operationId,
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
      });
      // Continue with empty body - will use authenticated user
    }

    // =========================================================================
    // STEP 3: Determine target user
    // =========================================================================
    // For now, users can only backfill their own contacts.
    // Future enhancement: Add admin role check to allow backfilling other users.
    // =========================================================================
    let targetUserId = user.id;

    if (requestBody.userId) {
      // Validate that the user is trying to backfill their own data
      // In the future, this could check for admin role
      if (requestBody.userId !== user.id) {
        logger.warn('User attempted to backfill another user', {
          operationId,
          requestingUserId: user.id,
          targetUserId: requestBody.userId,
        });
        return NextResponse.json(
          { success: false, error: 'You can only backfill your own contacts' },
          { status: 403 }
        );
      }
      targetUserId = requestBody.userId;
    }

    logger.info('Starting backfill operation', {
      operationId,
      targetUserId,
      requestedBy: user.id,
    });

    // =========================================================================
    // STEP 4: Call the database backfill function
    // =========================================================================
    // The backfill_contacts_from_emails function:
    // 1. Aggregates email senders from the emails table
    // 2. Creates/updates contact records with email counts and dates
    // 3. Returns the number of contacts processed
    //
    // Note: This function uses SECURITY DEFINER and has its own RLS handling.
    // =========================================================================
    const startTime = Date.now();

    const { data: contactsCount, error: backfillError } = await supabase.rpc(
      'backfill_contacts_from_emails',
      { p_user_id: targetUserId }
    );

    const durationMs = Date.now() - startTime;

    if (backfillError) {
      logger.error('Backfill database function failed', {
        operationId,
        targetUserId,
        durationMs,
        errorMessage: backfillError.message,
        errorCode: backfillError.code,
        errorDetails: backfillError.details,
        errorHint: backfillError.hint,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Backfill failed: ${backfillError.message}`,
        },
        { status: 500 }
      );
    }

    // =========================================================================
    // STEP 5: Return success response
    // =========================================================================
    const processedCount = contactsCount ?? 0;

    logger.success('Contact backfill completed successfully', {
      operationId,
      targetUserId,
      contactsProcessed: processedCount,
      durationMs,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          contactsProcessed: processedCount,
          userId: targetUserId,
          message: processedCount > 0
            ? `Successfully backfilled ${processedCount} contacts from existing emails.`
            : 'No new contacts to backfill (all contacts already exist or no emails found).',
        },
      },
      { status: 200 }
    );

  } catch (error) {
    // =========================================================================
    // UNEXPECTED ERROR HANDLING
    // =========================================================================
    // Catch any unexpected errors (network issues, etc.)
    // Log full error details for debugging but return sanitized message to client
    // =========================================================================
    logger.error('Unexpected error during contact backfill', {
      operationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during backfill. Please try again.',
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET HANDLER - Provide usage instructions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/backfill-contacts
 *
 * Returns usage instructions for this endpoint.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      endpoint: '/api/admin/backfill-contacts',
      method: 'POST',
      description: 'Backfill contacts from existing emails for the authenticated user.',
      usage: {
        basic: 'POST /api/admin/backfill-contacts with empty body or {}',
        withUserId: 'POST /api/admin/backfill-contacts with { "userId": "your-uuid" }',
      },
      notes: [
        'Requires authentication',
        'Users can only backfill their own contacts',
        'Safe to run multiple times (uses upsert)',
        'Returns count of contacts processed',
      ],
    },
    { status: 200 }
  );
}
