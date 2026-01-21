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
 * Also supports fetching all contacts for the "All Contacts" view.
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
 *   - includeAll: If true, returns all contacts (not just suggestions)
 *
 *   Returns:
 *   {
 *     suggestions: VipSuggestion[],
 *     hasContactsPermission: boolean
 *   }
 *
 * @module app/api/contacts/vip-suggestions/route
 * @version 1.1.0
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
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches all contacts (not just suggestions) for the "All Contacts" view.
 * Returns contacts ordered by email count, excluding archived and already-VIP.
 */
async function getAllContacts(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  limit: number
) {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, email, name, email_count, last_seen_at, relationship_type, is_vip')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .eq('is_vip', false)
    .order('email_count', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Error fetching all contacts', { error: error.message });
    return [];
  }

  // Transform to match VipSuggestion format
  interface ContactRow {
    id: string;
    email: string;
    name: string | null;
    email_count: number | null;
    last_seen_at: string | null;
    relationship_type: string | null;
    is_vip: boolean;
  }

  return (data || []).map((row: ContactRow) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: null,
    emailCount: row.email_count || 0,
    lastSeenAt: row.last_seen_at,
    isGoogleStarred: false,
    googleLabels: [],
    relationshipType: row.relationship_type,
    suggestionReason: '', // No suggestion reason for all contacts view
  }));
}

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
    const includeAll = searchParams.get('includeAll') === 'true';

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Check if user has contacts permission
    // ─────────────────────────────────────────────────────────────────────────────
    // We check if any Gmail account has contacts_sync_enabled
    const { data: accounts } = await supabase
      .from('gmail_accounts')
      .select('contacts_sync_enabled')
      .eq('user_id', user.id);

    const hasContactsPermission = accounts?.some((a: { contacts_sync_enabled?: boolean }) => a.contacts_sync_enabled) || false;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Get contacts based on mode
    // ─────────────────────────────────────────────────────────────────────────────
    let suggestions;

    if (includeAll) {
      // Fetch all contacts (for "All Contacts" tab)
      suggestions = await getAllContacts(supabase, user.id, limit);
      logger.info('All contacts returned', {
        userId: user.id.substring(0, 8),
        count: suggestions.length,
      });
    } else {
      // Get VIP suggestions (for "Suggested" tab)
      suggestions = await contactService.getVipSuggestions(user.id, limit);
      logger.success('VIP suggestions returned', {
        userId: user.id.substring(0, 8),
        count: suggestions.length,
        hasContactsPermission,
      });
    }

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
