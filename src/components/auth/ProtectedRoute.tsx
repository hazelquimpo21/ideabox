/**
 * 🛡️ Protected Route Wrapper Component
 *
 * Provides authentication guard for pages that require user login.
 * Wraps page content and handles loading states, redirects for
 * unauthenticated users, and onboarding flow detection.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Automatic redirect to landing page if not authenticated
 * - Optional redirect to onboarding for users who haven't completed it
 * - Loading state with customizable spinner/message
 * - Preserves intended destination for post-login redirect
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic usage (in a page layout):
 * ```tsx
 * // app/(auth)/layout.tsx
 * import { ProtectedRoute } from '@/components/auth';
 *
 * export default function AuthLayout({ children }) {
 *   return <ProtectedRoute>{children}</ProtectedRoute>;
 * }
 * ```
 *
 * With onboarding requirement:
 * ```tsx
 * <ProtectedRoute requireOnboarding>
 *   <InboxPage />
 * </ProtectedRoute>
 * ```
 *
 * With custom loading message:
 * ```tsx
 * <ProtectedRoute loadingMessage="Preparing your inbox...">
 *   <InboxPage />
 * </ProtectedRoute>
 * ```
 *
 * @module components/auth/ProtectedRoute
 */

'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { FullPageLoader } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ProtectedRoute');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for the ProtectedRoute component.
 */
export interface ProtectedRouteProps {
  /** Child components to render when authenticated */
  children: React.ReactNode;

  /**
   * Whether to require onboarding completion.
   * If true, users who haven't completed onboarding are redirected to /onboarding.
   * @default true
   */
  requireOnboarding?: boolean;

  /**
   * URL to redirect unauthenticated users.
   * @default '/'
   */
  redirectTo?: string;

  /**
   * URL to redirect users who need onboarding.
   * @default '/onboarding'
   */
  onboardingRedirect?: string;

  /**
   * Custom message to show during loading.
   * @default 'Loading...'
   */
  loadingMessage?: string;

  /**
   * Optional custom loading component.
   * If provided, replaces the default FullPageLoader.
   */
  loadingComponent?: React.ReactNode;

  /**
   * Callback fired when user is redirected due to auth failure.
   * Useful for analytics or cleanup.
   */
  onRedirect?: (reason: 'unauthenticated' | 'onboarding_required') => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Protects routes that require authentication.
 *
 * This component checks the current auth state and:
 * 1. Shows a loading state while auth is being determined
 * 2. Redirects to login page if user is not authenticated
 * 3. Optionally redirects to onboarding if user hasn't completed it
 * 4. Renders children if all checks pass
 *
 * @example
 * ```tsx
 * // In a layout file for protected routes
 * export default function ProtectedLayout({ children }) {
 *   return (
 *     <ProtectedRoute requireOnboarding>
 *       <Navbar />
 *       <Sidebar />
 *       <main>{children}</main>
 *     </ProtectedRoute>
 *   );
 * }
 * ```
 */
export function ProtectedRoute({
  children,
  requireOnboarding = true,
  redirectTo = '/',
  onboardingRedirect = '/onboarding',
  loadingMessage = 'Loading...',
  loadingComponent,
  onRedirect,
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Track if we've already initiated a redirect to prevent double-redirects
  const hasRedirected = React.useRef(false);

  React.useEffect(() => {
    // Don't redirect while still loading auth state
    if (isLoading) {
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected.current) {
      return;
    }

    // Check authentication
    if (!isAuthenticated || !user) {
      logger.info('Redirecting unauthenticated user', {
        from: pathname,
        to: redirectTo,
      });

      hasRedirected.current = true;
      onRedirect?.('unauthenticated');

      // Store intended destination for post-login redirect
      const returnUrl = encodeURIComponent(pathname);
      router.replace(`${redirectTo}?returnUrl=${returnUrl}`);
      return;
    }

    // Check onboarding requirement
    if (requireOnboarding && !user.onboardingCompleted) {
      // Don't redirect if already on onboarding page
      if (pathname.startsWith('/onboarding')) {
        return;
      }

      logger.info('Redirecting to onboarding', {
        userId: user.id,
        from: pathname,
      });

      hasRedirected.current = true;
      onRedirect?.('onboarding_required');
      router.replace(onboardingRedirect);
      return;
    }

    // All checks passed - user can view the content
    logger.debug('Access granted', {
      userId: user.id,
      path: pathname,
      onboardingCompleted: user.onboardingCompleted,
    });
  }, [
    isLoading,
    isAuthenticated,
    user,
    pathname,
    requireOnboarding,
    redirectTo,
    onboardingRedirect,
    router,
    onRedirect,
  ]);

  // Reset redirect flag when pathname changes (user navigated somewhere)
  React.useEffect(() => {
    hasRedirected.current = false;
  }, [pathname]);

  // Show loading state while determining auth
  if (isLoading) {
    return loadingComponent ?? <FullPageLoader message={loadingMessage} />;
  }

  // Don't render children if not authenticated (redirect is pending)
  if (!isAuthenticated || !user) {
    return loadingComponent ?? <FullPageLoader message="Redirecting..." />;
  }

  // Don't render if onboarding is required but not completed
  // (unless we're already on the onboarding page)
  if (requireOnboarding && !user.onboardingCompleted) {
    if (!pathname.startsWith('/onboarding')) {
      return loadingComponent ?? <FullPageLoader message="Redirecting to setup..." />;
    }
  }

  // All checks passed - render the protected content
  return <>{children}</>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIGHER-ORDER COMPONENT VARIANT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Higher-order component variant for protecting routes.
 *
 * Useful when you prefer HOC pattern over wrapper components.
 *
 * @example
 * ```tsx
 * function InboxPage() {
 *   return <div>Inbox content</div>;
 * }
 *
 * export default withProtectedRoute(InboxPage, {
 *   requireOnboarding: true,
 * });
 * ```
 */
export function withProtectedRoute<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  function WithProtectedRoute(props: P) {
    return (
      <ProtectedRoute {...options}>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  }

  WithProtectedRoute.displayName = `withProtectedRoute(${displayName})`;

  return WithProtectedRoute;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default ProtectedRoute;
