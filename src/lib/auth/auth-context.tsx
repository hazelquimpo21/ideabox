/**
 * 🔐 Authentication Context for IdeaBox
 *
 * Provides authentication state and methods throughout the application.
 * Uses Supabase Auth under the hood for Gmail OAuth integration.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - User authentication state management
 * - Gmail OAuth sign-in with required scopes
 * - Session persistence across page refreshes
 * - User profile data from Supabase
 * - Loading states for async operations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Wrap your app with the provider:
 * ```tsx
 * // app/layout.tsx
 * import { AuthProvider } from '@/lib/auth/auth-context';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <AuthProvider>{children}</AuthProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * Access auth state in components:
 * ```tsx
 * import { useAuth } from '@/lib/auth/auth-context';
 *
 * function ProfileButton() {
 *   const { user, isLoading, signOut } = useAuth();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!user) return <SignInButton />;
 *
 *   return <UserMenu user={user} onLogout={signOut} />;
 * }
 * ```
 *
 * @module lib/auth/auth-context
 */

'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger, logAuth } from '@/lib/utils/logger';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AuthContext');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gmail OAuth scopes required for IdeaBox functionality.
 * - email: Basic email address access
 * - profile: User profile information (name, avatar)
 * - gmail.readonly: Read emails (required for sync)
 * - gmail.modify: Modify labels (for category syncing to Gmail)
 */
const GMAIL_OAUTH_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User profile information.
 * Combines Supabase auth user with app-specific profile data.
 */
export interface AuthUser {
  /** Unique user identifier (from Supabase) */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name (from Google profile or user_profiles) */
  name?: string | null;
  /** URL to user's avatar image (from Google profile) */
  avatarUrl?: string | null;
  /** Whether user has completed onboarding flow */
  onboardingCompleted: boolean;
  /** User's preferred timezone (auto-detected or manually set) */
  timezone?: string | null;
  /** When the user was created */
  createdAt?: string;
  /**
   * Whether the profile data has been successfully loaded.
   * - true: Profile was fetched (or confirmed not to exist for new users)
   * - false: Profile fetch is pending, timed out, or failed
   * This helps distinguish between "user hasn't done onboarding" vs "we don't know yet"
   */
  profileLoaded: boolean;
}

/**
 * Authentication context value.
 * Provides auth state and methods to consumers.
 */
export interface AuthContextValue {
  /** Currently authenticated user (null if not logged in) */
  user: AuthUser | null;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Any auth-related error */
  error: Error | null;
  /** Initiate sign in with Gmail */
  signInWithGmail: () => Promise<void>;
  /** Connect an additional Gmail account (shows account picker) */
  connectAdditionalAccount: () => Promise<void>;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Refresh the current session */
  refreshSession: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * React context for authentication.
 * Use the useAuth hook instead of accessing this directly.
 */
const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the AuthProvider component.
 */
export interface AuthProviderProps {
  /** Child components that will have access to auth context */
  children: React.ReactNode;
}

/**
 * Authentication provider component.
 *
 * Wraps the application to provide authentication state and methods.
 * Automatically checks for existing session on mount and subscribes
 * to auth state changes.
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Create Supabase client once (stable reference)
  const supabase = React.useMemo(() => createClient(), []);

  /**
   * Maps a Supabase user and optional profile to our AuthUser type.
   * Combines auth data with app-specific profile data.
   *
   * @param supabaseUser - The Supabase auth user
   * @param profile - The user profile from DB (null if not found or not yet loaded)
   * @param profileLoaded - Whether the profile was successfully fetched (vs timeout/error)
   */
  const mapToAuthUser = React.useCallback(
    (supabaseUser: SupabaseUser, profile: UserProfile | null, profileLoaded: boolean): AuthUser => {
      return {
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        // Prefer profile name, fall back to Google metadata
        name: profile?.full_name ?? supabaseUser.user_metadata?.full_name ?? null,
        avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
        // Default to false if no profile exists yet (new users)
        onboardingCompleted: profile?.onboarding_completed ?? false,
        timezone: profile?.timezone ?? null,
        createdAt: supabaseUser.created_at,
        // Track whether profile data is reliable
        profileLoaded,
      };
    },
    []
  );

  /**
   * Result of profile fetch operation.
   * Distinguishes between:
   * - success (profile found or confirmed not to exist)
   * - timeout/error (we couldn't determine profile state)
   */
  type ProfileFetchResult = {
    profile: UserProfile | null;
    success: boolean; // true if fetch completed (even if no profile found), false if timeout/error
  };

