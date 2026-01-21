/**
 * Historical Email Sync API Route
 *
 * Syncs email metadata from historical periods to populate contact
 * communication history for CRM features. This sync is metadata-only
 * (no email bodies) and does not use AI analysis, resulting in zero
 * OpenAI costs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/contacts/historical-sync
 *   Starts historical email sync for contact CRM data.
 *
 *   Body (optional):
 *   {
 *     accountId?: string,     // Sync specific account only
 *     monthsBack?: number,    // How far back to sync (default: 12)
 *   }
 *
 *   Returns:
 *   {
 *     success: boolean,
 *     message: string,
 *     results: [{
 *       accountId: string,
 *       emailsSynced: number,
 *       contactsUpdated: number,
 *       oldestEmailDate: string | null,
 *     }]
 *   }
 *
 * GET /api/contacts/historical-sync
 *   Gets historical sync status for all connected accounts.
 *
 *   Returns:
 *   {
 *     accounts: [{
 *       accountId: string,
 *       accountEmail: string,
 *       status: 'not_started' | 'in_progress' | 'completed' | 'failed',
 *       emailCount: number,
 *       contactsUpdated: number,
 *       oldestDate: string | null,
 *       startedAt: string | null,
 *       completedAt: string | null,
 *       hasPageToken: boolean,
 *       error: string | null,
 *     }]
 *   }
 *
 * @module app/api/contacts/historical-sync/route
 * @version 1.0.0
 * @since January 2026
 * @see docs/HISTORICAL_SYNC_PLAN.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createHistoricalSyncService } from '@/services/sync';
import { createLogger } from '@/lib/utils/logger';
import { HISTORICAL_SYNC_CONFIG } from '@/config/historical-sync';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:HistoricalSync');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/historical-sync
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  logger.start('Getting historical sync status');

  try {
    // Authenticate
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    // Get status
    const service = createHistoricalSyncService(supabase, user.id);
    const accounts = await service.getStatus();

    logger.success('Historical sync status retrieved', {
      userId: user.id.substring(0, 8),
      accountCount: accounts.length,
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    logger.error('Failed to get historical sync status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/contacts/historical-sync
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Starting historical email sync');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized historical sync request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Parse request body
    // ─────────────────────────────────────────────────────────────────────────────
    let body: { accountId?: string; monthsBack?: number } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine
    }

    const accountId = body.accountId;
    const monthsBack = Math.min(
      body.monthsBack || HISTORICAL_SYNC_CONFIG.defaultMonthsBack,
      HISTORICAL_SYNC_CONFIG.maxMonthsBack
    );

    logger.info('Historical sync request', {
      userId: user.id.substring(0, 8),
      accountId: accountId?.substring(0, 8),
      monthsBack,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Create service and run sync
    // ─────────────────────────────────────────────────────────────────────────────
    const service = createHistoricalSyncService(supabase, user.id);

    let results;
    if (accountId) {
      // Sync specific account
      const result = await service.syncAccount(accountId, { monthsBack });
      results = [{ accountId, ...result }];
    } else {
      // Sync all accounts
      const allResults = await service.syncAll({ monthsBack });

      // Get account IDs for results
      const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id, email')
        .eq('user_id', user.id)
        .eq('sync_enabled', true);

      results = allResults.map((result, index) => ({
        accountId: accounts?.[index]?.id || 'unknown',
        accountEmail: accounts?.[index]?.email || 'unknown',
        ...result,
      }));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Return results
    // ─────────────────────────────────────────────────────────────────────────────
    const totalEmails = results.reduce((sum, r) => sum + r.emailsSynced, 0);
    const totalContacts = results.reduce((sum, r) => sum + r.contactsUpdated, 0);
    const allSuccess = results.every((r) => r.success);

    logger.success('Historical sync completed', {
      userId: user.id.substring(0, 8),
      totalEmails,
      totalContacts,
      allSuccess,
    });

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess
        ? `Synced ${totalEmails.toLocaleString()} emails, updated ${totalContacts.toLocaleString()} contacts`
        : 'Some accounts failed to sync',
      results,
    });
  } catch (error) {
    logger.error('Historical sync failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
