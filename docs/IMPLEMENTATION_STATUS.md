# IdeaBox - Implementation Status

> **Last Updated:** February 2026
> **Database Migrations:** 001-030

## What's Built

### Core Infrastructure
- Next.js 14 (App Router), TypeScript strict, Tailwind CSS, Vitest
- Supabase (PostgreSQL + RLS + pg_cron) with 20+ tables
- OpenAI GPT-4.1-mini client with function calling, retry, cost tracking
- Gmail API integration (read, modify, send, push notifications)
- Google People API (contact import)
- Enhanced Pino logger with domain-specific helpers
- Zod validation on all API boundaries

### AI Analysis Pipeline
- **8 analyzers** running in parallel via EmailProcessor:
  - Categorizer (12 life-bucket categories + summary + quick_action + labels)
  - Action Extractor (multi-action support, urgency scoring)
  - Client Tagger (fuzzy matching, relationship signals)
  - Event Detector (dates, location, RSVP, locality awareness)
  - Date Extractor (deadlines, payments, birthdays, expirations)
  - Content Digest (gist, key points, links)
  - Contact Enricher (company, job title, relationship from signatures)
  - Sender Type Detector (direct vs broadcast classification)
- Pre-filter system saves 20-30% AI tokens (skip no-reply, auto-categorize by domain)
- Sender pattern learning for future auto-categorization
- Two-phase execution (core in parallel, then conditional analyzers)

### Email Sync
- Full sync + incremental sync via Gmail API
- Push notifications (Gmail Pub/Sub) for real-time delivery
- Scheduled polling (pg_cron) as fallback
- Sync locking to prevent concurrent syncs
- History ID validation and stale detection
- Historical metadata-only sync for contact enrichment
- Initial sync orchestrator for onboarding

### Navigation & Pages

The app uses a 5-item sidebar navigation (redesigned Feb 2026):

| Nav Item | Route | Description |
|----------|-------|-------------|
| **Home** | `/home` | Daily briefing: greeting, top 3 priorities, today's schedule, pending tasks, profile nudge |
| **Inbox** | `/inbox` | Tabbed email view — Categories (discover dashboard), Priority (AI-ranked), Archive |
| | `/inbox/[category]` | Category deep-dive (email list for a life-bucket) |
| | `/inbox/[category]/[emailId]` | Single email detail view |
| **Contacts** | `/contacts` | Tabbed contacts — All, Clients, Personal, Subscriptions |
| | `/contacts/[id]` | Contact detail (CRM-style with emails, actions, events, notes) |
| **Calendar** | `/calendar` | Unified calendar: list/grid views, merged events + extracted dates, type filters |
| **Tasks** | `/tasks` | Tabbed task management — To-dos, Campaigns, Templates |
| | `/tasks/campaigns/new` | Create new campaign |
| | `/tasks/campaigns/[id]` | Campaign detail |
| **Sent** | `/sent` | Email composition, outbox, sent history |
| **Settings** | `/settings` | Preferences, cost tracking, account management |
| **Admin** | `/admin` | Superadmin dashboard — account reset, user management (restricted access) |

All old routes (`/hub`, `/discover`, `/actions`, `/events`, `/timeline`, `/clients`, `/campaigns`, `/templates`, `/archive`) redirect to their new equivalents via `next.config.mjs`.

### Clients Merged into Contacts (migration 029)
- `contacts` table gained: `is_client`, `client_status`, `client_priority`, `email_domains`, `keywords`
- Client data migrated from `clients` table into matching contacts
- `contact_id` added to `emails` and `actions` tables
- Legacy `client_id` columns dropped (migration 030)
- `clients` table renamed to `clients_deprecated` (migration 030)
- Hub priority scoring reads exclusively from contacts (`is_client = true`)

