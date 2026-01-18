# IdeaBox - System Architecture

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (modular, customizable)
- **State Management**: React Context + hooks (keep simple initially)
- **Calendar**: react-big-calendar or similar
- **Forms**: react-hook-form + zod validation

### Backend
- **Runtime**: Node.js (via Next.js API routes + separate services)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Authentication**: Supabase Auth + Gmail OAuth (External app, testing mode)
- **AI/LLM**: OpenAI GPT-4.1-mini (single model, no fallback - see PROJECT_OVERVIEW.md for rationale)
- **Email API**: Gmail API via googleapis npm package
- **Background Jobs**: Supabase pg_cron + Edge Functions (NOT Vercel Cron - see limitations below)
- **Queue System**: Consider pg-boss (PostgreSQL-based) for Phase 2+

> **Why not Vercel Cron?** Hobby tier limits to 2 cron jobs at once-per-day frequency.
> We need hourly sync, so Supabase pg_cron is the better choice since we're already using Supabase.

### Infrastructure
- **Hosting**: Vercel (for Next.js)
- **Database**: Supabase Cloud
- **Storage**: Supabase Storage (for any future file attachments)
- **Environment**: .env.local for development

### Key Libraries
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "typescript": "^5.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "googleapis": "^128.0.0",
    "openai": "^4.0.0",
    "zod": "^3.22.0",
    "date-fns": "^3.0.0",
    "tailwindcss": "^3.4.0",
    "pino": "^8.0.0",
    "pino-pretty": "^10.0.0"
  }
}
```

> **Note:** Anthropic SDK removed - using GPT-4.1-mini only for simplicity and cost efficiency.

## Folder Structure

```
ideabox/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth-required routes
│   │   ├── inbox/                # Main inbox view
│   │   │   ├── page.tsx
│   │   │   └── components/       # Inbox-specific components
│   │   ├── discover/             # Discovery Dashboard (post-onboarding)
│   │   │   └── page.tsx
│   │   ├── clients/              # Client hub
│   │   │   ├── page.tsx
│   │   │   ├── [clientId]/
│   │   │   └── components/
│   │   ├── content/              # Content library (Phase 2)
│   │   ├── events/               # Events calendar (Phase 2)
│   │   ├── actions/              # Action/to-do list
│   │   └── settings/
│   ├── api/                      # API routes
│   │   ├── auth/                 # Gmail OAuth callbacks
│   │   ├── emails/               # Email CRUD operations
│   │   │   ├── sync/route.ts     # Trigger email sync
│   │   │   ├── [id]/route.ts     # Single email operations
│   │   │   └── categorize/route.ts
│   │   ├── actions/              # Action item operations
│   │   ├── clients/              # Client CRUD
│   │   ├── analyzers/            # Trigger analysis jobs
│   │   ├── onboarding/           # Initial sync endpoints
│   │   │   ├── initial-sync/     # POST: Trigger initial sync
│   │   │   └── sync-status/      # GET: Poll sync progress
│   │   └── webhooks/             # Future: Gmail push notifications
│   ├── onboarding/               # Initial setup flow
│   │   ├── page.tsx              # Wizard + sync progress UI
│   │   └── components/           # Wizard steps including SyncConfigStep
│   ├── layout.tsx
│   └── page.tsx                  # Landing/login
│
├── lib/                          # Shared utilities and services
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── types.ts              # Generated types
│   ├── gmail/
│   │   ├── client.ts             # Gmail API wrapper
│   │   ├── auth.ts               # OAuth handling
│   │   ├── sync.ts               # Email sync logic
│   │   └── types.ts
│   ├── ai/
│   │   ├── openai-client.ts      # GPT-4.1-mini client with function calling
│   │   ├── prompts.ts            # System prompts for each analyzer
│   │   └── types.ts
│   ├── utils/
│   │   ├── logger.ts             # Logging utility
│   │   ├── date.ts               # Date formatting
│   │   └── validation.ts         # Shared validators
│   └── constants.ts
│
├── services/                     # Business logic (AI analyzers, processors)
│   ├── analyzers/                # AI analysis modules
│   │   ├── base-analyzer.ts      # Abstract base class
│   │   ├── categorizer.ts        # Phase 1: Email categorization
│   │   ├── action-extractor.ts   # Phase 1: Action item extraction
│   │   ├── client-tagger.ts      # Phase 2: Client/project detection
│   │   ├── event-detector.ts     # Phase 2: Event extraction
│   │   ├── url-extractor.ts      # Phase 2: URL intelligence
│   │   ├── content-opportunity.ts # Phase 2: Tweet/networking ideas
│   │   └── README.md             # Analyzer system documentation
│   ├── processors/
│   │   ├── email-processor.ts    # Orchestrates all analyzers
│   │   ├── batch-processor.ts    # Handles email batches
│   │   └── priority-scorer.ts    # Scores email urgency
│   ├── sync/                     # Initial sync & discovery services
│   │   ├── index.ts              # Barrel export
│   │   ├── email-prefilter.ts    # Pre-filter emails before AI
│   │   ├── sender-patterns.ts    # Learn sender→category patterns
│   │   ├── action-suggester.ts   # Generate quick actions
│   │   ├── discovery-builder.ts  # Build Discovery response
│   │   └── initial-sync-orchestrator.ts # Main sync coordinator
│   └── jobs/
│       ├── email-sync-job.ts     # Scheduled email fetching
│       └── daily-summary-job.ts  # Phase 3: Summary generation
│
├── components/                   # Shared/reusable components
│   ├── ui/                       # shadcn components
│   ├── email/
│   │   ├── EmailList.tsx         # <250 lines
│   │   ├── EmailCard.tsx
│   │   ├── EmailDetail.tsx
│   │   └── CategoryBadge.tsx
│   ├── actions/
│   │   ├── ActionList.tsx
│   │   └── ActionItem.tsx
│   ├── clients/
│   │   ├── ClientCard.tsx
│   │   └── ClientSelector.tsx
│   ├── discover/                 # Discovery Dashboard components
│   │   ├── index.ts              # Barrel export
│   │   ├── CategoryCard.tsx      # Single category summary
│   │   ├── CategoryCardGrid.tsx  # Responsive category grid
│   │   ├── ClientInsights.tsx    # Detected/suggested clients
│   │   ├── QuickActions.tsx      # Suggested action buttons
│   │   ├── FailureSummary.tsx    # Failed analysis display
│   │   └── DiscoveryHero.tsx     # Hero section with stats
│   └── layout/
│       ├── Navbar.tsx
│       ├── Sidebar.tsx
│       └── PageHeader.tsx
│
├── hooks/                        # Custom React hooks
│   ├── useEmails.ts
│   ├── useActions.ts
│   ├── useClients.ts
│   ├── useInitialSyncProgress.ts # Poll sync progress during onboarding
│   └── useSupabase.ts
│
├── types/                        # TypeScript type definitions
│   ├── database.ts               # Supabase generated types
│   ├── discovery.ts              # Discovery Dashboard types
│   ├── email.ts
│   ├── action.ts
│   ├── client.ts
│   └── analyzer.ts
│
├── supabase/                     # Supabase config and migrations
│   ├── migrations/               # SQL migration files
│   └── seed.sql                  # Initial data (if needed)
│
├── scripts/                      # Utility scripts
│   ├── sync-emails.ts            # Manual sync trigger
│   └── test-analyzer.ts          # Test individual analyzers
│
├── .env.local.example
├── .env.production.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Modularity Principles

