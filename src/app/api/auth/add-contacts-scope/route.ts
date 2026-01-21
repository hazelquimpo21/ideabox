/**
 * Add Contacts Scope API
 *
 * Initiates OAuth flow to add the Google Contacts (People API) scope
 * to an existing user's authorization. This is needed when users want
 * to sync their Google contacts but originally only authorized email access.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User clicks "Grant Access" on contacts sync button
 * 2. Frontend redirects to this endpoint
 * 3. We redirect to Google OAuth with all scopes (including contacts)
 * 4. Google prompts user to grant the additional contacts scope
 * 5. User approves
 * 6. Google redirects back to callback
 * 7. Callback updates tokens with new scopes
 * 8. User can now sync contacts
 *
 * @module app/api/auth/add-contacts-scope/route
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('AddContactsScope');

// Cookie names (same as connect-account for consistency)
const ADD_SCOPE_COOKIE = 'ideabox_add_scope_user_id';
const ORIGINAL_SESSION_COOKIE = 'ideabox_original_session';

// Full OAuth scopes including contacts
const FULL_OAUTH_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly', // Contacts scope!
].join(' ');

/**
 * GET /api/auth/add-contacts-scope
 *
 * Initiates OAuth flow to add contacts permission.
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const returnTo = searchParams.get('returnTo') || '/contacts';

  logger.start('Initiating contacts scope addition');

  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const userResult = await requireAuth(supabase);
    if (userResult instanceof Response) {
      logger.warn('Unauthenticated attempt to add contacts scope');
      return NextResponse.redirect(`${origin}/?error=unauthenticated`);
    }
    const user = userResult;

    logger.info('User authenticated, preparing OAuth redirect with contacts scope', {
      userId: user.id.substring(0, 8),
    });

    // Build the OAuth URL with contacts scope
    const redirectTo = `${origin}/api/auth/callback?mode=add_scope&returnTo=${encodeURIComponent(returnTo)}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: FULL_OAUTH_SCOPES,
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent', // Force consent screen to show new scope
          include_granted_scopes: 'true', // Include previously granted scopes
        },
      },
    });

    if (error || !data.url) {
      logger.error('Failed to generate OAuth URL', { error: error?.message });
      return NextResponse.redirect(`${origin}/contacts?error=oauth_failed`);
    }

    // Create response that redirects to Google OAuth
    const response = NextResponse.redirect(data.url);

    // Set cookie with user ID for callback
    response.cookies.set(ADD_SCOPE_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutes
    });

    // Store original session cookies for restoration
    const allCookies = (await cookies()).getAll();
    const supabaseAuthCookies = allCookies.filter(c =>
      c.name.includes('-auth-token') || c.name.includes('sb-')
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
    }

    logger.success('Redirecting to Google OAuth with contacts scope', {
      userId: user.id.substring(0, 8),
      returnTo,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error in add-contacts-scope', { error: message });
    return NextResponse.redirect(`${origin}/contacts?error=unexpected`);
  }
}