  /**
   * Fetches user profile from the database with timeout.
   * Returns an object indicating whether the fetch succeeded and the profile data.
   * This allows distinguishing between "no profile exists" vs "fetch timed out".
   */
  const fetchUserProfile = React.useCallback(
    async (userId: string): Promise<ProfileFetchResult> => {
      logger.info('Fetching user profile', { userId });

      // Use Promise.race for reliable timeout
      // Increased to 8 seconds to reduce false timeouts on slow connections
      const timeoutMs = 8000;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let didTimeout = false;

      const timeoutPromise = new Promise<ProfileFetchResult>((resolve) => {
        timeoutId = setTimeout(() => {
          didTimeout = true;
          logger.warn('Profile fetch timed out', { userId, timeoutMs });
          // Return success: false to indicate we couldn't determine profile state
          resolve({ profile: null, success: false });
        }, timeoutMs);
      });

      const fetchPromise = (async (): Promise<ProfileFetchResult> => {
        try {
          const startTime = Date.now();

          // IMPORTANT: Call getUser() first to ensure auth state is synchronized
          // This is required because when called from onAuthStateChange, the Supabase
          // client's internal JWT may not be fully processed yet. Without this,
          // RLS policies using auth.uid() may fail or hang.
          logger.info('Starting getUser() call', { userId });
          const { error: authError } = await supabase.auth.getUser();
          const getUserMs = Date.now() - startTime;
          logger.info('getUser() completed', { userId, durationMs: getUserMs });

          if (authError) {
            logger.warn('Auth verification failed before profile fetch', {
              userId,
              error: authError.message,
              durationMs: getUserMs,
            });
            return { profile: null, success: false };
          }

          const queryStartTime = Date.now();
          logger.info('Starting profile query', { userId });
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();
          const queryMs = Date.now() - queryStartTime;

          if (profileError) {
            // PGRST116 = row not found, which is expected for new users
            if (profileError.code === 'PGRST116') {
              logger.info('No profile found (new user)', { userId, queryMs });
              // This is a successful fetch - we confirmed no profile exists
              return { profile: null, success: true };
            } else if (profileError.code === '42P01') {
              logger.warn('user_profiles table does not exist - run migrations', { userId, queryMs });
              return { profile: null, success: false };
            } else {
              logger.warn('Failed to fetch user profile', {
                userId,
                error: profileError.message,
                code: profileError.code,
                queryMs,
              });
              return { profile: null, success: false };
            }
          }

          logger.info('Profile fetched successfully', { userId, queryMs });
          return { profile, success: true };
        } catch (err) {
          logger.warn('Profile fetch exception', { userId, error: String(err) });
          return { profile: null, success: false };
        } finally {
          // Clear timeout to prevent stale timeout warnings (e.g., from React StrictMode double-renders)
          if (timeoutId && !didTimeout) {
            clearTimeout(timeoutId);
          }
        }
      })();

      return Promise.race([fetchPromise, timeoutPromise]);
    },
    [supabase]
  );

  /**
   * Tracks whether updateUserState is currently in-flight.
   * Prevents duplicate concurrent profile fetches when multiple auth events
   * fire at the same time (e.g., refreshSession triggers both a direct call
   * and a TOKEN_REFRESHED event in onAuthStateChange).
   */
  const updateInFlightRef = React.useRef(false);

