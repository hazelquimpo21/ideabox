/**
 * Gmail Accounts API Route
 *
 * Fetches and manages connected Gmail accounts for the authenticated user.
 * Used by the Settings page to display real account data.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/gmail/accounts
 *   Returns all Gmail accounts connected to the authenticated user.
 *   Response: { accounts: GmailAccount[] }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Requires authentication
 * - Users can only see their own accounts
 * - Sensitive fields (tokens) are NOT returned to the client
 *
 * @module app/api/gmail/accounts/route
 * @since January 2026
 */

import { createServerClient } from '@/lib/supabase/server';
import { apiResponse, apiError, requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:GmailAccounts');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/gmail/accounts - List connected accounts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns all Gmail accounts connected to the authenticated user.
 *
 * NOTE: Sensitive fields (access_token, refresh_token) are excluded from response.
 *
 * @returns JSON response with accounts array
 *
 * @example Response:
 * ```json
 * {
 *   "accounts": [
 *     {
 *       "id": "uuid",
 *       "email": "user@gmail.com",
 *       "display_name": "John Doe",
 *       "last_sync_at": "2026-01-20T10:30:00Z",
 *       "sync_enabled": true,
 *       "created_at": "2026-01-15T08:00:00Z"
 *     }
 *   ]
 * }
 * ```
 */
export async function GET() {
  logger.start('Fetching Gmail accounts');

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate user
    // ─────────────────────────────────────────────────────────────────────────
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized access attempt to Gmail accounts');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch accounts (excluding sensitive token fields)
    // ─────────────────────────────────────────────────────────────────────────
    const { data: accounts, error } = await supabase
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
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to fetch Gmail accounts', {
        userId: user.id.substring(0, 8),
        error: error.message,
      });
      return apiError('Failed to fetch accounts', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Return response
    // ─────────────────────────────────────────────────────────────────────────
    logger.success('Gmail accounts fetched', {
      userId: user.id.substring(0, 8),
      count: accounts?.length || 0,
    });

    return apiResponse({ accounts: accounts || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching Gmail accounts', { error: message });
    return apiError('Internal server error', 500);
  }
}
