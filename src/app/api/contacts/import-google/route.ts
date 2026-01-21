/**
 * Import Google Contacts API Route
 *
 * Imports contacts from Google People API for the current user.
 * This enables better VIP suggestions during onboarding by importing:
 * - Starred contacts (excellent VIP candidates)
 * - Contact groups/labels (for relationship categorization)
 * - Contact photos (for avatars)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/contacts/import-google
 *   Imports contacts from Google for all connected Gmail accounts.
 *
 *   Body (optional):
 *   {
 *     accountId?: string,      // Import from specific account only
 *     maxContacts?: number,    // Maximum contacts to import (default: 100)
 *     starredOnly?: boolean,   // Only import starred contacts
 *   }
 *
 *   Returns:
 *   {
 *     imported: number,        // Number of contacts imported
 *     starred: number,         // Number of starred contacts
 *     skipped: number,         // Number of contacts skipped (no email, etc.)
 *     errors: string[]         // Any errors encountered
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * REQUIRED OAUTH SCOPE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This endpoint requires the user to have granted the contacts.readonly scope.
 * If the scope is not available, returns 403 Forbidden with instructions to
 * re-authorize.
 *
 * @module app/api/contacts/import-google/route
 * @version 1.0.0
 * @since January 2026
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { TokenManager } from '@/lib/gmail/token-manager';
import { contactService } from '@/services/contacts';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('API:ImportGoogleContacts');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/contacts/import-google
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  logger.start('Importing Google contacts');

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthorized Google contacts import request');
      return userResult;
    }
    const user = userResult;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 2: Parse request body
    // ─────────────────────────────────────────────────────────────────────────────
    let body: {
      accountId?: string;
      maxContacts?: number;
      starredOnly?: boolean;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Empty body is fine - use defaults
    }

    const { accountId, maxContacts = 100, starredOnly = false } = body;

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 3: Get Gmail accounts to import from
    // ─────────────────────────────────────────────────────────────────────────────
    let query = supabase
      .from('gmail_accounts')
      .select('id, email, access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .eq('sync_enabled', true);

    if (accountId) {
      query = query.eq('id', accountId);
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError) {
      logger.error('Failed to fetch Gmail accounts', {
        error: accountsError.message,
      });
      return NextResponse.json(
        { error: 'Failed to fetch Gmail accounts' },
        { status: 500 }
      );
    }

    if (!accounts || accounts.length === 0) {
      logger.warn('No Gmail accounts found for user');
      return NextResponse.json(
        { error: 'No Gmail accounts found. Connect a Gmail account first.' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 4: Import contacts from each account
    // ─────────────────────────────────────────────────────────────────────────────
    const tokenManager = new TokenManager(supabase);
    let totalImported = 0;
    let totalStarred = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    for (const account of accounts) {
      logger.info('Importing contacts from account', {
        accountId: account.id.substring(0, 8),
        email: account.email,
      });

      try {
        // Get valid access token
        const accessToken = await tokenManager.getValidToken(account);

        // Import contacts using ContactService
        const result = await contactService.importFromGoogle({
          userId: user.id,
          accessToken,
          accountId: account.id,
          maxContacts,
          starredOnly,
        });

        totalImported += result.imported;
        totalStarred += result.starred;
        totalSkipped += result.skipped;
        allErrors.push(...result.errors);

        logger.info('Account import complete', {
          accountId: account.id.substring(0, 8),
          imported: result.imported,
          starred: result.starred,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        // Check if this is a scope/permission error
        if (message.includes('403') || message.includes('scope') || message.includes('permission')) {
          logger.warn('Contacts scope not available for account', {
            accountId: account.id.substring(0, 8),
          });
          allErrors.push(`${account.email}: Contacts permission not granted`);
        } else {
          logger.error('Failed to import from account', {
            accountId: account.id.substring(0, 8),
            error: message,
          });
          allErrors.push(`${account.email}: ${message}`);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Check if any imports succeeded
    // ─────────────────────────────────────────────────────────────────────────────
    if (totalImported === 0 && allErrors.length > 0) {
      // All accounts failed - check if it's a permission issue
      const isPermissionIssue = allErrors.some(
        (e) => e.includes('permission') || e.includes('scope')
      );

      if (isPermissionIssue) {
        logger.info('Contacts permission not available');
        return NextResponse.json(
          {
            error: 'Contacts permission not granted',
            needsReauthorization: true,
          },
          { status: 403 }
        );
      }
    }

    logger.success('Google contacts import complete', {
      userId: user.id.substring(0, 8),
      totalImported,
      totalStarred,
      totalSkipped,
      errorCount: allErrors.length,
    });

    return NextResponse.json({
      imported: totalImported,
      starred: totalStarred,
      skipped: totalSkipped,
      errors: allErrors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error importing Google contacts', { error: message });

    return NextResponse.json(
      { error: 'Failed to import contacts' },
      { status: 500 }
    );
  }
}
