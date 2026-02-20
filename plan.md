# Onboarding Overhaul Plan

## Target User Persona

Solopreneur who may also have a day job. Likely has kids. May or may not have a website.
Typical account setup:
- **1 account**: Just personal Gmail (solo freelancer, side hustle)
- **2 accounts**: Personal Gmail + work/business Gmail
- **3 accounts**: Personal + day job + side business

Contact volume: 50-500 Google contacts. Email volume: moderate.
Key trait: **busy, impatient, doesn't want to waste time on setup.**

---

## Current State: What's Broken / Clunky

### Contacts Import Is Effectively Non-Functional
The VIP suggestions query filters by `email_count >= 3`, but newly imported Google contacts
have `email_count = 0`. So even after successfully importing 100 contacts, the user sees
**zero suggestions**. Starred status is stored but ignored in the fallback suggestion
algorithm. The whole import feels pointless because nothing appears after it runs.

### About You Step Is Tedious & Redundant
- User manually types role, company, VIP emails, priorities — all cold
- VIP emails field duplicates what the user already selected in the VIP Contacts step
- Many `user_context` fields exist in the DB but aren't collected (industry, location,
  work hours, projects, interests)
- No intelligence applied — the app has AI analyzers and email data but doesn't use them

### OAuth Redirect for Contacts Scope Is Jarring
User clicks "Import" → full page redirect to Google → returns to onboarding → has to
re-orient. No explanation of why they're being redirected. Could be handled more gracefully.

---

## Performance Issues Found in Audit

### P1 (High): Sequential Contact Imports — 100 RPCs for 100 Contacts
`contact-service.ts` `importFromGoogle()` calls `supabase.rpc('upsert_google_contact')`
one contact at a time in a for-loop. For a user with 2-3 accounts × 100 contacts each,
that's 200-300 sequential database round-trips. Takes 10+ seconds.

**Fix**: Batch upserts. Collect contacts into chunks of 25-50, use a single
`.upsert()` call per batch on the `contacts` table directly (with `onConflict` on
`user_id, email`). Falls back gracefully if the RPC doesn't exist. Target: <2s for
100 contacts.

### P2 (Medium): Redundant Suggestions Fetch on OAuth Return
When user returns from OAuth with `scope_added=true`, two things fire simultaneously:
1. `loadSuggestions()` (from mount useEffect) — fetches suggestions
2. `handleImportFromGoogle()` (from scope_added useEffect) — imports, then fetches
   suggestions again

The first fetch is wasted because it'll be immediately invalidated.

**Fix**: Skip the initial `loadSuggestions()` call when `scope_added=true` is in the URL.
Only load suggestions after the import completes.

### P3 (Medium): Multi-Account Import Is Sequential
`import-google/route.ts` iterates through accounts in a for-loop. Each account does
its own token refresh + contact fetch + sequential upserts. For 3 accounts, this
triples the wait time.

**Fix**: Process accounts in parallel with `Promise.all()` (or `Promise.allSettled()`
to handle partial failures). Each account's import is independent.

### P4 (Low): Missing React.memo on SuggestionCard
`SuggestionCard` re-renders all 15 cards on any parent state change. Handlers aren't
wrapped in `useCallback`.

**Fix**: Wrap `SuggestionCard` in `React.memo()`, wrap `handleToggle` in `useCallback`.

### P5 (Low): No Lazy Loading of Step Components
All 6 step components are eagerly imported in OnboardingWizard. User only sees one at
a time.

**Fix**: Use `React.lazy()` + `Suspense` for steps 3+ (ClientsStep, ContactImportStep,
AboutYouStep). Saves ~40KB from initial bundle.

---

## Proposed Changes

### Phase 1: Fix Contacts Import (Make it actually work) ✅ DONE

**1a. Fix VIP Suggestions to include imported contacts**
- In `contact-service.ts` fallback query: use `.or('email_count.gte.3,is_google_starred.eq.true')`
  instead of just `.gte('email_count', 3)`
- Include `avatar_url, is_google_starred, google_labels` in the `.select()`
- Map actual values instead of hardcoding `isGoogleStarred: false`
- Prioritize starred contacts above frequency-based suggestions
- Add suggestion reasons: "Starred in Google Contacts", "Frequent + Starred", etc.

**1b. Batch contact imports for performance**
- Replace the sequential `for` loop + individual RPC calls with batched `.upsert()`
- Chunk contacts into groups of 50, upsert each batch in one call
- Use `onConflict: 'user_id,email'` for idempotent upserts
- Process multiple accounts in parallel with `Promise.allSettled()`
- Target: 100 contacts in <2s (down from 10s+)