  /**
   * Updates user state with fresh session and profile data.
   * Called on initial load and auth state changes.
   *
   * Key behavior:
   * - If profile fetch succeeds, profileLoaded = true (even if no profile found)
   * - If profile fetch times out/errors, profileLoaded = false
   * - ProtectedRoute uses profileLoaded to avoid redirecting prematurely
   * - Concurrent calls are deduplicated via updateInFlightRef
   */
  const updateUserState = React.useCallback(
    async (supabaseUser: SupabaseUser | null) => {
      if (!supabaseUser) {
        setUser(null);
        return;
      }

      // Deduplicate: skip if another updateUserState call is already in-flight.
      // This prevents double profile fetches when refreshSession() both directly
      // calls updateUserState AND triggers TOKEN_REFRESHED in onAuthStateChange.
      if (updateInFlightRef.current) {
        logger.debug('Skipping concurrent updateUserState call', { userId: supabaseUser.id });
        return;
      }

      updateInFlightRef.current = true;
      logger.info('Updating user state', { userId: supabaseUser.id });

      try {
        const { profile, success: profileLoaded } = await fetchUserProfile(supabaseUser.id);
        const authUser = mapToAuthUser(supabaseUser, profile, profileLoaded);
        setUser(authUser);

        logger.success('User state updated', {
          userId: authUser.id,
          hasProfile: !!profile,
          profileLoaded,
          onboardingCompleted: authUser.onboardingCompleted
        });

        // If profile fetch timed out, retry in background (don't block UI)
        if (!profileLoaded) {
          logger.info('Scheduling background profile retry', { userId: supabaseUser.id });
          setTimeout(async () => {
            const retry = await fetchUserProfile(supabaseUser.id);
            if (retry.success) {
              const retryUser = mapToAuthUser(supabaseUser, retry.profile, true);
              setUser(retryUser);
              logger.success('Background profile retry succeeded', {
                userId: retryUser.id,
                onboardingCompleted: retryUser.onboardingCompleted
              });
            }
          }, 2000); // Retry after 2 seconds
        }
      } catch (err) {
        // Still set user even if profile fetch fails (graceful degradation)
        const authUser = mapToAuthUser(supabaseUser, null, false);
        setUser(authUser);
        logger.warn('Using auth user without profile', {
          userId: supabaseUser.id,
          error: String(err)
        });
      } finally {
        updateInFlightRef.current = false;
      }
    },
    [fetchUserProfile, mapToAuthUser]
  );

  /**
   * Initialize auth state on mount.
   * Uses onAuthStateChange for reliable session detection.
   */
  React.useEffect(() => {
    let mounted = true;
    let initialized = false;

    logger.start('Initializing auth state');

    // Subscribe to auth state changes - this is the primary way to get session
    // Using INITIAL_SESSION event instead of getSession() to avoid lock issues
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info('Auth state changed', { event, hasSession: !!session });

        if (!mounted) return;

        // Mark as initialized on first event
        if (!initialized) {
          initialized = true;
        }

        switch (event) {
          case 'INITIAL_SESSION':
            // This fires on page load with current session state
            if (session?.user) {
              // Set user immediately with basic info to unblock UI
              const basicUser = mapToAuthUser(session.user, null, false);
              setUser(basicUser);
              setIsLoading(false);
              logger.success('Auth initialized with existing session', {
                userId: session.user.id
              });
              // Defer profile fetch to avoid blocking auth callback
              // Supabase auth has internal locks that can cause deadlocks
              // when making auth-related calls inside onAuthStateChange
              setTimeout(() => {
                if (mounted) {
                  updateUserState(session.user);
                }
              }, 0);
            } else {
              setUser(null);
              setIsLoading(false);
              logger.success('Auth initialized (no session)');
            }
            break;

          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            if (session?.user) {
              // Set user immediately, defer profile fetch
              const basicUser = mapToAuthUser(session.user, null, false);
              setUser(basicUser);
              setIsLoading(false);
              setTimeout(() => {
                if (mounted) {
                  updateUserState(session.user);
                }
              }, 0);
            } else {
              setIsLoading(false);
            }
            break;

          case 'SIGNED_OUT':
            setUser(null);
            setIsLoading(false);
            logAuth.logoutSuccess({});
            break;

          case 'USER_UPDATED':
            if (session?.user) {
              // Defer profile fetch for user updates as well
              setTimeout(() => {
                if (mounted) {
                  updateUserState(session.user);
                }
              }, 0);
            }
            break;

          default:
            // Handle other events
            if (session?.user) {
              const basicUser = mapToAuthUser(session.user, null, false);
              setUser(basicUser);
              setIsLoading(false);
              setTimeout(() => {
                if (mounted) {
                  updateUserState(session.user);
                }
              }, 0);
            } else {
              setIsLoading(false);
            }
        }
      }
    );

    // Safety timeout - if no auth event fires within 5 seconds, stop loading
    const safetyTimeout = setTimeout(() => {
      if (mounted && !initialized) {
        logger.warn('Auth initialization timeout - no event received');
        setIsLoading(false);
      }
    }, 5000);

