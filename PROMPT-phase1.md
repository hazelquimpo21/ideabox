# Phase 1 Prompt — Fix the Waterfall & Add the AI Summary Bar

You are implementing Phase 1 of the email detail UI redesign. Read
`PLAN-email-detail-redesign.md` for full context, but this prompt is
self-contained — you have everything you need here.

## What You're Building

The email detail modal currently has a **request waterfall**: the email fetches
first, then once the component tree renders, the analysis hook fires. That means
the user stares at the email body waiting for AI insights that are fetching
sequentially, not in parallel. You're fixing that and adding a compact summary
bar above the email body so the most important analysis is the first thing
users see.

## Current Architecture (what you're changing)

```
EmailDetailModal.tsx (fetches email, renders EmailDetail)
  └─ EmailDetail.tsx (renders header, subject, body, AnalysisSummary)
       └─ AnalysisSummary (function inside EmailDetail.tsx, line 351)
            ├─ calls useEmailAnalysis(email.id)  ← WATERFALL: waits for email
            ├─ calls useExtractedDates({ emailId: email.id })  ← WATERFALL
            └─ renders 13 analysis sections inline (~780 lines)
```

**Key files and their current roles:**

- `src/components/email/EmailDetailModal.tsx` — Dialog wrapper. Has `emailId`
  as a prop. Fetches the email via Supabase `select('*')` in a useEffect
  (line 100). Passes the loaded `email` object to `EmailDetail`.

- `src/components/email/EmailDetail.tsx` — Main content component (1318 lines).
  Accepts `email: Email` as a required prop. Renders (in order):
  `EmailHeader` → `EmailSubject` → `EmailQuickActions` → `EmailBody` →
  `AnalysisSummary`. The `AnalysisSummary` function starts at line 351 and
  goes to line ~1130 — it's defined inside this same file as an internal
  function component.

- `src/hooks/useEmailAnalysis.ts` — Hook signature:
  `useEmailAnalysis(emailId: string | null): UseEmailAnalysisReturn`
  where the return is `{ analysis: NormalizedAnalysis | null, isLoading, error, refetch }`.
  It already accepts `null` and no-ops when emailId is null.

- `src/hooks/useExtractedDates.ts` — Hook signature:
  `useExtractedDates(options?: { emailId?, ... }): UseExtractedDatesReturn`
  where the return includes `{ dates: ExtractedDate[], isLoading, ... }`.

- `src/components/email/AnalysisSummaryBar.tsx` — A *different* component used
  in calendar email previews. Do NOT modify or replace this. Your new
  `AISummaryBar` is a separate component for the detail modal context.

## Tasks (in order)

### Task 1: Hoist `useEmailAnalysis` and `useExtractedDates` to `EmailDetailModal`

**Goal**: Both hooks fire the instant the modal opens, in parallel with the
email fetch — not after it.

**Steps:**

1. In `EmailDetailModal.tsx`, add these two hook calls near the top of the
   component (after the existing state declarations around line 96):

   ```tsx
   const {
     analysis,
     isLoading: isLoadingAnalysis,
     refetch: refetchAnalysis,
   } = useEmailAnalysis(isOpen ? emailId : null);

   const {
     dates: extractedDates,
   } = useExtractedDates(isOpen && emailId ? { emailId } : {});
   ```

   The `isOpen ? emailId : null` pattern ensures the hooks only fetch when the
   modal is actually open. `useEmailAnalysis` already handles `null` by no-oping.

2. Update the `handleAnalyze` function (currently line 256) to also call
   `refetchAnalysis()` after the API call succeeds, so the hoisted hook gets
   the fresh data:

   ```tsx
   const handleAnalyze = async () => {
     if (!emailId) return;
     setIsAnalyzing(true);
     try {
       const response = await fetch(`/api/emails/${emailId}/analyze`, {
         method: 'POST',
         credentials: 'include',
       });
       if (!response.ok) throw new Error('Analysis failed');
       // Refetch both email and analysis
       const { data } = await supabase
         .from('emails').select('*').eq('id', emailId).single();
       if (data) setEmail(data);
       await refetchAnalysis();
     } catch (err) {
       logger.error('Failed to analyze in modal', { error: String(err) });
     } finally {
       setIsAnalyzing(false);
     }
   };
   ```

3. Add new props to `EmailDetailProps` in `EmailDetail.tsx` (line 106):

   ```tsx
   export interface EmailDetailProps {
     email: Email;
     onStar?: (emailId: string) => void;
     onArchive?: (emailId: string) => void;
     onToggleRead?: (emailId: string) => void;
     onAnalyze?: (emailId: string) => Promise<void>;
     onClose?: () => void;
     isLoading?: boolean;
     isAnalyzing?: boolean;
     // NEW — hoisted analysis data
     analysis?: NormalizedAnalysis | null;
     isLoadingAnalysis?: boolean;
     extractedDates?: ExtractedDate[];
     refetchAnalysis?: () => Promise<void>;
   }
   ```

   Import `NormalizedAnalysis` from `@/hooks/useEmailAnalysis` and
   `ExtractedDate` from `@/hooks/useExtractedDates`.