**1c. Eliminate redundant suggestion fetches**
- When `scope_added=true`, skip the initial `loadSuggestions()` call
- Only load suggestions after import completes
- One fetch instead of two

**1d. Improve contacts permission UX**
- When `!hasContactsPermission`: show a clear card explaining what connecting Google
  Contacts does, why it helps, and that they'll be briefly redirected
- CTA: "Connect Google Contacts" (not just "Import")
- When permission is granted: show "Import Contacts" button directly
- After import: brief success message with count, then suggestions appear

### Phase 2: AI-Powered Profile Autofill ✅ DONE (Feb 2026)

**2a. New API endpoint: `POST /api/onboarding/profile-suggestions`**
- Analyzes the user's recently synced emails + contacts to extract:
  - **Role/Title**: From email signatures of sent emails, or from Google contact's
    own profile if available
  - **Company**: From email domain, signature, or Google Workspace org
  - **Industry**: Inferred from company name + email content patterns
  - **Top contacts/VIPs**: Already identified from import, carry forward
  - **Work hours**: Inferred from email send-time distribution
  - **Key projects**: Extracted from email subjects + action items
- Uses existing GPT-4.1-mini integration (same as other analyzers)
- Lightweight: analyzes ~10-20 recent sent emails, not the full corpus
- Returns confidence scores so the UI can indicate "AI suggested" vs "confirmed"
- Must handle the 1-account user (personal Gmail only — may not have "work" context)
  and the multi-account user (separate personal vs business signals)

**2b. Run this after the initial sync fires (background)**
- Since we now fire the initial sync in the background on wizard completion,
  this can also run as a follow-up
- Or: run it earlier (after Accounts step) on a small sample of sent emails
  to have suggestions ready by the time the user reaches the Mad Libs step

### Phase 3: "Mad Libs" Profile Card

Replace the current AboutYouStep form with an interactive fill-in-the-blank card.

**Concept — adapted for solopreneur persona:**
```
I'm a [__freelance designer__] working on [__my own__].

Right now I'm focused on [__landing new clients__] and [__finishing my portfolio site__].

I usually work [__Mon-Fri__], [__9am__] to [__5pm__].

The people I care most about hearing from:
  [sarah@bigclient.co ×] [mike@agency.com ×] [+ add]
```

Notes on persona flexibility:
- "at [company]" becomes "working on [my own / at Acme Corp]" — works for solopreneurs
  with no company name and for people with a day job
- Priorities should suggest things relevant to solopreneurs: "landing new clients",
  "invoicing", "project deadlines" — not just corporate jargon
- VIP contacts might be a mix of clients, collaborators, spouse, kids' school

**Implementation:**
- Each blank is an inline editable field (click to edit, shows as styled text when not editing)
- AI-suggested values shown as pre-filled defaults with a subtle "AI" indicator
- User can click any field to override
- Feels conversational, not form-like
- Pre-populated VIPs come from ContactImportStep selections (no re-entry)

**Fields to include:**
| Field | Source | Mad Libs Slot |
|-------|--------|---------------|
| role | AI from sent emails | "I'm a [___]" |
| company | AI from email domain/sig | "working on [my own / at ___]" |
| priorities | Manual (with AI suggestions) | "Focused on [___] and [___]" |
| work_hours_start/end | AI from send times | "[9am] to [6pm]" |
| work_days | AI from send patterns | "[Mon-Fri]" |
| vip_emails | Carried from VIP step | "People I care about: [chips]" |

**Interaction model:**
- Card renders as readable sentence with blanks
- Blanks are pre-filled from AI suggestions where available
- Empty blanks pulse gently to invite interaction
- Click a blank → inline input appears
- Press Enter or click away → saves and re-renders as styled text
- "Looks good!" button at bottom to confirm and continue
- "Skip for now" still available — all fields optional

### Phase 4: Streamline the Step Order

**Current:** Welcome → Accounts → Sync Config → Clients → VIP Contacts → About You

**Proposed:** Welcome → Accounts → VIP Contacts → Mad Libs Profile → Sync Config

Rationale:
- **Move VIP Contacts earlier**: After connecting accounts, the most natural next step
  is "who matters to you?" — this seeds the rest of the experience
