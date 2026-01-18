# IdeaBox - Next Developer Guide

> **Handoff Date:** January 18, 2026
> **Branch:** `claude/review-implementation-plan-Qb7XC`
> **Status:** UI Complete, Ready for Data Layer

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

# 5. Run build to verify everything works
npm run build
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
| Supabase Clients | ✅ | `src/lib/supabase/` |
| Database Types | ✅ | `src/types/database.ts` |
| Config | ✅ | `src/config/app.ts`, `analyzers.ts` |
| Root Layout | ✅ | `src/app/layout.tsx` |

### ✅ Authentication (Complete)
| Area | Status | Key Files |
|------|--------|-----------|
| AuthProvider | ✅ | `src/lib/auth/auth-context.tsx` |
| ProtectedRoute | ✅ | `src/components/auth/ProtectedRoute.tsx` |
| OAuth Callback | ✅ | `src/app/api/auth/callback/route.ts` |
| Landing Page | ✅ | `src/app/page.tsx` |

### ✅ Onboarding (Complete)
| Area | Status | Key Files |
|------|--------|-----------|
| Wizard Container | ✅ | `src/app/onboarding/page.tsx` |
| Welcome Step | ✅ | `src/app/onboarding/components/WelcomeStep.tsx` |
| Accounts Step | ✅ | `src/app/onboarding/components/AccountsStep.tsx` |
| Clients Step | ✅ | `src/app/onboarding/components/ClientsStep.tsx` |

### ✅ Core Pages (Complete - Mock Data)
| Page | Status | Key Files |
|------|--------|-----------|
| Auth Layout | ✅ | `src/app/(auth)/layout.tsx` |
| Inbox | ✅ | `src/app/(auth)/inbox/page.tsx` |
| Actions | ✅ | `src/app/(auth)/actions/page.tsx` |
| Settings | ✅ | `src/app/(auth)/settings/page.tsx` |

### ❌ Not Yet Built (Your Task)
| Priority | Area | Description |
|----------|------|-------------|
| **1** | Data Layer | Hooks and API routes to replace mock data |
| **2** | Gmail Integration | Fetch emails from Gmail API |
| **3** | AI Analyzers | Email categorization and action extraction |
| **4** | Additional Pages | Clients, Archive, Email Detail |

---

## Your Next Task: Data Layer

The UI is complete with mock data. Your job is to connect it to real data.

### Step 1: Create Data Hooks (2-3 hours)

Create hooks in `src/hooks/` to fetch data from Supabase:

**File:** `src/hooks/useEmails.ts`

```typescript
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { TableRow } from '@/types/database';

const logger = createLogger('useEmails');

type Email = TableRow<'emails'>;

interface UseEmailsOptions {
  category?: string;
  clientId?: string;
  limit?: number;
}

export function useEmails(options: UseEmailsOptions = {}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [emails, setEmails] = React.useState<Email[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchEmails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    logger.start('Fetching emails', options);

    try {
      let query = supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(options.limit || 50);

      if (options.category) {
        query = query.eq('category', options.category);
      }

      if (options.clientId) {
        query = query.eq('client_id', options.clientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setEmails(data || []);
      logger.success('Emails fetched', { count: data?.length || 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to fetch emails', { error: message });
      setError(err instanceof Error ? err : new Error(message));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, options.category, options.clientId, options.limit]);

  React.useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return { emails, isLoading, error, refetch: fetchEmails };
}
```

Create similar hooks:
- `src/hooks/useActions.ts` - Fetch action items
- `src/hooks/useClients.ts` - Fetch clients
- `src/hooks/index.ts` - Barrel export

### Step 2: Create API Routes (2-3 hours)

Create CRUD API routes in `src/app/api/`:

```
app/api/
├── emails/
│   ├── route.ts          # GET: List, POST: Create
│   ├── [id]/
│   │   └── route.ts      # GET: Single, PATCH: Update, DELETE: Archive
│   └── sync/
│       └── route.ts      # POST: Trigger Gmail sync
├── actions/
│   ├── route.ts          # GET: List, POST: Create
│   └── [id]/
│       └── route.ts      # GET, PATCH, DELETE
└── clients/
    ├── route.ts          # GET: List, POST: Create
    └── [id]/
        └── route.ts      # GET, PATCH, DELETE
```

