# IdeaBox - Next Developer Guide

> **Handoff Date:** January 18, 2026
> **Branch:** `claude/review-implementation-plan-esNph`
> **Status:** Data Layer Complete, Ready for Gmail Integration

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

### ✅ Core Pages (Connected to Real Data)
| Page | Status | Key Files |
|------|--------|-----------|
| Auth Layout | ✅ | `src/app/(auth)/layout.tsx` |
| Inbox | ✅ | `src/app/(auth)/inbox/page.tsx` (uses useEmails) |
| Actions | ✅ | `src/app/(auth)/actions/page.tsx` (uses useActions) |
| Settings | ✅ | `src/app/(auth)/settings/page.tsx` (mock data) |

### ✅ Data Layer (Complete)
| Area | Status | Key Files |
|------|--------|-----------|
| Data Hooks | ✅ | `src/hooks/useEmails.ts`, `useActions.ts`, `useClients.ts` |
| API Routes | ✅ | `src/app/api/emails/`, `actions/`, `clients/` |
| API Utilities | ✅ | `src/lib/api/utils.ts`, `schemas.ts` |
| Database Seed | ✅ | `scripts/seed.ts` (npm run seed) |
| Tests | ✅ | 34 tests passing (`npm run test`) |

### ❌ Not Yet Built (Your Task)
| Priority | Area | Description |
|----------|------|-------------|
| **1** | Gmail Integration | Fetch emails from Gmail API |
| **2** | AI Analyzers | Email categorization and action extraction |
| **3** | Additional Pages | Clients, Archive, Email Detail |

---

## Your Next Task: Gmail Integration

The data layer is complete. Your job is to fetch real emails from Gmail.

### Step 1: Create Gmail Service

```typescript
// src/lib/gmail/gmail-service.ts
import { google } from 'googleapis';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('GmailService');

export class GmailService {
  private gmail;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(maxResults = 50) {
    logger.start('Fetching messages', { maxResults });
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
    });
    return response.data.messages || [];
  }

  async getMessage(id: string) {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });
    return response.data;
  }

  parseEmail(message: gmail_v1.Schema$Message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value;

    return {
      subject: getHeader('subject'),
      sender_email: getHeader('from'),
      date: getHeader('date'),
      snippet: message.snippet,
      // ... parse more fields
    };
  }
}
```

### Step 2: Create Token Manager

```typescript
// src/lib/gmail/token-manager.ts
import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';

export class TokenManager {
  async getValidToken(gmailAccountId: string): Promise<string> {
    const supabase = await createServerClient();

    // Fetch current token from database
    const { data: account } = await supabase
      .from('gmail_accounts')
      .select('access_token, refresh_token, token_expiry')
      .eq('id', gmailAccountId)
      .single();

    // Check if token is expired
    if (new Date(account.token_expiry) < new Date()) {
      // Refresh the token
      return this.refreshToken(gmailAccountId, account.refresh_token);
    }

    return account.access_token;
  }

  private async refreshToken(accountId: string, refreshToken: string) {
    // Use googleapis to refresh
    // Update database with new token
    // Return new access token
  }
}
```

### Step 3: Create Sync API Route

```typescript
// src/app/api/emails/sync/route.ts
import { NextResponse } from 'next/server';
import { GmailService } from '@/lib/gmail/gmail-service';
import { TokenManager } from '@/lib/gmail/token-manager';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const tokenManager = new TokenManager();

  // 1. Get user's Gmail accounts
  // 2. For each account, get valid token
  // 3. Fetch messages from Gmail
  // 4. Parse and store in Supabase
  // 5. Return sync results
}
```

### Existing Hooks Are Ready

The hooks and pages are already set up to display emails:

```typescript
// Already implemented - just needs real data
import { useEmails } from '@/hooks';
const { emails, isLoading, error, refetch } = useEmails();
```

Once Gmail sync stores emails in Supabase, they'll automatically appear!

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

// Data Hooks (already created!)
import { useEmails, useActions, useClients } from '@/hooks';
import type { Email, Action, Client, EmailCategory, ActionType } from '@/hooks';
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
| **Data Hooks** | `src/hooks/index.ts` |
| useEmails | `src/hooks/useEmails.ts` |
| useActions | `src/hooks/useActions.ts` |
| useClients | `src/hooks/useClients.ts` |
| **API Utilities** | `src/lib/api/index.ts` |
| API helpers | `src/lib/api/utils.ts` |
| Zod schemas | `src/lib/api/schemas.ts` |
| **Seed script** | `scripts/seed.ts` |

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

1. **Create Gmail service** in `src/lib/gmail/`:
   - `gmail-service.ts` - Gmail API wrapper
   - `token-manager.ts` - OAuth token refresh logic
   - `email-parser.ts` - Parse Gmail messages to our Email type

2. **Create sync API route**:
   - `src/app/api/emails/sync/route.ts` - Trigger Gmail sync

3. **Wire up the Sync button**:
   - The Inbox page already has a Sync button
   - Connect it to call the sync API

4. **Test with real Gmail data**:
   - Seed script creates test data: `npm run seed`
   - But real emails come from Gmail sync

5. **Future phases:**
   - AI analyzers (categorize, extract actions)
   - Additional pages (Clients, Archive, Email Detail)
   - Real-time updates with Supabase subscriptions

## Available Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run tests (34 passing)
npm run test:run     # Run tests once
npm run lint         # ESLint check
npm run seed         # Seed database with test data
```

Good luck! 🚀