- **Mad Libs Profile replaces both Clients and About You**: The mad libs card collects
  role, company, priorities (covers About You), and the VIP contacts already cover the
  key relationships. Clients can be detected automatically from email analysis later.
- **Move Sync Config last**: This is the "let's get started" moment — configure how
  much to analyze, then click "Finish" and go to inbox. Feels like a natural end.
- **Remove Clients step**: Clients are better detected by the AI from email patterns
  than manually entered during onboarding. The ClientTaggerAnalyzer already does this.
  Manual client management belongs in Settings, not onboarding.

**Net effect:** 6 steps → 5 steps, less manual entry, more intelligence.

---

## Performance Principles (Apply Across All Phases)

1. **No sequential DB calls in loops.** Batch upserts, use `.in()` filters, chunk large
   operations. Never call `.rpc()` or `.upsert()` inside a for-loop.
2. **Parallel where independent.** Multi-account imports run in parallel. API calls that
   don't depend on each other fire simultaneously.
3. **Don't fetch what you'll immediately invalidate.** If a write is about to happen,
   skip the read-before-write pattern unless the read is needed for merge logic.
4. **Carry data forward between steps.** VIP selections from step N should be available
   in step N+1 without re-fetching. Use wizard-level state or URL params.
5. **React.memo + useCallback for list items.** Any component rendered in a `.map()` loop
   should be memoized. Callbacks passed to children should be stable references.
6. **Lazy load later steps.** Steps 3+ should use `React.lazy()` since the user won't
   see them for several seconds after page load.
7. **Optimistic UI.** Show success states immediately, confirm in background. Don't make
   the user wait for DB writes to see results.

---

## Implementation Order

1. **Phase 1** (fix what's broken + performance): Fix VIP suggestions query, batch contact
   imports, eliminate redundant fetches, improve contacts permission UX
2. **Phase 3** (highest UX impact): Build the Mad Libs card component, wire up to
   existing user_context fields, pre-populate VIPs from previous step
3. **Phase 2** (AI autofill): Build the profile-suggestions API to power the Mad Libs
   defaults. This can be done incrementally — start with role/company extraction, add
   work hours and projects later.
4. **Phase 4** (step reorder + polish): Reorder steps, remove Clients step, add lazy
   loading for later steps, React.memo optimizations.

---

## Files Affected

### Phase 1
- `src/services/contacts/contact-service.ts` — Fix VIP query + batch imports
- `src/app/api/contacts/import-google/route.ts` — Parallel account processing
- `src/app/onboarding/components/ContactImportStep.tsx` — Permission UX + skip redundant fetch

### Phase 2 ✅ DONE
- `src/app/api/onboarding/profile-suggestions/route.ts` — API endpoint (POST, cached)
- `src/services/onboarding/profile-analyzer.ts` — AI profile extraction (GPT-4.1-mini, function calling)
- `src/services/onboarding/work-hours-analyzer.ts` — Statistical work hours inference
- `src/services/user-context/user-context-service.ts` — Added `saveProfileSuggestions()`
- `src/types/database.ts` — Added `ProfileSuggestions` interface + updated user_context types
- `supabase/migrations/031_profile_suggestions.sql` — New JSONB column on user_context

### Phase 3
- `src/app/onboarding/components/MadLibsProfileStep.tsx` — New component (replaces AboutYouStep)
- `src/app/onboarding/components/MadLibsField.tsx` — Reusable inline-edit blank component

### Phase 4
- `src/app/onboarding/components/OnboardingWizard.tsx` — Reorder steps, remove ClientsStep, lazy load

---

## Phase 3 Implementation Prompt (for next Claude Code session)

The following prompt is designed to be copy-pasted into a new Claude Code session to implement Phase 3 of the onboarding overhaul.

```
You are working on the IdeaBox app (Next.js 14 App Router, TypeScript, Supabase, Tailwind).
Your task is Phase 3 of the onboarding overhaul: Build the "Mad Libs" Profile Card.
Read plan.md for full context, and read docs/ARCHITECTURE.md and docs/DATABASE_SCHEMA.md
to understand the codebase. Make sure to have great logging for troubleshooting and excellent
comments. At the end update all documentation too.

## Target User
Solopreneur, 1-3 Gmail accounts (personal / day job / side business). Busy, impatient.
50-500 Google contacts. Moderate email volume.

## Problem
The current "About You" onboarding step (AboutYouStep.tsx) is a boring form with text
inputs. Users abandon it or provide minimal info. Phase 2 built an AI-powered endpoint
(POST /api/onboarding/profile-suggestions) that analyzes the user's sent emails and
returns role, company, industry, projects, priorities, and work hours — all with
confidence scores. But nothing consumes these suggestions yet.

## Goal
Replace the "About You" step with an interactive "Mad Libs" fill-in-the-blank card
that pre-fills AI suggestions and lets users confirm/edit them conversationally.

## What the Mad Libs Card Looks Like

```
I'm a [__freelance designer__] working on [__my own__].

Right now I'm focused on [__landing new clients__] and [__finishing my portfolio site__].

I usually work [__Mon-Fri__], [__9am__] to [__5pm__].

The people I care most about hearing from:
  [sarah@bigclient.co ×] [mike@agency.com ×] [+ add]
```

Each blank is an inline editable field. AI-suggested values appear pre-filled with a
subtle "AI" indicator. Empty blanks pulse gently to invite interaction.

## Architecture

### Phase 2 Recap (Already Built)
- `POST /api/onboarding/profile-suggestions` returns `ProfileSuggestions` type
  (defined in `src/types/database.ts`)
- Response includes: role, company, industry, workHours, projects, priorities
- Each field has `{ value, confidence, source }` or null
- Work hours have `{ start, end, days, confidence, source }`
- Cached in user_context.profile_suggestions for 1 hour
- Endpoint returns empty suggestions gracefully if no emails synced

### New Files to Create

**1. `src/app/onboarding/components/MadLibsProfileStep.tsx`** — Main component

This replaces AboutYouStep as the profile collection step.

Responsibilities:
- On mount, call `POST /api/onboarding/profile-suggestions` to get AI suggestions
- Render the Mad Libs card with pre-filled blanks from suggestions
- Handle inline editing of each field
- On "Looks good!" click, save confirmed values to user_context via
  `updateUserContext()` (existing function in user-context-service.ts)
- Support "Skip for now" — all fields are optional

Props (same interface as AboutYouStep for drop-in replacement):
```typescript
interface MadLibsProfileStepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}
```

State management:
```typescript
// Fetched AI suggestions
const [suggestions, setSuggestions] = useState<ProfileSuggestions | null>(null);
const [loading, setLoading] = useState(true);

