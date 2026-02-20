# IdeaBox - System Architecture

> **Last Updated:** February 2026

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **UI Components**: Custom shadcn-style component library (`src/components/ui/`)
- **State Management**: React Context + custom hooks
- **Forms**: react-hook-form + Zod validation
- **Icons**: lucide-react
- **Notifications**: Sonner (toast)

### Backend
- **Runtime**: Node.js (Next.js API routes)
- **Database**: Supabase (PostgreSQL + RLS + pg_cron)
- **Authentication**: Supabase Auth + Gmail OAuth (external app, testing mode)
- **AI/LLM**: OpenAI GPT-4.1-mini exclusively (no fallback)
- **Email API**: Gmail API via `googleapis`
- **Background Jobs**: Supabase pg_cron + Edge Functions

### Infrastructure
- **Hosting**: Vercel (frontend)
- **Database**: Supabase Cloud
- **Testing**: Vitest + Testing Library

## Data Flow

### Email Sync
```
Cron/Push → Gmail API → Save raw emails → EmailProcessor → 8 Analyzers (parallel)
  → Save analysis JSONB → Denormalize to emails table → Extract actions → Update contacts
```

### Google Contacts Import (Onboarding)
```
ContactImportStep → POST /api/contacts/import-google
  → Promise.allSettled(accounts.map(account =>
      TokenManager.getValidToken → Google People API → batch .upsert(50) → contacts table
    ))
  → aggregate results → reload VIP suggestions
```

### Profile Suggestions (Onboarding Phase 2)
```
POST /api/onboarding/profile-suggestions
  → Auth check → Check cache (user_context.profile_suggestions, 1hr TTL)
  → Query sent emails (local DB, SENT label, LIMIT 20)
  → Query top contacts (by email_count, LIMIT 20)
  → analyzeProfileFromEmails() → GPT-4.1-mini (single function-calling request)
    → Extract role, company, industry, projects, priorities
  → inferWorkHours() → Statistical analysis of send-time distribution
    → Bucket by hour-of-day → find 80% contiguous block → detect active days
  → Merge AI results + work hours → Save to user_context.profile_suggestions
  → Return ProfileSuggestions (consumed by Mad Libs step in Phase 3)
```

### Mad Libs Profile Card (Onboarding Phase 3)
```
MadLibsProfileStep (mounts)
  → POST /api/onboarding/profile-suggestions (fetches AI suggestions)
  → GET /api/user/context (fetches existing VIP emails)
  → Pre-fill MadLibsField blanks: role, company, priorities, work hours
  → Pre-fill VIP chips from contacts table (is_vip = true)
  → User clicks/edits inline blanks (MadLibsField components)
  → "Looks good!" → PUT /api/user/context (saves confirmed values to user_context)
  → Advances to next onboarding step
```

### User Interaction
```
Component → Hook → API Route → Supabase (RLS-protected) → Response
```

### Database Access Pattern
No ORM. Uses Supabase.js SDK with typed queries:
```typescript
const { data } = await supabase
  .from('emails')
  .select('*, contact:contacts(name, is_client, client_priority), analyses:email_analyses(*)')
  .eq('user_id', userId)
  .eq('category', 'client_pipeline');
```

- **RLS** protects all tables (users see only their own data)
- **Service role key** bypasses RLS for server-side bulk operations
- **Types** from `src/types/database.ts` (20+ tables typed)
- **Clients merged into contacts** — the `contacts` table has `is_client`, `client_status`, `client_priority` columns. The legacy `clients` table has been renamed to `clients_deprecated`.

## Folder Structure

