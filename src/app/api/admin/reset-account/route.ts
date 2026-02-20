/**
 * Superadmin API: Reset Account Data
 *
 * POST /api/admin/reset-account
 *
 * Completely wipes a user's synced data and resets their account to a
 * pre-onboarding state. This is a development/testing tool that allows
 * superadmins to start fresh without creating a new account.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT GETS DELETED (user-generated/synced data)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - emails              - All synced emails and their metadata
 * - email_analyses      - AI analysis results for emails
 * - actions             - Extracted to-do items
 * - extracted_dates     - Timeline dates pulled from emails
 * - contacts            - Contact intelligence records
 * - contact_aliases     - Multi-email mappings
 * - user_event_states   - Event dismiss/accept decisions
 * - sync_logs           - Sync operation history
 * - api_usage_logs      - Cost tracking records
 * - gmail_push_logs     - Push notification audit trail
 * - outbound_emails     - Sent/draft/scheduled emails
 * - email_open_events   - Open tracking events
 * - email_campaigns     - Mail merge campaigns
 * - email_templates     - Saved email templates
 * - daily_send_quotas   - Send rate limiting records
 * - scheduled_sync_runs - Background sync tracking
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT GETS RESET (preserved but cleared)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - user_profiles       - onboarding_completed → false, sync_progress → null,
 *                         sender_patterns → [], initial_sync_* fields cleared
 * - gmail_accounts      - last_sync_at → null, last_history_id → null,
 *                         historical_sync_status → 'not_started', watch state cleared
 * - user_context        - onboarding_completed → false, onboarding_step → 0
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT'S PRESERVED (never touched)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - auth.users          - Supabase auth record (login still works)
 * - user_profiles       - email, full_name, timezone (identity fields)
 * - user_settings       - AI toggles, cost limits, notification prefs
 * - gmail_accounts      - OAuth tokens (access_token, refresh_token, email)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Requires authentication
 * - Requires superadmin email (checked against SUPERADMIN_EMAILS list)
 * - Uses service role client to bypass RLS for cross-table deletes
 * - All operations are logged with structured metadata
 *
 * @module api/admin/reset-account
 * @since February 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { isSuperAdmin } from '@/config/superadmin';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:ResetAccount');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request body for account reset.
 */
interface ResetRequest {
  /** The user ID to reset. If omitted, resets the authenticated user's own account. */
  targetUserId?: string;
}

/**
 * Result of deleting rows from a single table.
 */
interface TableDeleteResult {
  table: string;
  deletedCount: number;
  error?: string;
}

/**
 * Full response from the reset operation.
 */