// User-editable values (initialized from suggestions)
const [role, setRole] = useState('');
const [company, setCompany] = useState('');
const [priorities, setPriorities] = useState<string[]>([]);
const [workStart, setWorkStart] = useState('09:00');
const [workEnd, setWorkEnd] = useState('17:00');
const [workDays, setWorkDays] = useState<number[]>([1,2,3,4,5]);
const [vipEmails, setVipEmails] = useState<string[]>([]);

// Track which fields the user has edited (vs AI-suggested)
const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
```

Loading state:
- While fetching suggestions, show a skeleton/shimmer version of the card
- Use the card shape itself as the skeleton (blanks appear as shimmer bars)
- If suggestions return empty (no emails synced), blanks appear empty but
  the card is still interactive

**2. `src/app/onboarding/components/MadLibsField.tsx`** — Reusable blank component

A generic inline-editable "blank" that renders in two modes:
- **Display mode**: Shows value as styled underlined text (or empty pulse if no value)
- **Edit mode**: Shows an inline input (text, select, or chip list)

```typescript
interface MadLibsFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Whether this value came from AI suggestions */
  isAiSuggested?: boolean;
  /** Confidence score from AI (shown as visual indicator) */
  confidence?: number;
  /** Field type determines the edit UI */
  type?: 'text' | 'time' | 'days' | 'chips';
  /** For chips type: the list of items */
  chipValues?: string[];
  onChipAdd?: (value: string) => void;
  onChipRemove?: (value: string) => void;
}
```

Visual behavior:
- Underlined text that looks like a fill-in-the-blank
- Small "✨" or "AI" badge next to AI-suggested values (only show if isAiSuggested
  and user hasn't edited yet)
- Click → transitions to inline input with a subtle animation
- Press Enter or blur → saves and transitions back to display mode
- Empty fields show placeholder text with a gentle pulse animation
- High-confidence AI values (>0.8) appear slightly bolder/more prominent
- Low-confidence values (<0.3) appear with a "?" or lighter styling

### Files to Modify

**3. `src/app/onboarding/components/OnboardingWizard.tsx`** — Wire up new step

Replace the AboutYouStep import and usage with MadLibsProfileStep:
- Change import from AboutYouStep to MadLibsProfileStep
- Update the step definition: id stays 'about-you' for now (less disruption)
- Pass the same props (user, onNext, onBack)

**4. `src/app/onboarding/components/AboutYouStep.tsx`** — Deprecate

Add a comment at the top noting this is deprecated and replaced by MadLibsProfileStep.
Don't delete it yet (in case we need to revert).

## VIP Contacts Handling

The VIP chips section should show contacts that were selected in the previous
VIP Contacts step. During onboarding, VIPs are already saved to the contacts table
(is_vip = true). Query them:

```typescript
const { data: vips } = await supabase
  .from('contacts')
  .select('email, name')
  .eq('user_id', userId)
  .eq('is_vip', true);
