/**
 * Connect Additional Gmail Account API
 *
 * Initiates OAuth flow for connecting an additional Gmail account
 * to an already authenticated user. Sets a secure cookie with the
 * current user's ID so the callback can associate the new Gmail
 * account with the correct user.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User clicks "Connect Another Account" in Settings
 * 2. Frontend calls this endpoint
 * 3. We set a secure cookie with the user's ID AND store original session
 * 4. We redirect to Supabase OAuth (which redirects to Google)
 * 5. Google shows account picker
 * 6. User selects account
 * 7. Google redirects to our callback
 * 8. Callback checks for cookie and uses stored user_id for gmail_accounts
 * 9. Callback restores original session so user stays logged in as original user
 *
 * @module app/api/auth/connect-account/route
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('ConnectAccount');

// Cookie name for storing the original user ID
export const ADD_ACCOUNT_COOKIE = 'ideabox_add_account_user_id';
// Cookie name for storing original session (to restore after OAuth)
export const ORIGINAL_SESSION_COOKIE = 'ideabox_original_session';

// Gmail OAuth scopes (must match auth-context.tsx)
const GMAIL_OAUTH_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

/**
 * GET /api/auth/connect-account
 *
 * Initiates the OAuth flow to connect an additional Gmail account.
 * Sets a secure cookie with the current user's ID before redirecting.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  logger.start('Initiating additional account connection');

  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthenticated attempt to connect additional account');
      return NextResponse.redirect(`${origin}/?error=unauthenticated`);
    }
    const user = userResult;

    logger.info('User authenticated, preparing OAuth redirect', {
      userId: user.id.substring(0, 8),
    });

    // Build the OAuth URL manually since we need to set the cookie before redirect
    const redirectTo = `${origin}/api/auth/callback?mode=add_account`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: GMAIL_OAUTH_SCOPES,
        redirectTo,
        skipBrowserRedirect: true, // Don't auto-redirect, we'll do it manually
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account', // Force account picker
        },
      },
    });

    if (error || !data.url) {
      logger.error('Failed to generate OAuth URL', { error: error?.message });
      return NextResponse.redirect(`${origin}/settings?error=oauth_failed`);
    }

    // Get the current session to store for restoration after OAuth
    const { data: sessionData } = await supabase.auth.getSession();

    // Create response that redirects to Google OAuth
    const response = NextResponse.redirect(data.url);

    // Set secure cookie with the current user's ID
    // This cookie will be read by the callback to associate the new account
    response.cookies.set(ADD_ACCOUNT_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Needs to be 'lax' to survive the redirect
      path: '/',
      maxAge: 60 * 10, // 10 minutes - enough for OAuth flow
    });

    // Store ALL Supabase auth cookies so we can restore them after OAuth
    // This prevents the user from being logged in as the new account
    // Supabase uses cookies like: sb-<project-ref>-auth-token, sb-<project-ref>-auth-token.0, etc.
    const allCookies = (await cookies()).getAll();
    const supabaseAuthCookies = allCookies.filter(c =>
      c.name.includes('-auth-token') || c.name.includes('sb-')
    );

    logger.info('🔍 DEBUG: All cookies before redirect', {
      totalCookies: allCookies.length,
      allCookieNames: allCookies.map(c => c.name),
      supabaseAuthCookieCount: supabaseAuthCookies.length,
      supabaseAuthCookieNames: supabaseAuthCookies.map(c => c.name),
    });

    if (supabaseAuthCookies.length > 0) {
      const sessionJson = JSON.stringify(supabaseAuthCookies);
      response.cookies.set(ORIGINAL_SESSION_COOKIE, sessionJson, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 10, // 10 minutes
      });
      logger.info('🔍 DEBUG: Stored original auth cookies for restoration', {
        cookieCount: supabaseAuthCookies.length,
        cookieNames: supabaseAuthCookies.map(c => c.name),
        sessionJsonLength: sessionJson.length,
        sessionJsonPreview: sessionJson.substring(0, 100),
      });
    } else {
      logger.warn('🔍 DEBUG: No Supabase auth cookies found to store!', {
        allCookieNames: allCookies.map(c => c.name),
      });
    }

    logger.info('🔍 DEBUG: Cookies being set on redirect response', {
      addAccountCookie: user.id.substring(0, 8) + '...',
      originalSessionCookieSet: supabaseAuthCookies.length > 0,
    });

    logger.success('Redirecting to Google OAuth with account picker', {
      userId: user.id.substring(0, 8),
      hasSessionToRestore: !!sessionData?.session,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in connect-account', { error: message });
    return NextResponse.redirect(`${origin}/settings?error=unexpected`);
  }
}
