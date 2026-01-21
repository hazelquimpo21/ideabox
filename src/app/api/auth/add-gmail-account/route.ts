/**
 * Add Gmail Account API (Direct Google OAuth)
 *
 * Initiates a direct Google OAuth flow for connecting an additional Gmail account
 * WITHOUT using Supabase auth. This ensures the user's session is never affected.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY NOT USE SUPABASE OAUTH?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When using Supabase's signInWithOAuth for adding a secondary Gmail account:
 * 1. If the Gmail account has an existing Supabase user, OAuth switches the session
 * 2. This logs the user OUT of their original account
 * 3. Cookie-based session restoration is unreliable (size limits, cross-site issues)
 *
 * Solution: Use direct Google OAuth to get tokens WITHOUT touching Supabase auth.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User clicks "Connect Another Account" in Settings
 * 2. Frontend calls this endpoint
 * 3. We store the original user ID in a secure cookie
 * 4. We redirect directly to Google OAuth (NOT Supabase)
 * 5. Google shows account picker
 * 6. User selects account
 * 7. Google redirects to our callback (/api/auth/gmail-callback)
 * 8. Callback exchanges code for tokens directly with Google
 * 9. Callback stores tokens in gmail_accounts for original user
 * 10. User's Supabase session is NEVER touched
 *
 * @module app/api/auth/add-gmail-account/route
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';
import crypto from 'crypto';

const logger = createLogger('AddGmailAccount');

// Cookie name for storing the original user ID during OAuth
export const ADD_GMAIL_COOKIE = 'ideabox_add_gmail_user_id';
// Cookie name for storing the CSRF state token
export const OAUTH_STATE_COOKIE = 'ideabox_oauth_state';

// Gmail OAuth scopes
const GMAIL_OAUTH_SCOPES = [
  'email',
  'profile',
  'openid',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

/**
 * GET /api/auth/add-gmail-account
 *
 * Initiates direct Google OAuth flow (bypassing Supabase) for adding a Gmail account.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  logger.start('Initiating direct Google OAuth for adding Gmail account');

  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthenticated attempt to add Gmail account');
      return NextResponse.redirect(`${origin}/?error=unauthenticated`);
    }
    const user = userResult;

    logger.info('User authenticated, preparing direct Google OAuth', {
      userId: user.id.substring(0, 8),
    });

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Build Google OAuth URL directly
    // Use the existing callback URL that's already registered in Google Cloud Console
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    googleAuthUrl.searchParams.set('redirect_uri', `${origin}/api/auth/callback`);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', GMAIL_OAUTH_SCOPES);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'select_account consent'); // Force account picker + consent
    googleAuthUrl.searchParams.set('state', `direct_gmail:${state}`); // Prefix to identify direct OAuth

    // Create response that redirects to Google OAuth
    const response = NextResponse.redirect(googleAuthUrl.toString());

    // Set secure cookie with the current user's ID (small, won't exceed limits)
    response.cookies.set(ADD_GMAIL_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutes
    });

    // Set CSRF state cookie for verification in callback
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutes
    });

    logger.success('Redirecting to direct Google OAuth', {
      userId: user.id.substring(0, 8),
      redirectUri: `${origin}/api/auth/callback`,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in add-gmail-account', { error: message });
    return NextResponse.redirect(`${origin}/settings?tab=account&error=unexpected`);
  }
}