interface ResetResponse {
  success: boolean;
  data?: {
    targetUserId: string;
    resetBy: string;
    tablesCleared: TableDeleteResult[];
    profileReset: boolean;
    gmailAccountsReset: boolean;
    totalRowsDeleted: number;
    durationMs: number;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE DELETION ORDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tables to delete from, ordered to respect foreign key constraints.
 * Child tables (those with foreign keys) are listed BEFORE parent tables.
 *
 * Example: email_analyses references emails, so it must be deleted first.
 */
const TABLES_TO_DELETE = [
  // --- Child tables first (depend on emails) ---
  'email_analyses',
  'extracted_dates',
  'email_open_events',

  // --- Tables referencing contacts ---
  'contact_aliases',

  // --- Tables referencing emails or standalone ---
  'actions',
  'user_event_states',
  'outbound_emails',
  'email_campaigns',
  'email_templates',
  'daily_send_quotas',

  // --- Core data tables ---
  'emails',
  'contacts',

  // --- Audit/log tables ---
  'sync_logs',
  'api_usage_logs',
  'gmail_push_logs',
  'scheduled_sync_runs',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/reset-account
 *
 * Resets a user's account by deleting all synced data and resetting
 * profile/sync state back to pre-onboarding. Requires superadmin access.
 *
 * @param request - Next.js request with optional { targetUserId } body
 * @returns JSON response with deletion results and counts
 */
export async function POST(request: NextRequest): Promise<NextResponse<ResetResponse>> {
  const operationId = `reset-${Date.now()}`;
  const startTime = Date.now();

  logger.start('Account reset requested', { operationId });

  try {
    // =========================================================================
    // STEP 1: Authenticate the requesting user
    // =========================================================================
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication failed for reset request', {
        operationId,
        error: authError?.message ?? 'No user session',
      });
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    logger.info('User authenticated for reset', {
      operationId,
      userId: user.id,
      email: user.email,
    });

    // =========================================================================
    // STEP 2: Verify superadmin access
    // =========================================================================
    if (!isSuperAdmin(user.email)) {
      logger.warn('Non-superadmin attempted account reset', {
        operationId,
        userId: user.id,
        email: user.email,
      });
      return NextResponse.json(
        { success: false, error: 'Forbidden: superadmin access required' },
        { status: 403 }
      );
    }

    logger.info('Superadmin access verified', {
      operationId,
      adminEmail: user.email,
    });

    // =========================================================================
    // STEP 3: Parse request body to get target user ID
    // =========================================================================
    let targetUserId = user.id; // Default: reset own account

    try {
      const body: ResetRequest = await request.json();
      if (body.targetUserId) {
        targetUserId = body.targetUserId;
        logger.info('Resetting a different user account', {
          operationId,
          adminUserId: user.id,
          targetUserId,
        });
      }
    } catch {
      // Empty body is fine — will reset the authenticated user's own account
      logger.debug('No request body provided, resetting own account', {
        operationId,
        targetUserId,
      });
    }

    // =========================================================================
    // STEP 4: Verify target user exists
    // =========================================================================
    // Use service client to bypass RLS and check across all users
    const serviceClient = createServiceClient();

    const { data: targetProfile, error: profileError } = await serviceClient
      .from('user_profiles')
      .select('id, email, full_name, onboarding_completed')
      .eq('id', targetUserId)
      .single();

    if (profileError || !targetProfile) {
      logger.error('Target user not found', {
        operationId,
        targetUserId,
        error: profileError?.message,
      });
      return NextResponse.json(
        { success: false, error: `User not found: ${targetUserId}` },
        { status: 404 }
      );
    }

    logger.info('Target user found, beginning reset', {
      operationId,
      targetUserId,
      targetEmail: targetProfile.email,
      targetName: targetProfile.full_name,
      wasOnboarded: targetProfile.onboarding_completed,
    });

    // =========================================================================
    // STEP 5: Delete all user data from each table
    // =========================================================================
    // Using service client to bypass RLS for reliable cross-table deletes.
    // Tables are processed in order to respect foreign key constraints.
    const deleteResults: TableDeleteResult[] = [];
    let totalRowsDeleted = 0;

    for (const table of TABLES_TO_DELETE) {
      logger.debug('Deleting from table', {
        operationId,
        table,
        targetUserId,
      });

      try {
        // Count rows before deletion (for logging)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (serviceClient as any)
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', targetUserId);

        const rowCount = count ?? 0;

        if (rowCount > 0) {
          // Perform the actual deletion
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: deleteError } = await (serviceClient as any)
            .from(table)
            .delete()
            .eq('user_id', targetUserId);

          if (deleteError) {
            logger.warn('Failed to delete from table', {
              operationId,
              table,
              targetUserId,
              error: deleteError.message,
              code: deleteError.code,
            });
            deleteResults.push({
              table,
              deletedCount: 0,
              error: deleteError.message,
            });
          } else {
            logger.info('Table cleared', {
              operationId,
              table,
              deletedCount: rowCount,
            });
            deleteResults.push({ table, deletedCount: rowCount });
            totalRowsDeleted += rowCount;
          }
        } else {
          logger.debug('Table already empty, skipping', {
            operationId,
            table,
          });
          deleteResults.push({ table, deletedCount: 0 });
        }
      } catch (err) {
        // Some tables may not exist yet (e.g., if migrations haven't been run)
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('Error accessing table (may not exist)', {
          operationId,
          table,
          error: errorMessage,
        });
        deleteResults.push({
          table,
          deletedCount: 0,
          error: errorMessage,
        });
      }
    }

    logger.info('All table deletions complete', {
      operationId,
      totalRowsDeleted,
      tablesProcessed: TABLES_TO_DELETE.length,
    });

    // =========================================================================
    // STEP 6: Reset user_profiles to pre-onboarding state
    // =========================================================================
    logger.info('Resetting user_profiles to pre-onboarding state', {
      operationId,
      targetUserId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileResetError } = await (serviceClient as any)
      .from('user_profiles')
      .update({
        onboarding_completed: false,
        sync_progress: null,
        initial_sync_completed_at: null,
        initial_sync_pending: false,
        initial_sync_triggered_at: null,
        sender_patterns: '[]',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (profileResetError) {
      logger.error('Failed to reset user_profiles', {
        operationId,
        targetUserId,
        error: profileResetError.message,
      });
    } else {
      logger.success('user_profiles reset to pre-onboarding state', {
        operationId,
        targetUserId,
      });
    }

    // =========================================================================
    // STEP 7: Reset gmail_accounts sync state (keep OAuth tokens)
    // =========================================================================
    logger.info('Resetting gmail_accounts sync state', {
      operationId,
      targetUserId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gmailResetError } = await (serviceClient as any)
      .from('gmail_accounts')
      .update({
        // Clear sync state so next sync starts fresh
        last_sync_at: null,
        last_history_id: null,
        needs_full_sync: false,
        sync_lock_until: null,
        history_id_validated_at: null,

        // Clear push notification state
        watch_expiration: null,
        watch_history_id: null,
        watch_resource_id: null,
        last_push_at: null,
        watch_renewal_failures: 0,
        watch_last_error: null,
        watch_alert_sent_at: null,

        // Reset historical sync
        historical_sync_status: 'not_started',
        historical_sync_oldest_date: null,
        historical_sync_email_count: 0,
        historical_sync_contacts_updated: 0,
        historical_sync_started_at: null,
        historical_sync_completed_at: null,
        historical_sync_page_token: null,
        historical_sync_error: null,

        // Reset contacts sync
        contacts_synced_at: null,
        contacts_sync_enabled: false,

        updated_at: new Date().toISOString(),
      })
      .eq('user_id', targetUserId);

    if (gmailResetError) {
      logger.error('Failed to reset gmail_accounts', {
        operationId,
        targetUserId,
        error: gmailResetError.message,
      });
    } else {
      logger.success('gmail_accounts sync state reset (OAuth tokens preserved)', {
        operationId,
        targetUserId,
      });
    }

    // =========================================================================
    // STEP 8: Reset user_context onboarding state (keep personal context)
    // =========================================================================
    logger.info('Resetting user_context onboarding flags', {
      operationId,
      targetUserId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: contextResetError } = await (serviceClient as any)
      .from('user_context')
      .update({
        onboarding_completed: false,
        onboarding_step: 0,
        onboarding_completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', targetUserId);

    if (contextResetError) {
      // user_context may not exist for this user — that's fine
      logger.debug('user_context reset skipped or failed', {
        operationId,
        targetUserId,
        error: contextResetError.message,
      });
    } else {
      logger.success('user_context onboarding flags reset', {
        operationId,
        targetUserId,
      });
    }

    // =========================================================================
    // STEP 9: Build and return response
    // =========================================================================
    const durationMs = Date.now() - startTime;

    logger.success('Account reset completed successfully', {
      operationId,
      targetUserId,
      targetEmail: targetProfile.email,
      resetBy: user.email,
      totalRowsDeleted,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      data: {
        targetUserId,
        resetBy: user.email ?? user.id,
        tablesCleared: deleteResults,
        profileReset: !profileResetError,
        gmailAccountsReset: !gmailResetError,
        totalRowsDeleted,
        durationMs,
      },
    });
  } catch (error) {
    // =========================================================================
    // UNEXPECTED ERROR HANDLER
    // =========================================================================
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Unexpected error during account reset', {
      operationId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred during account reset.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET HANDLER - Returns endpoint documentation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/reset-account
 *
 * Returns usage instructions for the reset endpoint.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/admin/reset-account',
    method: 'POST',
    description: 'Completely resets a user account — wipes all synced data and returns to pre-onboarding state.',
    security: 'Requires authentication + superadmin email',
    usage: {
      resetSelf: 'POST /api/admin/reset-account with empty body or {}',
      resetOther: 'POST /api/admin/reset-account with { "targetUserId": "uuid" }',
    },
    whatGetsDeleted: [
      'emails', 'email_analyses', 'actions', 'extracted_dates',
      'contacts', 'contact_aliases', 'user_event_states',
      'outbound_emails', 'email_open_events', 'email_campaigns',
      'email_templates', 'daily_send_quotas',
      'sync_logs', 'api_usage_logs', 'gmail_push_logs', 'scheduled_sync_runs',
    ],
    whatGetsReset: [
      'user_profiles (onboarding_completed, sync_progress, sender_patterns)',
      'gmail_accounts (sync state, history ID, watch state — OAuth tokens preserved)',
      'user_context (onboarding_step, onboarding_completed)',
    ],
    whatIsPreserved: [
      'auth.users (Supabase auth record)',
      'user_profiles (email, full_name, timezone)',
      'user_settings (AI toggles, cost limits, notifications)',
      'gmail_accounts (OAuth tokens, email address)',
    ],
  });
}
