# Inbox Performance Audit

> **Date:** February 2026
> **Scope:** `/inbox` page, email navigation, data fetching, rendering
> **Auditor priority:** Issues ordered by user-perceived impact

---

## Executive Summary

The inbox has **three structural performance problems** that compound into the sluggish feel:

1. **Full-page reloads on every email click** — navigating to an email unmounts the entire inbox, refetches layout data, and forces a full re-render on back-navigation
2. **Over-fetching: `select('*')` on the emails table** — list views pull `body_html`, `body_text`, and all analysis fields when they only need subject/sender/date/snippet (~10x more data than necessary)
3. **No client-side data cache** — every navigation round-trip refetches everything from Supabase, even data that was loaded seconds ago

Fixing these three would transform the perceived speed. The remaining findings are smaller wins.

---

## P0 (Critical): Full-Page Reloads Kill the SPA Feel

### Problem

Every email click triggers `router.push('/inbox/[category]/[emailId]')`, which:
1. Unmounts the entire inbox page (tabs, category grid, email list)
2. Mounts a new full-page component (`InboxEmailDetailPage`)
3. Fetches the single email from Supabase
4. On back-navigation, re-mounts the inbox and refetches all data from scratch

This is the #1 reason the app feels like a traditional server-rendered page instead of a modern SPA.

### Affected Files

| File | Line | Issue |
|------|------|-------|
| `src/components/discover/DiscoverContent.tsx` | 602 | `router.push(\`/inbox/${category}/${email.id}\`)` from modal |
| `src/components/discover/CategoryModal.tsx` | 214 | `router.push(\`/inbox/${urlCategory}/${email.id}\`)` |
| `src/components/inbox/PriorityEmailList.tsx` | 279 | `<Link href={\`/inbox/${category}/${email.id}\`}>` |
| `src/components/archive/ArchiveContent.tsx` | 464 | `router.push(\`/inbox/${category}/${email.id}\`)` |

### Recommended Fix: Email Detail Modal (Intercept Pattern)

Instead of navigating to a full page, show email detail in a modal/slide-over panel:

```
User clicks email in list → Modal opens with email detail (inbox stays mounted)
                          → URL updates to /inbox/[category]/[emailId] (for shareability)
                          → Back button / Escape closes modal, inbox is still there
                          → Direct URL navigation still renders the full page as fallback
```

**Implementation approach:**
- Add an `EmailDetailModal` component using the existing `Dialog` primitive
- Reuse the existing `EmailDetail` component inside the modal
- Use Next.js [parallel routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes) or client-side state to intercept the navigation
- Keep the full-page `/inbox/[category]/[emailId]` route as a fallback for direct links/bookmarks
- The CategoryModal already proves this pattern works — it shows emails in a modal. Extend it to show full email detail.

**Estimated impact:** Eliminates the full-page re-render cycle. Back-navigation becomes instant.

---

## P0 (Critical): `select('*')` Fetches 10x More Data Than Needed

### Problem

List views fetch the complete email row including `body_html` (can be 50-100KB per email), `body_text`, and all analysis/metadata fields. For a list of 50 emails, this could be **2-5MB** of unnecessary data transfer.

### Affected Files

| File | Line | What it fetches | What it needs |
|------|------|-----------------|---------------|
| `src/hooks/useEmails.ts` | 303 | `select('*', { count: 'exact' })` | id, subject, sender_name, sender_email, date, snippet, category, is_read, is_starred, is_archived, quick_action, urgency_score, gist, priority_score, key_points, topics, labels |
| `src/hooks/useEmails.ts` | 510 | `select('*')` (loadMore) | Same as above |
| `src/components/discover/CategoryModal.tsx` | 159 | `select('*', { count: 'exact' })` | id, subject, sender_name, sender_email, date, snippet, is_read, is_starred, gist, key_points, quick_action, urgency_score, topics |
| `src/app/(auth)/inbox/[category]/[emailId]/page.tsx` | 71 | `select('*')` | Legitimately needs full row for detail view |

### Recommended Fix

Define a `LIST_FIELDS` constant for list views:

```typescript
const EMAIL_LIST_FIELDS = 'id, subject, sender_name, sender_email, date, snippet, category, is_read, is_starred, is_archived, quick_action, urgency_score, gist, summary, priority_score, key_points, topics, labels, relationship_signal, analyzed_at, gmail_id';
```

Use `select(EMAIL_LIST_FIELDS, { count: 'exact' })` instead of `select('*')` in list contexts. Keep `select('*')` only for the email detail page where `body_html`/`body_text` are actually rendered.

