# IdeaBox - Implementation Status

> **Last Updated:** February 2026
> **Database Migrations:** 001-028

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

### Pages & UI
| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Gmail sign-in, feature highlights |
| Onboarding | `/onboarding` | Multi-step wizard: accounts, clients, user context (7 steps), sync config |
| Discovery | `/discover` | Post-sync dashboard with category cards, client insights, quick actions |
| Category View | `/discover/[category]` | Deep-dive into a life-bucket category |
| Inbox | `/inbox` | Email list with filters, category badges, AI fields |
| Hub | `/hub` | Priority dashboard with urgency scoring |
| Actions | `/actions` | To-do list from email analysis |
| Clients | `/clients` | Client management with CRUD |
| Contacts | `/contacts` | Contact intelligence, VIP/muted toggles, sender type |
| Contact Detail | `/contacts/[id]` | CRM-style view with email history |
| Events | `/events` | Calendar events grouped by time period |
| Timeline | `/timeline` | Upcoming dates/deadlines with snooze/acknowledge |
| Archive | `/archive` | Archived emails |
| Sent | `/sent` | Email composition, outbox, sent history |
| Settings | `/settings` | Preferences, cost tracking, account management |

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
- Custom hooks: useEmails, useActions, useClients, useContacts, useExtractedDates, useEvents, useSettings, useSyncStatus, useEmailAnalysis, useInitialSyncProgress
- REST API routes for all entities with Zod validation
- Page-based pagination with URL state
- Optimistic UI updates with rollback

### UI Components
- Full component library: Button, Card, Badge, Dialog, Toast, Skeleton, Spinner, Input, Select, Switch, Checkbox, Pagination
- Layout: Navbar (search, sync indicator), Sidebar (nav, category filters, client quick-access, upcoming events), PageHeader (breadcrumbs)
- Category enhancements: urgency dots, AI briefings, key points, relationship health
- Contact sync progress banner (global)

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
- `urgency_score` and `relationship_signal` exist in TypeScript types for `emails` table but have **no database migration** - reads will return null. Need a migration to add these columns if denormalization is desired.

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
