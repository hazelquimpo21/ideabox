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
 * - Login/logout functionality
 * - Session persistence across page refreshes
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
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('AuthContext');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User profile information.
 * Extended from Supabase user with app-specific fields.
 */
export interface AuthUser {
  /** Unique user identifier (from Supabase) */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  name?: string | null;
  /** URL to user's avatar image */
  avatarUrl?: string | null;
  /** Whether user has completed onboarding */
  onboardingCompleted?: boolean;
  /** User's preferred timezone */
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

  /**
   * Initialize auth state on mount.
   * Checks for existing Supabase session.
   */
  React.useEffect(() => {
    const initializeAuth = async () => {
      logger.start('Initializing auth state');

      try {
        // TODO: Implement actual Supabase session check
        // const { data: { session } } = await supabase.auth.getSession();
        // if (session?.user) {
        //   setUser(mapSupabaseUser(session.user));
        // }

        // For now, simulate checking auth (stub implementation)
        await new Promise(resolve => setTimeout(resolve, 100));

        logger.success('Auth state initialized', { hasUser: false });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Auth initialization failed');
        logger.error('Auth initialization failed', { error: error.message });
        setError(error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // TODO: Subscribe to auth state changes
    // const { data: { subscription } } = supabase.auth.onAuthStateChange(
    //   (event, session) => {
    //     if (session?.user) {
    //       setUser(mapSupabaseUser(session.user));
    //     } else {
    //       setUser(null);
    //     }
    //   }
    // );
    //
    // return () => subscription.unsubscribe();
  }, []);

  /**
   * Initiate Gmail OAuth sign-in flow.
   */
  const signInWithGmail = React.useCallback(async () => {
    logger.start('Initiating Gmail sign-in');
    setError(null);

    try {
      // TODO: Implement actual Supabase OAuth
      // await supabase.auth.signInWithOAuth({
      //   provider: 'google',
      //   options: {
      //     scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
      //     redirectTo: `${window.location.origin}/api/auth/callback`,
      //   },
      // });

      logger.info('Gmail sign-in initiated - redirect pending');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Sign-in failed');
      logger.error('Gmail sign-in failed', { error: error.message });
      setError(error);
      throw error;
    }
  }, []);

  /**
   * Sign out the current user.
   */
  const signOut = React.useCallback(async () => {
    logger.start('Signing out user');
    setError(null);

    try {
      // TODO: Implement actual Supabase sign out
      // await supabase.auth.signOut();

      setUser(null);
      logger.success('User signed out');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Sign-out failed');
      logger.error('Sign-out failed', { error: error.message });
      setError(error);
      throw error;
    }
  }, []);

  /**
   * Refresh the current session.
   * Useful for updating user data after profile changes.
   */
  const refreshSession = React.useCallback(async () => {
    logger.start('Refreshing session');

    try {
      // TODO: Implement actual session refresh
      // const { data: { session } } = await supabase.auth.refreshSession();
      // if (session?.user) {
      //   setUser(mapSupabaseUser(session.user));
      // }

      logger.success('Session refreshed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Session refresh failed');
      logger.error('Session refresh failed', { error: error.message });
      setError(error);
      throw error;
    }
  }, []);

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
