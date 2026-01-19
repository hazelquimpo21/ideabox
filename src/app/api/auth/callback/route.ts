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

  logger.start('Processing OAuth callback', {
    hasCode: !!code,
    next,
    returnUrl,
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
  // Step 3: Store Google OAuth tokens in database (reduces cookie size)
  // ─────────────────────────────────────────────────────────────────────────────

  const providerToken = sessionData.session?.provider_token;
  const providerRefreshToken = sessionData.session?.provider_refresh_token;

  if (providerToken && user.email) {
    logger.info('Storing Gmail OAuth tokens', { userId: user.id });

    // Calculate token expiry (Google tokens typically expire in 1 hour)
    const tokenExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

    // Check if gmail_account exists, upsert if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gmailError } = await (supabase as any)
      .from('gmail_accounts')
      .upsert(
        {
          user_id: user.id,
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
        userId: user.id,
        error: gmailError.message,
      });
    } else {
      logger.success('Stored Gmail OAuth tokens', { userId: user.id });

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
            .eq('user_id', user.id)
            .eq('email', user.email)
            .single();

          if (gmailAccount?.id) {
            const watch = await gmailWatchService.startWatch(
              providerToken,
              gmailAccount.id
            );
            logger.success('Started Gmail push notifications', {
              userId: user.id,
              historyId: watch.historyId,
              expiresAt: new Date(parseInt(watch.expiration)).toISOString(),
            });
          }
        } catch (watchError) {
          // Don't fail the auth flow if watch setup fails
          // We'll fall back to polling via scheduled sync
          logger.warn('Failed to start Gmail push notifications (will use polling)', {
            userId: user.id,
            error: watchError instanceof Error ? watchError.message : 'Unknown error',
          });
        }
      } else {
        logger.debug('Gmail push notifications not enabled (missing GOOGLE_CLOUD_PROJECT)', {
          userId: user.id,
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
  // Step 5: Determine redirect destination
  // ─────────────────────────────────────────────────────────────────────────────

  let redirectPath: string;

  if (isNewUser) {
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
    redirectTo: redirectPath,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 6: Redirect to destination with cookies
  // ─────────────────────────────────────────────────────────────────────────────

  // Create redirect response and set all collected cookies
  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // Set cookies on response (this enables proper cookie chunking by @supabase/ssr)
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}
