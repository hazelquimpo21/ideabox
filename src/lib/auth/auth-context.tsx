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
   */
  const mapToAuthUser = React.useCallback(
    (supabaseUser: SupabaseUser, profile?: UserProfile | null): AuthUser => {
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
      };
    },
    []
  );

  /**
   * Fetches user profile from the database.
   * Creates a profile if one doesn't exist (for new users).
   */
  const fetchUserProfile = React.useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = row not found, which is expected for new users
        logger.warn('Failed to fetch user profile', {
          userId,
          error: profileError.message
        });
      }

      return profile;
    },
    [supabase]
  );

  /**
   * Updates user state with fresh session and profile data.
   * Called on initial load and auth state changes.
   */
  const updateUserState = React.useCallback(
    async (supabaseUser: SupabaseUser | null) => {
      if (!supabaseUser) {
        setUser(null);
        return;
      }

      try {
        const profile = await fetchUserProfile(supabaseUser.id);
        const authUser = mapToAuthUser(supabaseUser, profile);
        setUser(authUser);

        logAuth.loginSuccess({
          userId: authUser.id,
          onboardingCompleted: authUser.onboardingCompleted
        });
      } catch {
        // Still set user even if profile fetch fails (graceful degradation)
        const authUser = mapToAuthUser(supabaseUser, null);
        setUser(authUser);
        logger.warn('Using auth user without profile', { userId: supabaseUser.id });
      }
    },
    [fetchUserProfile, mapToAuthUser]
  );

  /**
   * Initialize auth state on mount.
   * Checks for existing Supabase session and sets up state change listener.
   */
  React.useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      logger.start('Initializing auth state');

      try {
        // Check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (mounted) {
          if (session?.user) {
            await updateUserState(session.user);
            logger.success('Auth initialized with existing session', {
              userId: session.user.id
            });
          } else {
            setUser(null);
            logger.success('Auth initialized (no session)');
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Auth initialization failed');
        logger.error('Auth initialization failed', { error: error.message });
        if (mounted) {
          setError(error);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info('Auth state changed', { event, hasSession: !!session });

        if (!mounted) return;

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            if (session?.user) {
              await updateUserState(session.user);
            }
            break;

          case 'SIGNED_OUT':
            setUser(null);
            logAuth.logoutSuccess({});
            break;

          case 'USER_UPDATED':
            if (session?.user) {
              await updateUserState(session.user);
            }
            break;

          default:
            // Handle other events (INITIAL_SESSION, PASSWORD_RECOVERY, etc.)
            if (session?.user) {
              await updateUserState(session.user);
            }
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      mounted = false;
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
      signOut,
      refreshSession,
    }),
    [user, isLoading, error, signInWithGmail, signOut, refreshSession]
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
