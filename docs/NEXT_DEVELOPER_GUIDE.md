# IdeaBox - Next Developer Guide

> **Handoff Date:** January 18, 2026
> **Branch:** `claude/add-logging-documentation-uV3P1`

Welcome! This guide gets you up to speed quickly on the IdeaBox codebase and tells you exactly what to build next.

---

## Quick Start (5 minutes)

```bash
# 1. Clone and install
git clone <repo-url>
cd ideabox
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase and Google OAuth credentials

# 3. Run development server
npm run dev

# 4. Verify TypeScript compiles
npx tsc --noEmit
```

---

## What's Been Built

### ✅ Foundation Layer (Complete)
| Area | Status | Key Files |
|------|--------|-----------|
| UI Components | ✅ | `src/components/ui/` (14 components) |
| Layout Components | ✅ | `src/components/layout/` (Navbar, Sidebar, PageHeader) |
| Logger | ✅ | `src/lib/utils/logger.ts` |
| OpenAI Client | ✅ | `src/lib/ai/openai-client.ts` |
| Auth Context (stub) | ✅ | `src/lib/auth/auth-context.tsx` |
| Supabase Clients | ✅ | `src/lib/supabase/` |
| Database Types | ✅ | `src/types/database.ts` |
| Config | ✅ | `src/config/app.ts`, `analyzers.ts` |
| Root Layout | ✅ | `src/app/layout.tsx` |

### ❌ Not Yet Built (Your Task)
| Priority | Area | Estimated Effort |
|----------|------|------------------|
| **1** | Auth + Onboarding | Medium |
| **2** | Core Pages (Inbox, Actions, Settings) | Large |
| **3** | Data Layer (hooks, API routes) | Medium |
| **4** | Services + AI Analyzers | Large |

---

## Your Next Task: Authentication & Onboarding

The layout components are ready. Your job is to build the auth flow.

### Step 1: Complete AuthProvider (30 min)

The auth context exists but is a stub. Wire it to Supabase.

**File:** `src/lib/auth/auth-context.tsx`

```typescript
// Replace the stub in initializeAuth() with:
import { createBrowserClient } from '@/lib/supabase/client';

const supabase = createBrowserClient();

// Check existing session
const { data: { session } } = await supabase.auth.getSession();
if (session?.user) {
  setUser({
    id: session.user.id,
    email: session.user.email!,
    name: session.user.user_metadata?.full_name,
    avatarUrl: session.user.user_metadata?.avatar_url,
  });
}

// Subscribe to auth changes
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    logger.info('Auth state changed', { event });
    if (session?.user) {
      setUser({ /* map session.user */ });
    } else {
      setUser(null);
    }
  }
);

return () => subscription.unsubscribe();
```

### Step 2: Create Landing Page (1 hour)

Replace the boilerplate in `src/app/page.tsx`.

**Requirements:**
- Hero section with tagline: "Take control of your inbox with AI"
- "Connect with Gmail" button using `signInWithGmail()` from `useAuth`
- 3-4 feature highlight cards
- Redirect authenticated users to `/inbox`

**Example structure:**
```tsx
'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { Mail, CheckSquare, Users, Sparkles } from 'lucide-react';

export default function LandingPage() {
  const { user, isLoading, signInWithGmail } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !isLoading) {
      router.push('/inbox');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <FullPageLoader />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      {/* Hero */}
      <h1 className="text-4xl font-bold text-center mb-4">
        Take control of your inbox with AI
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-xl mb-8">
        IdeaBox automatically categorizes emails, extracts action items,
        and helps you focus on what matters.
      </p>

      <Button size="lg" onClick={signInWithGmail}>
        <Mail className="mr-2 h-5 w-5" />
        Connect Gmail Account
      </Button>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 mt-16 max-w-4xl">
        {/* Feature cards */}
      </div>
    </main>
  );
}
```

### Step 3: Create OAuth API Routes (1 hour)

**Create:** `src/app/api/auth/callback/route.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('AuthCallback');

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/onboarding';

  if (code) {
    logger.start('Processing OAuth callback');

    const supabase = createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      logger.success('OAuth callback successful');
      return NextResponse.redirect(`${origin}${next}`);
    }

    logger.error('OAuth callback failed', { error: error.message });
  }

  return NextResponse.redirect(`${origin}/?error=auth_error`);
}
```

