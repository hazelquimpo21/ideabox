# IdeaBox - Implementation Status

> **Last Updated:** March 5, 2026
> **Database Migrations:** 001-045 (in `scripts/migration-*.sql`)

## What's Built

### Core Infrastructure
- Next.js 14 (App Router), TypeScript strict, Tailwind CSS, Vitest
- Supabase (PostgreSQL + RLS + pg_cron) with 25+ tables
- OpenAI GPT-4.1-mini client with function calling, retry, cost tracking
- Gmail API integration (read, modify, send, push notifications)
- Google People API (contact import)
- Enhanced Pino logger with domain-specific helpers
- Zod validation on all API boundaries

### AI Analysis Pipeline
- **14 analyzers** via EmailProcessor (Phase 1 parallel + Phase 2 conditional):
  - Categorizer (20 life-bucket categories [Taxonomy v2] + summary + quick_action + labels + signal_strength + reply_worthiness + noise detection + timeliness extraction)
  - Content Digest (gist, key points, links, golden nuggets [7 types incl. remember_this + sales_opportunity], email style ideas)
  - Action Extractor (multi-action support, urgency scoring, tightened for real tasks with new types: pay, submit, register, book)
  - Client Tagger (fuzzy matching, relationship signals)
  - Date Extractor (deadlines, payments, birthdays, expirations)
  - Event Detector (dates, location, RSVP, locality awareness, event type taxonomy [18 types], commitment level inference, recalibrated relevance scoring)
  - **Multi-Event Detector** (NEW Feb 2026, ENHANCED Mar 2026): Extracts up to 10 events from a single email — handles course schedules, event roundups, newsletter event sections. Runs INSTEAD OF EventDetector when both `has_event` and `has_multiple_events` labels present. Optional link resolution for additional context. Now includes per-event type taxonomy, commitment inference (defaults to `fyi` for newsletter events), and relevance scoring with webinar penalty.
  - Contact Enricher (company, job title, relationship from signatures)
  - Sender Type Detector (direct vs broadcast classification)
  - **Idea Spark** (Feb 2026, REFINED Mar 2026): Generates 0-3 creative ideas per email (solopreneur focus). Smarter gating skips low-signal and automated emails (Taxonomy v2 merged notification/transactional into automated). New types: tweet_draft, learning, tool_to_try, place_to_visit. Can return 0 ideas when email isn't idea-worthy.
  - **Insight Extractor** (NEW Feb 2026): Synthesizes interesting ideas, tips, frameworks from newsletter/substantive content — "what's worth knowing"
  - **News Brief** (NEW Feb 2026): Extracts factual news items (launches, announcements, changes) from news/digest emails — "what happened"
  - **Link Analyzer** (NEW Feb 2026): Deep URL intelligence — enriches links from emails with priority scoring (must_read/worth_reading/reference/skip), topic tagging, save-worthiness, and expiration detection based on user context. Saves to `email_analyses.url_extraction` JSONB; user-promoted links persist to `saved_links` table.
- Pre-filter system saves 20-30% AI tokens (relaxed SKIP_SENDER_PATTERNS, auto-categorize by domain)
- Sender pattern learning for future auto-categorization
- Two-phase execution (core in parallel, then conditional analyzers)
- Signal strength + reply worthiness scoring for Hub priority (noise emails suppressed at 0.05x)
- Noise detection labels (sales_pitch, webinar_invite, fake_recognition, mass_outreach, promotional)
- Action extractor noise rejection (cold outreach, fake awards never generate actions)
- **Hard noise gate** (NEW Feb 2026): Emails with signal_strength = 'low' or 'noise' never create action records
- **Scoring Engine** (NEW Mar 2026): Pure-computation scoring after analyzers — 5 dimensions (importance, urgency, action, cognitive load, missability) plus composite surface_priority
- **Timeliness Extraction** (NEW Mar 2026): Categorizer outputs timeliness JSONB (nature, relevant_date, late_after, expires, perishable) for time-aware surfacing
- **Smart Views API** (NEW Mar 2026): `/api/emails/smart-views?view=today|upcoming|expiring|reading-list|high-priority|needs-action`
- **Timeliness Cron Job** (NEW Mar 2026): Hourly job auto-archives expired emails, escalates approaching deadlines, decays stale perishables
- **Event Suggestion Weighting** (NEW Mar 2026): 18-type event taxonomy (meeting, social, webinar, community, etc.) with default importance weights. 4-tier commitment inference (confirmed/invited/suggested/fyi). Composite weight algorithm combining 6 signals (type weight, commitment, AI relevance, sender, temporal urgency, behavior weight). Events sorted by commitment tier → composite weight → date within time groups. EventCard shows type badges + commitment badges + whyAttend text. **Phase 4 preference learning** (Mar 2026): `user_event_preferences` table with count-aware EMA scoring. Preferences updated as fire-and-forget side-effect on dismiss/maybe/save. Behavior weight uses event_type (50%), sender_domain (30%), category (20%). Batch states endpoint (`/api/events/states?ids=`) replaces N+1 pattern. See `src/services/events/preference-learning.ts`.
- **Two-tier task system** (NEW Feb 2026): Review Queue for scan-worthy emails + Real Tasks for concrete actions
- **Email Summaries** (NEW Feb 2026): AI-synthesized narrative digests. Summary generator service gathers threads/actions/dates/ideas/news, clusters by thread, synthesizes with GPT-4.1-mini into conversational headlines + themed sections. Staleness tracking via `user_summary_state` table. Lazy generation (user visit) + eager batch job (`generateSummariesForStaleUsers`). 1-hour minimum interval. Full history browsable at `/summaries`.