```
src/
  app/
    (auth)/                     # Protected routes (requires login)
      home/                     # Daily briefing dashboard (replaces hub)
      inbox/                    # Email inbox with tabs: Categories, Priority, Archive
        [category]/             # Category deep-dive views
          [emailId]/            # Single email detail
      contacts/                 # Contact management with tabs: All, Clients, Personal, Subscriptions
        [id]/                   # Contact detail (CRM-style)
      calendar/                 # Unified calendar (events + timeline merged)
      tasks/                    # Tasks with tabs: To-dos, Campaigns, Templates
        campaigns/
          [id]/                 # Campaign detail
          new/                  # Create campaign
      sent/                     # Sent emails, compose, outbox
      settings/                 # User preferences + cost tracking
    api/
      auth/                     # OAuth callbacks
      emails/                   # sync/, send/, analyze/, rescan/, bulk-archive/
      contacts/                 # CRUD, import-google/, historical-sync/, vip-suggestions/, promote/, stats/
      hub/                      # Hub prioritization endpoints
      settings/                 # Settings + usage stats
      onboarding/               # Initial sync + profile suggestions endpoints
      campaigns/                # Campaign CRUD
      templates/                # Template CRUD
      actions/                  # Action/to-do CRUD
      events/                   # Event CRUD
    onboarding/                 # Multi-step onboarding wizard
    dev/                        # Development utilities

  services/
    analyzers/                  # 8 AI analyzers
      base-analyzer.ts          # Abstract base class
      categorizer.ts            # Life-bucket classification
      action-extractor.ts       # Action item extraction (multi-action)
      client-tagger.ts          # Client/project matching
      event-detector.ts         # Event extraction
      date-extractor.ts         # Timeline date extraction
      content-digest.ts         # Email summary + key points + links
      contact-enricher.ts       # Contact metadata extraction
      types.ts                  # Analyzer result types
    processors/
      email-processor.ts        # Orchestrates all analyzers
      batch-processor.ts        # Batch processing
      priority-scorer.ts        # Urgency scoring
    sync/
      initial-sync-orchestrator.ts  # Main sync coordinator
      email-prefilter.ts        # Skip no-reply/notifications before AI
      sender-patterns.ts        # Learn sender→category patterns
      sender-type-detector.ts   # Classify direct vs broadcast senders
      action-suggester.ts       # Generate quick actions
      discovery-builder.ts      # Build Discovery Dashboard response
    contacts/                   # Contact service layer
    hub/                        # Hub prioritization service
    user-context/               # AI personalization context
    onboarding/                 # Onboarding intelligence services
      profile-analyzer.ts       # AI profile extraction from sent emails
      work-hours-analyzer.ts    # Statistical work hours inference
    jobs/                       # Background job runners

  components/
    ui/                         # Base UI library (Button, Card, Dialog, etc.)
    email/                      # Email display (list, detail, compose)
    home/                       # Home page: DailyBriefingHeader, TodaySchedule, PendingTasksList
    inbox/                      # Inbox page: InboxTabs, PriorityEmailList (all 12 category colors)
    actions/                    # ActionsContent (extracted from old actions page)
    archive/                    # ArchiveContent — queries is_archived emails, supports restore/hard-delete/click-to-detail
    campaigns/                  # CampaignsContent (extracted from old campaigns page)
    templates/                  # TemplatesContent (extracted from old templates page)
    contacts/                   # ContactsTabs, PromoteToClientDialog
    calendar/                   # CalendarStats
    tasks/                      # TasksTabs
    shared/                     # PriorityCard (shared across pages)
    discover/                   # DiscoverContent, CategoryCardGrid, ClientInsights, QuickActions, FailureSummary (wired to retry API)
    categories/                 # Category view (EmailCard, intelligence bar)
    layout/                     # Navbar, Sidebar, PageHeader
    onboarding/                 # Onboarding wizard steps (5 steps, lazy-loaded 3+) + MadLibsProfileStep, MadLibsField

  hooks/                        # Custom React hooks
    useEmails.ts                # Email list, search, filters
    useActions.ts               # Action management
    useContacts.ts              # Contact + client management (unified)
    useSupabase.ts              # Supabase client access
    useEmailAnalysis.ts         # Parse analysis JSONB
    useInitialSyncProgress.ts   # Poll sync status during onboarding
    useEvents.ts                # Event data
    useExtractedDates.ts        # Extracted date data (deadlines, birthdays, etc.)

  lib/
    ai/                         # OpenAI client (GPT-4.1-mini, function calling)
    auth/                       # Auth helpers
    gmail/                      # Gmail API wrapper + OAuth
    google/                     # Google Contacts API
    supabase/                   # Browser + server clients
    contexts/                   # React contexts (auth, theme)
    services/                   # Shared business logic utilities
    utils/                      # Logger, validation, date helpers

  types/
    database.ts                 # Supabase schema types (20+ tables)
    discovery.ts                # Discovery dashboard types

  config/
    analyzers.ts                # AI analyzer settings + pricing
    app.ts                      # App configuration

supabase/
  migrations/                   # 31 SQL migration files (001-031)

scripts/
  seed.ts                       # Database seeding
  verify-migrations.ts          # Migration validation
```

## Modularity Principles

1. **400-line file limit** - forces good separation
2. **Analyzers as plugins** - each analyzer is a self-contained class extending BaseAnalyzer
3. **Service layer pattern**: Component -> Hook -> API Route -> Service -> Database
4. **Type safety first** - strict TypeScript, Zod validation at boundaries
5. **Configuration over hardcoding** - analyzer settings in `config/analyzers.ts`

## Performance Patterns

1. **No sequential DB calls in loops** — batch upserts, use `.in()` filters, chunk large
   operations. The Google contacts import uses batches of 50 with `.upsert()` instead of
   individual RPC calls. (See `contact-service.ts` `importFromGoogle()`.)
2. **Parallel where independent** — multi-account Google contact imports run via
   `Promise.allSettled()` so each account refreshes tokens and upserts independently.
   (See `import-google/route.ts`.)
3. **Don't fetch what you'll immediately invalidate** — when returning from OAuth with
   `scope_added=true`, the initial `loadSuggestions()` call is skipped because the import
   handler reloads suggestions after it completes. (See `ContactImportStep.tsx`.)
4. **React.memo + useCallback for list items** — `SuggestionCard` is memoized and
   `handleToggle` uses `useCallback` for stable references in `.map()` loops.
5. **Optimistic UI** — import success states shown immediately with count badges.
6. **Lazy loading for onboarding steps** — steps 3+ (VIP Contacts, Mad Libs Profile,
   Sync Config) are loaded via `React.lazy()` + `Suspense` so the initial bundle only
   includes WelcomeStep and AccountsStep. Later steps load on demand as the user navigates.

## Security

- **RLS on all tables** - users only see their own data
- **Service role key** only used server-side
- **Gmail tokens** stored in Supabase (encrypted at rest)
- **Zod validation** on all API route inputs
- **OAuth scopes**: gmail.readonly, gmail.modify, gmail.send
