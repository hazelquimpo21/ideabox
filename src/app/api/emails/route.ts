/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue
/**
 * 📧 Emails API Route
 *
 * Handles listing emails with filtering, pagination, and search.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/emails
 *   List emails with optional filtering
 *   Query params: category, clientId, unread, starred, archived, search, page, limit
 *   Returns: Paginated list of emails with X-Total-Count header
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * List action-required emails:
 *   GET /api/emails?category=action_required
 *
 * List unread emails for a client:
 *   GET /api/emails?clientId=uuid&unread=true
 *
 * Search emails:
 *   GET /api/emails?search=proposal&limit=20
 *
 * @module app/api/emails/route
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  apiError,
  paginatedResponse,
  getPagination,
  validateQuery,
  requireAuth,
} from '@/lib/api/utils';
import { emailQuerySchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('API:Emails');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/emails - List emails
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  logger.start('Fetching emails list');

  try {
    // Initialize Supabase client with user context
    const supabase = await createServerClient();

    // Verify authentication
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) return userResult;
    const user = userResult;

    // Validate query parameters
    const queryResult = validateQuery(request, emailQuerySchema);
    if (queryResult instanceof Response) return queryResult;
    const {
      category,
      clientId,
      unread,
      starred,
      archived,
      search,
      contactEmail,
      direction,
      sender,
    } = queryResult;

    // Get pagination parameters
    const pagination = getPagination(request);
    const { limit, offset } = pagination;

    // Build query
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    // ─────────────────────────────────────────────────────────────────────────────
    // Apply contact email and direction filters (for CRM contact detail page)
    // ─────────────────────────────────────────────────────────────────────────────
    // For the "all" direction, we need to handle this specially because the
    // PostgREST or() filter has issues with email addresses containing special chars
    let useSpecialAllQuery = false;
    if (contactEmail) {
      const emailDirection = direction || 'all';

      logger.debug('Filtering by contact email', {
        contactEmail,
        direction: emailDirection,
      });

      switch (emailDirection) {
        case 'received':
          // Emails received FROM the contact (they are the sender)
          query = query.eq('sender_email', contactEmail);
          break;
        case 'sent':
          // Emails sent TO the contact (user is sender, contact is in recipients)
          // Check if contact email is in to_addresses array
          query = query.contains('to_addresses', [contactEmail]);
          break;
        case 'all':
        default:
          // For "all" direction, we'll do two separate queries and merge
          // This avoids the problematic or() filter with array contains
          useSpecialAllQuery = true;
          break;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Handle "all" direction with two separate queries (more robust)
    // ─────────────────────────────────────────────────────────────────────────────
    if (useSpecialAllQuery && contactEmail) {
      // Build base query options for both queries
      const baseFilters = {
        user_id: user.id,
        is_archived: archived === true ? true : false,
        ...(category && { category }),
        ...(clientId && { client_id: clientId }),
        ...(unread !== undefined && { is_read: !unread }),
        ...(starred !== undefined && { is_starred: starred }),
      };

      // Query 1: Emails received FROM the contact
      let receivedQuery = supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('sender_email', contactEmail)
        .eq('is_archived', archived === true ? true : false);

      // Query 2: Emails sent TO the contact
      let sentQuery = supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .contains('to_addresses', [contactEmail])
        .eq('is_archived', archived === true ? true : false);

      // Apply additional filters to both queries
      if (category) {
        receivedQuery = receivedQuery.eq('category', category);
        sentQuery = sentQuery.eq('category', category);
      }
      if (clientId) {
        receivedQuery = receivedQuery.eq('client_id', clientId);
        sentQuery = sentQuery.eq('client_id', clientId);
      }
      if (unread !== undefined) {
        receivedQuery = receivedQuery.eq('is_read', !unread);
        sentQuery = sentQuery.eq('is_read', !unread);
      }
      if (starred !== undefined) {
        receivedQuery = receivedQuery.eq('is_starred', starred);
        sentQuery = sentQuery.eq('is_starred', starred);
      }
      if (search) {
        receivedQuery = receivedQuery.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
        sentQuery = sentQuery.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
      }

      // Execute both queries in parallel
      const [receivedResult, sentResult] = await Promise.all([
        receivedQuery.order('date', { ascending: false }),
        sentQuery.order('date', { ascending: false }),
      ]);

      if (receivedResult.error) {
        logger.error('Received query failed', { error: receivedResult.error.message });
        return apiError('Failed to fetch emails', 500);
      }
      if (sentResult.error) {
        logger.error('Sent query failed', { error: sentResult.error.message });
        return apiError('Failed to fetch emails', 500);
      }

      // Merge and deduplicate by email ID
      const emailMap = new Map();
      const receivedEmails = receivedResult.data || [];
      const sentEmails = sentResult.data || [];

      // Add received emails first
      for (const email of receivedEmails) {
        emailMap.set(email.id, { ...email, direction: 'received' });
      }
      // Add sent emails (may overwrite if same email is in both - which is unlikely)
      for (const email of sentEmails) {
        if (!emailMap.has(email.id)) {
          emailMap.set(email.id, { ...email, direction: 'sent' });
        }
      }

      // Convert to array and sort by date descending
      let mergedEmails = Array.from(emailMap.values());
      mergedEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Calculate total count (approximate - may have duplicates counted twice)
      const totalCount = (receivedResult.count || 0) + (sentResult.count || 0) -
        (mergedEmails.length < receivedEmails.length + sentEmails.length ?
          receivedEmails.length + sentEmails.length - mergedEmails.length : 0);

      // Apply pagination to merged results
      const paginatedEmails = mergedEmails.slice(offset, offset + limit);

      logger.success('Emails fetched (all direction)', {
        received: receivedEmails.length,
        sent: sentEmails.length,
        merged: mergedEmails.length,
        paginated: paginatedEmails.length,
        total: totalCount,
        userId: user.id,
      });

      return paginatedResponse(
        paginatedEmails,
        pagination,
        mergedEmails.length, // Use actual merged count for accurate pagination
        request.url
      );
    }

    // Legacy sender filter (for backwards compatibility with inbox?sender=)
    if (sender && !contactEmail) {
      logger.debug('Filtering by sender (legacy)', { sender });
      query = query.ilike('sender_email', `%${sender}%`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Apply standard filters
    // ─────────────────────────────────────────────────────────────────────────────
    if (category) {
      query = query.eq('category', category);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (unread !== undefined) {
      query = query.eq('is_read', !unread);
    }

    if (starred !== undefined) {
      query = query.eq('is_starred', starred);
    }

    // By default, exclude archived unless explicitly requested
    if (archived === true) {
      query = query.eq('is_archived', true);
    } else if (archived === false || archived === undefined) {
      query = query.eq('is_archived', false);
    }

    // Apply text search on subject and snippet
    if (search) {
      query = query.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
    }

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      logger.error('Database query failed', { error: error.message });
      return apiError('Failed to fetch emails', 500);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Enrich emails with direction field when filtering by contactEmail
    // This allows the UI to show sent/received badges in the "all" view
    // ─────────────────────────────────────────────────────────────────────────────
    let enrichedData = data || [];
    if (contactEmail && enrichedData.length > 0) {
      const normalizedContactEmail = contactEmail.toLowerCase();
      enrichedData = enrichedData.map((email) => {
        // Check if contact is the sender (received) or in recipients (sent)
        const isSender = email.sender_email?.toLowerCase() === normalizedContactEmail;
        const isRecipient = email.to_addresses?.some(
          (addr: string) => addr.toLowerCase() === normalizedContactEmail
        );

        return {
          ...email,
          direction: isSender ? 'received' : isRecipient ? 'sent' : 'unknown',
        };
      });

      logger.debug('Enriched emails with direction', {
        total: enrichedData.length,
        received: enrichedData.filter((e) => e.direction === 'received').length,
        sent: enrichedData.filter((e) => e.direction === 'sent').length,
      });
    }

    logger.success('Emails fetched', {
      count: enrichedData.length,
      total: count,
      userId: user.id,
    });

    return paginatedResponse(
      enrichedData,
      pagination,
      count || 0,
      request.url
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return apiError('Internal server error', 500);
  }
}
