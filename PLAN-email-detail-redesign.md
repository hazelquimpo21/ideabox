# Email Detail UI Redesign — 3-Phase Implementation Plan

> **Goal**: Transform the email detail modal from a "body-first, analysis-buried"
> layout into a "smart summary first, body on demand" experience that loads fast
> and stays responsive.

---

## Architecture Overview (Before → After)

```
BEFORE (current)                         AFTER (target)
┌──────────────────────┐                 ┌──────────────────────┐
│  EmailHeader         │                 │  EmailHeader (slim)  │
│  EmailSubject        │                 │  ─────────────────── │
│  EmailQuickActions   │                 │  AI Summary Bar      │  ← NEW above-fold
│  ─────────────────── │                 │  (gist + category +  │
│  EmailBody (full)    │  ← user sees   │   signal + action)   │
│  ─────────────────── │    this first   │  ─────────────────── │
│  AnalysisSummary     │  ← buried,     │  EmailBody           │  ← scrollable
│   (780-line monolith │    must scroll  │  (collapsible or     │
│    with 13 sections) │                 │   fade-truncated)    │
│  SmartCaptureBar     │                 │  ─────────────────── │
│  EventDetailsCard    │                 │  Analysis Sections   │  ← collapsible
└──────────────────────┘                 │  (each independent,  │
                                         │   memo'd, lazy)      │
                                         │  ─────────────────── │
                                         │  SmartCaptureBar     │  ← deferred
                                         └──────────────────────┘
```

---

## Phase 1 — Fix the Waterfall & Add the Summary Bar ✅ COMPLETE

**Theme**: Make the important data load first, not last.

> **Status**: Implemented March 2026. All tasks complete.
> **Commit**: `feat: hoist analysis hooks and add AISummaryBar to email detail modal (Phase 1)`
> **Branch**: `claude/email-detail-redesign-phase-1-09Lnx`

### 1A. Hoist `useEmailAnalysis` to `EmailDetailModal`

**Why**: Currently `useEmailAnalysis(email.id)` is called inside `AnalysisSummary`
(EmailDetail.tsx:360), which doesn't mount until *after* the email fetch completes.
That's a sequential waterfall: fetch email → render tree → fetch analysis.

The modal already has `emailId` as a prop (before any fetch). We should start both
fetches in parallel.

**Changes**:
- In `EmailDetailModal.tsx`, call `useEmailAnalysis(emailId)` at the component top
  level, gated on `isOpen && emailId`. This fires the analysis fetch the instant the
  modal opens — in parallel with the email fetch on line 112.
- Pass `analysis`, `isLoadingAnalysis`, and `refetch` down through `EmailDetail` →
  child components as props instead of having `AnalysisSummary` call the hook itself.
- Remove the `useEmailAnalysis` call from inside `AnalysisSummary`. It becomes a
  pure presentational component that receives analysis data via props.
- Similarly hoist `useExtractedDates({ emailId })` to the same level.

**Design taste**: Hooks that fetch data should live at the data boundary (the modal),
not deep in the render tree. Presentational components receive data; they don't fetch it.

### 1B. Create the `AISummaryBar` component

**What**: A compact, fixed-height bar that renders above the email body showing
the most important analysis signals at a glance.

**Contents** (single horizontal row, ~56px tall):
```
┌─────────────────────────────────────────────────────────────────┐
│ 🏷 Category    ● Signal   ↩ Reply?   ⚡ Quick Action   "gist" │
└─────────────────────────────────────────────────────────────────┘
```

- **Category badge**: Use existing `Badge` variant from badge.tsx (already has
  16+ life-bucket variants with colors and dark mode).
- **Signal dot**: Colored dot (emerald/yellow/slate) + label. Pattern already
  exists in `AnalysisSummaryBar.tsx` lines 57-62 — reuse that mapping.
- **Reply worthiness**: Only show if `must_reply` or `should_reply`. Red/orange
  chip. Pattern exists in `AnalysisSummaryBar.tsx` lines 131-143.
- **Quick action**: Icon + label (respond, review, calendar, follow_up, save).
  Icon mapping exists in `AnalysisSummaryBar.tsx` lines 65-71.
- **Gist**: The one-sentence summary from `analysis.contentDigest.gist`.
  Truncate with `line-clamp-1`. This is the highest-value piece of analysis.

**File**: `src/components/email/AISummaryBar.tsx` (~80-100 lines)

