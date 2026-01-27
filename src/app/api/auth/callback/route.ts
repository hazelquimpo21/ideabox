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

// Cookie name for add_scope flow (from add-contacts-scope route)
const ADD_SCOPE_COOKIE = 'ideabox_add_scope_user_id';
// Cookie name for add_send_scope flow (from add-send-scope route)
const ADD_SEND_SCOPE_COOKIE = 'ideabox_add_send_scope_user_id';
import { ADD_GMAIL_COOKIE, OAUTH_STATE_COOKIE } from '@/app/api/auth/add-gmail-account/route';
import type { Database, TableInsert } from '@/types/database';
import { createServerClient as createSupabaseServer } from '@/lib/supabase/server';

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
  const modeParam = searchParams.get('mode');

  // Get cookie store early to check for add_account cookie
  // This is more reliable than URL params which may not survive OAuth redirects
  const cookieStore = await cookies();
  const addAccountCookieValue = cookieStore.get(ADD_ACCOUNT_COOKIE)?.value ?? null;
  const addScopeCookieValue = cookieStore.get(ADD_SCOPE_COOKIE)?.value ?? null;
  const addSendScopeCookieValue = cookieStore.get(ADD_SEND_SCOPE_COOKIE)?.value ?? null;
  const originalSessionCookieValue = cookieStore.get(ORIGINAL_SESSION_COOKIE)?.value ?? null;

  // DEBUG: Log ALL cookies to understand what's being sent
  const allCookies = cookieStore.getAll();
  logger.info('🔍 DEBUG: All cookies received in callback', {
    cookieCount: allCookies.length,
    cookieNames: allCookies.map(c => c.name),
    hasAddAccountCookie: !!addAccountCookieValue,
    hasOriginalSessionCookie: !!originalSessionCookieValue,
    addAccountCookieValueLength: addAccountCookieValue?.length ?? 0,
    originalSessionCookieValueLength: originalSessionCookieValue?.length ?? 0,
  });

  // Check if this is "add account" mode using BOTH the cookie AND URL param
  // The cookie is the reliable source of truth since we set it ourselves
  // The URL param may get lost during the OAuth redirect chain through external systems
  const isAddAccountMode = !!addAccountCookieValue || modeParam === 'add_account';

  // Check if this is "add scope" mode (adding contacts permission)
  const isAddScopeMode = !!addScopeCookieValue || modeParam === 'add_scope';
  // Check if this is "add send scope" mode (adding gmail.send permission)
  const isAddSendScopeMode = !!addSendScopeCookieValue || modeParam === 'add_send_scope';
  const returnToPath = searchParams.get('returnTo') || '/contacts';

  logger.start('Processing OAuth callback', {
    hasCode: !!code,
    next,
    returnUrl,
    modeParam,
    hasAddAccountCookie: !!addAccountCookieValue,
    hasOriginalSessionCookie: !!originalSessionCookieValue,
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
  // Step 1b: Check for DIRECT Google OAuth (bypasses Supabase entirely)
  // ─────────────────────────────────────────────────────────────────────────────
  // This handles the "add secondary Gmail account" flow which uses direct Google
  // OAuth to avoid session switching issues with Supabase.

  const stateParam = searchParams.get('state');
  const directGmailCookie = cookieStore.get(ADD_GMAIL_COOKIE)?.value;
  const storedOAuthState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  // Check if this is a direct Google OAuth callback (state starts with "direct_gmail:")
  if (stateParam?.startsWith('direct_gmail:') && directGmailCookie) {
    logger.info('Detected direct Google OAuth callback for add-gmail flow', {
      hasDirectGmailCookie: !!directGmailCookie,
      hasStoredState: !!storedOAuthState,
    });

    // Extract the actual state token (after the prefix)
    const receivedState = stateParam.replace('direct_gmail:', '');

    // Verify CSRF state
    if (!storedOAuthState || receivedState !== storedOAuthState) {
      logger.error('CSRF state mismatch in direct Gmail OAuth', {
        receivedStatePrefix: receivedState?.substring(0, 8),
      });
      return NextResponse.redirect(`${origin}/settings?tab=account&error=invalid_state`);
    }

    // Exchange code for tokens directly with Google (NOT through Supabase)
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${origin}/api/auth/callback`,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Direct Google OAuth token exchange failed', { error: errorText });
        return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_failed`);
      }

      const tokens = await tokenResponse.json();
      logger.success('Direct Google OAuth token exchange successful', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      // Get user's Gmail profile
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!profileResponse.ok) {
        logger.error('Failed to get Gmail profile');
        return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_failed`);
      }

      const profile = await profileResponse.json();
      logger.info('Got Gmail profile for direct OAuth', { email: profile.email });

      // Store tokens in database under the ORIGINAL user (from cookie)
      const supabase = await createSupabaseServer();
      const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Check if account already exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingAccount } = await (supabase as any)
        .from('gmail_accounts')
        .select('id')
        .eq('user_id', directGmailCookie)
        .eq('email', profile.email)
        .single();

      if (existingAccount) {
        // Update existing account
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('gmail_accounts')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || undefined,
            token_expiry: tokenExpiry,
            display_name: profile.name || null,
            sync_enabled: true,
          })
          .eq('id', existingAccount.id);
        logger.success('Updated Gmail account via direct OAuth', { email: profile.email });
      } else {
        // Insert new account
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase as any)
          .from('gmail_accounts')
          .insert({
            user_id: directGmailCookie,
            email: profile.email,
            display_name: profile.name || null,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || '',
            token_expiry: tokenExpiry,
            sync_enabled: true,
          });

        if (insertError?.code === '23505') {
          logger.warn('Gmail account already connected to another user', { email: profile.email });
          return NextResponse.redirect(`${origin}/settings?tab=account&error=account_exists`);
        }
        if (insertError) {
          logger.error('Failed to insert Gmail account', { error: insertError.message });
          return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_failed`);
        }
        logger.success('Created Gmail account via direct OAuth', { email: profile.email });
      }

      // Create response - user's Supabase session is UNTOUCHED
      const response = NextResponse.redirect(`${origin}/settings?tab=account&account_added=true`);

      // Clear OAuth cookies
      response.cookies.set(ADD_GMAIL_COOKIE, '', { path: '/', maxAge: 0 });
      response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });

      logger.success('Direct Gmail OAuth complete - user session preserved', {
        originalUserId: directGmailCookie.substring(0, 8),
        addedEmail: profile.email,
      });

      return response;
    } catch (err) {
      logger.error('Direct Google OAuth failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return NextResponse.redirect(`${origin}/settings?tab=account&error=oauth_failed`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: Exchange code for session (with proper cookie handling)
  // ─────────────────────────────────────────────────────────────────────────────

  // Note: cookieStore was already created above for add_account detection

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
  // Use the cookie value we already retrieved (more reliable than URL param)
  const originalUserIdFromCookie = addAccountCookieValue;

  if (isAddAccountMode && originalUserIdFromCookie) {
    // In "add account" mode, we need to associate the new Gmail account
    // with the ORIGINAL user, not the session user (which may have changed)
    targetUserId = originalUserIdFromCookie;
    logger.info('Add account mode: using original user ID from cookie', {
      originalUserId: originalUserIdFromCookie.substring(0, 8),
      sessionUserId: user.id.substring(0, 8),
      newEmail: user.email,
      sessionUserMatchesOriginal: user.id === originalUserIdFromCookie,
    });
  } else if (isAddAccountMode && !originalUserIdFromCookie) {
    // This shouldn't happen if modeParam was set - log for debugging
    logger.warn('Add account mode detected from URL param but no cookie found', {
      sessionUserId: user.id.substring(0, 8),
      modeParam,
    });
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
        isAddSendScopeMode,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Update has_send_scope if this was a send scope addition flow
      // ─────────────────────────────────────────────────────────────────────────
      if (isAddSendScopeMode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: sendScopeError } = await (supabase as any)
          .from('gmail_accounts')
          .update({
            has_send_scope: true,
            send_scope_granted_at: new Date().toISOString(),
          })
          .eq('user_id', targetUserId)
          .eq('email', user.email);

        if (sendScopeError) {
          logger.warn('Failed to update has_send_scope flag', {
            targetUserId: targetUserId.substring(0, 8),
            error: sendScopeError.message,
          });
        } else {
          logger.success('Updated gmail_accounts with send scope', {
            targetUserId: targetUserId.substring(0, 8),
            email: user.email,
          });
        }
      }

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
  // Step 5b: Prepare session restoration if in add_account mode
  // ─────────────────────────────────────────────────────────────────────────────
  // When adding an account, Supabase OAuth switches the session to the new user.
  // We stored the original Supabase auth cookies before OAuth, and will restore
  // them on the response to keep the user logged in as their original account.

  let originalAuthCookies: Array<{ name: string; value: string }> = [];
  let sessionRestored = false;

  if (isAddAccountMode && originalUserIdFromCookie) {
    const originalSessionJson = cookieStore.get(ORIGINAL_SESSION_COOKIE)?.value;

    logger.info('🔍 DEBUG: Attempting session restoration', {
      hasOriginalSessionJson: !!originalSessionJson,
      originalSessionJsonLength: originalSessionJson?.length ?? 0,
      originalSessionJsonPreview: originalSessionJson?.substring(0, 100) ?? 'null',
    });

    if (originalSessionJson) {
      try {
        originalAuthCookies = JSON.parse(originalSessionJson);
        logger.info('🔍 DEBUG: Parsed original auth cookies', {
          isArray: Array.isArray(originalAuthCookies),
          cookieCount: Array.isArray(originalAuthCookies) ? originalAuthCookies.length : 0,
          cookieNames: Array.isArray(originalAuthCookies) ? originalAuthCookies.map((c: { name: string }) => c.name) : [],
        });
        if (Array.isArray(originalAuthCookies) && originalAuthCookies.length > 0) {
          sessionRestored = true;
          logger.info('Will restore original auth cookies', {
            originalUserId: originalUserIdFromCookie.substring(0, 8),
            cookieCount: originalAuthCookies.length,
          });
        }
      } catch (parseError) {
        logger.warn('Failed to parse original session cookie', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          jsonPreview: originalSessionJson?.substring(0, 100),
        });
      }
    } else {
      logger.warn('No original session cookie found in add_account mode', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
        allCookieNames: allCookies.map(c => c.name),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 6: Determine redirect destination
  // ─────────────────────────────────────────────────────────────────────────────

  let redirectPath: string;

  if (isAddSendScopeMode) {
    // "Add send scope" mode - redirect back to returnTo path with success
    redirectPath = `${returnToPath}?send_scope_added=true`;
    logger.success('Add send scope flow complete - gmail.send permission granted', {
      userId: user.id.substring(0, 8),
      email: user.email,
    });
  } else if (isAddScopeMode) {
    // "Add scope" mode - redirect back to contacts (or returnTo path)
    redirectPath = `${returnToPath}?scope_added=true`;
    logger.success('Add scope flow complete - contacts permission granted', {
      userId: user.id.substring(0, 8),
      email: user.email,
    });
  } else if (isAddAccountMode && originalUserIdFromCookie) {
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

  if (isAddAccountMode && originalUserIdFromCookie) {
    if (sessionRestored && originalAuthCookies.length > 0) {
      // In add_account mode with session restoration:
      // DON'T set the new session cookies (from exchangeCodeForSession)
      // Instead, restore the ORIGINAL auth cookies to keep user logged in as original account
      logger.info('Restoring original session cookies instead of new session', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
        newSessionCookieCount: cookiesToSet.length,
        originalCookieCount: originalAuthCookies.length,
      });

      for (const cookie of originalAuthCookies) {
        response.cookies.set(cookie.name, cookie.value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          // Set maxAge to match Supabase's default session duration (7 days)
          // Without this, cookies would be session-only and might behave differently
          maxAge: 60 * 60 * 24 * 7,
        });
      }

      logger.success('Restored original user session after add account', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
        newAccountEmail: user.email,
      });
    } else {
      // CRITICAL: Session restoration failed in add_account mode
      // This means we couldn't find/parse the original session cookies
      // The OAuth flow switched the user to the new account, which we don't want
      // DON'T set the new OAuth cookies - leave cookies unchanged and show error
      logger.error('Session restoration FAILED in add_account mode - not setting new cookies', {
        originalUserId: originalUserIdFromCookie.substring(0, 8),
        sessionUserId: user.id.substring(0, 8),
        sessionRestored,
        originalCookieCount: originalAuthCookies.length,
        hadOriginalSessionCookie: !!cookieStore.get(ORIGINAL_SESSION_COOKIE)?.value,
      });

      // Redirect to settings with error instead of success
      // The user should still be logged in as their original account
      // because we're not setting any new cookies
      return NextResponse.redirect(`${origin}/settings?tab=account&error=session_restore_failed`);
    }
  } else {
    // Normal flow: set cookies from OAuth flow
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, options);
    }
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

  // Clear the add_scope cookies if they were used
  if (isAddScopeMode) {
    response.cookies.set(ADD_SCOPE_COOKIE, '', {
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

  // Clear the add_send_scope cookies if they were used
  if (isAddSendScopeMode) {
    response.cookies.set(ADD_SEND_SCOPE_COOKIE, '', {
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