    // Cleanup on unmount
    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [supabase, updateUserState]);

  /**
   * Initiate Gmail OAuth sign-in flow.
   *
   * Redirects user to Google OAuth consent screen with required Gmail scopes.
   * After consent, user is redirected to /api/auth/callback which exchanges
   * the code for a session.
   */
  const signInWithGmail = React.useCallback(async () => {
    logAuth.loginStart({ provider: 'google' });
    setError(null);

    try {
      // Get the callback URL based on current environment
      const redirectTo = `${window.location.origin}/api/auth/callback`;

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: GMAIL_OAUTH_SCOPES,
          redirectTo,
          // Request offline access for refresh tokens (needed for background sync)
          queryParams: {
            access_type: 'offline',
            prompt: 'consent', // Force consent to ensure we get refresh token
          },
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      logger.info('Gmail OAuth initiated', {
        redirectUrl: data.url ? 'generated' : 'missing'
      });

      // Note: The actual redirect happens automatically
      // User will be redirected to Google, then back to our callback URL
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Sign-in failed');
      logAuth.loginError({ error: error.message, provider: 'google' });
      setError(error);
      throw error;
    }
  }, [supabase]);

  /**
   * Connect an additional Gmail account.
   *
   * Redirects to /api/auth/add-gmail-account which uses DIRECT Google OAuth
   * (bypassing Supabase auth) to avoid session switching issues.
   *
   * Flow:
   * 1. Sets a secure cookie with the current user's ID
   * 2. Redirects directly to Google OAuth (not through Supabase)
   * 3. Callback exchanges code for tokens directly with Google
   * 4. Stores tokens in gmail_accounts for the original user
   * 5. User's Supabase session is NEVER touched
   *
   * This ensures the new Gmail account is linked to the current user,
   * and the user stays logged in as their original account.
   */
  const connectAdditionalAccount = React.useCallback(async () => {
    if (!user) {
      throw new Error('Must be logged in to connect additional accounts');
    }

    logger.start('Connecting additional Gmail account', { userId: user.id });
    setError(null);

    // Redirect to server-side add-gmail-account endpoint
    // This uses direct Google OAuth (not Supabase) to avoid session switching
    window.location.href = '/api/auth/add-gmail-account';
  }, [user]);

  /**
   * Sign out the current user.
   *
   * Clears the Supabase session and resets local state.
   * Note: Does NOT revoke Google OAuth tokens (user keeps Gmail permissions).
   */
  const signOut = React.useCallback(async () => {
    logger.start('Signing out user', { userId: user?.id });
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      // State will be cleared by onAuthStateChange listener
      // but we also clear it here for immediate UI update
      setUser(null);
      logAuth.logoutSuccess({});
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Sign-out failed');
      logger.error('Sign-out failed', { error: error.message });
      setError(error);
      throw error;
    }
  }, [supabase, user?.id]);

  /**
   * Refresh the current session and user profile.
   *
   * Useful after:
   * - User completes onboarding
   * - User updates their profile
   * - Session needs token refresh
   */
  const refreshSession = React.useCallback(async () => {
    logger.start('Refreshing session');

    try {
      // First refresh the Supabase session (gets new tokens if needed)
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        throw refreshError;
      }

      if (session?.user) {
        // Re-fetch profile to get latest data (e.g., onboarding status)
        await updateUserState(session.user);
        logger.success('Session refreshed', { userId: session.user.id });
      } else {
        // Session expired or invalid
        setUser(null);
        logger.warn('Session refresh returned no user');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Session refresh failed');
      logger.error('Session refresh failed', { error: error.message });
      setError(error);
      throw error;
    }
  }, [supabase, updateUserState]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      error,
      signInWithGmail,
      connectAdditionalAccount,
      signOut,
      refreshSession,
    }),
    [user, isLoading, error, signInWithGmail, connectAdditionalAccount, signOut, refreshSession]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to access authentication context.
 *
 * Must be used within an AuthProvider. Throws an error if used outside.
 *
 * @returns Authentication context value with user state and methods
 * @throws Error if used outside of AuthProvider
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { user, isLoading, signOut } = useAuth();
 *
 *   if (isLoading) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   if (!user) {
 *     redirect('/');
 *   }
 *
 *   return (
 *     <div>
 *       <h1>Welcome, {user.name}!</h1>
 *       <button onClick={signOut}>Sign Out</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);

  if (context === undefined) {
    throw new Error(
      '🚨 useAuth must be used within an AuthProvider. ' +
      'Make sure your component is wrapped with <AuthProvider>.'
    );
  }

  return context;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default AuthProvider;