**Design taste**: This is *not* a miniature version of the full analysis card.
It answers one question: "What is this email and what should I do about it?"
No expandable sections, no save buttons, no secondary metadata. Pure signal.

### 1C. Add a skeleton placeholder for `AISummaryBar`

**Why**: The email body will render below the summary bar. If the bar appears
empty then fills in, the body shifts down — a layout jump.

**Solution**: When `isLoadingAnalysis` is true, render a skeleton with the exact
same height as the populated bar (h-14, matching the bar's padding + content).

```tsx
// Inside AISummaryBar
if (isLoading) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg h-14">
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 flex-1" />
    </div>
  );
}
```

**Design taste**: Skeletons should match the *shape* of what they replace, not
just be generic pulsing rectangles. The rounded-full skeleton for the category
badge, the short ones for signal/action, the long one for the gist — these
telegraph what's coming.

### 1D. Integrate into `EmailDetail` render order

**Current order** (EmailDetail.tsx:1286-1312):
```
EmailHeader → EmailSubject → EmailQuickActions → EmailBody → AnalysisSummary
```

**New order**:
```
EmailHeader → EmailSubject → AISummaryBar → EmailBody → AnalysisSummary
```

- Remove `EmailQuickActions` as a separate section. Its "Create Task" button
  moves into the `AISummaryBar` as the quick-action CTA (or into the header
  action buttons). This eliminates a full-width section that added vertical
  space without much value.

**Files touched in Phase 1** (actual):
- `src/components/email/EmailDetailModal.tsx` — hoisted `useEmailAnalysis` + `useExtractedDates`, updated `handleAnalyze` to call `refetchAnalysis()`, threaded 4 new props to `EmailDetail`
- `src/components/email/EmailDetail.tsx` — extended `EmailDetailProps` with analysis props, removed unused hook imports (kept type-only imports), removed `EmailQuickActions` from render, added `AISummaryBar` between subject and body, updated `AnalysisSummary` to accept props instead of calling hooks
- `src/components/email/AISummaryBar.tsx` — **new file** (~150 lines) with skeleton loading, null for unanalyzed emails, compact horizontal summary bar
- Note: `AnalysisSummary` was NOT extracted to its own file — it remains an internal function inside `EmailDetail.tsx` (extraction is Phase 2)

---

## Phase 2 — Decompose the Analysis Monolith ✅ COMPLETE

**Theme**: Break the 780-line `AnalysisSummary` into independent, collapsible,
memoized sections that don't re-render each other.

> **Status**: Implemented March 2026. All tasks complete.
> **Commit**: `feat: decompose AnalysisSummary into collapsible memoized sections (Phase 2)`
> **Branch**: `claude/email-analysis-summary-r3CfS`
>
> **Prerequisites**: Phase 1 complete. Analysis data now flows as props from
> EmailDetailModal → EmailDetail → AnalysisSummary. The `AnalysisSummary`
> function (EmailDetail.tsx, starts at ~line 365) was the target for decomposition.

### 2A. Create a `CollapsibleAnalysisSection` wrapper

A reusable shell that every analysis section renders inside:

```tsx
interface CollapsibleAnalysisSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;         // e.g., "3 items" count
  iconColor?: string;        // e.g., "text-amber-500"
  defaultOpen?: boolean;     // first section open by default
  children: React.ReactNode;
}
```

**Behavior**:
- Renders a header row: icon + title + subtitle + chevron
- Click toggles open/closed with a height transition (not display:none — use
  `grid-rows-[0fr]`/`grid-rows-[1fr]` for smooth CSS-only animation)
- Stores open/closed state internally (no lift to parent)
- `React.memo` the wrapper so parent re-renders don't propagate

**File**: `src/components/email/CollapsibleAnalysisSection.tsx` (~60 lines)

**Design taste**: Use CSS grid for the collapse animation, not JS-measured
heights or `max-height: 9999px` hacks. Grid row transition is smooth, doesn't
require measuring content, and works with dynamic content.

```css
.section-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms ease;
}
.section-body[data-open="true"] {
  grid-template-rows: 1fr;
}
.section-body > div {
  overflow: hidden;
}
```

### 2B. Extract each analysis section into its own component

Break `AnalysisSummary` into these standalone components, each wrapped in
`CollapsibleAnalysisSection` and `React.memo`:

| Component | Source lines | Default | Key props |
|-----------|-------------|---------|-----------|
| `CategoriesSection` | 482-546 | open | categorization |
| `ContentDigestSection` | 549-551 | open | contentDigest (already extracted) |
| `GoldenNuggetsSection` | 554-619 | open | goldenNuggets[], emailId |
| `EmailStyleIdeasSection` | 622-678 | closed | emailStyleIdeas[], emailId |
| `ActionExtractionSection` | 681-779 | open | actionExtraction |
| `ClientTaggingSection` | 782-811 | closed | clientTagging |
| `IdeaSparksSection` | 814-878 | open | ideaSparks |
| `InsightsSection` | 881-953 | closed | insights[], emailId |
| `NewsBriefSection` | 956-1029 | closed | newsItems[], emailId |
| `DateExtractionSection` | 1032-1049 | open | (already extracted) |
| `MultiEventSection` | 1052-1091 | closed | multiEventDetection |

**File location**: Each in `src/components/email/analysis/` directory.

**Naming**: `<SectionName>Section.tsx`. The directory groups them visually in the
file tree without polluting the parent `email/` directory.

### 2C. Co-locate `savedItems` state with each section

**Current problem**: `savedItems` is a single `Set<string>` at the `AnalysisSummary`
level (line 364). When you save a golden nugget, the entire analysis card
re-renders — all 13 sections.

**Fix**: Each section that has save buttons (`GoldenNuggetsSection`,
`EmailStyleIdeasSection`, `IdeaSparksSection`, `InsightsSection`, `NewsBriefSection`)
manages its own `savedIds` state internally. No shared state needed — the save
status of a nugget has no bearing on the insights section.

This is the key performance win of decomposition: state changes in one section
cannot cause re-renders in siblings.

### 2D. Rewrite `AnalysisSummary` as a thin orchestrator

After extraction, `AnalysisSummary.tsx` becomes ~80-100 lines:

```tsx
const AnalysisSummary = React.memo(function AnalysisSummary({
  email,
  analysis,
  isLoadingAnalysis,
  extractedDates,
  onAnalyze,
  isAnalyzing,
}: AnalysisSummaryProps) {
  // No hooks — just receives data and renders sections

  if (!email.analyzed_at) return <AnalysisPendingCard ... />;
  if (isLoadingAnalysis) return <AnalysisLoadingSkeleton />;
  if (email.analysis_error) return <AnalysisErrorCard ... />;
  if (!analysis) return null;

  return (
    <Card>
      <CardHeader>AI Analysis</CardHeader>
      <CardContent className="space-y-1">
        {analysis.categorization && <CategoriesSection ... />}
        {analysis.contentDigest && <ContentDigestSection ... />}
        {analysis.contentDigest?.goldenNuggets?.length > 0 && <GoldenNuggetsSection ... />}
        {analysis.actionExtraction?.hasAction && <ActionExtractionSection ... />}
        {analysis.ideaSparks?.hasIdeas && <IdeaSparksSection ... />}
        {/* ... etc */}
      </CardContent>
    </Card>
  );
});
```

**Design taste**: The orchestrator only decides *which* sections to show.
Each section decides *how* to show itself. This is the single-responsibility
principle applied to UI — the parent is a layout coordinator, not a renderer.

**Files touched in Phase 2** (actual):
- `src/components/email/analysis/` — **new directory** with 12 files (10 sections + helpers + barrel)
- `src/components/email/CollapsibleAnalysisSection.tsx` — **new file** (54 lines) — reusable collapse wrapper with CSS grid animation
- `src/components/email/AnalysisSummary.tsx` — **new file** (277 lines) — thin orchestrator extracted from EmailDetail
- `src/components/email/EmailDetail.tsx` — removed inline AnalysisSummary (~780 lines) + helper functions, imports from new files. Reduced from 1377 to ~320 lines.
- Note: Each section with save buttons manages its own `savedItems` state internally — the shared Set was eliminated. Dead `EmailQuickActions` function was also removed.

---

## Phase 3 — Deferred Loading, Caching & Polish ⬜ NEXT

**Theme**: Eliminate wasted work and add tactile quality.

> **Prerequisites**: Phase 2 complete. Analysis sections are now independent,
> collapsible, memoized components. SmartCaptureBar, AISummaryBar, and
> CollapsibleAnalysisSection are ready for the enhancements below.

### 3A. Defer `SmartCaptureBar` data fetching

**Current problem**: `SmartCaptureBar` calls `useProjects({ status: 'all' })`
and `useProjectItems()` on mount — two full-table Supabase queries. Most users
won't interact with it on first view.

**Fix**: Wrap `SmartCaptureBar` in its own `CollapsibleAnalysisSection` that
starts **collapsed**. Inside, gate the hooks on an `isExpanded` flag:

```tsx
function SmartCaptureBar({ ..., isExpanded }: Props) {
  // Only fetch when visible
  const { projects } = useProjects(isExpanded ? { status: 'all' } : { enabled: false });
  const { createItem } = useProjectItems(isExpanded ? {} : { enabled: false });
  // ...
}
```

If the hooks don't support an `enabled` flag, add one — it's a one-line guard
at the top of the `useEffect` in each hook:

```tsx
// In useProjects.ts fetchProjects callback:
if (!enabled) { setIsLoading(false); return; }
```

This eliminates 2 Supabase round-trips from the modal's critical path.

### 3B. Add a simple analysis cache

**Current problem**: Closing and reopening the same email refetches all analysis
data. The modal even clears state on close (EmailDetailModal.tsx:171-180).

**Fix**: Add a lightweight `useRef<Map<string, NormalizedAnalysis>>()` cache at
the `EmailDetailModal` level (or lift to the parent page layout if the modal
is frequently remounted):

```tsx
const analysisCache = React.useRef(new Map<string, NormalizedAnalysis>());

// In useEmailAnalysis (or a wrapper):
// On fetch success: cache.set(emailId, analysis)
// On mount: if cache.has(emailId), return cached immediately, then refetch in background
```

This gives **instant re-open** for previously viewed emails while still
revalidating in the background (stale-while-revalidate pattern).

Also: remove the 300ms `setTimeout` that clears `email` state on close
(line 171-180). Instead, keep the data and let the next open overwrite it.
The animation doesn't need the data cleared — it's already hiding the content.

### 3C. Memoize `normalizeAnalysis`

**Current problem**: `normalizeAnalysis` (useEmailAnalysis.ts:267-502) is a
235-line synchronous transform that runs every time the hook's state updates.

**Fix**: Wrap the result in the hook:

```tsx
const normalized = React.useMemo(
  () => rawData ? normalizeAnalysis(rawData) : null,
  [rawData]  // only re-normalize when the raw DB record changes
);
```

This is already partially the case (the hook stores the normalized result in
state), but if we add background revalidation in 3B, this memoization prevents
re-normalizing when the same data comes back from the revalidation fetch.

### 3D. Visual polish

Small touches that add up:

1. **Section enter animation**: When a `CollapsibleAnalysisSection` opens,
   fade-in the content with `animate-in fade-in-0 duration-150`. Cheap, adds
   perceived quality.

2. **Analysis confidence as a subtle indicator**: Instead of showing "87%
   confidence" as text in the card header (current), show it as a thin colored
   progress bar under the `AISummaryBar`. Green >80%, yellow 60-80%, hidden <60%.
   One glance, no cognitive load.

3. **Sticky AISummaryBar**: When scrolling the modal content, keep the summary
   bar pinned with `sticky top-0 z-10 bg-background/95 backdrop-blur-sm`. The
   user always sees the gist and category while reading the email body. This is
   the single highest-ROI UX improvement — it keeps context visible.

4. **Empty state for no-analysis sections**: If a section has no data (e.g.,
   no golden nuggets), don't render the `CollapsibleAnalysisSection` at all.
   Current code already does conditional checks; just ensure the extracted
   section components return `null` rather than an empty shell.

**Files touched in Phase 3**:
- `src/components/email/SmartCaptureBar.tsx` — add `isExpanded` gating
- `src/hooks/useProjects.ts` — add `enabled` option
- `src/hooks/useProjectItems.ts` — add `enabled` option
- `src/hooks/useEmailAnalysis.ts` — add memoization, cache support
- `src/components/email/EmailDetailModal.tsx` — remove state-clearing timeout, add cache ref
- `src/components/email/AISummaryBar.tsx` — add sticky positioning
- `src/components/email/CollapsibleAnalysisSection.tsx` — add enter animation

---

## File Inventory

### Phase 1 files (complete)
| File | Status | What changed |
|------|--------|-------------|
| `src/components/email/AISummaryBar.tsx` | **Created** (~150 lines) | Above-fold summary bar with skeleton |
| `src/components/email/EmailDetailModal.tsx` | Modified | Hoisted hooks, updated handleAnalyze, threaded props |
| `src/components/email/EmailDetail.tsx` | Modified | Extended props, reordered render, removed EmailQuickActions |

### Phase 2 files (complete)
| File | Lines | Purpose |
|------|-------|---------|
| `src/components/email/CollapsibleAnalysisSection.tsx` | 54 | Reusable collapse wrapper (CSS grid animation) |
| `src/components/email/AnalysisSummary.tsx` | 277 | Thin orchestrator (extracted from EmailDetail) |
| `src/components/email/analysis/helpers.ts` | 193 | Shared helper functions (getCategoryBadge, etc.) |
| `src/components/email/analysis/index.ts` | 10 | Barrel export for section components |
| `src/components/email/analysis/CategoriesSection.tsx` | 91 | Category, signal, reply badges |
| `src/components/email/analysis/GoldenNuggetsSection.tsx` | 96 | Worth remembering items + save |
| `src/components/email/analysis/EmailStyleIdeasSection.tsx` | 88 | Email format observations + save |
| `src/components/email/analysis/ActionExtractionSection.tsx` | 121 | Multi-action extraction |
| `src/components/email/analysis/ClientTaggingSection.tsx` | 48 | Client match + relationship signal |
| `src/components/email/analysis/IdeaSparksSection.tsx` | 95 | AI-generated ideas + save |
| `src/components/email/analysis/InsightsSection.tsx` | 100 | Synthesized tips/frameworks + save |
| `src/components/email/analysis/NewsBriefSection.tsx` | 101 | Factual news items + save |
| `src/components/email/analysis/MultiEventSection.tsx` | 58 | Multiple events from a single email |
| `src/components/email/analysis/AnalysisMetaInfo.tsx` | 25 | Tokens/timing/version display |
| `src/components/email/EmailDetail.tsx` | Modified | 1377→320 lines, imports AnalysisSummary |

### Phase 3 files (planned)
| File | Change scope |
|------|-------------|
| `SmartCaptureBar.tsx` | Add `isExpanded` prop gating |
| `useEmailAnalysis.ts` | Add memoization, optional cache layer |
| `useProjects.ts` | Add `enabled` option |
| `useProjectItems.ts` | Add `enabled` option |
| `EmailDetailModal.tsx` | Remove state-clearing timeout, add cache ref |
| `AISummaryBar.tsx` | Add sticky positioning |
| `CollapsibleAnalysisSection.tsx` | Add enter animation |

### Deleted files (0)
No files deleted. `AnalysisSummaryBar.tsx` stays — it's used in a different
context (calendar email previews).

---

## Implementation Order & Dependencies

```
Phase 1 (foundation — do first, everything else depends on it)
  1A  Hoist hooks          ← must be first, changes prop threading
  1B  AISummaryBar         ← can parallel with 1A
  1C  Skeleton             ← part of 1B
  1D  Reorder sections     ← depends on 1A + 1B

Phase 2 (decomposition — biggest diff, but isolated)
  2A  CollapsibleSection   ← standalone, no dependencies
  2B  Extract sections     ← depends on 2A
  2C  Co-locate state      ← part of 2B
  2D  Rewrite orchestrator ← depends on 2B, last step of phase

Phase 3 (polish — each task is independent)
  3A  Defer SmartCapture   ← independent
  3B  Analysis cache       ← independent
  3C  Memoize normalize    ← independent
  3D  Visual polish        ← depends on 2A for animations, otherwise independent
```

---

## What NOT to Do

- **Don't add a state management library** (Zustand, Jotai, etc.) for this.
  React state + props + memo is sufficient. Adding a store for one modal's
  data is over-engineering.
- **Don't virtualize the analysis sections**. There are at most 13, not 1300.
  Virtualization adds complexity for zero gain here.
- **Don't prefetch analysis on hover** over the email list. The analysis data
  is ~2-5KB per email — not worth the speculative network cost across dozens
  of emails.
- **Don't lazy-import** (`React.lazy`) the section components. They're small
  (~80 lines each) and the code-split chunk overhead would exceed the savings.
  Static imports, memo'd components.
- **Don't add loading spinners inside each collapsed section**. If a section
  has data, show it. If it doesn't, don't render the section. The only loading
  state is the single skeleton in `AISummaryBar` and the existing analysis
  loading card.
- **Don't touch the email body sanitization** (the regex-based `sanitizeHtml`).
  It works, and switching to DOMPurify for this task would be scope creep.