### Email Sync
- Full sync + incremental sync via Gmail API
- Push notifications (Gmail Pub/Sub) for real-time delivery
- Scheduled polling (pg_cron) as fallback
- Sync locking to prevent concurrent syncs
- History ID validation and stale detection
- Historical metadata-only sync for contact enrichment
- Initial sync orchestrator for onboarding (100 emails, 240s timeout, batch checkpoints for interruption recovery)

### Navigation & Pages

The app uses a 5-item sidebar navigation (redesigned Feb 2026):

| Nav Item | Route | Description |
|----------|-------|-------------|
| **Home** | `/home` | Daily briefing: greeting, top 3 priorities, today's schedule, pending tasks, idea sparks, daily review queue, saved links, profile nudge |
| **Inbox** | `/inbox` | 5 tabs — Inbox (unified feed), Priority (AI-ranked), Categories (overview grid), Discoveries (insights/news/links), Archive |
| | `/inbox/[category]` | Category deep-dive (email list for a life-bucket) |
| | `/inbox/[category]/[emailId]` | Single email detail view |
| **Contacts** | `/contacts` | Tabbed contacts — All, Clients, Personal, Subscriptions |
| | `/contacts/[id]` | Contact detail (CRM-style with emails, actions, events, notes) |
| **Calendar** | `/calendar` | Unified calendar: list/grid views, merged events + extracted dates, type filters |
| **Tasks** | `/tasks` | 4 tabs — Triage, Board, Projects, Library (redesigned Mar 2026 from 6 tabs) |
| | `/tasks/campaigns/new` | Create new campaign |
| | `/tasks/campaigns/[id]` | Campaign detail |
| **Summaries** | `/summaries` | Browsable history of AI-synthesized email summaries, grouped by date |
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
- Custom hooks: useEmails, useActions, useContacts (with client fields), useExtractedDates, useEvents, useSettings, useSyncStatus, useEmailAnalysis, useInitialSyncProgress, useIdeas, useInsights, useNews, useReviewQueue, useCategoryStats, useCategoryPreviews, useHubPriorities, useSidebarData, useCampaigns, useTemplates, useGmailAccounts, useUserContext, useEmailThumbnails, useSummary, useSummaryHistory, useProjects, useProjectItems
- REST API routes for all entities with Zod validation
- Page-based pagination with URL state
- Optimistic UI updates with rollback

