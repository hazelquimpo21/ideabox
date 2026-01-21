/**
 * 🔐 OAuth Callback Handler
 *
 * Handles the redirect from Google OAuth after user grants permissions.
 * Exchanges the authorization code for a Supabase session and creates
 * a user profile if needed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. User clicks "Sign in with Gmail" → redirected to Google
 * 2. User grants permissions → Google redirects here with `code` param
 * 3. This route exchanges code for Supabase session
 * 4. Creates user_profile if new user
 * 5. Redirects to onboarding (new users) or inbox (returning users)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Missing code: Redirects to home with error param
 * - Code exchange fails: Redirects to home with error param
 * - Profile creation fails: Logs warning but continues (graceful degradation)
 *
 * @module app/api/auth/callback/route
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createLogger, logAuth } from '@/lib/utils/logger';
import { gmailWatchService } from '@/lib/gmail/watch-service';
import { ADD_ACCOUNT_COOKIE, ORIGINAL_SESSION_COOKIE } from '@/app/api/auth/connect-account/route';
import type { Database, TableInsert } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AuthCallback');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error codes that can be returned in redirect URL.
 */
type AuthErrorCode =
  | 'missing_code'      // No authorization code in callback
  | 'exchange_failed'   // Code-to-session exchange failed
  | 'auth_error';       // Generic auth error

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a redirect URL with error parameter.
 */
function createErrorRedirect(origin: string, code: AuthErrorCode): string {
  return `${origin}/?error=${code}`;
}

/**
 * Detects user's timezone from request headers.
 * Falls back to a sensible default if detection fails.
 */
