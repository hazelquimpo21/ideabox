You are implementing Phase 3 of the email detail UI redesign. Read
`PLAN-email-detail-redesign.md` for full context, but this prompt is
self-contained — you have everything you need here.

## What You're Building

Phase 1 fixed the data-fetching waterfall and added an AISummaryBar above the
email body. Phase 2 decomposed the 780-line `AnalysisSummary` into independent,
collapsible, memoized section components. Phase 3 eliminates wasted work
(deferred loading, caching, memoization) and adds tactile polish (animations,
sticky summary bar).

## Current Architecture (after Phase 2)

```
EmailDetailModal.tsx (334 lines — fetches email + analysis in parallel)
  ├─ useEmailAnalysis(isOpen ? emailId : null)     ← fires on open
  ├─ useExtractedDates(isOpen && emailId ? … : {}) ← fires on open
  └─ EmailDetail.tsx (320 lines — layout shell)
       ├─ EmailHeader
       ├─ EmailSubject
       ├─ AISummaryBar (157 lines — compact bar above body)
       ├─ EmailBody
       └─ AnalysisSummary.tsx (277 lines — thin orchestrator)
            ├─ CategoriesSection          (defaultOpen)
            ├─ ContentDigestSection       (already extracted, not collapsible)
            ├─ GoldenNuggetsSection       (defaultOpen)
            ├─ EmailStyleIdeasSection     (collapsed)
            ├─ ActionExtractionSection    (defaultOpen)
            ├─ ClientTaggingSection       (collapsed)
            ├─ IdeaSparksSection          (defaultOpen)
            ├─ InsightsSection            (collapsed)
            ├─ NewsBriefSection           (collapsed)
            ├─ DateExtractionSection      (already extracted, not collapsible)
            ├─ MultiEventSection          (collapsed)
            ├─ SmartCaptureBar            (569 lines — always mounted, 2 unconditioned fetches)
            ├─ AnalysisMetaInfo
            └─ EventDetailsCard           (conditional, already extracted)
```

**Key problem**: `SmartCaptureBar` calls `useProjects({ status: 'all' })` and
`useProjectItems()` on mount — two full-table Supabase queries that fire every
time the modal opens, even though most users won't interact with the capture bar
on first view. Additionally, closing and reopening the same email refetches all
analysis data from scratch.

**Key files you'll work with:**

- `src/components/email/SmartCaptureBar.tsx` (569 lines) — calls `useProjects`
  (line 435) and `useProjectItems` (line 436) unconditionally on mount. Props
  defined at lines 75-83. No `isExpanded`/`enabled` pattern.
- `src/hooks/useProjects.ts` (234 lines) — no `enabled` option. Fetches via
  `useEffect` → `fetchProjects()` at line 224. Options interface at lines 31-35.
- `src/hooks/useProjectItems.ts` (356 lines) — no `enabled` option. Fetches via
  `useEffect` → `fetchItems()` at line 346. Options interface at lines 39-50.
- `src/hooks/useEmailAnalysis.ts` (584 lines) — `normalizeAnalysis` at line 267
  (235 lines, not memoized). Hook at line 523. Already has null-guard pattern:
  `emailId: string | null` — when null, skips fetch. The modal passes
  `isOpen ? emailId : null` (line 110 of EmailDetailModal).
- `src/components/email/EmailDetailModal.tsx` (424 lines) — clears email state
  on close with 200ms delay (lines 189-198). Hooks hoisted at lines 106-114.
  No analysis cache.
- `src/components/email/AISummaryBar.tsx` (157 lines) — not sticky. Outer div
  at line 111: `className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg min-h-[3.5rem]"`.
- `src/components/email/CollapsibleAnalysisSection.tsx` (55 lines) — manages
  own open/closed state internally. Children always mount (CSS-only collapse).
  No `onToggle` callback or controlled mode.

## Tasks (in order)

### Task 1: Add `enabled` option to `useProjects` and `useProjectItems`

**Goal**: Allow consumers to opt out of the initial fetch, so SmartCaptureBar
can defer its queries until the user actually expands the section.

