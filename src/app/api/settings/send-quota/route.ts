/**
 * Send Quota API Route
 *
 * Returns the user's current daily email send quota usage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```json
 * {
 *   "sent": 42,
 *   "limit": 400,
 *   "remaining": 358,
 *   "percentUsed": 10.5,
 *   "resetsAt": "2026-01-27T00:00:00Z"
 * }
 * ```
 *
 * @module app/api/settings/send-quota/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth, createApiError, createApiSuccess } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('SendQuotaAPI');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_DAILY_LIMIT = 400;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/settings/send-quota
 *
 * Returns the user's current daily send quota usage.
 */
export async function GET(request: NextRequest) {
  logger.start('Fetching send quota');

  try {
    const supabase = await createServerClient();

    // Authenticate user
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Get today's quota record
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const { data: quota, error } = await supabase
      .from('daily_send_quotas')
      .select('emails_sent, quota_limit')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    // If no record exists, user hasn't sent any emails today
    const sent = quota?.emails_sent || 0;
    const limit = quota?.quota_limit || DEFAULT_DAILY_LIMIT;
    const remaining = Math.max(0, limit - sent);
    const percentUsed = (sent / limit) * 100;

    // Calculate when quota resets (midnight UTC)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const resetsAt = tomorrow.toISOString();

    logger.success('Fetched send quota', {
      userId: user.id.substring(0, 8),
      sent,
      limit,
      remaining,
    });

    return createApiSuccess({
      sent,
      limit,
      remaining,
      percentUsed: Math.round(percentUsed * 10) / 10, // 1 decimal place
      resetsAt,
    });
  } catch (error) {
    logger.error('Unexpected error in send quota API', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return createApiError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