4. Pass these new props from `EmailDetailModal` through to `EmailDetail`:

   ```tsx
   <EmailDetail
     email={email}
     onStar={handleStar}
     onArchive={handleArchive}
     onToggleRead={handleToggleRead}
     onAnalyze={handleAnalyze}
     onClose={onClose}
     isAnalyzing={isAnalyzing}
     analysis={analysis}
     isLoadingAnalysis={isLoadingAnalysis}
     extractedDates={extractedDates}
     refetchAnalysis={refetchAnalysis}
   />
   ```

5. Update the `AnalysisSummary` function (line 351 in EmailDetail.tsx) to
   accept `analysis`, `isLoadingAnalysis`, `extractedDates`, and
   `refetchAnalysis` as props instead of calling the hooks itself.
   **Remove** the two hook calls on lines 360-361. Update the `handleAnalyze`
   callback (line 370) to use the prop-based `refetchAnalysis` instead of
   the locally-obtained `refetch`.

   The new signature:
   ```tsx
   function AnalysisSummary({
     email,
     onAnalyze,
     isAnalyzing,
     analysis,
     isLoadingAnalysis,
     extractedDates,
     refetchAnalysis,
   }: {
     email: Email;
     onAnalyze?: (emailId: string) => Promise<void>;
     isAnalyzing?: boolean;
     analysis?: NormalizedAnalysis | null;
     isLoadingAnalysis?: boolean;
     extractedDates?: ExtractedDate[];
     refetchAnalysis?: () => Promise<void>;
   }) {
   ```

6. Thread the new props from `EmailDetail` to `AnalysisSummary` in the render
   (line 1299):
   ```tsx
   <AnalysisSummary
     email={email}
     onAnalyze={onAnalyze}
     isAnalyzing={isAnalyzing}
     analysis={analysis}
     isLoadingAnalysis={isLoadingAnalysis}
     extractedDates={extractedDates}
     refetchAnalysis={refetchAnalysis}
   />
   ```

### Task 2: Create `AISummaryBar` component

**Goal**: A compact bar rendered above the email body showing the gist,
category, signal strength, quick action, and reply worthiness — the five most
useful pieces of analysis at a glance.

**File**: `src/components/email/AISummaryBar.tsx`

**Design principles:**
- Fixed height (~56px / h-14) so skeletons match perfectly.
- Single horizontal row. No multi-line wrapping on desktop.
- Answers: "What is this email and what should I do?" Nothing else.
- Returns `null` if the email hasn't been analyzed yet (`!email.analyzed_at`).
- Shows a shaped skeleton when `isLoading` is true.

**Props:**
```tsx
interface AISummaryBarProps {
  email: Email;
  analysis: NormalizedAnalysis | null;
  isLoading: boolean;
}
```

**Skeleton state** (when `isLoading && email.analyzed_at`):
```tsx
<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg h-14 animate-pulse">
  <Skeleton className="h-5 w-20 rounded-full" />  {/* category badge shape */}
  <Skeleton className="h-3 w-16" />                {/* signal */}
  <Skeleton className="h-3 w-24" />                {/* action */}
  <Skeleton className="h-3 flex-1 max-w-xs" />     {/* gist */}
</div>
```

Only show the skeleton if the email has been analyzed (`email.analyzed_at`
is truthy). If it hasn't been analyzed, there's no summary to show — return
`null` and let the AnalysisSummary section below show the "Analyze Now" card.

**Populated state:**
```tsx
<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg min-h-[3.5rem]">
  {/* Category badge — reuse the Badge component from @/components/ui */}
  {category && (
    <Badge variant="outline" className="shrink-0 text-xs">
      {category.replace(/_/g, ' ')}
    </Badge>
  )}

  {/* Signal strength dot */}
  {signalStrength && (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
      <span className={cn('h-2 w-2 rounded-full', signalDotColor)} />
      {signalStrength}
    </span>
  )}

  {/* Reply worthiness — only must_reply and should_reply */}
  {(replyWorthiness === 'must_reply' || replyWorthiness === 'should_reply') && (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0',
      replyWorthiness === 'must_reply'
        ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
        : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    )}>
      <Reply className="h-2.5 w-2.5" />
      {replyWorthiness === 'must_reply' ? 'Must Reply' : 'Should Reply'}
    </span>
  )}

  {/* Quick action */}
  {quickAction && ActionIcon && (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
      <ActionIcon className="h-3 w-3" />
      {quickAction.replace(/_/g, ' ')}
    </span>
  )}

  {/* Gist — the crown jewel */}
  {gist && (
    <p className="text-sm text-muted-foreground line-clamp-1 min-w-0">
      {gist}
    </p>
  )}
</div>
```

