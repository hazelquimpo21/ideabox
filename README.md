# IdeaBox

> AI-powered email intelligence for busy professionals

IdeaBox automatically categorizes your emails into 12 life-bucket categories, extracts action items, detects events, enriches contacts, and helps you focus on what matters. Built for professionals managing 200-300+ emails/day across multiple Gmail accounts.

## Quick Start

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your Supabase, Google OAuth, and OpenAI keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Framework:** Next.js 14 (App Router), TypeScript (strict)
- **Styling:** Tailwind CSS, custom shadcn-style components
- **Database:** Supabase (PostgreSQL + RLS + pg_cron)
- **Auth:** Supabase Auth + Gmail OAuth (testing mode)
- **AI:** OpenAI GPT-4.1-mini (single model, ~$3-5/month)
- **Email:** Gmail API (read, modify, send)
- **Testing:** Vitest + Testing Library

## Documentation

| Document | Description |
|----------|-------------|
| [Implementation Status](docs/IMPLEMENTATION_STATUS.md) | Current progress and what to build next |
| [Project Overview](docs/PROJECT_OVERVIEW.md) | Vision, goals, and roadmap |
| [Architecture](docs/ARCHITECTURE.md) | System design and folder structure |
| [Database Schema](docs/DATABASE_SCHEMA.md) | All 20+ Supabase tables, functions, and migrations |
| [AI Analyzer System](docs/AI_ANALYZER_SYSTEM.md) | How the 8 AI analyzers work |
| [Coding Standards](docs/CODING_STANDARDS.md) | 400-line file limit, conventions |
| [Decisions](docs/DECISIONS.md) | Architectural decision log |
| [API Integrations](docs/API_INTEGRATIONS.md) | Gmail, Google People, OpenAI integration details |
| [Gmail Sending](docs/GMAIL_SENDING_IMPLEMENTATION.md) | Email sending, templates, campaigns |
| [Edge Functions](docs/SUPABASE_EDGE_FUNCTIONS_SETUP.md) | Scheduled sync setup guide |
| [Category View UX](docs/CATEGORY_VIEW_UX_DESIGN.md) | Enhanced category view design |
| [Initial Sync Strategy](docs/INITIAL_SYNC_STRATEGY.md) | First-run sync approach |

## Project Structure

```
src/
  app/
    (auth)/           # Protected routes (5 main nav items + sent + settings)
      home/           # Daily briefing dashboard
      inbox/          # Tabbed email view (Categories, Priority, Archive)
        [category]/   # Category deep-dive + email detail
      contacts/       # Tabbed contacts (All, Clients, Personal, Subscriptions)
        [id]/         # Contact detail (CRM-style)
      calendar/       # Unified calendar (events + extracted dates)
      tasks/          # Tabbed tasks (To-dos, Campaigns, Templates)
        campaigns/    # Campaign detail + create routes
      sent/           # Email composition, outbox, sent history
      settings/       # User preferences + cost tracking
    api/              # API routes: emails, contacts, hub, settings, onboarding, auth,
                      # campaigns, templates, actions, events
    onboarding/       # Multi-step onboarding wizard
  components/
    ui/               # Base UI library (Button, Card, Dialog, etc.)
    email/            # Email display components
    home/             # DailyBriefingHeader, TodaySchedule, PendingTasksList
    inbox/            # InboxTabs, PriorityEmailList
    actions/          # ActionsContent
    archive/          # ArchiveContent
    campaigns/        # CampaignsContent
    templates/        # TemplatesContent
    contacts/         # ContactsTabs, PromoteToClientDialog
    calendar/         # CalendarStats
    tasks/            # TasksTabs
    shared/           # PriorityCard (reusable across pages)
    discover/         # DiscoverContent, CategoryCardGrid, ClientInsights, QuickActions
    categories/       # Category-specific UI (EmailCard, etc.)
    layout/           # Navbar, Sidebar, PageHeader
    onboarding/       # Onboarding wizard UI
  services/
    analyzers/        # 8 AI analyzers (categorizer, action-extractor, etc.)
    processors/       # Email processing orchestration
    sync/             # Initial sync, sender patterns, pre-filtering
    contacts/         # Contact enrichment service
    hub/              # Priority scoring (reads from contacts, not legacy clients)
    user-context/     # AI personalization
    jobs/             # Background jobs
  hooks/              # useEmails, useActions, useContacts, useEvents, etc.
  lib/                # Shared: ai/, auth/, gmail/, google/, supabase/, utils/
  types/              # database.ts (20+ table types), discovery.ts
  config/             # App config, analyzer config
supabase/
  migrations/         # 30 SQL migration files (001-030)
scripts/              # seed.ts, verify-migrations.ts
```

## Features

**Implemented:**
- Streamlined 5-item navigation: Home, Inbox, Contacts, Calendar, Tasks
- Multi-Gmail account sync (push notifications + scheduled polling)
- 8 AI analyzers running in parallel (categorizer, action extractor, client tagger, event detector, date extractor, content digest, contact enricher, sender type classifier)
- 12 life-bucket email categories with auto-categorization
- Home page with daily briefing, AI priorities, today's schedule, pending tasks
- Inbox with tabbed views: Categories (discover dashboard), Priority (AI-ranked), Archive
- Unified contacts with clients merged in — tabbed filtering by All, Clients, Personal, Subscriptions
- Unified calendar merging events + extracted dates with list/grid views and type filters
- Task management with To-dos, Campaigns, and Templates tabs
- Action tracking with multi-action support
- Contact intelligence with sender type classification and client promotion
- Event detection with locality awareness
- Email sending with templates, campaigns, open tracking
- Onboarding wizard with initial sync
- Google Contacts import
- Historical sync for contact enrichment
- Cost tracking and budget controls

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run test     # Run tests (Vitest)
```

## Environment Variables

See `.env.local.example` for all required variables:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL`
