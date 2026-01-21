/**
 * VIP Suggestions API Route
 *
 * Returns contacts suggested as VIPs for onboarding or settings.
 * Suggestions are based on:
 * - Google starred contacts
 * - High email count
 * - Recent communication
 * - Contacts in important Google groups
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/contacts/vip-suggestions
 *   Returns VIP suggestions for the current user.
 *
 *   Query params:
 *   - limit: Maximum suggestions to return (default: 15)
 *
 *   Returns:
 *   {
 *     suggestions: VipSuggestion[],
 *     hasContactsPermission: boolean
 *   }
 *
 * @module app/api/contacts/vip-suggestions/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { contactService } from '@/services/contacts';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:VipSuggestions');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/vip-suggestions
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching VIP suggestions');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized VIP suggestions request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Parse query parameters
    // ─────────────────────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Check if user has contacts permission
    // ─────────────────────────────────────────────────────────────────────────────
    // We check if any Gmail account has contacts_sync_enabled
    const { data: accounts } = await supabase
      .from('gmail_accounts')
      .select('contacts_sync_enabled')
      .eq('user_id', user.id);

    const hasContactsPermission = accounts?.some((a) => a.contacts_sync_enabled) || false;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Get VIP suggestions from ContactService
    // ─────────────────────────────────────────────────────────────────────────────
    const suggestions = await contactService.getVipSuggestions(user.id, limit);

    logger.success('VIP suggestions returned', {
      userId: user.id.substring(0, 8),
      count: suggestions.length,
      hasContactsPermission,
    });

    return NextResponse.json({
      suggestions,
      hasContactsPermission,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching VIP suggestions', { error: message });

    return NextResponse.json(
      { error: 'Failed to fetch VIP suggestions' },
      { status: 500 }
    );
  }
}