### 1. Single Responsibility
- **Each file does ONE thing**: analyzer, API route, component, etc.
- **Max 400 lines per file**: Forces good separation
- **If file grows**: Split into logical modules

### 2. Analyzers as Plugins
```typescript
// Each analyzer is a self-contained module
interface Analyzer {
  name: string;
  analyze(email: Email): Promise<AnalysisResult>;
  getFunctionSchema(): FunctionSchema; // For OpenAI function calling
}

// Easy to add/remove/modify analyzers
const analyzers = [
  new CategorizerAnalyzer(),
  new ActionExtractorAnalyzer(),
  new ClientTaggerAnalyzer(), // Can be toggled on/off
];
```

### 3. Service Layer Pattern
```
Component → Hook → API Route → Service → Database
                                    ↓
                              External API (Gmail/OpenAI)
```

**Benefits:**
- Services can be tested independently
- Services can be called from API routes OR background jobs
- Easy to swap implementations (e.g., switch from OpenAI to Anthropic)

### 4. Configuration Over Hardcoding
```typescript
// config/analyzers.ts
export const ANALYZER_CONFIG = {
  categorizer: {
    enabled: true,
    model: 'gpt-4o-mini',
    temperature: 0.3,
  },
  actionExtractor: {
    enabled: true,
    model: 'gpt-4o-mini',
    batchSize: 10,
  },
  // Easy to enable/disable features
};
```

