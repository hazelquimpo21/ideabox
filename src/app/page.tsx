/**
 * 🏠 IdeaBox Landing Page
 *
 * The entry point for unauthenticated users. Features:
 * - Hero section with value proposition
 * - Gmail sign-in button
 * - Feature highlights
 * - Automatic redirect for authenticated users
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEHAVIOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Unauthenticated users: See landing page with sign-in CTA
 * - Authenticated users (onboarding incomplete): Redirect to /onboarding
 * - Authenticated users (onboarding complete): Redirect to /discover
 * - Error state: Shows error toast if redirected with error param
 *
 * @module app/page
 */

'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardContent, useToast, FullPageLoader } from '@/components/ui';
import { createLogger } from '@/lib/utils/logger';
import {
  Mail,
  CheckSquare,
  Users,
  Sparkles,
  Inbox,
  Zap,
  Shield,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('LandingPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Feature card data structure.
 */
interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Features displayed on the landing page.
 * Each feature highlights a key benefit of IdeaBox.
 */
const FEATURES: Feature[] = [
  {
    icon: <Sparkles className="h-8 w-8 text-primary" />,
    title: 'Smart Categorization',
    description:
      'AI automatically sorts your emails into meaningful categories: action items, events, newsletters, and more.',
  },
  {
    icon: <CheckSquare className="h-8 w-8 text-primary" />,
    title: 'Auto Action Items',
    description:
      'Never miss a to-do buried in email. IdeaBox extracts tasks with deadlines and urgency scores.',
  },
  {
    icon: <Users className="h-8 w-8 text-primary" />,
    title: 'Client Context',
    description:
      'All emails from each client organized together. Track relationships and never lose important threads.',
  },
  {
    icon: <Inbox className="h-8 w-8 text-primary" />,
    title: 'Unified Inbox',
    description:
      'Connect multiple Gmail accounts and manage everything from one intelligent dashboard.',
  },
  {
    icon: <Zap className="h-8 w-8 text-primary" />,
    title: 'Lightning Fast',
    description:
      'Process hundreds of emails in seconds. Our AI works in the background while you focus on what matters.',
  },
  {
    icon: <Shield className="h-8 w-8 text-primary" />,
    title: 'Privacy First',
    description:
      'Your emails stay yours. We use industry-standard encryption and never sell your data.',
  },
];

/**
 * Error messages for OAuth error codes.
 */
const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Authentication was cancelled. Please try again.',
  exchange_failed: 'Failed to complete sign in. Please try again.',
  auth_error: 'An authentication error occurred. Please try again.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Feature card component displaying a single feature.
 */
function FeatureCard({ icon, title, description }: Feature) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="mb-4">{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Google/Gmail icon component.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Landing page component.
 *
 * Displays marketing content for unauthenticated users and
 * handles redirects for authenticated users.
 */
export default function LandingPage() {
  const { user, isLoading, isAuthenticated, signInWithGmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Track sign-in button loading state
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle OAuth errors from redirect
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    const error = searchParams.get('error');
    if (error && ERROR_MESSAGES[error]) {
      logger.warn('OAuth error on landing page', { error });
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: ERROR_MESSAGES[error],
      });
    }
  }, [searchParams, toast]);

  // ───────────────────────────────────────────────────────────────────────────
  // Redirect authenticated users
  // ───────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      const returnUrl = searchParams.get('returnUrl');

      if (!user.onboardingCompleted) {
        logger.info('Redirecting to onboarding', { userId: user.id });
        router.replace('/onboarding');
      } else if (returnUrl) {
        logger.info('Redirecting to return URL', { returnUrl });
        router.replace(decodeURIComponent(returnUrl));
      } else {
        logger.info('Redirecting to discover', { userId: user.id });
        router.replace('/discover');
      }
    }
  }, [isLoading, isAuthenticated, user, router, searchParams]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handle sign in
  // ───────────────────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGmail();
      // User will be redirected by OAuth flow
    } catch {
      setIsSigningIn(false);
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: 'Unable to initiate sign in. Please try again.',
      });
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Loading state
  // ───────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <FullPageLoader message="Loading..." />;
  }

  // Don't show landing page if authenticated (redirect is pending)
  if (isAuthenticated) {
    return <FullPageLoader message="Redirecting..." />;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render landing page
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">IdeaBox</span>
          </div>
          <Button
            variant="outline"
            onClick={handleSignIn}
            disabled={isSigningIn}
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          Hero Section
          ───────────────────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="container px-4 md:px-8 py-16 md:py-24 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Take control of your inbox{' '}
              <span className="text-primary">with AI</span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              IdeaBox automatically categorizes emails, extracts action items,
              and helps you focus on what matters. Built for professionals
              managing 200+ emails daily.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="gap-2 text-base"
              >
                <GoogleIcon className="h-5 w-5" />
                {isSigningIn ? 'Connecting...' : 'Connect Gmail Account'}
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Free to start. No credit card required.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────────
            Features Section
            ───────────────────────────────────────────────────────────────────── */}
        <section className="container px-4 md:px-8 py-16 md:py-24 bg-muted/30">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-bold text-center mb-4">
              Everything you need to manage email overload
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              Stop drowning in emails. Let AI handle the sorting so you can
              focus on the work that matters.
            </p>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────────
            CTA Section
            ───────────────────────────────────────────────────────────────────── */}
        <section className="container px-4 md:px-8 py-16 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to reclaim your inbox?
            </h2>
            <p className="text-muted-foreground mb-8">
              Join professionals who have transformed their email workflow with
              IdeaBox. Setup takes less than 2 minutes.
            </p>
            <Button
              size="lg"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="gap-2"
            >
              <GoogleIcon className="h-5 w-5" />
              Get Started Free
            </Button>
          </div>
        </section>
      </main>

      {/* ─────────────────────────────────────────────────────────────────────
          Footer
          ───────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="container px-4 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                IdeaBox - AI Email Intelligence
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built with Next.js, Supabase, and OpenAI
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
