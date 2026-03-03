You are implementing Phase 2 of the email detail UI redesign. Read
`PLAN-email-detail-redesign.md` for full context, but this prompt is
self-contained — you have everything you need here.

## What You're Building

The `AnalysisSummary` function inside `EmailDetail.tsx` is a ~780-line monolith
that renders 13 analysis sections inline. When any section's state changes
(e.g., saving a golden nugget), the entire monolith re-renders. You're
decomposing it into independent, collapsible, memoized section components.

## Current Architecture (after Phase 1)

```
EmailDetailModal.tsx (fetches email + analysis in parallel)
  └─ EmailDetail.tsx (receives analysis as props, renders layout)
       ├─ AISummaryBar (compact bar above body — DO NOT TOUCH)
       ├─ EmailBody
       └─ AnalysisSummary (internal function, line ~385)
            ├─ receives analysis/extractedDates/refetchAnalysis as props
            ├─ manages a shared savedItems: Set<string> state
            └─ renders 13 sections inline (~780 lines):
                 1. "Not analyzed" card (lines 417-456)
                 2. Loading skeleton (lines 458-477)
                 3. Error card (lines 479-501)
                 4. Categories + Summary + Labels (lines 521-584)
                 5. ContentDigestSection (line 589 — already extracted)
                 6. Golden Nuggets (lines 593-658)
                 7. Email Style Ideas (lines 661-717)
                 8. Action Extraction (lines 719-818)
                 9. Client Tagging (lines 820-850)
                10. Idea Sparks (lines 852-917)
                11. Insights (lines 919-992)
                12. News Brief (lines 994-1068)
                13. Date Extraction (lines 1070-1088 — already extracted)
                14. Multi-Event Detection (lines 1090-1130)
                15. SmartCaptureBar (lines 1132-1140)
                16. Meta info (lines 1142-1149)
                + EventDetailsCard conditional (lines 1155-1168)
```

**Key files you'll work with:**
- `src/components/email/EmailDetail.tsx` — 1330 lines. Contains `AnalysisSummary`
  starting at ~line 385. Also contains helper functions (lines 92-300) used by
  the analysis sections: `getIdeaTypeLabel`, `getIdeaTypeStyle`,
  `getActionTypeIcon`, `getUrgencyColor`, `getRelationshipIcon`,
  `getSignalBadge`, `getNuggetBadgeColor`, `getReplyBadge`, `getCategoryBadge`.
- `src/hooks/useEmailAnalysis.ts` — exports `NormalizedAnalysis` type with fields:
  `categorization`, `contentDigest`, `actionExtraction`, `clientTagging`,
  `eventDetection`, `multiEventDetection`, `dateExtraction`, `ideaSparks`,
  `insightExtraction`, `newsBrief`, `tokensUsed`, `processingTimeMs`,
  `analyzerVersion`, `analyzedAt`.
- `src/components/email/ContentDigestSection.tsx` (244 lines) — already extracted,
  used on line 589. Do NOT re-extract.
- `src/components/email/DateExtractionSection.tsx` (194 lines) — already extracted,
  used on lines 1070-1088. Do NOT re-extract.
- `src/components/email/SmartCaptureBar.tsx` — already extracted, used on lines
  1132-1140. Do NOT modify.
- `src/components/email/EventDetailsCard.tsx` — already extracted, used on lines
  1159-1163. Do NOT modify.

## Tasks (in order)

### Task 1: Create `CollapsibleAnalysisSection` wrapper

**Goal**: A reusable shell that every analysis section renders inside. Click
toggles open/closed with a smooth CSS grid animation.

**File**: `src/components/email/CollapsibleAnalysisSection.tsx` (~60-80 lines)

**Props:**
```tsx
import type { LucideIcon } from 'lucide-react';

interface CollapsibleAnalysisSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;         // e.g., "3 items" count
  iconColor?: string;        // e.g., "text-amber-500"
  defaultOpen?: boolean;     // first section open by default
  children: React.ReactNode;
}
```