**Estimated impact:** 80-90% reduction in data transferred for list views.

---

## P1 (High): No Client-Side Data Cache

### Problem

There is no caching layer (SWR, React Query, or even a simple context cache). Every component mount triggers a fresh Supabase query:

- Switch from Priority tab → Archive tab → back to Priority: **3 separate fetches** for Priority data
- Open email detail → press back: **full refetch** of the inbox tab content
- Open CategoryModal → close it → open it again: **2 separate fetches** for the same category's emails

### Affected Hooks/Components

- `useEmails` — refetches on every mount via `useEffect(() => { fetchEmails(); }, [fetchEmails])`
- `PriorityEmailList` — independent `fetchEmails()` on mount, no shared state
- `CategoryModal` — fetches on every `isOpen` change
- `DiscoverContent` — fetches sync-status and/or live categories on every mount
- `ArchiveContent` — fetches via `useEmails` on mount

### Recommended Fix

Two approaches (pick one):

**Option A: SWR or React Query** (recommended for indie hacker)
- Wrap Supabase calls in SWR's `useSWR` or React Query's `useQuery`
- Automatic deduplication, background revalidation, stale-while-revalidate
- Minimal code change — replace fetch calls with query hooks

**Option B: Lightweight context cache**
- Create an `EmailCacheProvider` that stores fetched emails in a Map
- Tabs share the same cache, modal reads from cache when available
- Manual invalidation on write operations (archive, star, mark read)

**Estimated impact:** Eliminates redundant fetches. Tab switching and back-navigation become instant for previously-loaded data.

---

## P1 (High): Broken Import — `/inbox/[category]` Route Is Dead

### Problem

`src/app/(auth)/inbox/[category]/page.tsx:25` imports:

```typescript
import CategoryDetailPage from '@/app/(auth)/discover/[category]/page';
```

But the directory `src/app/(auth)/discover/` **does not exist**. It was deleted during the navigation redesign. This means:

- The `/inbox/[category]` route (category deep-dive) will fail at build time or produce a runtime error
- The "View Full Page" button in CategoryModal (`router.push(\`/inbox/${urlCategory}\`)`) navigates to a broken page
- All "View All" links from the category card grid point to broken routes

### Recommended Fix

Either:
1. **Recreate the component inline** — build a proper `InboxCategoryPage` component that uses `useEmails({ category })` directly
2. **Extract the old CategoryDetailPage** into `src/components/categories/CategoryDetailContent.tsx` and import from there

---

## P2 (Medium): ArchiveContent Over-Fetches Then Filters Client-Side

### Problem

`ArchiveContent` (`src/components/archive/ArchiveContent.tsx:349-356`) fetches up to 100 emails with `includeArchived: true`, which gets ALL emails (archived + non-archived), then filters to `is_archived === true` in JavaScript:

```typescript
const { emails } = useEmails({ limit: 100, includeArchived: true });
const archivedEmails = emails.filter((email) => email.is_archived);
```

If the user has 100 non-archived emails and 10 archived ones, this fetches 100 emails to show 10. Combined with `select('*')`, this is particularly wasteful.

### Recommended Fix

Add a dedicated `archivedOnly` option to `useEmails` that adds `.eq('is_archived', true)` to the query, or create a dedicated `useArchivedEmails` hook. The DB should do the filtering, not JavaScript.

---

## P2 (Medium): Bulk Operations Are Sequential

### Problem

`ArchiveContent` bulk unarchive and bulk delete iterate with sequential `for` loops:

```typescript
// src/components/archive/ArchiveContent.tsx:487-489
const handleBulkUnarchive = async () => {
  const ids = Array.from(selectedIds);
  for (const id of ids) {
    await handleUnarchive(id); // Sequential — one DB call per email
  }
};
```

For 20 selected emails, that's 20 sequential Supabase calls.

### Recommended Fix

Use a single batch operation:

```typescript
await supabase
  .from('emails')
  .update({ is_archived: false })
  .in('id', Array.from(selectedIds));
```

Same fix for bulk delete.

---

## P2 (Medium): Stats Calculated in JavaScript Instead of SQL

### Problem

`useEmails` (`src/hooks/useEmails.ts:358-426`) fetches all emails, then iterates over them in JavaScript to compute `quickActionStats` and `categoryStats`. For 50+ emails, this is a non-trivial CPU cost on the client, and it only counts the fetched page — not the total dataset.

### Recommended Fix

Use Supabase's aggregation or a dedicated `/api/emails/stats` endpoint that runs SQL:

```sql
SELECT category, COUNT(*) as count
FROM emails
WHERE user_id = $1 AND is_archived = false
GROUP BY category;
```

This gives accurate totals across the entire dataset, not just the current page.

---

## P3 (Low): PriorityEmailList Creates Supabase Client Outside useMemo

### Problem

`PriorityEmailList` (`src/components/inbox/PriorityEmailList.tsx:173`) creates a new Supabase client inside `fetchEmails`:

```typescript
const fetchEmails = React.useCallback(async () => {
  const supabase = createClient(); // New client on every call
  // ...
}, []);
```

While `createClient()` likely returns a singleton internally, this is inconsistent with the `useMemo` pattern used elsewhere (e.g., `useEmails`, `CategoryModal`).

### Recommended Fix

Move to component level: `const supabase = React.useMemo(() => createClient(), []);`

---

## P3 (Low): EmailCard Debug Logging on Every Render

### Problem

`EmailCard` (`src/components/categories/EmailCard.tsx:211-219`) runs a `useEffect` that logs debug info on every mount:

```typescript
React.useEffect(() => {
  logger.debug('Rendering email card', {
    emailId: email.id,
    // ...5 fields
  });
}, [email]);
```

In a list of 50 emails, that's 50 debug log calls on mount. The `[email]` dependency means it re-fires whenever the email object reference changes (which happens on any parent re-render that creates new objects).

### Recommended Fix

Remove this useEffect entirely. Debug logging in render effects has a measurable cost and provides limited value in production.

---

## P3 (Low): No React.memo on Repeated List Items

### Problem

Several components rendered in `.map()` loops are not memoized:

- `EmailCard` — rendered 15x in CategoryModal, 50x in category views
- `ModalEmailItem` — rendered 15x in CategoryModal
- `ArchivedEmailItem` — rendered up to 100x in ArchiveContent
- `CategoryCard` — rendered 12x in CategoryCardGrid
- Priority email rows in `PriorityEmailList` — rendered 50x (inline JSX, not even a component)

Without `React.memo`, any parent state change (e.g., toggling a single star) re-renders the entire list.

### Recommended Fix

Wrap list-item components in `React.memo`:
```typescript
export const EmailCard = React.memo(function EmailCard({ ... }: EmailCardProps) { ... });
```

Also extract the inline priority email row into a memoized component.

---

## P3 (Low): Duplicate Date Formatting Utilities

### Problem

There are **three separate** date formatting functions across the inbox code:

1. `formatRelativeDate()` in `PriorityEmailList.tsx:135` — hand-rolled
2. `formatRelativeTime()` in `ArchiveContent.tsx:74` — hand-rolled (different logic)
3. `formatDistanceToNow()` from `date-fns` in `EmailCard.tsx:199` — library import

These produce inconsistent output ("2d ago" vs "2 days ago" vs "2 days ago") and `date-fns` adds ~6KB gzipped to the bundle for a single function call.

### Recommended Fix

Create one shared `formatRelativeDate()` in `src/lib/utils/date.ts` and use it everywhere. Drop the `date-fns` import unless it's used elsewhere.

---

## P3 (Low): DiscoverContent Has Complex Sequential Loading Logic

### Problem

`DiscoverContent` (`src/components/discover/DiscoverContent.tsx:213-293`) has a deeply nested `useEffect` that makes sequential API calls:

1. Fetch `/api/onboarding/sync-status`
2. If result is empty → fetch `/api/emails/category-summary`
3. If that fails → start polling every 5 seconds

This waterfall adds latency. Also, onboarded users still call the `sync-status` endpoint first, which is primarily for onboarding state.

### Recommended Fix

For onboarded users, skip the sync-status check entirely and go straight to `/api/emails/category-summary`. The sync-status fallback only matters during/immediately after onboarding.

---

## Architecture Recommendation: Email Detail Modal

This addresses the user's core request: "see email detail in modal before going to a full page."

### Proposed UX Flow

```
/inbox (Categories tab)
  ├── Click category card → CategoryModal (already exists)
  │     └── Click email → EmailDetailModal (NEW) — opens within existing modal or replaces it
  │           ├── Back/Escape → return to CategoryModal
  │           └── "Open Full Page" → /inbox/[category]/[emailId]
  │
/inbox?tab=priority
  └── Click email row → EmailDetailModal (NEW) — slides in from right
        ├── Back/Escape → return to priority list (list stays mounted!)
        └── "Open Full Page" → /inbox/[category]/[emailId]

/inbox?tab=archive
  └── Click email row → EmailDetailModal (NEW) — same pattern
```