**File**: `src/hooks/useProjects.ts`

Add an `enabled` option (default `true`) to `UseProjectsOptions`:

```tsx
export interface UseProjectsOptions {
  status?: ProjectStatus | 'all';
  limit?: number;
  sortBy?: 'updated_at' | 'created_at' | 'name' | 'priority';
  enabled?: boolean; // ← NEW: skip fetch when false
}
```

Guard the fetch in the existing `useEffect` (line 224):

```tsx
React.useEffect(() => {
  if (enabled === false) return; // skip fetch when disabled
  fetchProjects();
}, [fetchProjects, enabled]);
```

Also guard the `fetchProjects` callback itself so it no-ops when disabled:

```tsx
const fetchProjects = React.useCallback(async () => {
  if (enabled === false) { setIsLoading(false); return; }
  // ... existing fetch logic ...
}, [supabase, status, limit, sortBy, enabled]);
```

**File**: `src/hooks/useProjectItems.ts`

Same pattern — add `enabled?: boolean` to `UseProjectItemsOptions`, guard the
`useEffect` at line 346 and the `fetchItems` callback.

**This follows the codebase's existing pattern**: `useEmailAnalysis` already
uses a null-guard on `emailId` to skip fetching. The `enabled` flag is the
same concept, just explicit.

### Task 2: Defer SmartCaptureBar rendering until section is expanded

**Goal**: SmartCaptureBar's hooks should not fire until the user clicks to
expand it. Since `CollapsibleAnalysisSection` always mounts its children
(CSS-only collapse), we need a different approach.

**Approach**: Add an `onToggle` callback to `CollapsibleAnalysisSection` so
the parent can know when the section opens. Then conditionally render
SmartCaptureBar only when expanded.

**File**: `src/components/email/CollapsibleAnalysisSection.tsx`

Add an optional `onToggle` callback prop and optional controlled mode:

```tsx
interface CollapsibleAnalysisSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  onToggle?: (isOpen: boolean) => void;  // ← NEW
}
```

When the toggle fires, call `onToggle` after updating state:

```tsx
const handleToggle = React.useCallback(() => {
  setIsOpen((prev: boolean) => {
    const next = !prev;
    onToggle?.(next);
    return next;
  });
}, [onToggle]);
```

**File**: `src/components/email/AnalysisSummary.tsx`

Wrap SmartCaptureBar in a `CollapsibleAnalysisSection` that starts collapsed.
Use local state to track whether it has ever been opened, and only mount the
bar once expanded:

```tsx
const [captureExpanded, setCaptureExpanded] = React.useState(false);
const captureEverOpened = React.useRef(false);

const handleCaptureToggle = React.useCallback((isOpen: boolean) => {
  setCaptureExpanded(isOpen);
  if (isOpen) captureEverOpened.current = true;
}, []);

// In the render:
<CollapsibleAnalysisSection
  icon={Zap}
  title="Quick Capture"
  subtitle="Save actions & ideas to board"
  iconColor="text-orange-500"
  onToggle={handleCaptureToggle}
>
  {captureEverOpened.current && (
    <SmartCaptureBar
      emailId={email.id}
      emailSubject={email.subject || undefined}
      emailGist={email.gist || email.snippet || undefined}
      actionExtraction={analysis.actionExtraction}
      ideaSparks={analysis.ideaSparks}
      contactId={analysis.clientTagging?.clientId}
    />
  )}
</CollapsibleAnalysisSection>
```

Using `captureEverOpened.current` (a ref) ensures that once the user opens the
section, the bar stays mounted even if they collapse and re-expand (no re-fetch).

**Why not use `enabled` prop on the hooks?** Because SmartCaptureBar has
internal state (saved IDs, edit mode) that would reset if we unmount it. The
ref-based "mount once" pattern preserves that state.

### Task 3: Add analysis cache with stale-while-revalidate

**Goal**: Closing and reopening the same email should show analysis instantly,
then silently revalidate in the background.

**File**: `src/hooks/useEmailAnalysis.ts`

Add a module-level cache (a simple `Map`) and stale-while-revalidate logic:

```tsx
// Module-level cache — persists across hook instances within the same page session
const analysisCache = new Map<string, NormalizedAnalysis>();

export function useEmailAnalysis(emailId: string | null): UseEmailAnalysisReturn {
  const [analysis, setAnalysis] = React.useState<NormalizedAnalysis | null>(
    // Initialize from cache if available
    emailId ? (analysisCache.get(emailId) ?? null) : null
  );
  const [isLoading, setIsLoading] = React.useState(
    // Not loading if we have a cached result
    emailId ? !analysisCache.has(emailId) : false
  );
  // ...

  const fetchAnalysis = React.useCallback(async () => {
    if (!emailId) { setAnalysis(null); return; }

    // If we have a cached result, show it immediately but still refetch
    const cached = analysisCache.get(emailId);
    if (cached) {
      setAnalysis(cached);
      setIsLoading(false);
      // Continue to background revalidation below
    } else {
      setIsLoading(true);
    }

    try {
      const { data, error: queryError } = await supabase
        .from('email_analyses')
        .select('*')
        .eq('email_id', emailId)
        .maybeSingle();

      if (queryError) throw queryError;
      if (!data) { setAnalysis(null); setIsLoading(false); return; }

      const normalized = normalizeAnalysis(data as EmailAnalysis);
      analysisCache.set(emailId, normalized); // Update cache
      setAnalysis(normalized);
    } catch (err) {
      // Only set error if we don't have cached data to fall back on
      if (!cached) setError(err instanceof Error ? err : new Error('Unknown'));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, emailId]);
```

**Cache invalidation**: The cache is a simple `Map` with no TTL. It lives for
the page session. The background refetch on every open ensures staleness is
bounded to one modal-open cycle. This is sufficient — analysis data changes
infrequently (only when re-analyzed).

**Do NOT** add cache size limits, TTL, or eviction — that's premature for a
map that will hold at most ~50 entries per session (~2KB each).

### Task 4: Memoize `normalizeAnalysis` result