### Step 4: Build Onboarding Wizard (2-3 hours)

**Create directory:** `src/app/onboarding/`

**Files to create:**
```
app/onboarding/
├── page.tsx              # Main wizard component
├── layout.tsx            # Minimal layout (no sidebar)
└── components/
    ├── OnboardingWizard.tsx
    ├── WelcomeStep.tsx
    ├── AccountsStep.tsx
    └── ClientsStep.tsx
```

**Wizard steps:**
1. **Welcome** - Brief intro, "Get Started" button
2. **Connect Accounts** - Show connected Gmail, option to add more
3. **Add Clients** - Optional: pre-populate client names

**Important:** After completing onboarding:
```typescript
// Set onboarding_completed = true in user_profiles
await supabase
  .from('user_profiles')
  .update({ onboarding_completed: true })
  .eq('user_id', user.id);

// Trigger initial email sync
await fetch('/api/emails/sync', { method: 'POST' });

// Redirect to inbox
router.push('/inbox');
```

### Step 5: Create Protected Route Wrapper (30 min)

**Create:** `src/components/auth/ProtectedRoute.tsx`

```typescript
'use client';

import { useAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { FullPageLoader } from '@/components/ui';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageLoader message="Loading..." />;
  }

  if (!user) {
    redirect('/');
  }

  return <>{children}</>;
}
```

---

## Code Patterns to Follow

### 1. Logging (MANDATORY)

Every service, API route, and component with side effects MUST use logging:

```typescript
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('MyComponent');

// Lifecycle
logger.start('Starting operation', { userId });
logger.success('Operation completed', { count: 10 });
logger.error('Operation failed', { error: err.message });

// Domain-specific (for common operations)
import { logEmail, logAI, logAuth, logDB } from '@/lib/utils/logger';
logAuth.loginSuccess({ userId: '123' });
logEmail.fetchStart({ accountId: '456' });
```

### 2. File Size Limit

**Maximum 400 lines per file.** If approaching this limit:
- Extract sub-components
- Move logic to custom hooks
- Split into smaller modules

### 3. JSDoc Documentation

Every exported component/function needs JSDoc:

```typescript
/**
 * Page header with breadcrumbs and actions.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Inbox"
 *   breadcrumbs={[{ label: 'Home', href: '/' }]}
 *   actions={<Button>Sync</Button>}
 * />
 * ```
 */
export function PageHeader({ ... }: PageHeaderProps) { ... }
```

### 4. Component Imports

Use barrel exports for cleaner imports:

```typescript
// Layout components
import { Navbar, Sidebar, PageHeader } from '@/components/layout';

// UI components
import { Button, Card, Badge, useToast } from '@/components/ui';

// Auth
import { useAuth } from '@/lib/auth';
```

---

## Key Files Reference

| Purpose | File |
|---------|------|
| App config | `src/config/app.ts` |
| Analyzer config | `src/config/analyzers.ts` |
| Database types | `src/types/database.ts` |
| Logger | `src/lib/utils/logger.ts` |
| OpenAI client | `src/lib/ai/openai-client.ts` |
| Supabase browser | `src/lib/supabase/client.ts` |
| Supabase server | `src/lib/supabase/server.ts` |
| Auth context | `src/lib/auth/auth-context.tsx` |

---

## Testing

When adding features:
- **Services:** 80%+ coverage
- **Analyzers:** 90%+ coverage
- **Components:** 60%+ coverage

Run tests with:
```bash
npm test
npm run test:coverage
```

---

## Environment Variables

Required in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Gmail OAuth (Google Cloud Console)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# OpenAI
OPENAI_API_KEY=sk-xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
LOG_LEVEL=debug
```

---

## Questions?

1. **Architecture decisions:** See `docs/DECISIONS.md`
2. **Component specs:** See `docs/PHASE_1_IMPLEMENTATION.md`
3. **Code style:** See `docs/CODING_STANDARDS.md`
4. **AI analyzers:** See `docs/AI_ANALYZER_SYSTEM.md`
5. **Database schema:** See `docs/DATABASE_SCHEMA.md`

---

## Checklist Before You Start

- [ ] `.env.local` configured with all credentials
- [ ] Supabase project created with schema applied
- [ ] Google Cloud OAuth credentials set up
- [ ] `npm install` completed
- [ ] `npm run dev` works
- [ ] `npx tsc --noEmit` passes

Good luck! 🚀