### Implementation Plan

1. **Create `EmailDetailModal` component** — wraps existing `EmailDetail` in a `Dialog` (slide-over variant, max-w-3xl, right-aligned)
2. **Add email detail state to InboxTabs** — `selectedEmailId` + `selectedEmailCategory` state at the tab container level
3. **Pass `onEmailSelect` down** to `DiscoverContent`, `PriorityEmailList`, `ArchiveContent`
4. **On email click** — set selected email state, open modal, update URL with shallow routing
5. **On modal close** — clear selected email state, restore URL
6. **Keep full-page route** as fallback for direct navigation / bookmarks

### Key Constraints
- Modal must fetch email detail data (body_html, analysis) only when opened — don't prefetch
- Back navigation must not trigger a full page re-render
- Star/archive actions in the modal should optimistically update the underlying list
- URL should update for shareability: `/inbox?tab=priority&email=[id]` or use parallel routes

---

## Implementation Status

| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| **P0-A** | Email Detail Modal | **DONE** | EmailDetailModal component + wired into all tabs |
| **P0-B** | `select('*')` → select specific fields | **DONE** | EMAIL_LIST_FIELDS / MODAL_LIST_FIELDS constants |
| **P1-A** | Fix broken `/inbox/[category]` route | **DONE** | Rebuilt as inline component using useEmails |
| **P1-B** | Add SWR/React Query cache | TODO | Deferred — requires new dependency |
| **P2-A** | ArchiveContent server-side filtering | **DONE** | New `archivedOnly` option in useEmails |
| **P2-B** | Batch bulk operations | **DONE** | Single `.in('id', ids)` call |
| **P2-C** | SQL aggregation for stats | TODO | Requires API endpoint |
| **P3** | React.memo, remove debug logging, fix Supabase client | **DONE** | EmailCard, ArchivedEmailItem, PriorityEmailRow |

---

## Files Modified

### Email Detail Modal (P0-A)
- `src/components/email/EmailDetailModal.tsx` — **NEW** — slide-over modal wrapping EmailDetail
- `src/components/inbox/InboxTabs.tsx` — selectedEmail state + EmailDetailModal rendering
- `src/components/discover/DiscoverContent.tsx` — accepts onEmailSelect, uses modal from CategoryModal
- `src/components/discover/CategoryModal.tsx` — email click delegates to onEmailSelect when available
- `src/components/inbox/PriorityEmailList.tsx` — email click uses onEmailSelect callback
- `src/components/archive/ArchiveContent.tsx` — email click uses onEmailSelect callback

### Select Optimization (P0-B)
- `src/hooks/useEmails.ts` — `EMAIL_LIST_FIELDS` constant, replaces `select('*')` in fetchEmails/loadMore
- `src/components/discover/CategoryModal.tsx` — `MODAL_LIST_FIELDS` constant, replaces `select('*')`

### Broken Route Fix (P1-A)
- `src/app/(auth)/inbox/[category]/page.tsx` — rebuilt as standalone component using useEmails

### Server-Side Archive Filtering (P2-A)
- `src/hooks/useEmails.ts` — added `archivedOnly` option with `.eq('is_archived', true)`
- `src/components/archive/ArchiveContent.tsx` — uses `archivedOnly: true` instead of JS filtering

### Batch Bulk Operations (P2-B)
- `src/components/archive/ArchiveContent.tsx` — `handleBulkUnarchive` and `handleBulkDelete` use single `.in()` call

### React.memo and Cleanup (P3)
- `src/components/categories/EmailCard.tsx` — wrapped in React.memo, removed debug useEffect
- `src/components/archive/ArchiveContent.tsx` — ArchivedEmailItem wrapped in React.memo
- `src/components/inbox/PriorityEmailList.tsx` — extracted PriorityEmailRow (React.memo), Supabase client at component level

---

## Remaining Work

### P1-B: Client-Side Data Cache
- Add `swr` or `@tanstack/react-query` to `package.json`
- Wrap Supabase calls in `useSWR` or `useQuery` hooks
- Automatic deduplication, stale-while-revalidate, background refetching

### P2-C: SQL Aggregation for Stats
- Create `/api/emails/stats` endpoint with `GROUP BY category` SQL
- Replace JS-side stat computation in `useEmails`

### P3 (remaining): Consolidate Date Utilities
- Create shared `src/lib/utils/date.ts` with single `formatRelativeDate()`
- Replace 3 separate implementations (PriorityEmailList, ArchiveContent, EmailCard)