**Goal**: If the background revalidation in Task 3 returns the same raw data,
avoid creating a new normalized object (which would trigger re-renders in all
memo'd section components).

**File**: `src/hooks/useEmailAnalysis.ts`

Option A (preferred — simple JSON comparison):

```tsx
const normalized = normalizeAnalysis(data as EmailAnalysis);
const cached = analysisCache.get(emailId);

// Only update state if the data actually changed
if (!cached || JSON.stringify(cached) !== JSON.stringify(normalized)) {
  analysisCache.set(emailId, normalized);
  setAnalysis(normalized);
} else {
  // Same data — don't update state, preserving referential stability
  setIsLoading(false);
}
```

This avoids the cost of deep-equal libraries. The normalized object is ~2KB of
JSON — `JSON.stringify` comparison is sub-millisecond.

Option B (if you prefer useMemo):

Wrap the normalization call site in the hook:

```tsx
const normalizedRef = React.useRef<NormalizedAnalysis | null>(null);
const rawDataRef = React.useRef<string | null>(null);

// Inside fetchAnalysis, after getting data:
const rawJson = JSON.stringify(data);
if (rawJson !== rawDataRef.current) {
  rawDataRef.current = rawJson;
  normalizedRef.current = normalizeAnalysis(data as EmailAnalysis);
}
const normalized = normalizedRef.current!;
```

**Either approach is fine.** The key insight is: don't create a new object
reference when the data hasn't changed.

### Task 5: Remove state-clearing timeout on modal close

**Goal**: Stop clearing email state on close. The cache from Task 3 makes
re-opens instant for analysis data; keeping the email object avoids a flash
of empty content if the user reopens the same email.

**File**: `src/components/email/EmailDetailModal.tsx`

Remove or simplify the cleanup effect at lines 189-198:

```tsx
// BEFORE (current):
React.useEffect(() => {
  if (!isOpen) {
    const timeout = setTimeout(() => {
      setEmail(null);
      setError(null);
    }, 200);
    return () => clearTimeout(timeout);
  }
}, [isOpen]);

// AFTER:
React.useEffect(() => {
  if (!isOpen) {
    setError(null); // Clear errors, but keep email for instant re-open
  }
}, [isOpen]);
```

**Why keep the email?** When the user clicks the same email again, the modal
can show the cached email content immediately while the fresh fetch happens
in the background. The `setEmail(data)` call in the fetch effect (line ~140)
will overwrite it with fresh data once the fetch completes.

**Why remove the setTimeout?** The 200ms delay was there to let the close
animation finish before clearing the DOM content. But since we're no longer
clearing the email, there's nothing that would flash. If a *different* email
is opened next, the fetch effect runs and the new emailId triggers a fresh
fetch — the old email data is overwritten immediately.

### Task 6: Make AISummaryBar sticky

**Goal**: Keep the summary bar pinned at the top of the scrollable area so
the user always sees the gist and category while scrolling through the email
body and analysis sections.

**File**: `src/components/email/AISummaryBar.tsx`

Update the outer container className on line 111:

```tsx
// BEFORE:
<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg min-h-[3.5rem]">

// AFTER:
<div className="flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm rounded-lg min-h-[3.5rem] sticky top-0 z-10 shadow-sm">
```

Changes:
- `sticky top-0 z-10` — pins to top of scroll container
- `bg-background/95 backdrop-blur-sm` — replaces `bg-muted/30` for better
  readability when content scrolls behind it
- `shadow-sm` — subtle shadow to separate from content below

**Important**: The sticky behavior depends on the scroll container. Check that
the parent `<div className="flex-1 overflow-y-auto">` in `EmailDetail.tsx`
(line ~252) is the scrollable ancestor. `sticky` works relative to the nearest
scrolling ancestor, so the AISummaryBar's sticky `top-0` will pin to the top
of that `overflow-y-auto` div — which is exactly what we want.

**Also update the skeleton** (line ~89) to match:

```tsx
// BEFORE:
<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg h-14 animate-pulse">

// AFTER:
<div className="flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm rounded-lg h-14 animate-pulse sticky top-0 z-10 shadow-sm">
```

### Task 7: Add section enter animation to CollapsibleAnalysisSection

**Goal**: When a collapsed section opens, fade-in the content for a subtle
quality feel. No animation on close (instant collapse feels snappier).

**File**: `src/components/email/CollapsibleAnalysisSection.tsx`

Add `animate-in fade-in-0 duration-150` to the inner content wrapper, but
only when opening:

```tsx
<div
  className="grid transition-[grid-template-rows] duration-200 ease-out"
  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
>
  <div className={`overflow-hidden ${isOpen ? 'animate-in fade-in-0 duration-150' : ''}`}>
    {children}
  </div>
</div>
```

**Note**: `animate-in` and `fade-in-0` are Tailwind CSS animation utilities
from the `tailwindcss-animate` plugin (already installed — check your
`tailwind.config.ts` for the plugin). If they're not available, use:

```tsx
<div className={`overflow-hidden transition-opacity duration-150 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
```

### Task 8: Ensure empty sections return null (not empty shells)

**Goal**: Verify that every extracted section component returns `null` when
it has no data, so no empty `CollapsibleAnalysisSection` shells render.

**What to check**: Each section file in `src/components/email/analysis/`
should have an early return `null` guard:

| Section | Guard |
|---------|-------|
| `CategoriesSection` | — (always has categorization when rendered) |
| `GoldenNuggetsSection` | `if (!goldenNuggets \|\| goldenNuggets.length === 0) return null` |
| `EmailStyleIdeasSection` | `if (!emailStyleIdeas \|\| emailStyleIdeas.length === 0) return null` |
| `ActionExtractionSection` | — (always has actionExtraction when rendered) |
| `ClientTaggingSection` | — (always has clientTagging when rendered) |
| `IdeaSparksSection` | `if (!ideaSparks.ideas \|\| ideaSparks.ideas.length === 0) return null` |
| `InsightsSection` | `if (!insightExtraction.insights \|\| ... .length === 0) return null` |
| `NewsBriefSection` | `if (!newsBrief.newsItems \|\| ... .length === 0) return null` |
| `MultiEventSection` | `if (!... .events \|\| ... .events.length === 0) return null` |
| `AnalysisMetaInfo` | `if (!tokensUsed && !processingTimeMs) return null` |

The orchestrator (`AnalysisSummary.tsx`) already has conditional guards
(`{analysis.ideaSparks?.hasIdeas && ...}`), but the sections should also
defend themselves. This is defense-in-depth — if a future caller skips the
guard, the section silently returns null rather than rendering an empty card.

**Verify each file has the guard.** If any are missing, add them.

## What NOT to Do

- Do NOT modify the section components created in Phase 2 (`CategoriesSection`,
  `GoldenNuggetsSection`, etc.) beyond adding the null guards in Task 8. Their
  rendering logic is finalized.
- Do NOT modify `AnalysisSummaryBar.tsx` — that's a different component used
  for calendar email previews.
- Do NOT add React Query, SWR, or any data-fetching library. The codebase uses
  `useState` + `useEffect` + Supabase client. Stay consistent.
- Do NOT add cache size limits, TTL, or eviction to the analysis cache.
  Keep it simple — a `Map` that lives for the page session.
- Do NOT use `React.lazy` or dynamic imports for SmartCaptureBar. It's 569
  lines — the overhead of code-splitting is not worth it.
- Do NOT add a "loading" spinner inside the SmartCaptureBar collapse. When
  the user opens it, the hooks fire and the bar renders its items. The existing
  CaptureRow shimmer/skeleton pattern inside SmartCaptureBar (if any) is
  sufficient.
- Do NOT change the visual appearance of existing sections. The only visual
  changes are: sticky AISummaryBar, section enter animation, and the new
  collapsible wrapper around SmartCaptureBar.

## Verification

After implementation, verify:

1. **Deferred SmartCaptureBar**: Open the modal for an analyzed email. Check
   the Network tab — `useProjects` and `useProjectItems` queries should NOT
   fire. Expand the "Quick Capture" section. Now the queries fire. Collapse
   and re-expand — no new queries (bar stays mounted via ref).

2. **Analysis cache**: Open email A. Close modal. Open email A again. The
   analysis should appear instantly (no loading skeleton). Check Network tab —
   a background refetch should still happen, but the UI doesn't show loading.

3. **Sticky AISummaryBar**: Open a long email. Scroll down through the body
   into the analysis sections. The summary bar should stay pinned at the top
   of the modal with a subtle shadow and blur effect.

4. **Section enter animation**: Click to expand a collapsed section (e.g.,
   Insights). The content should fade in smoothly (~150ms). Collapsing should
   be instant (no fade-out delay).

5. **No TypeScript errors**: `npx tsc --noEmit` — no new errors (pre-existing
   errors in `scripts/` and `calendar/page.tsx` are expected).

6. **Empty state defense**: If an email has no golden nuggets, the
   `GoldenNuggetsSection` should not render at all — no empty collapsible
   header with "0 nuggets".

7. **State-clearing removal**: Close and reopen the same email. The email
   content should not flash empty during the transition.

## File Checklist

| File | Action |
|------|--------|
| `src/hooks/useProjects.ts` | **Edit** — add `enabled` option |
| `src/hooks/useProjectItems.ts` | **Edit** — add `enabled` option |
| `src/hooks/useEmailAnalysis.ts` | **Edit** — add module-level cache + stale-while-revalidate + memoize normalization |
| `src/components/email/EmailDetailModal.tsx` | **Edit** — remove state-clearing timeout |
| `src/components/email/AISummaryBar.tsx` | **Edit** — add sticky positioning + backdrop blur |
| `src/components/email/CollapsibleAnalysisSection.tsx` | **Edit** — add `onToggle` callback + enter animation |
| `src/components/email/AnalysisSummary.tsx` | **Edit** — wrap SmartCaptureBar in collapsible with deferred mount |
| `src/components/email/analysis/*.tsx` | **Verify** — ensure null guards exist |

Commit and push when done.