**Reference for icon/color mappings** — copy these from
`AnalysisSummaryBar.tsx` (lines 57-71):

```tsx
const SIGNAL_DOT_COLORS: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
  noise: 'bg-slate-300',
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  respond: MessageSquare,
  review: Eye,
  calendar: Calendar,
  follow_up: CornerUpRight,
  save: Bookmark,
};
```

**Data extraction from `analysis`:**
```tsx
const category = analysis?.categorization?.category;
const signalStrength = analysis?.categorization?.signalStrength;
const quickAction = analysis?.categorization?.quickAction;
const replyWorthiness = analysis?.categorization?.replyWorthiness;
const gist = analysis?.contentDigest?.gist;
```

### Task 3: Integrate into `EmailDetail` render order

**Goal**: Insert the `AISummaryBar` between `EmailSubject` and `EmailBody`.
Remove `EmailQuickActions` as a standalone section (its "Create Task" capability
is superseded by the SmartCaptureBar in the analysis section).

**Change the render in `EmailDetail` (line 1286-1315):**

```tsx
return (
  <div className="flex flex-col h-full overflow-hidden">
    <EmailHeader
      email={email}
      onStar={onStar}
      onArchive={onArchive}
      onToggleRead={onToggleRead}
      onClose={onClose}
    />
    <div className="flex-1 overflow-y-auto">
      <EmailSubject email={email} />
      {/* NEW: AI Summary Bar — above the body */}
      <div className="px-6 pb-2">
        <AISummaryBar
          email={email}
          analysis={analysis ?? null}
          isLoading={isLoadingAnalysis ?? false}
        />
      </div>
      <EmailBody email={email} />
      <AnalysisSummary
        email={email}
        onAnalyze={onAnalyze}
        isAnalyzing={isAnalyzing}
        analysis={analysis}
        isLoadingAnalysis={isLoadingAnalysis}
        extractedDates={extractedDates}
        refetchAnalysis={refetchAnalysis}
      />
      {email.gmail_id && (
        <div className="px-6 py-4 border-t border-border">
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View in Gmail
          </a>
        </div>
      )}
    </div>
  </div>
);
```

**Remove `EmailQuickActions`:**
- Delete the `<EmailQuickActions email={email} />` line (currently line 1297).
- You can leave the `EmailQuickActions` function definition in the file for now
  (it will be cleaned up in Phase 2). Just stop rendering it.

## What NOT to Do

- Do NOT modify `AnalysisSummaryBar.tsx` — that's a different component used
  for calendar email previews.
- Do NOT break `AnalysisSummary` into multiple files yet — that's Phase 2.
- Do NOT add caching, deferred loading, or collapsible sections — that's Phase 3.
- Do NOT change the `useEmailAnalysis` or `useExtractedDates` hook internals.
  You're only changing *where* they're called (hoisting), not *how* they work.
- Do NOT remove the state-clearing timeout in `EmailDetailModal` (line 171-180)
  — that's Phase 3.
- Do NOT add a sticky position to the summary bar yet — that's Phase 3.

## Verification

After implementation, verify:

1. **No TypeScript errors**: `npx tsc --noEmit` should pass.
2. **Parallel fetching**: Open the browser Network tab, open a modal. You should
   see the `emails` query and the `email_analyses` query fire at the same time,
   not sequentially.
3. **Summary bar visible**: For analyzed emails, the gist/category/signal bar
   appears between subject and body. For unanalyzed emails, nothing appears
   there (the "Analyze Now" card still shows in its original position below
   the body).
4. **Skeleton shape**: While analysis loads, a shaped skeleton placeholder
   prevents layout shift when the bar populates.
5. **Analyze flow still works**: Clicking "Analyze Now" in the analysis section
   still triggers analysis, and the summary bar + analysis sections both update
   when it completes.
6. **No duplicate hook calls**: `useEmailAnalysis` is called exactly once (in
   `EmailDetailModal`), not once there and again inside `AnalysisSummary`.

## File Checklist

| File | Action |
|------|--------|
| `src/components/email/EmailDetailModal.tsx` | Edit — add hook calls, update handleAnalyze, pass new props |
| `src/components/email/EmailDetail.tsx` | Edit — extend props interface, thread props to AnalysisSummary, reorder render, remove EmailQuickActions from render |
| `src/components/email/AISummaryBar.tsx` | **Create** — new component (~100 lines) |

Commit and push when done.
