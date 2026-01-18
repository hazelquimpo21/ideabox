/**
 * Initial Sync API Route
 *
 * POST /api/onboarding/initial-sync
 *
 * Triggers the initial email batch analysis for a new user.
 * This is called when the user clicks "Finish Setup" in onboarding.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUEST FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "maxEmails": 50,       // Optional, default: 50
 *   "includeRead": true    // Optional, default: true
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE FORMAT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Success (200):
 * ```json
 * {
 *   "success": true,
 *   "stats": { ... },
 *   "categories": [ ... ],
 *   "clientInsights": [ ... ],
 *   "failures": [ ... ],
 *   "suggestedActions": [ ... ]
 * }
 * ```
 *
 * Error (4xx/5xx):
 * ```json
 * {
 *   "success": false,
 *   "error": "Error message",
 *   "canRetry": true
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * IMPORTANT NOTES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - This endpoint assumes emails have already been synced from Gmail to the database
 * - It only performs AI analysis on unanalyzed emails
 * - Progress updates are stored in user_profiles.sync_progress for polling
 * - The frontend should poll /api/onboarding/sync-status for progress
 *
 * @module app/api/onboarding/initial-sync/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { createInitialSyncOrchestrator } from '@/services/sync';
import { INITIAL_SYNC_CONFIG } from '@/config/initial-sync';
import type {
  InitialSyncRequest,
  InitialSyncResponse,
  InitialSyncError,
} from '@/types/discovery';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger('API:InitialSync');

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Validate request body.
 */
function isValidRequest(body: unknown): body is InitialSyncRequest {
  if (!body || typeof body !== 'object') {
    return true; // Empty body is valid (uses defaults)
  }

  const b = body as Record<string, unknown>;

  // maxEmails must be a positive integer if provided
  if (b.maxEmails !== undefined) {
    if (typeof b.maxEmails !== 'number' || b.maxEmails < 1 || b.maxEmails > 200) {
      return false;
    }
  }

  // includeRead must be a boolean if provided
  if (b.includeRead !== undefined && typeof b.includeRead !== 'boolean') {
    return false;
  }

  return true;
}

// =============================================================================
// POST HANDLER
// =============================================================================

/**
 * POST /api/onboarding/initial-sync
 *
 * Triggers the initial email batch analysis.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<InitialSyncResponse | InitialSyncError>> {
  const startTime = Date.now();

  try {
    logger.info('Initial sync request received');

    // ─────────────────────────────────────────────────────────────────────────
    // Authentication
    // ─────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized initial sync request', {
        error: authError?.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          canRetry: false,
        },
        { status: 401 }
      );
    }

    logger.info('Authenticated user for initial sync', { userId: user.id });

    // ─────────────────────────────────────────────────────────────────────────
    // Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────
    let body: InitialSyncRequest = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      logger.warn('Invalid JSON in request body');
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    if (!isValidRequest(body)) {
      logger.warn('Invalid request body', { body });
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request parameters. maxEmails must be 1-200, includeRead must be boolean.',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Check if onboarding already completed
    // ─────────────────────────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed, initial_sync_completed_at')
      .eq('id', user.id)
      .single();

    if (profile?.initial_sync_completed_at) {
      logger.warn('Initial sync already completed', { userId: user.id });
      return NextResponse.json(
        {
          success: false,
          error: 'Initial sync has already been completed. Use settings to re-analyze.',
          canRetry: false,
        },
        { status: 409 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Get user's Gmail account
    // ─────────────────────────────────────────────────────────────────────────
    const { data: gmailAccounts, error: accountError } = await supabase
      .from('gmail_accounts')
      .select('id, email')
      .eq('user_id', user.id)
      .eq('sync_enabled', true)
      .limit(1);

    if (accountError || !gmailAccounts || gmailAccounts.length === 0) {
      logger.error('No Gmail account found', {
        userId: user.id,
        error: accountError?.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'No Gmail account connected. Please connect your Gmail account first.',
          canRetry: false,
        },
        { status: 400 }
      );
    }

    const gmailAccount = gmailAccounts[0];

    logger.info('Found Gmail account for sync', {
      userId: user.id,
      gmailAccountId: gmailAccount.id,
      email: gmailAccount.email,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Create and execute orchestrator
    // ─────────────────────────────────────────────────────────────────────────
    const orchestrator = createInitialSyncOrchestrator({
      userId: user.id,
      gmailAccountId: gmailAccount.id,
      maxEmails: body.maxEmails ?? INITIAL_SYNC_CONFIG.maxEmails,
      includeRead: body.includeRead ?? INITIAL_SYNC_CONFIG.includeRead,
    });

    logger.info('Starting initial sync orchestrator', {
      userId: user.id,
      gmailAccountId: gmailAccount.id,
      maxEmails: body.maxEmails ?? INITIAL_SYNC_CONFIG.maxEmails,
    });

    // Execute the sync
    const result = await orchestrator.execute();

    const totalTime = Date.now() - startTime;

    logger.info('Initial sync completed successfully', {
      userId: user.id,
      stats: result.stats,
      totalTimeMs: totalTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const totalTime = Date.now() - startTime;

    logger.error('Initial sync failed', {
      error: errorMessage,
      totalTimeMs: totalTime,
    });

    // Determine if error is retryable
    const isRetryable =
      errorMessage.includes('timeout') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('network');

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        canRetry: isRetryable,
        retryAfterMs: isRetryable ? 5000 : undefined,
      },
      { status: 500 }
    );
  }
}
