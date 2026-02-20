/**
 * Add Gmail Send Scope API
 *
 * Initiates OAuth flow to add the Gmail Send scope to an existing user's
 * authorization. This is needed when users want to send emails through IdeaBox
 * but originally only authorized read access.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User attempts to send an email or clicks "Enable Sending"
 * 2. Frontend redirects to this endpoint
 * 3. We redirect to Google OAuth with all scopes (including gmail.send)
 * 4. Google prompts user to grant the additional send scope
 * 5. User approves
 * 6. Google redirects back to callback
 * 7. Callback updates tokens and sets has_send_scope=true in gmail_accounts
 * 8. User can now send emails
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCOPE REQUIRED
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * https://www.googleapis.com/auth/gmail.send
 *
 * This scope allows the application to send email on behalf of the user.
 * Sent emails appear in the user's Gmail Sent folder.
 *
 * @module app/api/auth/add-send-scope/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AddSendScope');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cookie name for tracking the add-scope flow.
 */
export const ADD_SEND_SCOPE_COOKIE = 'ideabox_add_send_scope_user_id';

/**
 * Cookie name for storing original session during OAuth.
 */
const ORIGINAL_SESSION_COOKIE = 'ideabox_original_session';

/**
 * Full OAuth scopes including gmail.send.
 *
 * Note: We request all scopes together because Google's OAuth incremental
 * auth model requires including previously granted scopes.
 */
const FULL_OAUTH_SCOPES_WITH_SEND = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send', // Send scope!
  'https://www.googleapis.com/auth/contacts.readonly',
].join(' ');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/add-send-scope
 *
 * Initiates OAuth flow to add gmail.send permission.
 *
 * Query Parameters:
 * - returnTo: Path to redirect after success (default: /discover)
 * - accountId: Gmail account ID to update (optional)
 *
 * @example
 * ```
 * // Redirect user to grant send permission
 * window.location.href = '/api/auth/add-send-scope?returnTo=/compose';
 * ```
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  // UPDATED (Feb 2026): Default /discover → /inbox per Navigation Redesign
  const returnTo = searchParams.get('returnTo') || '/inbox';
  const accountId = searchParams.get('accountId');

  logger.start('Initiating Gmail send scope addition', {
    returnTo,
    hasAccountId: !!accountId,
  });

  try {
    const supabase = await createServerClient();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Verify user is authenticated
    // ─────────────────────────────────────────────────────────────────────────

    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthenticated attempt to add send scope');
      return NextResponse.redirect(`${origin}/?error=unauthenticated`);
    }
    const user = userResult;

    logger.info('User authenticated, preparing OAuth redirect with send scope', {
      userId: user.id.substring(0, 8),
      accountId: accountId?.substring(0, 8),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Build OAuth URL with send scope
    // ─────────────────────────────────────────────────────────────────────────

    const callbackUrl = new URL(`${origin}/api/auth/callback`);
    callbackUrl.searchParams.set('mode', 'add_send_scope');
    callbackUrl.searchParams.set('returnTo', returnTo);
    if (accountId) {
      callbackUrl.searchParams.set('accountId', accountId);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: FULL_OAUTH_SCOPES_WITH_SEND,
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
        queryParams: {
          // Request offline access for refresh token
          access_type: 'offline',
          // Force consent screen to show new scope
          prompt: 'consent',
          // Include previously granted scopes
          include_granted_scopes: 'true',
        },
      },
    });

    if (error || !data.url) {
      logger.error('Failed to generate OAuth URL for send scope', {
        error: error?.message,
      });
      return NextResponse.redirect(
        `${origin}${returnTo}?error=oauth_failed&message=Failed+to+initiate+authorization`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Set cookies for callback handling
    // ─────────────────────────────────────────────────────────────────────────

    const response = NextResponse.redirect(data.url);

    // Store user ID for the callback to know who initiated this flow
    const cookiePayload = JSON.stringify({
      userId: user.id,
      accountId: accountId || null,
    });

    response.cookies.set(ADD_SEND_SCOPE_COOKIE, cookiePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutes - enough for OAuth flow
    });

    // Store original session cookies for restoration after OAuth
    // (OAuth might switch sessions, we need to restore the original)
    const allCookies = (await cookies()).getAll();
    const supabaseAuthCookies = allCookies.filter(
      (c) => c.name.includes('-auth-token') || c.name.includes('sb-')
    );

    if (supabaseAuthCookies.length > 0) {
      const sessionJson = JSON.stringify(supabaseAuthCookies);
      response.cookies.set(ORIGINAL_SESSION_COOKIE, sessionJson, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 10,
      });
      logger.debug('Stored original session cookies for restoration', {
        cookieCount: supabaseAuthCookies.length,
      });
    }

    logger.success('Redirecting to Google OAuth with send scope', {
      userId: user.id.substring(0, 8),
      returnTo,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in add-send-scope', { error: message });
    return NextResponse.redirect(
      `${origin}${returnTo}?error=unexpected&message=${encodeURIComponent(message)}`
    );
  }
}