### UI Components
- Full component library: Button, Card, Badge, Dialog, Toast, Skeleton, Spinner, Input, Select, Switch, Checkbox, Pagination
- Layout: Navbar (search, sync indicator), Sidebar (5-item nav, category filters, top contacts, upcoming events), PageHeader (breadcrumbs)
- Tab containers: InboxTabs (5 tabs), ContactsTabs, TasksTabs (6 tabs incl. Ideas) — all URL-synced via `?tab=` with legacy redirects
- Extracted content components: ActionsContent, CampaignsContent, TemplatesContent, DiscoverContent, ArchiveContent, ProjectsContent, AllItemsContent, DiscoveriesFeed
- Project components: ProjectCard, ProjectItemRow, ProjectItemList, ProjectDateRange, CreateProjectDialog, CreateItemDialog, EditProjectDialog, DeleteProjectDialog, PromoteActionDialog, ActiveProjectsWidget
- Shared components: PriorityCard, EmptyState (4 variants), StatCard (animated numbers), CollapsibleSection (lazy-rendered)
- **View Redesign Phase 1** (Mar 2026): Tooltip system (3-tier Radix-based), Card elevation/accent/interactive props, timeliness accent utility, animation utilities (staggeredEntrance, useAnimatedNumber), CSS keyframes (fade-slide-up, pulse-once, confetti-pop). Home page redesigned to Trifecta layout: NowCard (top priority), TodayCard (mini-timeline), ThisWeekCard (stat cluster) above fold; PendingTasks, IdeaSparks, DailyReview, ActiveProjects in collapsible below-fold sections. Deleted 6 redundant home components (EmailSummaryCard, InsightsCard, NewsBriefCard, SavedLinksCard, StyleInspirationCard, SummaryItemCapture). DailyBriefingHeader simplified. ActiveProjectsWidget optimized (O(n) single-pass). IdeaSparksCard config slimmed. TooltipProvider wraps app root.
- **View Redesign Phase 2** (Mar 2026): Inbox polish — InboxFeed broken from 682→264 lines with 7 extracted components (EmailList, InboxSearchBar, InboxEmptyState, EmailHoverActions, EmailRowIndicators, CategorySparkline, DiscoveryItem). Timeliness-driven left borders on email rows via `getTimelinessAccent()`. Hover action tray (Archive/Star/Snooze) with CSS translate-x transition. Badge cascade (max 2 indicators): star + one contextual (must_reply → nuggets → broadcast → category). InboxEmailCard shows gist + timeliness accent. PriorityEmailList groups by reply_worthiness with CollapsibleSection + score breakdown tooltips. Category sparklines (7-day inline SVG). CategoryOverview with avatar clusters. DiscoveryItem unified component. ⌘K search hint. React.memo on list items, useMemo/useCallback throughout. All files under 400 lines.
- **View Redesign Phase 3** (Mar 2026): Calendar redesign — Calendar page broken from 1,234→297 lines (thin orchestrator). 10 new components: `event-colors.ts` (unified event type→color/shape mapping), `types.ts` (CalendarItem unified type + mergeToCalendarItems + groupByTimePeriod), `RsvpBadge` (4-tier urgency countdown), `TimelineGroup` (sticky headers with overdue red strip), `TimelineItem` (vertical timeline with colored dots, inline expansion, birthday confetti-pop, React.memo), `TimelineView` (6 time-period groups with staggered entrance), `CalendarDayCell` (heat map intensity, type dots, today ring, React.memo), `CalendarDayExpansion` (accordion detail row), `CalendarGrid` (month grid with navigation + day expansion + color legend), `EventActions` (compact/full action buttons with snooze presets). CalendarStats refactored from 5 hand-rolled cards to 3 StatCards with smart subtitles (next-up item, busiest day, oldest overdue). All files under 400 lines.
- **View Redesign Phase 4** (Mar 2026): Delight & polish — `useKeyboardShortcuts` hook (single document listener, form-element guard). Keyboard navigation: `?` (ShortcutsModal), `N` (home top priority), `J/K` (inbox + calendar list nav), `E` (archive), `S` (star/unstar). `ShortcutHint` component for desktop kbd badges. `GlobalShortcuts` wrapper in root layout. `streak.ts` utility (weekend-aware consecutive-day calculation, 3-tier emoji display). Streak indicator in DailyBriefingHeader (useMemo cached). Staggered entrance animations on EmailList + PriorityEmailList (hasMounted ref guard, capped at item 6). State change CSS: `slide-out-right` (archive 300ms), `slide-out-down` (dismiss 200ms), `star-spin` (star 200ms). Exit animations complete before DOM removal. 5 new files, 13 modified, all under 400 lines.
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
- Daily/weekly digest emails
- Pattern detection (communication trends)
- Smart bundling of related emails
- Unsubscribe intelligence
- Google Calendar sync (export events)
- Advanced analytics dashboard
- Category Intelligence Bar (API ready, UI pending)
- Focus Mode for category view
- Projects Phase 4: drag-and-drop reordering, project templates, Gantt-style timeline view
- ~~**Event Suggestion Weighting Phase 4**~~: **IMPLEMENTED** (Mar 2026) — preference learning system with count-aware EMA, batch states endpoint, behavior weight in composite scoring
- **Event Suggestion Weighting Phase 5**: UI enhancements — event type filter bar, commitment filter, "Teach Me" prompts (auto-minimize after repeated dismissals), compact cards for low-relevance events, "Why this event" tooltips
- **Performance**: Full SWR/React Query cache for all hooks (useEmails, useContacts, etc.) — analysis cache partially done (module-level stale-while-revalidate)
- **Performance**: SQL aggregation for inbox stats (`/api/emails/stats` endpoint with `GROUP BY category` SQL, replaces JS-side computation in useEmails)
- **Performance**: Consolidate 3 date formatting functions into shared `src/lib/utils/date.ts`
- **UI Audit**: Home page email type breakdown in daily briefing summary
- **UI Audit**: Confidence-based visual affordances (fade low-confidence gist, "?" badge for categorization < 0.5)
- **UI Audit**: Email thread intelligence (aggregate insights across thread)
- **UI Audit**: Export/share capabilities (nuggets, insights, links → Notion/Obsidian/markdown)