```

Show these as pre-filled chips. User can add more or remove existing ones.

## Saving Confirmed Values

When user clicks "Looks good!", save ONLY the fields that have values:

```typescript
import { updateUserContext } from '@/services/user-context/user-context-service';

await updateUserContext(userId, {
  role: role || null,
  company: company || null,
  priorities: priorities.length > 0 ? priorities : undefined,
  work_hours_start: workStart,
  work_hours_end: workEnd,
  work_days: workDays,
  vip_emails: vipEmails.length > 0 ? vipEmails : undefined,
});
```

This writes to the REAL user_context fields (not profile_suggestions). Once confirmed,
these values are used by all AI analyzers for personalized email processing.

## UI/UX Requirements

- **Card-like layout**: The Mad Libs card should feel like a greeting card or letter,
  not a form. White card with subtle shadow, generous padding, readable font size.
- **Sentence flow**: The blanks are embedded in natural English sentences. Reading
  the card should feel like reading a short bio paragraph.
- **Tailwind styling**: Use Tailwind classes. The blank underlines can be done with
  `border-b-2 border-dashed` in display mode.
- **AI indicator**: Small sparkle icon (✨ from Lucide's Sparkles) next to AI-filled
  values. Disappears when user edits.
- **Responsive**: Card should work on mobile (stack to single column if needed).
- **Loading skeleton**: While fetching suggestions, show shimmer/skeleton that matches
  the final card shape.
- **Transitions**: Use subtle CSS transitions for edit mode toggle (not jarring).

## Edge Cases

1. **No suggestions available**: All blanks appear empty. Card is still usable.
2. **Partial suggestions**: Some fields filled, others empty. Mix of AI and manual.
3. **User clears an AI-suggested value**: Blank returns to empty state, AI indicator gone.
4. **Multiple priorities**: Show as comma-separated in the sentence, click to edit as chips.
5. **Work days display**: Show as "Mon-Fri" (abbreviated), click to toggle individual days.
6. **Skip button**: Always visible. Saves nothing, advances to next step.

## Existing Patterns to Follow

- **Component style**: Look at existing onboarding components in
  `src/app/onboarding/components/` for the pattern (props interface, logger, etc.)
- **Logging**: Use `createLogger('MadLibsProfileStep')` from `@/lib/utils/logger`
- **API calls**: Use fetch with proper error handling (see other onboarding steps)
- **UI components**: Import from `@/components/ui` (Button, Badge, Input, Label)
- **Icons**: Use Lucide React icons (`lucide-react`)
- **Auth**: The `user` prop provides `user.id` for API calls

## Verification

After implementing, verify:

**Happy path (user with AI suggestions):**
1. Navigate to onboarding, reach the profile step
2. Card loads with AI-suggested values in the blanks
3. AI indicators (sparkle) visible next to pre-filled values
4. Click a blank → inline editor appears
5. Edit value, press Enter → value updates, AI indicator disappears
6. Click "Looks good!" → values saved to user_context
7. Advancing to next step works

**Edge case (no suggestions):**
1. User hasn't synced emails yet
2. Card loads with all empty blanks (pulsing placeholders)
3. User can manually fill in values
4. "Looks good!" saves manual values

**Edge case (skip):**
1. User clicks "Skip for now"
2. No values saved
3. Next step loads correctly

## Files to Create
- `src/app/onboarding/components/MadLibsProfileStep.tsx`
- `src/app/onboarding/components/MadLibsField.tsx`

## Files to Modify
- `src/app/onboarding/components/OnboardingWizard.tsx` — swap AboutYouStep for MadLibsProfileStep
- `src/app/onboarding/components/AboutYouStep.tsx` — add deprecation comment
- `docs/ARCHITECTURE.md` — document the new components
- `plan.md` — mark Phase 3 as done

Commit your work with clear messages and push to your branch when done.
```
