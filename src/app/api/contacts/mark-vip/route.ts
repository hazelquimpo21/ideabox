/**
 * Mark VIP Contacts API Route
 *
 * Marks selected contacts as VIPs for email prioritization.
 * VIP contacts appear at the top of the inbox with special highlighting.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/contacts/mark-vip
 *   Marks the specified contacts as VIPs.
 *
 *   Body:
 *   {
 *     contactIds: string[]     // Array of contact IDs to mark as VIP
 *   }
 *
 *   Returns:
 *   {
 *     marked: number           // Number of contacts marked as VIP
 *   }
 *
 * @module app/api/contacts/mark-vip/route
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

const logger = createLogger('API:MarkVip');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/contacts/mark-vip
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Marking contacts as VIP');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized mark VIP request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Parse request body
    // ─────────────────────────────────────────────────────────────────────────────
    let body: { contactIds?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds)) {
      return NextResponse.json(
        { error: 'contactIds must be an array of strings' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Validate contact IDs are UUIDs
    // ─────────────────────────────────────────────────────────────────────────────
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validIds = contactIds.filter((id) => uuidRegex.test(id));

    if (validIds.length !== contactIds.length) {
      logger.warn('Some contact IDs are not valid UUIDs', {
        provided: contactIds.length,
        valid: validIds.length,
      });
    }

    if (validIds.length === 0) {
      return NextResponse.json({ marked: 0 });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Mark contacts as VIP using ContactService
    // ─────────────────────────────────────────────────────────────────────────────
    const marked = await contactService.markAsVip(user.id, validIds);

    logger.success('Contacts marked as VIP', {
      userId: user.id.substring(0, 8),
      requested: validIds.length,
      marked,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Also update user_context.vip_emails for backwards compatibility
    // The user_context table stores VIP emails as a string array, which is used
    // by the AI for email prioritization.
    // ─────────────────────────────────────────────────────────────────────────────
    try {
      // Fetch the emails for the marked contacts
      const { data: contacts } = await supabase
        .from('contacts')
        .select('email')
        .in('id', validIds);

      if (contacts && contacts.length > 0) {
        const vipEmails = contacts.map((c) => c.email);

        // Merge with existing VIP emails
        const { data: existingContext } = await supabase
          .from('user_context')
          .select('vip_emails')
          .eq('user_id', user.id)
          .single();

        const existingVips: string[] = existingContext?.vip_emails || [];
        const mergedVips = [...new Set([...existingVips, ...vipEmails])];

        // Upsert the user_context
        await supabase
          .from('user_context')
          .upsert({
            user_id: user.id,
            vip_emails: mergedVips,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          });

        logger.debug('Updated user_context.vip_emails', {
          userId: user.id.substring(0, 8),
          vipCount: mergedVips.length,
        });
      }
    } catch (err) {
      // Non-critical error - log but don't fail the request
      logger.warn('Failed to update user_context.vip_emails', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return NextResponse.json({ marked });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error marking contacts as VIP', { error: message });

    return NextResponse.json(
      { error: 'Failed to mark contacts as VIP' },
      { status: 500 }
    );
  }
}
