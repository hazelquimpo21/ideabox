# Phase 2 Implementation Prompt — Navigation Redesign

> **Prerequisite:** Phase 1 is complete. The sidebar has 5 nav items, new route pages exist as thin wrappers, all old routes redirect, and all hardcoded references are updated. See `NAVIGATION_REDESIGN_PLAN.md` Phase 1 section for full details.

You are implementing Phase 2 of a navigation redesign for the IdeaBox app (a Next.js email intelligence platform). Read `NAVIGATION_REDESIGN_PLAN.md` in the project root for full context.

**Phase 2 Goal:** Replace the thin wrapper pages created in Phase 1 with real, fully-featured page components. Build out the Home, Inbox, and Calendar pages with proper tabbed UIs, reusing existing components wherever possible.

**IMPORTANT CODE QUALITY REQUIREMENTS:**
- All new code MUST have thorough logging using the project's `createLogger()` utility from `@/lib/utils/logger`
- Every component, function, and module MUST have clear JSDoc comments explaining purpose, parameters, and behavior
- Use descriptive section headers (the `═══` and `───` comment patterns used throughout the codebase)
- Log important user actions, state changes, data fetches, and errors for troubleshooting
- Follow the existing code style — look at `src/app/(auth)/discover/page.tsx` and `src/app/(auth)/events/page.tsx` as reference for logging and comment patterns

---

### What to do:

#### 1. Build the Home page (`src/app/(auth)/home/page.tsx`)

Replace the thin wrapper (currently renders HubPage) with a proper Home page containing these sections:

**Section A: Daily Briefing Header (new component)**
- Greeting message: "Good morning, {firstName}" (or afternoon/evening based on time)
- Summary line: "You have {X} priorities, {Y} events today, {Z} pending tasks"
- Use `useAuth()` for the user's name
- Use `useHubPriorities()` for priority count, `useExtractedDates()` filtered to today for event count, `useActions()` for pending task count

**Section B: Top Priorities (reuse existing)**
- Show top 3 AI-scored priority cards
- Reuse `PriorityCard` component from the Hub page (`src/app/(auth)/hub/page.tsx`)
- Data: `useHubPriorities()` or `GET /api/hub/priorities`
- "View all" link → `/home` (stay on page, or scroll to section)

**Section C: Today's Schedule (new component)**
- Compact timeline of today's events and deadlines
- Show: time + title + type icon (event, deadline, birthday, payment, etc.)
- Data: `useExtractedDates()` filtered to today and tomorrow
- Also include events from `useEvents()` filtered to today
- Each item links to `/calendar?highlight=[id]`
- Empty state: "Nothing scheduled today"

**Section D: Pending Tasks (new component)**
- Top 5 pending tasks sorted by urgency
- Quick-complete checkboxes (reuse from ActionsPage `ActionListItem`)
- Data: `useActions({ limit: 5, status: 'pending' })`
- "View all →" link → `/tasks`

**Section E: Profile Completion Nudge (reuse existing)**
- Show `ProfileCompletionNudge` component if completion < 50%
- Already exists in Hub page — find and reuse it

**New components to create:**
- `src/components/home/DailyBriefingHeader.tsx`
- `src/components/home/TodaySchedule.tsx`
- `src/components/home/PendingTasksList.tsx`

---

#### 2. Build the Inbox page with tabs (`src/app/(auth)/inbox/page.tsx`)

Replace the thin wrapper (currently switches between DiscoverPage and ArchivePage) with a proper tabbed interface:

**Tab Structure:**
```
[Categories]  [Priority]  [Archive]
```

**Tab A: Categories (default)**
- Render the existing Discover page content: `StartAnalysisCard`, `SyncProgressCard`, `CategoryCardGrid`, `ClientInsights`, `QuickActions`, `FailureSummary`, `DiscoveryHero`
- These components are in `src/components/discover/` and `src/app/(auth)/discover/components/`
- Keep all the sync progress tracking logic from `discover/page.tsx`

**Tab B: Priority (new)**
- Email list ranked by AI priority score (`priority_score` field on emails table)
- Fetch: `supabase.from('emails').select('*').order('priority_score', { ascending: false }).limit(50)`
- Show: sender, subject, priority score badge, category badge, date
- Click → `/inbox/[category]/[emailId]`
- New component: `src/components/inbox/PriorityEmailList.tsx`

**Tab C: Archive**
- Render the existing Archive page content
- Reuse all components from `src/app/(auth)/archive/page.tsx`

