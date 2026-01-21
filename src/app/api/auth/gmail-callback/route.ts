/**
 * Gmail OAuth Callback (Direct Google OAuth)
 *
 * Handles the callback from direct Google OAuth for adding secondary Gmail accounts.
 * This bypasses Supabase auth entirely to avoid session switching issues.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Google redirects here with authorization code
 * 2. We verify the CSRF state token
 * 3. We exchange the code for tokens directly with Google
 * 4. We get the user's Gmail profile (email address)
 * 5. We store the tokens in gmail_accounts for the original user
 * 6. We redirect back to settings with success message
 *
 * The user's Supabase session is NEVER touched during this flow.
 *
 * @module app/api/auth/gmail-callback/route
 * @since January 2026
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';
import { ADD_GMAIL_COOKIE, OAUTH_STATE_COOKIE } from '../add-gmail-account/route';
import { gmailWatchService } from '@/lib/gmail/watch-service';

const logger = createLogger('GmailCallback');

/**
 * Exchange authorization code for tokens directly with Google.
 */
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Get user's Gmail profile from Google.
 */
async function getGmailProfile(accessToken: string): Promise<{
  email: string;
  name?: string;
  picture?: string;
}> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user profile: ${error}`);
  }

  return response.json();
}

/**
 * GET /api/auth/gmail-callback
 *
 * Handles the OAuth callback from Google.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  logger.start('Processing Gmail OAuth callback');

  // Handle OAuth errors from Google
  if (error) {
    logger.error('Google OAuth error', { error });
    return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_denied`);
  }

  // Validate required parameters
  if (!code) {
    logger.error('Missing authorization code');
    return NextResponse.redirect(`${origin}/settings?tab=account&error=missing_code`);
  }

  // Get and validate cookies
  const cookieStore = await cookies();
  const originalUserId = cookieStore.get(ADD_GMAIL_COOKIE)?.value;
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  logger.info('Validating OAuth state', {
    hasOriginalUserId: !!originalUserId,
    hasStoredState: !!storedState,
    statesMatch: state === storedState,
  });

  // Verify CSRF state
  if (!storedState || state !== storedState) {
    logger.error('CSRF state mismatch', { receivedState: state?.substring(0, 8) });
    return NextResponse.redirect(`${origin}/settings?tab=account&error=invalid_state`);
  }

  // Verify we have the original user ID
  if (!originalUserId) {
    logger.error('Missing original user ID cookie');
    return NextResponse.redirect(`${origin}/settings?tab=account&error=missing_user`);
  }

  try {
    // Exchange code for tokens
    const redirectUri = `${origin}/api/auth/gmail-callback`;
    logger.info('Exchanging code for tokens', { redirectUri });

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    logger.success('Token exchange successful', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    // Get the user's Gmail profile
    const profile = await getGmailProfile(tokens.access_token);
    logger.info('Got Gmail profile', { email: profile.email });

    // Store tokens in database
    const supabase = await createServerClient();

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Check if this Gmail account already exists for this user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAccount } = await (supabase as any)
      .from('gmail_accounts')
      .select('id, email')
      .eq('user_id', originalUserId)
      .eq('email', profile.email)
      .single();

    if (existingAccount) {
      // Update existing account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('gmail_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || existingAccount.refresh_token,
          token_expiry: tokenExpiry,
          display_name: profile.name || null,
          sync_enabled: true,
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        throw new Error(`Failed to update Gmail account: ${updateError.message}`);
      }

      logger.success('Updated existing Gmail account', {
        originalUserId: originalUserId.substring(0, 8),
        email: profile.email,
      });
    } else {
      // Insert new account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('gmail_accounts')
        .insert({
          user_id: originalUserId,
          email: profile.email,
          display_name: profile.name || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || '',
          token_expiry: tokenExpiry,
          sync_enabled: true,
        });

      if (insertError) {
        // Check if it's a duplicate key error (account already exists under different user)
        if (insertError.code === '23505') {
          logger.warn('Gmail account already connected to another user', {
            email: profile.email,
          });
          return NextResponse.redirect(
            `${origin}/settings?tab=account&error=account_exists`
          );
        }
        throw new Error(`Failed to create Gmail account: ${insertError.message}`);
      }

      logger.success('Created new Gmail account', {
        originalUserId: originalUserId.substring(0, 8),
        email: profile.email,
      });
    }

    // Start Gmail watch for push notifications (if enabled)
    if (gmailWatchService.isPushEnabled()) {
      try {
        // Get the account ID
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: gmailAccount } = await (supabase as any)
          .from('gmail_accounts')
          .select('id')
          .eq('user_id', originalUserId)
          .eq('email', profile.email)
          .single();

        if (gmailAccount?.id) {
          const watch = await gmailWatchService.startWatch(
            tokens.access_token,
            gmailAccount.id
          );
          logger.success('Started Gmail push notifications', {
            historyId: watch.historyId,
          });
        }
      } catch (watchError) {
        // Don't fail if watch setup fails
        logger.warn('Failed to start Gmail push (will use polling)', {
          error: watchError instanceof Error ? watchError.message : 'Unknown',
        });
      }
    }

    // Create response with redirect
    const response = NextResponse.redirect(
      `${origin}/settings?tab=account&account_added=true`
    );

    // Clear the OAuth cookies
    response.cookies.set(ADD_GMAIL_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Delete
    });
    response.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Delete
    });

    logger.success('Gmail account added successfully', {
      originalUserId: originalUserId.substring(0, 8),
      email: profile.email,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to process Gmail OAuth callback', { error: message });
    return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_failed`);
  }
}