### Email Sending (migration 026)
- Send emails via Gmail API (from user's real address)
- Schedule emails for future delivery
- Open tracking with 1x1 pixel
- Reusable templates with merge fields
- Mail merge campaigns with throttling (25s delay)
- Follow-up automation (no-open, no-reply conditions)
- Rate limiting: 400 emails/day per user
- Inline reply with editable subject

### Data Layer
- Custom hooks: useEmails, useActions, useContacts (with client fields), useExtractedDates, useEvents, useSettings, useSyncStatus, useEmailAnalysis, useInitialSyncProgress
- REST API routes for all entities with Zod validation
- Page-based pagination with URL state
- Optimistic UI updates with rollback

### UI Components
- Full component library: Button, Card, Badge, Dialog, Toast, Skeleton, Spinner, Input, Select, Switch, Checkbox, Pagination
- Layout: Navbar (search, sync indicator), Sidebar (5-item nav, category filters, top contacts, upcoming events), PageHeader (breadcrumbs)
- Tab containers: InboxTabs, ContactsTabs, TasksTabs (all URL-synced via `?tab=`)
- Extracted content components: ActionsContent, CampaignsContent, TemplatesContent, DiscoverContent, ArchiveContent
- Shared components: PriorityCard (used by Home page)
- Category enhancements: urgency dots, AI briefings, key points, relationship health
- Contact sync progress banner (global)

### Superadmin & Dev Tools
- Superadmin access control via hardcoded email list (`src/config/superadmin.ts`)
- Superadmin dashboard (`/admin`) — restricted to authorized emails only
- Account reset API (`POST /api/admin/reset-account`) — wipes all synced data, resets to pre-onboarding state
  - Deletes: emails, analyses, actions, contacts, extracted dates, events, campaigns, templates, sent emails, tracking, logs
  - Resets: onboarding flags, sync progress, sender patterns, Gmail sync state (preserves OAuth tokens)
  - Preserves: auth record, profile identity, user settings, Gmail OAuth tokens
- Two-step confirmation UI with detailed per-table deletion results
- Full audit logging for all reset operations

---

## What's Not Built Yet

### Planned Features
- URL extraction library (save links from emails)
- Content opportunities (tweet ideas, networking)
- Daily/weekly digest emails
- Pattern detection (communication trends)
- Smart bundling of related emails
- Unsubscribe intelligence
- Google Calendar sync (export events)
- Advanced analytics dashboard
- Category Intelligence Bar (API ready, UI pending)
- Focus Mode for category view

### Known Issues
- `urgency_score` and `relationship_signal` exist in TypeScript types for `emails` table but have **no database migration** — reads will return null. Need a migration to add these columns if denormalization is desired.

---

## Session History

| Session | Date | Summary |
|---------|------|---------|
| 1-2 | Jan 2026 | Project setup, UI library, auth, landing, onboarding, core pages |
| 3 | Jan 2026 | Data hooks + tests, API routes, seed script, Vitest |
| 4 | Jan 2026 | Gmail integration, AI analyzers (categorizer, action, client tagger) |
| 5 | Jan 2026 | Email detail, clients page, archive page |
| 6 | Jan 2026 | Discovery dashboard, initial sync orchestrator, pre-filter system |
| 7 | Jan 2026 | Enhanced categorizer (summary, quick_action), event detector, priority jobs |
| 8 | Jan 2026 | User context onboarding (7 steps), contacts API, extracted dates API |
| 9 | Jan 2026 | Contacts page, timeline page, hub enhancement |
| 10 | Jan 2026 | Events page with grouped cards, sidebar events preview |
| 11 | Jan 2026 | Event state management (dismiss/maybe/calendar), email preview modal |
| 12 | Jan 2026 | Contact pagination, sync progress banner, CRM contact detail |
| 13 | Jan 2026 | Enhanced category view (urgency dots, AI briefings, key points, relationship health) |
| 14+ | Jan 2026 | Push notifications, sender type classification, content digest, historical sync, email sending, category cleanup |
| Nav Redesign | Feb 2026 | 4-phase navigation overhaul: sidebar from 11→5 items, new routes, tabbed UIs, clients merged into contacts, old pages deleted |
| Superadmin | Feb 2026 | Superadmin dashboard (/admin), account reset API, superadmin access control config, two-step confirmation UI |