### 5. Type Safety First
- All database queries return typed objects
- All API responses have explicit types
- Use Zod for runtime validation + type inference
- Supabase CLI generates types from database schema

### 6. Error Handling & Logging
```typescript
// Every service/analyzer logs extensively
logger.info('Starting email sync', { userId, accountCount });
logger.debug('Fetched emails from Gmail', { count: emails.length });
logger.error('Analysis failed', { emailId, error: error.message });

// Errors bubble up with context
throw new AnalyzerError('Failed to extract actions', {
  emailId,
  analyzer: 'ActionExtractor',
  originalError: error,
});
```

## Data Flow

### Email Sync Flow
```
1. Cron Job triggers → /api/emails/sync
2. API route calls → GmailService.fetchNewEmails()
3. For each email:
   a. Save raw email → Supabase (emails table)
   b. Queue for analysis → EmailProcessor.process(email)
4. EmailProcessor runs all enabled analyzers in parallel
5. Save analysis results → Supabase (email_analyses table)
6. Extract actions → Save to actions table
7. Update email categorization
8. Log completion
```

### User Interaction Flow
```
1. User views inbox → /inbox page
2. Page uses useEmails() hook
3. Hook calls → /api/emails?category=action_required
4. API route queries Supabase with filters
5. Returns typed Email[] with embedded analyses
6. Component renders with proper types
```

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Gmail API (OAuth - External app in testing mode)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# OpenAI (GPT-4.1-mini only)
OPENAI_API_KEY=sk-xxx

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=info  # debug, info, warn, error

# Feature Flags (for gradual rollout)
ENABLE_GMAIL_LABEL_SYNC=true
MAX_BODY_CHARS=16000
```

## Performance Considerations

### 1. Batch Processing
- Don't analyze emails one-by-one
- Group into batches of 10-20 for parallel processing
- Use Promise.all() but with concurrency limits

### 2. Caching
- Cache Gmail tokens in Supabase
- Cache analyzer results (don't re-analyze same email)
- Use Next.js API route caching where appropriate

### 3. Pagination
- All list views paginate (20-50 items per page)
- Use cursor-based pagination for infinite scroll
- Load email bodies lazily (not in list view)

### 4. Background Jobs
- Email sync happens in background (not blocking user)
- Analysis happens asynchronously
- User sees "Processing..." state, then updates in real-time

## Security

### 1. Row Level Security (RLS)
- All Supabase tables have RLS enabled
- Users can only access their own emails/actions/clients
- Service role key only used in API routes (server-side)

### 2. Gmail OAuth
- Tokens encrypted at rest (Supabase handles this)
- Refresh tokens stored securely
- Scopes: gmail.readonly, gmail.modify (for labels)

### 3. API Routes
- All routes check authentication
- Validate all inputs with Zod
- Rate limiting on expensive operations (Phase 2+)

## Testing Strategy

### Unit Tests
- All analyzers have tests (mock OpenAI responses)
- All services have tests (mock Supabase/Gmail)
- Use Vitest for fast, modern testing

### Integration Tests
- Test full email sync flow (with test Gmail account)
- Test analyzer orchestration
- Use Supabase local development

### E2E Tests (Phase 3)
- Playwright for critical user flows
- Onboarding, inbox view, action creation

## Deployment

### Development
```bash
npm run dev              # Start Next.js dev server
supabase start          # Start local Supabase
npm run db:push         # Push schema changes
npm run db:seed         # Seed with test data
```

### Production
- **Frontend**: Auto-deploy to Vercel on `main` branch push
- **Database**: Supabase Cloud (production project)
- **Migrations**: Run via Supabase CLI before deploy
- **Env vars**: Set in Vercel dashboard + Supabase dashboard

## Migration Path Between Phases

### Phase 1 → Phase 2
- Add new analyzer modules (no changes to existing)
- Add new database tables (migrations)
- Add new pages/routes (no impact on existing)
- Toggle new analyzers on via config

### Phase 2 → Phase 3
- Add summary generation service
- Add pattern detection analyzer
- Enhance existing pages (no breaking changes)
- Add cron jobs for daily summaries

**Key:** Each phase is additive, not destructive. Modularity allows safe evolution.