**Example API Route:** `src/app/api/emails/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('EmailsAPI');

export async function GET(request: Request) {
  logger.start('GET /api/emails');

  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('emails')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Query failed', { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.success('Emails fetched', { count: data.length });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Step 3: Connect Pages to Real Data (1-2 hours)

Update each page to use the hooks instead of mock data:

**Inbox Page:** `src/app/(auth)/inbox/page.tsx`

```typescript
// Replace this:
const [emails, setEmails] = React.useState<MockEmail[]>([]);
React.useEffect(() => {
  setTimeout(() => setEmails(MOCK_EMAILS), 800);
}, []);

// With this:
import { useEmails } from '@/hooks';
const { emails, isLoading, error, refetch } = useEmails();
```

**Actions Page:** `src/app/(auth)/actions/page.tsx`

```typescript
import { useActions } from '@/hooks';
const { actions, isLoading, error } = useActions();
```

---

## Important Technical Notes

### TypeScript + Supabase Pattern

The Supabase client has type inference limitations. When you encounter `never` type errors, use this pattern:

```typescript
// For queries with type issues, use explicit cast
const { data, error } = await (supabase as any)
  .from('table_name')
  .select('*');

// Or type the result explicitly
interface QueryResult {
  data: TableRow<'emails'>[] | null;
  error: { message: string } | null;
}

const result = await supabase
  .from('emails')
  .select('*') as unknown as QueryResult;
```

### Build Configuration

The app uses dynamic rendering due to auth state. This is configured in `src/app/layout.tsx`:

```typescript
export const dynamic = 'force-dynamic';
```

### Mock Data Pattern

Each page has mock data clearly marked for replacement:

```typescript
// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA (Remove when hooks are implemented)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_EMAILS: MockEmail[] = [
  // ...
];
```

And a developer note at the bottom of each page:

```tsx
<div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
  <p className="text-sm text-yellow-700 dark:text-yellow-400">
    <strong>Developer Note:</strong> This page displays mock data.
    Next steps: Create useEmails hook and API routes.
  </p>
</div>
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

// Domain-specific
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
import type { AuthUser } from '@/lib/auth';

// Hooks (after you create them)
import { useEmails, useActions, useClients } from '@/hooks';
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
| Protected route | `src/components/auth/ProtectedRoute.tsx` |

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

## Database Schema Reference

Key tables you'll work with:

| Table | Purpose |
|-------|---------|
| `user_profiles` | User data, onboarding status |
| `gmail_accounts` | Connected Gmail accounts with tokens |
| `emails` | Synced emails with metadata |
| `action_items` | Extracted tasks from emails |
| `clients` | Client/contact management |
| `email_analyses` | AI analysis results |

See `docs/DATABASE_SCHEMA.md` for full schema.

---

## Questions?

1. **Architecture decisions:** See `docs/DECISIONS.md`
2. **Component specs:** See `docs/PHASE_1_IMPLEMENTATION.md`
3. **Code style:** See `docs/CODING_STANDARDS.md`
4. **AI analyzers:** See `docs/AI_ANALYZER_SYSTEM.md`
5. **Database schema:** See `docs/DATABASE_SCHEMA.md`
6. **Implementation status:** See `docs/IMPLEMENTATION_STATUS.md`

---

## Checklist Before You Start

- [ ] `.env.local` configured with all credentials
- [ ] Supabase project created with schema applied
- [ ] Google Cloud OAuth credentials set up
- [ ] `npm install` completed
- [ ] `npm run dev` works (http://localhost:3000)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds

---

## Summary of Your Tasks

1. **Create hooks** in `src/hooks/`:
   - `useEmails.ts`
   - `useActions.ts`
   - `useClients.ts`
   - `index.ts` (barrel export)

2. **Create API routes** in `src/app/api/`:
   - `/emails` (list, create, sync)
   - `/actions` (list, create, update, delete)
   - `/clients` (list, create, update, delete)

3. **Connect pages** to real data:
   - Update Inbox page to use `useEmails`
   - Update Actions page to use `useActions`
   - Update Settings page to use actual save logic

4. **Future phases:**
   - Gmail integration (fetch from Gmail API)
   - AI analyzers (categorize, extract actions)
   - Additional pages (Clients, Archive, Email Detail)

Good luck! 🚀