### Known Issues
- `urgency_score` and `relationship_signal` exist in TypeScript types for `emails` table but have **no database migration** — reads will return null. Need a migration to add these columns if denormalization is desired.
- ComposeEmail component exists but is not accessible from the inbox or email detail views (no reply/compose button wired up in inbox flows)

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
| Inbox Audit | Feb 2026 | Fixed 9 inbox issues: archive tab now queries archived emails correctly, unarchive/delete handlers fixed, archived emails clickable, back button preserves tab context, retry failures wired to real API, "View All" navigates to full page, all 12 category colors in Priority tab, unused imports cleaned up |
| Inbox Perf | Feb 2026 | Performance overhaul: EmailDetailModal (no full-page reloads), select specific fields (80-90% less data), server-side archive filtering, batch bulk ops, React.memo on list items, fixed broken /inbox/[category] route, removed debug logging |
| Email Taxonomy | Feb 2026 | Signal strength (high/medium/low/noise) + reply worthiness (must_reply/should_reply/optional_reply/no_reply) added to categorizer. Noise detection labels (sales_pitch, webinar_invite, fake_recognition, mass_outreach, promotional). Action extractor noise rejection. Hub priority scoring with signal/reply multipliers. Migration 032 for denormalized columns + indexes. |
| Ideas & Review | Feb 2026 | IdeaSparkAnalyzer (Phase 2, 10 idea types, skipped for noise). Ideas API (GET/POST/PATCH /api/ideas). Review Queue API (GET/PATCH /api/emails/review-queue). useIdeas + useReviewQueue hooks. Two-tier task system: scan-worthy emails vs concrete actions. Migration 033 for idea_sparks JSONB column. |
| Doc Cleanup | Feb 2026 | Updated all docs to reflect current state: fixed outdated category names (client_pipeline→clients, etc.), added IdeaSpark analyzer to AI docs, synced action types, updated migration count to 033, cleaned up redundancies. |
| Multi-Event | Feb 2026 | MultiEventDetectorAnalyzer: extracts up to 10 events from a single email (course schedules, event roundups, newsletter event sections). Runs instead of EventDetector when both `has_event` + `has_multiple_events` labels present. Optional link resolution via ContentDigest links. `has_multiple_events` label added to categorizer. |
| Insights & News | Feb 2026 | Two new Phase 2 analyzers: InsightExtractor (synthesizes ideas/tips/frameworks from newsletters, temp 0.4, gated on substantive content types) and NewsBrief (extracts factual news items, temp 0.2, gated on industry_news label or digest content). API routes (GET/POST/PATCH /api/insights, /api/news). useInsights + useNews hooks. InsightsCard + NewsBriefCard home widgets. InsightsFeed + NewsFeed full-page components. saved_insights + saved_news tables. Migration 034. |
| Contact Onboarding Fix | Feb 2026 | Fixed 5 issues in contact onboarding flow: (1) VIP save failure now shows toast instead of failing silently, (2) MadLibsProfileStep reads VIPs directly from user_context.vip_emails instead of unnecessarily calling vip-suggestions endpoint, (3) email validation added to MadLibsField chip input, (4) context-aware empty state messaging in ContactImportStep, (5) OAuth return URL fixed to use explicit /onboarding path. |
| Contact Onboarding UX | Feb 2026 | Fixed 3 bugs: (1) VIP suggestions returned 0 after fresh Google import (filter required email_count>=3 or starred, fresh imports have neither), (2) MadLibsProfileStep loading race (card rendered before VIPs loaded causing flash), (3) MadLibsField animate-pulse removed (replaced with static italic). Then replaced simple suggestion filter with 12-signal weighted scoring: Google starred/labels, same last name (family), same email domain (coworker), sent count, bidirectional communication, email frequency, recency, longevity, relationship type, sender type penalty, avatar presence. Badge shows top 2 reasons (e.g. "Starred + Possible family"). Works for both fresh imports and established accounts. |
| Email Summaries | Feb 2026 | AI-synthesized email digests. Phase 1: migration 038 (email_summaries + user_summary_state tables), summary generator service (staleness check → gather inputs → cluster threads → AI synthesis → persist), summary prompt engineering, summary/types.ts, GET /api/summaries/latest, POST /api/summaries/generate, config/analyzers.ts update. Phase 2: useSummary hook (auto-generate when stale, polling), EmailSummaryCard component (themed collapsible sections, urgency indicators, loading/empty states), home page integration. Phase 3: Post-sync staleness triggers (sync route + webhook), batch job service (generateSummariesForStaleUsers for cron), GET /api/summaries/history (paginated), useSummaryHistory hook, SummaryHistoryList component (date-grouped, expandable), /summaries history page. "View history" link in EmailSummaryCard footer. |
| Projects | Feb 2026 | Project management system (Phase 1+2). Migration 041: `projects` + `project_items` tables with RLS, indexes, triggers. TypeScript types + Zod schemas. 6 API route files (projects CRUD, project items CRUD, cross-project items). `useProjects` + `useProjectItems` hooks with optimistic updates. 8 UI components: ProjectCard, ProjectItemRow, ProjectItemList, ProjectDateRange, CreateProjectDialog, CreateItemDialog, ProjectsContent, AllItemsContent. ActiveProjectsWidget on home page. TasksTabs expanded from 3→5 tabs (Projects, All Items, Inbox Tasks, Campaigns, Templates). Items support due dates, date ranges, recurrence patterns, tags, priority, estimated time. Items can exist without a project. Source linking to actions/emails for "promote to project" workflow. |
| Projects Phase 3 | Feb 2026 | Action→project item promotion bridge (PromoteActionDialog + ActionsContent integration). EditProjectDialog + DeleteProjectDialog with confirmation. ProjectsContent detail view enhanced with date progress bar, edit/delete buttons. ProjectItemRow inline editing (double-click title, click priority to cycle, click due date to change, project reassignment dropdown). AllItemsContent sort (due date, priority, created, manual) + status filter (pending/in_progress/completed) + overdue-only toggle + show-completed toggle (default off). Recurrence badge on routines (human-readable: "Weekly (Mon)", "Every 2 weeks"). Auto-create next routine occurrence on completion. Updated barrel exports. |
| Analyzer Refinement | Feb 2026 | Unified "right on top of that, Rose!" prompt voice across all analyzers. Added 2 new golden nugget types (remember_this, sales_opportunity) with max increased from 5→7. Multi-category display in inbox UI (secondary dots + badges). Initial sync increased 50→100 emails, relaxed SKIP_SENDER_PATTERNS (removed noreply/notifications/alerts), timeout 120s→240s. Batch checkpoints in initial sync orchestrator (checkpoint saved after each batch for interruption recovery). Fixed retry-analysis route to clear analysis_error before re-processing. Fixed single email analyze route to reset error state on force-reanalyze. Enhanced logging across categorizer, content-digest, insight-extractor (invalid value warnings, low-confidence alerts, failure details). Color-coded nugget badges in EmailDetail. Updated DECISIONS.md (#20-22), AI_ANALYZER_SYSTEM.md (nugget types, voice, checkpoints, re-analysis). |
| Items & Email UX | Mar 2026 | **Email traceability**: Clickable source email links on IdeaSparksCard and ProjectItemRow (pill-style chips with Mail icon), email gist preview on items, `source_email_gist` added to ProjectItemWithEmail type + useProjectItems enrichment. **Quick actions**: EmailQuickActions component in EmailDetail for one-click task creation from email. **Tab consolidation**: Inbox reduced from 8→5 tabs (consolidated Insights+News+Links into DiscoveriesFeed with internal sub-tabs), legacy URL redirects for old bookmarks. Ideas moved from Inbox to Tasks (6 tabs now). **UX improvements**: Search filter in AllItemsContent (title/description/tags/email), project selector in CreateItemDialog, TriageTray auto-expand when 3+ suggestions. IdeaSparksCard "View all" link updated to `/tasks?tab=ideas`. |
| Tasks Page Redesign Phase 1 | Mar 2026 | **Triage-first redesign**: Tasks page restructured from 6→4 tabs (Triage, Board, Projects, Library) with Triage as default. **New hook**: `useTriageItems` composition hook merging `useActions` + `useIdeas` into unified `TriageItem[]` stream with sort-by-urgency, dismiss, and snooze (local state). **New components**: `TriageContent` (full-width triage tab with stats banner, filter pills, accept/dismiss/snooze), `TriageActionCard` + `TriageIdeaCard` (extracted reusable cards with Snooze button), `TriageEmptyState` (celebratory zero-inbox state). `BoardContent` (fork of AllItemsContent, kanban-default, TriageTray removed). `LibraryContent` (sub-tab wrapper for Campaigns + Templates, URL-synced via `?sub=` param). **Legacy redirects**: `LEGACY_TAB_MAP` in TasksTabs for backward-compatible URL redirects (items→board, todos/ideas→triage, campaigns/templates→library). **Sidebar badge**: `useSidebarBadges` extended with `triageCount` query, amber badge on Tasks nav item. |
| Tasks Page Redesign Phase 2 | Mar 2026 | **QuickAcceptPopover**: Lightweight 2-step alternative to PromoteActionDialog — popover anchored to Accept button with project dropdown (MRU from localStorage) + priority selector + "Add to Board" button. "More options..." link falls back to full PromoteActionDialog. **New UI primitive**: `Popover` component (CSS-positioned div with click-outside-to-close, no new npm deps). **Triage wiring**: Accept buttons on `TriageActionCard` + `TriageIdeaCard` now trigger popover instead of dialog. For actions, creates `project_item` with `item_type: 'task'`. For ideas, calls `saveIdea` AND creates `project_item` with `item_type: 'idea'`. **Board enhancements**: Project color stripes (left border on kanban cards via `projectColorMap`), Done column auto-collapse (items completed >7 days ago hidden behind "Show N older" toggle), quick-add "+" button on each column header (opens CreateItemDialog with status pre-filled). `CreateItemDialog` extended with `defaultStatus` prop. |
| Tasks Page Redesign Phase 3 | Mar 2026 | **Query optimization**: `useActions` and `useProjectItems` now use field-specific `select()` + Supabase foreign key joins (`emails!email_id(...)` / `emails!source_email_id(...)`) — eliminates second email enrichment query per hook (~6 KB savings, 1 fewer network round-trip each). **Smarter triage badge**: `useSidebarBadges` triageCount now subtracts promoted actions (those with `source_action_id` in `project_items`) so accepted items no longer inflate the badge. **Snooze persistence**: `useTriageItems` snoozed items now persist to `localStorage` (`ideabox_triage_snoozed` key) — survive page refresh, expired snoozes cleaned up on mount. **AllItemsContent deprecated**: `@deprecated` JSDoc comment added, removed from barrel export (`src/components/projects/index.ts`); file kept for rollback safety until April 2026. **IdeaSparksCard link fix**: "View all" now links to `/tasks` (Triage default) instead of `/tasks?tab=ideas` (legacy redirect). |
| Idea Spark Refinement | Mar 2026 | **Solopreneur-focused idea generation**: IdeaSparkAnalyzer rewritten for 0-3 ideas (was always 3). Smarter gating skips low-signal + automated/notification/transactional email types + notifications category (~60% skip rate, was ~30%). New idea types: `tweet_draft` (replaces `social_post`), `learning` (replaces `hobby`), `tool_to_try`, `place_to_visit`. Removed `shopping`. Legacy type mapping in analyzer normalizer + UI. Prompt rewritten with solopreneur framing, removed "SPECIAL CASES" that forced bad ideas on spam/receipts. `skip_reason` field for when model returns 0 ideas. EmailDetail idea badges now colored + styled (was plain text). Nugget-to-idea type mapping updated. UI components (IdeaSparksCard, IdeasFeed) updated with new type configs + icons + legacy fallbacks. Migration 043 updates `email_ideas.idea_type` CHECK constraint. Cost reduction: ~$0.60/month (was ~$1.05). |
| Email Detail Redesign Phase 3 | Mar 2026 | **Deferred loading + caching + polish**: `enabled` option added to `useProjects` + `useProjectItems` hooks (skip fetch when false). SmartCaptureBar deferred into collapsible section — saves 2 Supabase queries per modal open. Module-level analysis cache (`Map<string, NormalizedAnalysis>`) with stale-while-revalidate — reopening same email shows analysis instantly, background refetch silently updates. JSON comparison prevents unnecessary re-renders when revalidation returns same data. Removed state-clearing timeout on modal close (email data persists for instant re-open). AISummaryBar made sticky (`sticky top-0 z-10 bg-background/95 backdrop-blur-sm shadow-sm`). CollapsibleAnalysisSection gains `onToggle` callback + fade-in animation on expand. All analysis sections verified to have null guards for empty data. |
| Event Weighting | Mar 2026 | **Event suggestion weighting** (Phases 1-3): 18-type event taxonomy (`meeting`, `social`, `webinar`, `community`, etc.) with default importance weights. 4-tier commitment inference (`confirmed`/`invited`/`suggested`/`fyi`) — AI infers from email signals (booking confirmation → confirmed, newsletter listing → fyi). Composite weight algorithm (`services/events/composite-weight.ts`): 6-signal weighted formula (base type 0.15 + commitment 0.20 + AI relevance 0.25 + sender 0.15 + temporal urgency 0.10 + behavior 0.15 placeholder). Recalibrated relevance scoring: commitment is strongest signal, webinars from marketing get -2 penalty. Events API computes compositeWeight. useEvents sorts by commitment tier → compositeWeight → date. EventCard: colored EventTypeBadge (18 types), CommitmentBadge (Going/Invited/FYI), whyAttend text display. Plan doc: `docs/EVENT_SUGGESTION_WEIGHTING_PLAN.md`. Phase 4 (preference learning) and Phase 5 (UI filters, "Teach Me" prompts) remain future work. |
| View Redesign Phase 1 | Mar 2026 | **Shared infrastructure + Trifecta home redesign**: Installed @radix-ui/react-tooltip. Created 3-tier tooltip system (info/preview/rich). Card component upgraded with elevation/accent/interactive props, tightened padding (p-4). Timeliness accent utility maps 6 natures to Tailwind class bundles. Animation utilities: staggeredEntrance (mount-guarded), useAnimatedNumber (rAF-based with cleanup). 3 CSS keyframes (fade-slide-up, pulse-once, confetti-pop). New shared components: EmptyState (4 variants), StatCard (animated numbers + tooltip), CollapsibleSection (CSS grid-template-rows trick, lazy rendering). Home page restructured to Trifecta layout: NowCard (top priority from useHubPriorities, elevated + accent), TodayCard (mini-timeline, 5 items max), ThisWeekCard (3 StatCards + busiest day). Below-fold: 4 CollapsibleSections (PendingTasks, IdeaSparks, DailyReview, ActiveProjects). DailyBriefingHeader simplified to greeting + action count sentence. Deleted 6 components (EmailSummaryCard, InsightsCard, NewsBriefCard, SavedLinksCard, StyleInspirationCard, SummaryItemCapture). ActiveProjectsWidget O(n) optimization. IdeaSparksCard config slimmed. 28 files changed, 1565 insertions, 2172 deletions. |
| View Redesign Phase 2 | Mar 2026 | **Inbox polish — timeliness rows, hover actions, feed breakup, unified discoveries**: InboxFeed broken from 682→264 lines (orchestrator only) with 7 extracted components: EmailList, InboxSearchBar, InboxEmptyState, EmailHoverActions, EmailRowIndicators, CategorySparkline, DiscoveryItem. Email rows redesigned with timeliness left border (3px accent via getTimelinessAccent), hover action tray (Archive/Star/Snooze, CSS translate-x slide-in), badge cascade (max 2: star + one contextual). InboxEmailCard shows gist + timeliness accent, action buttons wired with useCallback. PriorityEmailList groups by reply_worthiness (must/should/optional) with CollapsibleSection + score breakdown tooltips (importance/action/missability bars). Category sparklines (7-day inline SVG polyline, no library) in CategorySummaryPanel. CategoryOverview enhanced with overlapping avatar clusters + sparklines. DiscoveryItem unified component handles insight/news/link types with config-driven icons/colors. ⌘K keyboard hint in InboxSearchBar (desktop only, useEffect focus handler). InboxSummaryBanner refactored to use StatCard (168 lines). CategoryIcon simplified to config-object pattern (394 lines — 20 hand-crafted SVG icons irreducible). React.memo on InboxEmailRow, InboxEmailCard, DiscoveryItem, PriorityRow. useMemo for sparkline computation, priority grouping, search filtering. useCallback on all handlers. File-level JSDoc on all 15 files. All files under 400 lines. Legacy feed files (IdeasFeed, InsightsFeed, NewsFeed, LinksFeed) kept for backward compatibility. |
| View Redesign Phase 3 | Mar 2026 | **Calendar redesign — timeline view, heat map grid, RSVP badges, birthday delight**: Calendar page broken from 1,234→297 lines (thin orchestrator). 10 new components: `event-colors.ts` (unified event type→color/shape mapping per §2b), `types.ts` (CalendarItem unified type + mergeToCalendarItems + groupByTimePeriod), `RsvpBadge` (4-tier urgency: >48h muted, 24-48h amber, <24h red pulse, past strikethrough), `TimelineGroup` (sticky headers with overdue red strip), `TimelineItem` (vertical timeline with circle/diamond dots by type, inline expansion, birthday confetti-pop on mount via hasMounted guard, React.memo), `TimelineView` (6 time-period groups with staggered entrance animation), `CalendarDayCell` (heat map intensity 4 levels, up to 3 type dots, today ring, tooltip breakdown, React.memo), `CalendarDayExpansion` (accordion detail row below grid week), `CalendarGrid` (month nav, 7-col grid, day expansion, date-fns math, itemsByDate useMemo, color legend), `EventActions` (compact icon-only + full text modes with snooze presets). CalendarStats refactored from 5 hand-rolled cards to 3 StatCards with smart subtitles (today: next-up item, week: busiest day, overdue: oldest item). 14 files changed, 1729 insertions, 1179 deletions. All files under 400 lines. Also fixed pre-existing duplicate export in priority-reassessment.ts. |
| View Redesign Phase 4 | Mar 2026 | **Delight & polish — keyboard shortcuts, streak gamification, entrance animations, state transitions**: `useKeyboardShortcuts` hook (single document-level `keydown` listener, form-element suppression, modifier key support). `ShortcutHint` component (desktop-only `<kbd>` badges). `ShortcutsModal` via `?` key globally (grouped by view: Home/Inbox/Calendar/Global). `GlobalShortcuts` wrapper added to root layout. Home: `N` navigates to top priority item. Inbox: `J/K` navigate email rows (DOM-based via `data-email-row` attribute), `E` archive, `S` star/unstar. Calendar: `J/K` navigate timeline items. `streak.ts` utility: weekend-aware consecutive-day calculation, 3-tier emoji (🔥/🔥🔥/🔥🔥🔥), hidden below 3 days, wrapped in `useMemo`. Streak displayed in DailyBriefingHeader (right-aligned, tooltip, pulse animation on mount). Staggered entrance animations added to EmailList + PriorityEmailList (hasMounted ref guard, capped at item 6). State change CSS keyframes: `slide-out-right` (archive 300ms), `slide-out-down` (dismiss 200ms), `star-spin` (star 200ms). InboxEmailRow: archive slide-out animation before DOM removal, star spin on toggle. TimelineView: dismiss slide-out before actual removal. ShortcutHint badges on NowCard (`N`), EmailHoverActions (`E`/`S`). Barrel exports updated (shared/index.ts, hooks/index.ts). 5 new files, 13 modified, all under 400 lines. |
| Taxonomy v2 | Mar 2026 | **Category expansion**: 13 -> 20 life-bucket categories. New: `job_search`, `parenting`, `health`, `billing`, `deals`, `civic`, `sports`. Renamed: `personal_friends_family` -> `personal`. Merged: `newsletters_creator` + `newsletters_industry` -> `newsletters`. Split: `news_politics` -> `news` + `politics`. **Email types simplified**: 9 -> 6 values (`needs_response`, `personal`, `newsletter`, `automated`, `marketing`, `fyi`). Removed: `transactional`, `notification`, `promo`, `cold_outreach` (merged into `automated` and `marketing`). **Timeliness**: New JSONB column `{nature, relevant_date, late_after, expires, perishable}` for time-aware surfacing. **5-dimension scoring**: `importance_score`, `urgency_score`, `action_score`, `cognitive_load`, `missability_score`, `surface_priority` (composite). **Smart views API**: `/api/emails/smart-views?view=today|upcoming|expiring|reading-list|high-priority|needs-action`. **Timeliness cron job**: Auto-archive expired, escalate late, decay stale perishables. **New UI components**: `TimelinessIcon`, `EmailTypeIcon`, `ScoreBadge`. Migration 045. |
