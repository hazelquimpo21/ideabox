/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Promote to Client API Route
 *
 * Promotes an existing contact to client status by setting is_client = TRUE
 * and populating client-specific fields (status, priority, email domains, keywords).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/contacts/promote
 *   Promote a contact to client status
 *
 *   Body: {
 *     contactId: string (UUID),
 *     clientStatus: 'active' | 'inactive' | 'archived',
 *     clientPriority: 'vip' | 'high' | 'medium' | 'low',
 *     emailDomains?: string[],
 *     keywords?: string[]
 *   }
 *
 *   Returns: Updated contact object with client fields
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Promote contact to active VIP client:
 *   POST /api/contacts/promote
 *   {
 *     "contactId": "123e4567-e89b-12d3-a456-426614174000",
 *     "clientStatus": "active",
 *     "clientPriority": "vip",
 *     "emailDomains": ["acme.com"],
 *     "keywords": ["project-x"]
 *   }
 *
 * @module app/api/contacts/promote/route
 * @version 1.0.0
 * @since February 2026 — Phase 3 Navigation Redesign
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiResponse,
  apiError,
  validateBody,
  requireAuth,
} from '@/lib/api/utils';
import { promoteToClientSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:PromoteToClient');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/contacts/promote - Promote contact to client
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Promoting contact to client');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized promote request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Validate request body
    // ─────────────────────────────────────────────────────────────────────────────
    const bodyResult = await validateBody(request, promoteToClientSchema);
    if (bodyResult instanceof Response) {
      logger.warn('Invalid promote request body');
      return bodyResult;
    }

    const {
      contactId,
      clientStatus,
      clientPriority,
      emailDomains,
      keywords,
    } = bodyResult;

    logger.info('Promote request validated', {
      contactId: contactId.substring(0, 8),
      clientStatus,
      clientPriority,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Verify contact exists and belongs to user
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('id, email, is_client')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      logger.warn('Contact not found for promote', {
        contactId: contactId.substring(0, 8),
      });
      return apiError('Contact not found', 404);
    }

    if (existing.is_client) {
      logger.info('Contact is already a client', {
        contactId: contactId.substring(0, 8),
      });
      // Still allow updating client fields even if already a client
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Update contact with client fields
    // ─────────────────────────────────────────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      is_client: true,
      client_status: clientStatus,
      client_priority: clientPriority,
      relationship_type: 'client',
      updated_at: new Date().toISOString(),
    };

    // Set VIP status if promoting to VIP priority
    if (clientPriority === 'vip') {
      updatePayload.is_vip = true;
    }

    // Optional fields
    if (emailDomains && emailDomains.length > 0) {
      updatePayload.email_domains = emailDomains;
    }

    if (keywords && keywords.length > 0) {
      updatePayload.keywords = keywords;
    }

    const { data: updatedContact, error: updateError } = await supabase
      .from('contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to promote contact', {
        error: updateError.message,
        contactId: contactId.substring(0, 8),
      });
      return apiError('Failed to promote contact to client', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Return updated contact
    // ─────────────────────────────────────────────────────────────────────────────
    logger.success('Contact promoted to client', {
      contactId: contactId.substring(0, 8),
      clientStatus,
      clientPriority,
      emailDomains: emailDomains?.length ?? 0,
      keywords: keywords?.length ?? 0,
    });

    return apiResponse(updatedContact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in POST /api/contacts/promote', {
      error: message,
    });
    return apiError('Internal server error', 500);
  }
}