**Tab container component to create:**
- `src/components/inbox/InboxTabs.tsx` — manages tab state via URL query param `?tab=`
- Use the existing UI tab components: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui`
- Preserve the `?tab=` query param in the URL when switching tabs

**Important:** The sub-routes `/inbox/[category]/page.tsx` and `/inbox/[category]/[emailId]/page.tsx` should continue to work as thin wrappers. They are NOT part of the tabbed UI — they're separate pages for category detail and email detail views.

---

#### 3. Build the Calendar page (`src/app/(auth)/calendar/page.tsx`)

Replace the thin wrapper (currently renders EventsPage) with a unified Calendar page merging Events + Timeline:

**View Toggle:**
```
[Calendar Grid]  [List View]
```
Use `?view=calendar` and `?view=list` query params. Default: list view.

**Calendar Grid View:**
- Reuse `CalendarView` from `src/components/timeline/CalendarView.tsx`
- This already exists as a P6 enhancement in the Timeline page
- Feed it data from both extracted dates AND events

**List View (grouped):**
- Merge events from `useEvents()` and dates from `useExtractedDates()`
- Group by time period: Today, Tomorrow, This Week, Next Week, Later
- Reuse `EventCard` from events page for events
- Reuse `DateCard` from timeline page for extracted dates
- Or create a unified `CalendarItemCard` that handles both types

**Type Filters:**
```
[All] [Events] [Deadlines] [Birthdays] [Payments] [Appointments] [Follow-ups]
```
- Filter the list/calendar by item type
- Reuse the type filter pattern from Timeline page

**Stats Banner:**
- Merge stats from Events page (`EventStatsBanner`) and Timeline stats
- Show: upcoming events count, overdue deadlines, birthdays this month, etc.

**Query params to support:**
- `?view=calendar` / `?view=list` — view toggle
- `?type=event` / `?type=deadline` etc. — type filter
- `?highlight=[id]` — scroll to and highlight a specific item (already supported by EventsPage)
- `?showPast=true` — include past items

**New components to create:**
- `src/components/calendar/CalendarPage.tsx` — main container with view toggle
- `src/components/calendar/CalendarItemCard.tsx` — unified card for dates + events (optional, can reuse existing cards)
- `src/components/calendar/CalendarStats.tsx` — merged stats banner

---

#### 4. Update active state highlighting

Make sure the sidebar nav highlights correctly:
- `/home` highlights "Home"
- `/inbox`, `/inbox/[category]`, `/inbox/[category]/[emailId]` all highlight "Inbox"
- `/contacts`, `/contacts/[id]` highlight "Contacts"
- `/calendar` highlights "Calendar"
- `/tasks`, `/tasks?tab=campaigns`, `/tasks?tab=templates` all highlight "Tasks"
- Settings page highlights "Settings" (bottom item)

The `isActivePath` function in Sidebar.tsx was updated in Phase 1, but verify it works correctly with the new tabbed pages.

---

### Acceptance criteria:

- [ ] Home page shows Daily Briefing, Top 3 Priorities, Today's Schedule, Pending Tasks, Profile Nudge
- [ ] Inbox has 3 working tabs: Categories (default), Priority, Archive
- [ ] Inbox Categories tab renders all Discover components with sync/analysis functionality
- [ ] Inbox Priority tab shows emails sorted by AI priority score
- [ ] Inbox Archive tab renders existing archive functionality
- [ ] Calendar has working view toggle (Calendar Grid / List)
- [ ] Calendar List view shows merged events + extracted dates, grouped by time period
- [ ] Calendar Calendar view renders the grid with all date types
- [ ] Calendar type filters work (All, Events, Deadlines, etc.)
- [ ] `?highlight=` param works in Calendar to scroll to a specific item
- [ ] Tab state persists in URL query params across navigation
- [ ] Active sidebar highlighting works on all pages and sub-pages
- [ ] All new components have thorough logging with `createLogger()`
- [ ] All new components have clear JSDoc comments
- [ ] The app compiles without new TypeScript errors
- [ ] No broken links in the app

### Important constraints:

- Do NOT delete any old page files — they'll be removed in Phase 4
- Do NOT touch the database schema — that's Phase 3
- Do NOT build the Tasks tabs yet — that's Phase 3
- Reuse existing components wherever possible — minimize new code
- Keep the existing hooks and data fetching patterns — don't create new API routes
- The `/inbox/[category]` and `/inbox/[category]/[emailId]` thin wrappers stay as-is
- Follow the project's existing logging patterns using `createLogger()` from `@/lib/utils/logger`
- Follow the project's existing comment/docstring patterns (see any page file for examples)
- Commit your work with clear messages and push to the working branch

### Key files to reference (read these first):

**Existing pages to extract components from:**
- `src/app/(auth)/hub/page.tsx` — PriorityCard, ProfileCompletionNudge patterns
- `src/app/(auth)/discover/page.tsx` — CategoryCardGrid, sync logic, QuickActions
- `src/app/(auth)/discover/components/` — StartAnalysisCard, SyncProgressCard
- `src/app/(auth)/events/page.tsx` — EventCard, EventStatsBanner, time grouping
- `src/app/(auth)/timeline/page.tsx` — DateCard, DateGroup, CalendarView, type filters
- `src/app/(auth)/archive/page.tsx` — Archive search, filter, bulk actions

**Hooks to use:**
- `src/hooks/useActions.ts` — task/action data
- `src/hooks/useEvents.ts` — event data
- `src/hooks/useExtractedDates.ts` — extracted date data (deadlines, birthdays, etc.)
- `src/hooks/useEmails.ts` — email data for archive
- `src/services/hub/hub-priority-service.ts` — priority scoring

**UI components:**
- `src/components/ui/` — Tabs, TabsList, TabsTrigger, TabsContent, Card, Badge, Button, Skeleton, etc.
- `src/components/layout/PageHeader.tsx` — consistent page headers with breadcrumbs
