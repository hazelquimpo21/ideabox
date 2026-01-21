/**
 * Contact Stats API Route
 *
 * Returns aggregate statistics for a user's contacts.
 * These stats are global (not affected by filters) for dashboard display.
 *
 * GET /api/contacts/stats
 *   Returns:
 *   {
 *     total: number,           // All contacts
 *     vip: number,            // VIP contacts
 *     muted: number,          // Muted contacts
 *     clients: number,        // Contacts with relationship_type = 'client'
 *     lastGoogleSync: string | null,  // Last Google contacts sync timestamp
 *     needsEnrichment: number // Contacts awaiting AI enrichment
 *   }
 *
 * @module app/api/contacts/stats/route
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:ContactStats');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/stats
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      return userResult;
    }
    const user = userResult;

    logger.debug('Fetching contact stats', { userId: user.id.substring(0, 8) });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Get aggregate counts using parallel queries
    // ─────────────────────────────────────────────────────────────────────────────

    const [
      totalResult,
      vipResult,
      mutedResult,
      clientsResult,
      lastSyncResult,
    ] = await Promise.all([
      // Total contacts
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),

      // VIP contacts
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_vip', true),

      // Muted contacts
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_muted', true),

      // Client contacts
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('relationship_type', 'client'),

      // Last Google sync time (from gmail_accounts)
      supabase
        .from('gmail_accounts')
        .select('contacts_synced_at')
        .eq('user_id', user.id)
        .order('contacts_synced_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Build response
    // ─────────────────────────────────────────────────────────────────────────────

    const stats = {
      total: totalResult.count || 0,
      vip: vipResult.count || 0,
      muted: mutedResult.count || 0,
      clients: clientsResult.count || 0,
      lastGoogleSync: lastSyncResult.data?.contacts_synced_at || null,
    };

    logger.debug('Contact stats retrieved', stats);

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching contact stats', { error: message });

    return NextResponse.json(
      { error: 'Failed to fetch contact statistics' },
      { status: 500 }
    );
  }
}
