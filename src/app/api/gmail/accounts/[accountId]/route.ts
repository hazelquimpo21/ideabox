/**
 * Gmail Account Management API Route
 *
 * Handles operations on individual Gmail accounts (delete/disconnect).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * DELETE /api/gmail/accounts/[accountId]
 *   Disconnects a Gmail account from the user's IdeaBox.
 *   - Deletes the gmail_account record
 *   - Associated emails are cascade deleted via FK constraint
 *   - Cannot disconnect the primary (first/only) account
 *
 * GET /api/gmail/accounts/[accountId]
 *   Returns details for a specific Gmail account.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Requires authentication
 * - Users can only manage their own accounts
 * - RLS policies enforce row-level access
 *
 * @module app/api/gmail/accounts/[accountId]/route
 * @since January 2026
 */

import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:GmailAccount');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RouteParams {
  params: Promise<{ accountId: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/gmail/accounts/[accountId] - Get single account details
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns details for a specific Gmail account.
 * Useful for getting status or details of a single account.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { accountId } = await params;
  logger.start('Fetching Gmail account', { accountId });

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Fetch the account (RLS ensures user can only see their own)
    const { data: account, error } = await supabase
      .from('gmail_accounts')
      .select(`
        id,
        email,
        display_name,
        last_sync_at,
        sync_enabled,
        created_at,
        updated_at
      `)
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (error || !account) {
      logger.warn('Gmail account not found', {
        accountId,
        userId: user.id.substring(0, 8),
        error: error?.message,
      });
      return apiError('Account not found', 404);
    }

    logger.success('Gmail account fetched', { accountId });
    return apiResponse({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching Gmail account', { error: message });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/gmail/accounts/[accountId] - Disconnect account
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Disconnects (deletes) a Gmail account from the user's IdeaBox.
 *
 * IMPORTANT: This is a destructive action that also deletes all associated emails
 * due to the CASCADE foreign key constraint on the emails table.
 *
 * Restrictions:
 * - Cannot delete your only account (must have at least 1)
 * - The primary account (first connected) cannot be deleted unless it's the only one
 *
 * @returns JSON response with success status
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { accountId } = await params;
  logger.start('Disconnecting Gmail account', { accountId });

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Verify account exists and belongs to user
    // ─────────────────────────────────────────────────────────────────────────
    const { data: account, error: fetchError } = await supabase
      .from('gmail_accounts')
      .select('id, email, created_at')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !account) {
      logger.warn('Cannot disconnect: account not found or not owned', {
        accountId,
        userId: user.id.substring(0, 8),
      });
      return apiError('Account not found', 404);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Check if this is the only account (prevent orphaning)
    // ─────────────────────────────────────────────────────────────────────────
    const { count: accountCount } = await supabase
      .from('gmail_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (accountCount === 1) {
      logger.warn('Cannot disconnect: only account', {
        accountId,
        userId: user.id.substring(0, 8),
      });
      return apiError(
        'Cannot disconnect your only account. Add another account first, or delete your entire IdeaBox account.',
        400
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Check if this is the primary account (first created)
    // ─────────────────────────────────────────────────────────────────────────
    const { data: allAccounts } = await supabase
      .from('gmail_accounts')
      .select('id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const isPrimary = allAccounts && allAccounts[0]?.id === accountId;

    if (isPrimary) {
      logger.warn('Cannot disconnect: primary account', {
        accountId,
        userId: user.id.substring(0, 8),
      });
      return apiError(
        'Cannot disconnect your primary account. This is the account you originally signed up with.',
        400
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Delete the account (cascade deletes emails)
    // ─────────────────────────────────────────────────────────────────────────
    const { error: deleteError } = await supabase
      .from('gmail_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id);

    if (deleteError) {
      logger.error('Failed to delete Gmail account', {
        accountId,
        userId: user.id.substring(0, 8),
        error: deleteError.message,
      });
      return apiError('Failed to disconnect account', 500);
    }

    logger.success('Gmail account disconnected', {
      accountId,
      email: account.email,
      userId: user.id.substring(0, 8),
    });

    return apiResponse({
      success: true,
      message: `Account ${account.email} has been disconnected.`,
      accountId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error disconnecting Gmail account', { error: message });
    return apiError('Internal server error', 500);
  }
}
