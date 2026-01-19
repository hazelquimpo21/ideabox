/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Contact Detail API Route
 *
 * Handles operations on a single contact by ID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/contacts/[id]
 *   Fetch a single contact with full details and stats
 *   Returns: Contact object with email threads summary
 *
 * PUT /api/contacts/[id]
 *   Update contact properties
 *   Body: { is_vip?, is_muted?, relationship_type?, name?, birthday?, ... }
 *   Returns: Updated contact object
 *
 * DELETE /api/contacts/[id]
 *   Delete a contact (hard delete - contacts are auto-recreated from emails)
 *   Returns: Success confirmation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Get contact:
 *   GET /api/contacts/123e4567-e89b-12d3-a456-426614174000
 *
 * Mark as VIP:
 *   PUT /api/contacts/[id]
 *   { "is_vip": true }
 *
 * Mute contact:
 *   PUT /api/contacts/[id]
 *   { "is_muted": true }
 *
 * Update relationship:
 *   PUT /api/contacts/[id]
 *   { "relationship_type": "client", "name": "John Smith" }
 *
 * @module app/api/contacts/[id]/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { contactUpdateSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:Contact');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route params type for Next.js 15 App Router.
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/contacts/[id] - Get single contact
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Fetching contact', { contactId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized contact request', { contactId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Fetch contact
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('Contact not found', { contactId: id.substring(0, 8) });
        return apiError('Contact not found', 404);
      }
      logger.error('Database query failed', {
        error: error.message,
        contactId: id.substring(0, 8),
      });
      return apiError('Failed to fetch contact', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Fetch related email count (for additional stats)
    // ─────────────────────────────────────────────────────────────────────────────
    const { count: recentEmailCount } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('sender_email', contact.email)
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Return enriched contact data
    // ─────────────────────────────────────────────────────────────────────────────
    const enrichedContact = {
      ...contact,
      recent_email_count: recentEmailCount || 0,
    };

    logger.success('Contact fetched', {
      contactId: id.substring(0, 8),
      email: contact.email.substring(0, 10) + '...',
    });

    return apiResponse(enrichedContact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in GET /api/contacts/[id]', {
      error: message,
      contactId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/contacts/[id] - Update contact
// ═══════════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Updating contact', { contactId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized contact update', { contactId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, contactUpdateSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid contact update body', { contactId: id.substring(0, 8) });
      return bodyResult;
    }
    const updates = bodyResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Verify contact exists and belongs to user
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Contact not found for update', { contactId: id.substring(0, 8) });
      return apiError('Contact not found', 404);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Update contact
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: contact, error: updateError } = await supabase
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Contact update failed', {
        error: updateError.message,
        contactId: id.substring(0, 8),
      });
      return apiError('Failed to update contact', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Return updated contact
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Contact updated', {
      contactId: id.substring(0, 8),
      fields: Object.keys(updates),
    });

    return apiResponse(contact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in PUT /api/contacts/[id]', {
      error: message,
      contactId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/contacts/[id] - Delete contact
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  logger.start('Deleting contact', { contactId: id.substring(0, 8) });

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized contact delete', { contactId: id.substring(0, 8) });
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Verify contact exists
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Contact not found for delete', { contactId: id.substring(0, 8) });
      return apiError('Contact not found', 404);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Delete contact
    // Note: This is a hard delete. Contacts will be re-created when new
    // emails from this sender are processed.
    // ─────────────────────────────────────────────────────────────────────────────
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      logger.error('Contact delete failed', {
        error: deleteError.message,
        contactId: id.substring(0, 8),
      });
      return apiError('Failed to delete contact', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Return success
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Contact deleted', {
      contactId: id.substring(0, 8),
      email: existing.email.substring(0, 10) + '...',
    });

    return apiResponse({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in DELETE /api/contacts/[id]', {
      error: message,
      contactId: id.substring(0, 8),
    });
    return apiError('Internal server error', 500);
  }
}
