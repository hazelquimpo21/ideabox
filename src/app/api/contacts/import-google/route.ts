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
import { updateSyncProgress } from '../sync-progress/route';

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
    // Step 4: Initialize progress tracking
    // ─────────────────────────────────────────────────────────────────────────────
    const tokenManager = new TokenManager(supabase);
    let totalImported = 0;
    let totalStarred = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    // Initialize progress in database for polling
    await updateSyncProgress(supabase, user.id, {
      status: 'in_progress',
      type: 'contacts',
      progress: 0,
      imported: 0,
      estimatedTotal: maxContacts * accounts.length,
      skipped: 0,
      message: `Starting import from ${accounts.length} account(s)...`,
      startedAt: new Date().toISOString(),
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 5: Import contacts from all accounts in parallel
    // ─────────────────────────────────────────────────────────────────────────────
    // Previously, accounts were processed sequentially in a for-loop, meaning
    // 3 accounts with 100 contacts each = 3x the wait time. Now each account
    // refreshes its token, fetches contacts, and batch-upserts independently.
    // Promise.allSettled() ensures one failing account doesn't block the others.

    logger.info('Starting parallel import for all accounts', {
      accountCount: accounts.length,
      accountEmails: accounts.map((a) => a.email),
    });

    await updateSyncProgress(supabase, user.id, {
      progress: 10,
      imported: 0,
      skipped: 0,
      message: `Importing from ${accounts.length} account(s) in parallel...`,
    });

    const importPromises = accounts.map(async (account) => {
      const accountTag = account.email; // for logging
      logger.info('Starting import for account', {
        accountId: account.id.substring(0, 8),
        email: accountTag,
      });

      try {
        // Each account independently refreshes its token
        const accessToken = await tokenManager.getValidToken(account);

        // Each account independently fetches + upserts its contacts (batched)
        const result = await contactService.importFromGoogle({
          userId: user.id,
          accessToken,
          accountId: account.id,
          maxContacts,
          starredOnly,
        });

        logger.info('Account import complete', {
          accountId: account.id.substring(0, 8),
          email: accountTag,
          imported: result.imported,
          starred: result.starred,
          skipped: result.skipped,
          errors: result.errors.length,
        });

        return { account: accountTag, ...result };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isPermissionError =
          message.includes('403') || message.includes('scope') || message.includes('permission');

        if (isPermissionError) {
          logger.warn('Contacts scope not available for account', {
            accountId: account.id.substring(0, 8),
            email: accountTag,
          });
        } else {
          logger.error('Failed to import from account', {
            accountId: account.id.substring(0, 8),
            email: accountTag,
            error: message,
          });
        }

        // Return a result-shaped object so we can aggregate uniformly
        return {
          account: accountTag,
          imported: 0,
          starred: 0,
          skipped: 0,
          errors: [
            `${accountTag}: ${isPermissionError ? 'Contacts permission not granted' : message}`,
          ],
        };
      }
    });

    // Wait for all accounts to finish (none will reject thanks to inner try/catch)
    const settledResults = await Promise.allSettled(importPromises);

    // Aggregate results from all accounts
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        const r = settled.value;
        totalImported += r.imported;
        totalStarred += r.starred;
        totalSkipped += r.skipped;
        allErrors.push(...r.errors);
      } else {
        // This shouldn't happen since we catch inside the promise, but handle defensively
        const reason = settled.reason instanceof Error ? settled.reason.message : 'Unknown';
        logger.error('Unexpected rejected import promise', { error: reason });
        allErrors.push(`Unknown account: ${reason}`);
      }
    }

    logger.info('All parallel imports settled', {
      totalImported,
      totalStarred,
      totalSkipped,
      errorCount: allErrors.length,
    });

    // Update progress after all accounts complete
    await updateSyncProgress(supabase, user.id, {
      progress: 90,
      imported: totalImported,
      skipped: totalSkipped,
      message: `Imported ${totalImported} contacts from ${accounts.length} account(s)`,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 6: Check if any imports succeeded
    // ─────────────────────────────────────────────────────────────────────────────
    if (totalImported === 0 && allErrors.length > 0) {
      // All accounts failed - check if it's a permission issue
      const isPermissionIssue = allErrors.some(
        (e) => e.includes('permission') || e.includes('scope')
      );

      // Mark progress as error
      await updateSyncProgress(supabase, user.id, {
        status: 'error',
        progress: 100,
        message: isPermissionIssue ? 'Contacts permission not granted' : 'Import failed',
        error: allErrors.join('; '),
        completedAt: new Date().toISOString(),
      });

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

    // ─────────────────────────────────────────────────────────────────────────────
    // Step 7: Mark progress as complete
    // ─────────────────────────────────────────────────────────────────────────────
    await updateSyncProgress(supabase, user.id, {
      status: 'completed',
      progress: 100,
      imported: totalImported,
      skipped: totalSkipped,
      message: `Imported ${totalImported} contacts${totalSkipped ? `, skipped ${totalSkipped}` : ''}`,
      completedAt: new Date().toISOString(),
    });

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

    // Try to mark progress as error (may fail if auth issue)
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateSyncProgress(supabase, user.id, {
          status: 'error',
          progress: 0,
          message: 'Import failed',
          error: message,
          completedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore - we're already in error handling
    }

    return NextResponse.json(
      { error: 'Failed to import contacts' },
      { status: 500 }
    );
  }
}
