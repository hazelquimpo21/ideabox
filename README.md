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
    (auth)/           # Protected routes: inbox, discover, hub, clients,
                      # contacts, actions, events, timeline, archive, sent, settings
    api/              # API routes: emails, contacts, hub, settings, onboarding, auth
    onboarding/       # Multi-step onboarding wizard
  components/
    ui/               # Base UI library (Button, Card, Dialog, etc.)
    email/            # Email display components
    actions/          # Action/to-do components
    clients/          # Client management components
    contacts/         # Contact management components
    discover/         # Discovery dashboard components
    categories/       # Category-specific UI (EmailCard, etc.)
    events/           # Event calendar components
    timeline/         # Timeline view components
    hub/              # Hub dashboard components
    layout/           # Navbar, Sidebar
    onboarding/       # Onboarding wizard UI
  services/
    analyzers/        # 8 AI analyzers (categorizer, action-extractor, etc.)
    processors/       # Email processing orchestration
    sync/             # Initial sync, sender patterns, pre-filtering
    contacts/         # Contact enrichment service
    hub/              # Priority scoring
    user-context/     # AI personalization
    jobs/             # Background jobs
  hooks/              # useEmails, useActions, useClients, useContacts, etc.
  lib/                # Shared: ai/, auth/, gmail/, google/, supabase/, utils/
  types/              # database.ts (20+ table types), discovery.ts
  config/             # App config, analyzer config
supabase/
  migrations/         # 28 SQL migration files (001-028)
scripts/              # seed.ts, verify-migrations.ts
```

## Features

**Implemented:**
- Multi-Gmail account sync (push notifications + scheduled polling)
- 8 AI analyzers running in parallel (categorizer, action extractor, client tagger, event detector, date extractor, content digest, contact enricher, sender type classifier)
- 12 life-bucket email categories with auto-categorization
- Action tracking with multi-action support
- Client management and auto-tagging
- Contact intelligence with sender type classification
- Event detection with locality awareness
- Discovery dashboard with category overview
- Timeline view for upcoming dates/deadlines
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