**Behavior:**
- Renders a header row: `icon + title + subtitle + ChevronDown`
- Click toggles open/closed
- Uses CSS grid for smooth height animation (not JS measurement):
  ```tsx
  <div
    className="grid transition-[grid-template-rows] duration-200 ease-out"
    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
  >
    <div className="overflow-hidden">
      {children}
    </div>
  </div>
  ```
- `ChevronDown` rotates 180° when open (use `transition-transform duration-200`)
- Wrap the entire component in `React.memo`
- Header should have `cursor-pointer`, slight hover effect (`hover:bg-muted/50
  rounded-md`), and be a `<button>` for accessibility
- The `pt-3 border-t` spacing that currently wraps each section in
  AnalysisSummary should be part of this wrapper (so sections are self-contained)

### Task 2: Create shared helpers file

**Goal**: Extract helper functions used by multiple sections out of
`EmailDetail.tsx` into a shared file so section components can import them.

**File**: `src/components/email/analysis/helpers.ts`

Move these functions and constants from `EmailDetail.tsx` (keep them in
`EmailDetail.tsx` too if they're used by non-analysis parts — but check first):
- `IDEA_TYPE_LABELS` (line 92) + `IDEA_TYPE_STYLES` (line 100) +
  `getIdeaTypeLabel` (line 116) + `getIdeaTypeStyle` (line 120)
  — used by Idea Sparks section only
- `getActionTypeIcon` (line 225) — used by Action Extraction only
- `getUrgencyColor` (line 240) — used by Action Extraction only
- `getRelationshipIcon` (line 247) — used by Client Tagging only
- `getSignalBadge` (line 255) — used by Categories section only
- `getNuggetBadgeColor` (line 266) — used by Golden Nuggets only
- `getReplyBadge` (line 279) — used by Categories section only
- `getCategoryBadge` (line 169) — used by Categories section AND `EmailSubject`.
  Keep it in `EmailDetail.tsx` AND export it from helpers so both can use it.

After moving, update `EmailDetail.tsx` to import from `./analysis/helpers`
for anything that's still used there (`getCategoryBadge`, `formatDate`).

### Task 3: Extract each analysis section into its own component

**Goal**: Each section becomes an independent file inside
`src/components/email/analysis/`, wrapped in `CollapsibleAnalysisSection`
and `React.memo`.

**Directory**: `src/components/email/analysis/`

Create a barrel: `src/components/email/analysis/index.ts`

**Sections to extract** (each is a new file):

| File | Source lines in AnalysisSummary | Default open? | Key data |
|------|-------------------------------|---------------|----------|
| `CategoriesSection.tsx` | 521-584 | yes | `analysis.categorization` |
| `GoldenNuggetsSection.tsx` | 593-658 | yes | `analysis.contentDigest.goldenNuggets` |
| `EmailStyleIdeasSection.tsx` | 661-717 | no | `analysis.contentDigest.emailStyleIdeas` |
| `ActionExtractionSection.tsx` | 719-818 | yes | `analysis.actionExtraction` |
| `ClientTaggingSection.tsx` | 820-850 | no | `analysis.clientTagging` |
| `IdeaSparksSection.tsx` | 852-917 | yes | `analysis.ideaSparks` |
| `InsightsSection.tsx` | 919-992 | no | `analysis.insightExtraction` |
| `NewsBriefSection.tsx` | 994-1068 | no | `analysis.newsBrief` |
| `MultiEventSection.tsx` | 1090-1130 | no | `analysis.multiEventDetection` |
| `AnalysisMetaInfo.tsx` | 1142-1149 | — (no collapse) | `tokensUsed`, `processingTimeMs`, `analyzerVersion` |

**Do NOT extract** (already separate components):
- `ContentDigestSection` (line 589) — already in `./ContentDigestSection.tsx`
- `DateExtractionSection` (lines 1070-1088) — already in `./DateExtractionSection.tsx`
- `SmartCaptureBar` (lines 1132-1140) — already in `./SmartCaptureBar.tsx`
- `EventDetailsCard` (lines 1155-1168) — already in `./EventDetailsCard.tsx`

**Pattern for each section** (example: GoldenNuggetsSection):

```tsx
'use client';

import * as React from 'react';
import { Gem, Bookmark, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { CollapsibleAnalysisSection } from '../CollapsibleAnalysisSection';
import { getNuggetBadgeColor } from './helpers';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';

const logger = createLogger('GoldenNuggetsSection');

interface GoldenNuggetsSectionProps {
  goldenNuggets: NonNullable<NormalizedAnalysis['contentDigest']>['goldenNuggets'];
  emailId: string;
}

export const GoldenNuggetsSection = React.memo(function GoldenNuggetsSection({
  goldenNuggets,
  emailId,
}: GoldenNuggetsSectionProps) {
  // Each section manages its own saved state — no shared state needed
  const [savedItems, setSavedItems] = React.useState<Set<string>>(new Set());
  const markSaved = React.useCallback((key: string) => {
    setSavedItems(prev => new Set(prev).add(key));
  }, []);

  if (!goldenNuggets || goldenNuggets.length === 0) return null;

  return (
    <CollapsibleAnalysisSection
      icon={Gem}
      title="Worth Remembering"
      subtitle={`${goldenNuggets.length} nugget${goldenNuggets.length !== 1 ? 's' : ''}`}
      iconColor="text-yellow-500"
      defaultOpen
    >
      {/* ... nugget rendering (move from lines 602-657) ... */}
    </CollapsibleAnalysisSection>
  );
});
```

**Key principle**: Each section that has save buttons (`GoldenNuggetsSection`,
`EmailStyleIdeasSection`, `IdeaSparksSection`, `InsightsSection`,
`NewsBriefSection`) manages its own `savedItems` state. The shared
`savedItems` Set in `AnalysisSummary` is eliminated.

### Task 4: Rewrite `AnalysisSummary` as a thin orchestrator

**Goal**: After extraction, `AnalysisSummary` becomes ~80-100 lines. It only
decides *which* sections to show. Each section decides *how* to show itself.

**Move `AnalysisSummary` out of `EmailDetail.tsx`** into its own file:
`src/components/email/AnalysisSummary.tsx`

The new orchestrator:

```tsx
'use client';

import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Button, Skeleton } from '@/components/ui';
import { Brain, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { EventDetailsCard } from './EventDetailsCard';
import { ContentDigestSection } from './ContentDigestSection';
import { DateExtractionSection } from './DateExtractionSection';
import { SmartCaptureBar } from './SmartCaptureBar';
import {
  CategoriesSection,
  GoldenNuggetsSection,
  EmailStyleIdeasSection,
  ActionExtractionSection,
  ClientTaggingSection,
  IdeaSparksSection,
  InsightsSection,
  NewsBriefSection,
  MultiEventSection,
  AnalysisMetaInfo,
} from './analysis';
import type { NormalizedAnalysis } from '@/hooks/useEmailAnalysis';
import type { ExtractedDate } from '@/hooks/useExtractedDates';
import type { Email } from '@/types/database';

export interface AnalysisSummaryProps {
  email: Email;
  onAnalyze?: (emailId: string) => Promise<void>;
  isAnalyzing?: boolean;
  analysis?: NormalizedAnalysis | null;
  isLoadingAnalysis?: boolean;
  extractedDates?: ExtractedDate[];
  refetchAnalysis?: () => Promise<void>;
}

export const AnalysisSummary = React.memo(function AnalysisSummary({
  email,
  onAnalyze,
  isAnalyzing,
  analysis,
  isLoadingAnalysis,
  extractedDates,
  refetchAnalysis,
}: AnalysisSummaryProps) {

  const handleAnalyze = React.useCallback(async () => {
    if (onAnalyze) {
      await onAnalyze(email.id);
      if (refetchAnalysis) await refetchAnalysis();
    }
  }, [onAnalyze, email.id, refetchAnalysis]);

  // ── Not analyzed yet ──────────────────────────────────────────────────
  if (!email.analyzed_at) {
    return ( /* ... existing "AI Analysis Pending" card ... */ );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoadingAnalysis) {
    return ( /* ... existing loading skeleton card ... */ );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (email.analysis_error) {
    return ( /* ... existing "Analysis Failed" card ... */ );
  }

  if (!analysis) return null;

  // ── Populated analysis ────────────────────────────────────────────────
  return (
    <>
      <Card className="mx-6 my-4">
        <CardHeader className="py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              AI Analysis
            </div>
            {analysis.categorization?.confidence && (
              <span className="text-xs text-muted-foreground">
                {Math.round(analysis.categorization.confidence * 100)}% confident
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-1">
          {analysis.categorization && (
            <CategoriesSection
              categorization={analysis.categorization}
              emailCategory={email.category}
            />
          )}
          {analysis.contentDigest?.gist && (
            <ContentDigestSection
              digest={analysis.contentDigest}
              emailId={email.id}
              emailCategory={email.category}
            />
          )}
          {analysis.contentDigest?.goldenNuggets?.length && (
            <GoldenNuggetsSection
              goldenNuggets={analysis.contentDigest.goldenNuggets}
              emailId={email.id}
            />
          )}
          {analysis.contentDigest?.emailStyleIdeas?.length && (
            <EmailStyleIdeasSection
              emailStyleIdeas={analysis.contentDigest.emailStyleIdeas}
              emailId={email.id}
              senderName={email.sender_name || email.sender_email}
            />
          )}
          {analysis.actionExtraction && (
            <ActionExtractionSection
              actionExtraction={analysis.actionExtraction}
            />
          )}
          {analysis.clientTagging && (
            <ClientTaggingSection
              clientTagging={analysis.clientTagging}
            />
          )}
          {analysis.ideaSparks?.hasIdeas && (
            <IdeaSparksSection
              ideaSparks={analysis.ideaSparks}
              emailId={email.id}
            />
          )}
          {analysis.insightExtraction?.hasInsights && (
            <InsightsSection
              insightExtraction={analysis.insightExtraction}
              emailId={email.id}
            />
          )}
          {analysis.newsBrief?.hasNews && (
            <NewsBriefSection
              newsBrief={analysis.newsBrief}
              emailId={email.id}
            />
          )}
          {((extractedDates && extractedDates.length > 0) || analysis.dateExtraction) && (
            <DateExtractionSection
              extraction={analysis.dateExtraction}
              dates={/* ... existing mapping ... */}
            />
          )}
          {analysis.multiEventDetection?.hasMultipleEvents && (
            <MultiEventSection
              multiEventDetection={analysis.multiEventDetection}
            />
          )}
          <SmartCaptureBar
            emailId={email.id}
            emailSubject={email.subject || undefined}
            emailGist={email.gist || email.snippet || undefined}
            actionExtraction={analysis.actionExtraction}
            ideaSparks={analysis.ideaSparks}
            contactId={analysis.clientTagging?.clientId}
          />
          <AnalysisMetaInfo
            tokensUsed={analysis.tokensUsed}
            processingTimeMs={analysis.processingTimeMs}
            analyzerVersion={analysis.analyzerVersion}
          />
        </CardContent>
      </Card>
      {analysis.eventDetection?.hasEvent && (
        <EventDetailsCard
          event={analysis.eventDetection}
          emailSubject={email.subject || undefined}
          description={email.snippet || undefined}
        />
      )}
    </>
  );
});
```

### Task 5: Update `EmailDetail.tsx` to import the extracted `AnalysisSummary`

After extracting, update `EmailDetail.tsx`:

1. Remove the entire `AnalysisSummary` function (~780 lines).
2. Remove helper functions that were moved to `analysis/helpers.ts` and are
   no longer used directly in `EmailDetail.tsx`. Keep `getCategoryBadge` and
   `formatDate` if they're still used by `EmailSubject` or `EmailHeader`.
3. Import `AnalysisSummary` from `'./AnalysisSummary'`.
4. The `EmailDetail` render stays exactly the same — it already passes all
   the right props to `<AnalysisSummary>`.
5. Remove unused icon imports from lucide-react that were only used by the
   inline analysis sections.
6. Remove the `useEmailAnalysis` / `useExtractedDates` import comment if the
   type imports are still there.

**Expected result**: `EmailDetail.tsx` drops from ~1330 lines to ~500 lines.

## What NOT to Do

- Do NOT modify `AISummaryBar.tsx` — that was Phase 1, it's done.
- Do NOT modify `AnalysisSummaryBar.tsx` — that's a different component for
  calendar email previews.
- Do NOT modify `EmailDetailModal.tsx` — the hook hoisting from Phase 1 is done.
- Do NOT modify the hook internals (`useEmailAnalysis.ts`, `useExtractedDates.ts`).
- Do NOT add caching, deferred loading, or sticky positioning — that's Phase 3.
- Do NOT add `React.lazy` imports — the sections are small (~80 lines each),
  code-splitting would add more overhead than it saves.
- Do NOT change the visual appearance of any section. The decomposition should
  be a pure refactor — the UI should look and behave identically.
- Do NOT touch `ContentDigestSection.tsx`, `DateExtractionSection.tsx`,
  `SmartCaptureBar.tsx`, or `EventDetailsCard.tsx` — they're already extracted.

## Helper function signatures (for reference)

These functions currently live in `EmailDetail.tsx` and need to be available
to the extracted section components:

```tsx
// Used by CategoriesSection
function getCategoryBadge(category: EmailCategory | null): {
  label: string; variant: string; icon: React.ReactNode;
}
function getSignalBadge(signal: string): { label: string; className: string }
function getReplyBadge(reply: string): { label: string; className: string }

// Used by GoldenNuggetsSection
function getNuggetBadgeColor(type: string): string

// Used by ActionExtractionSection
function getActionTypeIcon(actionType: string): React.ReactNode
function getUrgencyColor(score: number): string

// Used by ClientTaggingSection
function getRelationshipIcon(signal: string): React.ReactNode

// Used by IdeaSparksSection
function getIdeaTypeLabel(type: string): string
function getIdeaTypeStyle(type: string): string
const IDEA_TYPE_LABELS: Record<string, string>
const IDEA_TYPE_STYLES: Record<string, string>
```

## Verification

After implementation, verify:
1. **No TypeScript errors**: `npx tsc --noEmit` — no new errors (pre-existing
   errors in `scripts/` and `calendar/page.tsx` are expected).
2. **Visual parity**: Open an analyzed email in the modal. Every section should
   look identical to before. The category badges, nugget save buttons, action
   cards — all the same.
3. **Collapsible sections**: Each section should have a clickable header with
   a chevron. Clicking toggles the section body with a smooth animation.
   Sections marked `defaultOpen` should start expanded.
4. **Independent state**: Save a golden nugget → the "Saved" indicator appears.
   Other sections (insights, ideas) should NOT re-render. You can verify this
   by adding a `console.log` to another section's render and confirming it
   doesn't fire when you save a nugget.
5. **`EmailDetail.tsx` is smaller**: Should be ~500 lines, down from ~1330.
6. **New file count**: ~14 new files (CollapsibleAnalysisSection + helpers +
   10 section components + barrel + AnalysisSummary.tsx).

## File Checklist

| File | Action |
|------|--------|
| `src/components/email/CollapsibleAnalysisSection.tsx` | **Create** — reusable collapse wrapper |
| `src/components/email/analysis/helpers.ts` | **Create** — shared helper functions |
| `src/components/email/analysis/index.ts` | **Create** — barrel export |
| `src/components/email/analysis/CategoriesSection.tsx` | **Create** |
| `src/components/email/analysis/GoldenNuggetsSection.tsx` | **Create** |
| `src/components/email/analysis/EmailStyleIdeasSection.tsx` | **Create** |
| `src/components/email/analysis/ActionExtractionSection.tsx` | **Create** |
| `src/components/email/analysis/ClientTaggingSection.tsx` | **Create** |
| `src/components/email/analysis/IdeaSparksSection.tsx` | **Create** |
| `src/components/email/analysis/InsightsSection.tsx` | **Create** |
| `src/components/email/analysis/NewsBriefSection.tsx` | **Create** |
| `src/components/email/analysis/MultiEventSection.tsx` | **Create** |
| `src/components/email/analysis/AnalysisMetaInfo.tsx` | **Create** |
| `src/components/email/AnalysisSummary.tsx` | **Create** — thin orchestrator |
| `src/components/email/EmailDetail.tsx` | **Edit** — remove inline AnalysisSummary + helpers, import from new files |

Commit and push when done.