function detectTimezone(): string {
  // In a real implementation, this would come from the client
  // For server-side, we default to UTC and let client override later
  return 'UTC';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/callback
 *
 * Handles OAuth callback from Google. The flow is:
 * 1. Extract authorization code from query params
 * 2. Exchange code for Supabase session
 * 3. Create user profile if new user
 * 4. Redirect to appropriate page
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const returnUrl = searchParams.get('returnUrl');
  const mode = searchParams.get('mode');

  // Check if this is "add account" mode
  const isAddAccountMode = mode === 'add_account';

  logger.start('Processing OAuth callback', {
    hasCode: !!code,
    next,
    returnUrl,
    isAddAccountMode,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1: Validate authorization code
  // ─────────────────────────────────────────────────────────────────────────────

  if (!code) {
    logger.error('OAuth callback missing authorization code');
    return NextResponse.redirect(createErrorRedirect(origin, 'missing_code'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: Exchange code for session (with proper cookie handling)
  // ─────────────────────────────────────────────────────────────────────────────

  const cookieStore = await cookies();

  // Track cookies that need to be set on the response
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        // Collect all cookies to set on the response later
        cookies.forEach((cookie) => {
          cookiesToSet.push(cookie);
        });
      },
    },
  });

  const { data: sessionData, error: exchangeError } = await supabase.auth
    .exchangeCodeForSession(code);

  if (exchangeError) {
    logAuth.loginError({
      error: exchangeError.message,
      provider: 'google',
    });
    return NextResponse.redirect(createErrorRedirect(origin, 'exchange_failed'));
  }

  const user = sessionData?.user;

  if (!user) {
    logger.error('No user in session after code exchange');
    return NextResponse.redirect(createErrorRedirect(origin, 'auth_error'));
  }

  logAuth.loginSuccess({
    userId: user.id,
    provider: 'google',
    email: user.email,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 3: Handle "add account" mode - get original user ID from cookie
  // ─────────────────────────────────────────────────────────────────────────────

  let targetUserId = user.id;
  let originalUserIdFromCookie: string | null = null;

  if (isAddAccountMode) {
    // In "add account" mode, we need to associate the new Gmail account
    // with the ORIGINAL user, not the session user (which may have changed)
    originalUserIdFromCookie = cookieStore.get(ADD_ACCOUNT_COOKIE)?.value ?? null;

    if (originalUserIdFromCookie) {
      targetUserId = originalUserIdFromCookie;
      logger.info('Add account mode: using original user ID', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
        sessionUserId: user.id.substring(0, 8),
        newEmail: user.email,
      });
    } else {
      logger.warn('Add account mode but no cookie found, using session user', {
        sessionUserId: user.id.substring(0, 8),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 4: Store Google OAuth tokens in database (reduces cookie size)
  // ─────────────────────────────────────────────────────────────────────────────

  const providerToken = sessionData.session?.provider_token;
  const providerRefreshToken = sessionData.session?.provider_refresh_token;

  if (providerToken && user.email) {
    logger.info('Storing Gmail OAuth tokens', {
      targetUserId: targetUserId.substring(0, 8),
      email: user.email,
      isAddAccountMode,
    });

    // Calculate token expiry (Google tokens typically expire in 1 hour)
    const tokenExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

    // Check if gmail_account exists, upsert if needed
    // In add_account mode, targetUserId may differ from user.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gmailError } = await (supabase as any)
      .from('gmail_accounts')
      .upsert(
        {
          user_id: targetUserId,
          email: user.email,
          display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          access_token: providerToken,
          refresh_token: providerRefreshToken ?? '',
          token_expiry: tokenExpiry,
          sync_enabled: true,
        },
        { onConflict: 'user_id,email' }
      );

    if (gmailError) {
      logger.warn('Failed to store Gmail tokens', {
        targetUserId: targetUserId.substring(0, 8),
        error: gmailError.message,
      });
    } else {
      logger.success('Stored Gmail OAuth tokens', {
        targetUserId: targetUserId.substring(0, 8),
        email: user.email,
        isAddAccountMode,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Start Gmail watch for push notifications (if enabled)
      // ─────────────────────────────────────────────────────────────────────────
      // This enables real-time email sync via Google Cloud Pub/Sub.
      // If watch setup fails, we fall back to polling (scheduled sync).
      if (gmailWatchService.isPushEnabled()) {
        try {
          // Get the account ID we just created/updated
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: gmailAccount } = await (supabase as any)
            .from('gmail_accounts')
            .select('id')
            .eq('user_id', targetUserId)
            .eq('email', user.email)
            .single();

          if (gmailAccount?.id) {
            const watch = await gmailWatchService.startWatch(
              providerToken,
              gmailAccount.id
            );
            logger.success('Started Gmail push notifications', {
              targetUserId: targetUserId.substring(0, 8),
              historyId: watch.historyId,
              expiresAt: new Date(parseInt(watch.expiration)).toISOString(),
            });
          }
        } catch (watchError) {
          // Don't fail the auth flow if watch setup fails
          // We'll fall back to polling via scheduled sync
          logger.warn('Failed to start Gmail push notifications (will use polling)', {
            targetUserId: targetUserId.substring(0, 8),
            error: watchError instanceof Error ? watchError.message : 'Unknown error',
          });
        }
      } else {
        logger.debug('Gmail push notifications not enabled (missing GOOGLE_CLOUD_PROJECT)', {
          targetUserId: targetUserId.substring(0, 8),
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 4: Check if user profile exists, create if needed
  // ─────────────────────────────────────────────────────────────────────────────

  // Type assertion for Supabase query result
  type ProfileSelectResult = { id: string; onboarding_completed: boolean };

  const { data: existingProfile, error: profileFetchError } = await supabase
    .from('user_profiles')
    .select('id, onboarding_completed')
    .eq('id', user.id)
    .single() as unknown as {
      data: ProfileSelectResult | null;
      error: { code: string; message: string } | null;
    };

  // Determine if this is a new user
  const isNewUser = profileFetchError?.code === 'PGRST116'; // Row not found

  if (isNewUser) {
    logger.info('Creating profile for new user', { userId: user.id });

    // Extract name from Google user metadata
    const fullName = user.user_metadata?.full_name ??
                     user.user_metadata?.name ??
                     null;

    const profileData: TableInsert<'user_profiles'> = {
      id: user.id,
      email: user.email ?? '',
      full_name: fullName,
      timezone: detectTimezone(),
      onboarding_completed: false,
      default_view: 'inbox',
      emails_per_page: 50,
    };

    // Using explicit any cast due to Supabase SSR type inference limitations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileCreateError } = await (supabase as any)
      .from('user_profiles')
      .insert(profileData);

    if (profileCreateError) {
      // Log but don't fail - user can still use app without profile
      // Profile will be created on next login attempt
      logger.warn('Failed to create user profile', {
        userId: user.id,
        error: profileCreateError.message,
      });
    } else {
      logger.success('Created user profile', { userId: user.id });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 5b: Restore original session if in add_account mode
  // ─────────────────────────────────────────────────────────────────────────────
  // When adding an account, Supabase OAuth switches the session to the new user.
  // We need to restore the original session so the user stays logged in as
  // their original account, not the newly added Gmail account.

  let sessionRestored = false;
  if (isAddAccountMode && originalUserIdFromCookie) {
    const originalSessionJson = cookieStore.get(ORIGINAL_SESSION_COOKIE)?.value;

    if (originalSessionJson) {
      try {
        const originalSession = JSON.parse(originalSessionJson);

        if (originalSession.access_token && originalSession.refresh_token) {
          // Restore the original session
          const { error: restoreError } = await supabase.auth.setSession({
            access_token: originalSession.access_token,
            refresh_token: originalSession.refresh_token,
          });

          if (restoreError) {
            logger.warn('Failed to restore original session', {
              error: restoreError.message,
              originalUserId: originalUserIdFromCookie.substring(0, 8),
            });
          } else {
            sessionRestored = true;
            logger.success('Restored original user session after add account', {
              originalUserId: originalUserIdFromCookie.substring(0, 8),
              newAccountEmail: user.email,
            });
          }
        }
      } catch (parseError) {
        logger.warn('Failed to parse original session cookie', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
        });
      }
    } else {
      logger.warn('No original session cookie found in add_account mode', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 6: Determine redirect destination
  // ─────────────────────────────────────────────────────────────────────────────

  let redirectPath: string;

  if (isAddAccountMode && originalUserIdFromCookie) {
    // "Add account" mode - redirect back to settings with success message
    redirectPath = '/settings?tab=account&account_added=true';
    logger.success('Add account flow complete', {
      originalUserId: originalUserIdFromCookie.substring(0, 8),
      newEmail: user.email,
      sessionRestored,
    });
  } else if (isNewUser) {
    // New users always go to onboarding
    redirectPath = '/onboarding';
  } else if (existingProfile && !existingProfile.onboarding_completed) {
    // Returning users who haven't finished onboarding
    redirectPath = '/onboarding';
  } else if (returnUrl) {
    // Returning users go to their intended destination
    redirectPath = decodeURIComponent(returnUrl);
  } else if (next) {
    // Explicit next parameter (from OAuth options)
    redirectPath = next;
  } else {
    // Default to inbox for returning users
    redirectPath = '/inbox';
  }

  logger.success('OAuth callback complete', {
    userId: user.id,
    isNewUser,
    isAddAccountMode,
    redirectTo: redirectPath,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 7: Redirect to destination with cookies
  // ─────────────────────────────────────────────────────────────────────────────

  // Create redirect response and set all collected cookies
  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // Set cookies on response (this enables proper cookie chunking by @supabase/ssr)
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  // Clear the add_account cookies if they were used
  if (isAddAccountMode) {
    response.cookies.set(ADD_ACCOUNT_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Delete the cookie
    });
    response.cookies.set(ORIGINAL_SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Delete the cookie
    });
  }

  return response;
}
