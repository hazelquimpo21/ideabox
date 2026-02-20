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

### Phase 3: "Mad Libs" Profile Card ✅ DONE (Feb 2026)

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

### Phase 3 ✅ DONE
- `src/app/onboarding/components/MadLibsProfileStep.tsx` — New component (replaces AboutYouStep)
- `src/app/onboarding/components/MadLibsField.tsx` — Reusable inline-edit blank component
- `src/app/onboarding/components/OnboardingWizard.tsx` — Swapped AboutYouStep → MadLibsProfileStep
- `src/app/onboarding/components/AboutYouStep.tsx` — Deprecated (kept for rollback)

### Phase 4
- `src/app/onboarding/components/OnboardingWizard.tsx` — Reorder steps, remove ClientsStep, lazy load

---

## Phase 3 Implementation Prompt ✅ DONE

Phase 3 has been implemented. See the commit on `claude/build-profile-card-QqeOq`.

---

## Phase 4 Implementation Prompt (for next Claude Code session)

The following prompt is designed to be copy-pasted into a new Claude Code session to implement Phase 4 of the onboarding overhaul.

```
You are working on the IdeaBox app (Next.js 14 App Router, TypeScript, Supabase, Tailwind).
Your task is Phase 4 of the onboarding overhaul: Streamline the Step Order.
Read plan.md for full context, and read docs/ARCHITECTURE.md and docs/DATABASE_SCHEMA.md
to understand the codebase. Make sure to have great logging for troubleshooting and excellent
comments. At the end update all documentation too.

## Target User

Solopreneur, 1-3 Gmail accounts (personal / day job / side business). Busy, impatient.
50-500 Google contacts. Moderate email volume.

## Problem

The current onboarding wizard has 6 steps in a suboptimal order:

  1. Welcome → 2. Accounts → 3. Sync Config → 4. Clients → 5. VIP Contacts → 6. About You

Issues:
- **Clients step is redundant**: Clients are better detected automatically by the
  ClientTaggerAnalyzer from email patterns. Manual client entry during onboarding is
  tedious and adds friction for solopreneurs who may not think in "clients" terms.
- **VIP Contacts is too late**: It should come right after Accounts so the user's VIP
  selections can seed the Mad Libs Profile step.
- **Sync Config should be last**: It's the "let's get started" moment — configure how
  much to analyze, then click "Finish" and launch the initial sync.
- **All 6 step components are eagerly imported**: User only sees one step at a time,
  so steps 3+ should be lazy loaded to reduce the initial bundle.

## Goal

Reorder to 5 steps, remove Clients, add lazy loading:

  1. Welcome → 2. Accounts → 3. VIP Contacts → 4. Mad Libs Profile → 5. Sync Config

Net effect: 6 steps → 5 steps, less manual entry, more intelligence, faster load.

## Architecture

### Phases 1-3 Recap (Already Built)
- **Phase 1**: Fixed contacts import (batch upserts, parallel multi-account, VIP suggestions)
- **Phase 2**: Built `POST /api/onboarding/profile-suggestions` (AI profile extraction from
  sent emails, statistical work hours inference, cached in user_context.profile_suggestions)
- **Phase 3**: Built MadLibsProfileStep and MadLibsField — interactive "Mad Libs" fill-in-the-blank
  card that replaces AboutYouStep. Pre-fills from Phase 2 AI suggestions. Already wired up
  in OnboardingWizard.tsx at the 'about-you' step ID.

### What Phase 4 Changes

**1. Reorder the STEPS array in OnboardingWizard.tsx**

Current STEPS array:
```typescript
const STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started with IdeaBox' },
  { id: 'accounts', title: 'Accounts', description: 'Connect your Gmail accounts' },
  { id: 'sync-config', title: 'Analysis', description: 'Configure initial email analysis' },
  { id: 'clients', title: 'Clients', description: 'Add your main clients (optional)' },
  { id: 'vip-contacts', title: 'VIP Contacts', description: 'Select your most important contacts (optional)' },
  { id: 'about-you', title: 'About You', description: 'Confirm your AI-generated profile (optional)' },
];
```

New STEPS array (5 steps):
```typescript
const STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', description: 'Get started with IdeaBox' },
  { id: 'accounts', title: 'Accounts', description: 'Connect your Gmail accounts' },
  { id: 'vip-contacts', title: 'VIP Contacts', description: 'Select your most important contacts' },
  { id: 'about-you', title: 'About You', description: 'AI-powered profile card' },
  { id: 'sync-config', title: 'Get Started', description: 'Configure and launch email analysis' },
];
```

Key changes:
- Remove 'clients' step entirely
- Move 'vip-contacts' to position 3 (right after accounts)
- Move 'about-you' (MadLibsProfileStep) to position 4
- Move 'sync-config' to position 5 (last step — the "Finish" moment)
- Update the WizardStep type to remove 'clients'
- Remove the 'clients' case from the switch statement
- Remove the ClientsStep import

**2. Update SyncConfigStep to be the final "launch" step**

Since SyncConfig is now the last step, its "Continue" button should say "Finish Setup"
and feel like the natural endpoint. The isLastStep prop already handles this, but verify
the SyncConfigStep renders appropriately as the final step:
- The button text should say "Finish Setup" when isLastStep is true
- Clicking it should trigger onComplete (which fires the initial sync)

**3. Handle OAuth return URL (scope_added=true)**

The current wizard has this logic:
```typescript
if (searchParams.get('scope_added') === 'true') {
  const vipStepIndex = STEPS.findIndex((s) => s.id === 'vip-contacts');
  // Jump to VIP Contacts step
}
```

This still works because 'vip-contacts' still exists, just at a different index.
Verify this logic still works correctly after the reorder.

**4. Add React.lazy() for later steps**

Lazy load steps 3+ (VIP Contacts, Mad Libs Profile, Sync Config) since the user
won't see them until several seconds after page load.

```typescript
import { WelcomeStep } from './WelcomeStep';
import { AccountsStep } from './AccountsStep';

// Lazy load steps the user won't see immediately
const ContactImportStep = React.lazy(() => import('./ContactImportStep'));
const MadLibsProfileStep = React.lazy(() => import('./MadLibsProfileStep'));
const SyncConfigStep = React.lazy(() => import('./SyncConfigStep'));
```

Wrap the step content in `<React.Suspense>` with a loading fallback:
```typescript
<React.Suspense fallback={<StepLoadingFallback />}>
  {renderStepContent()}
</React.Suspense>
```

The StepLoadingFallback should be a simple centered spinner or skeleton that
matches the card dimensions.

IMPORTANT: Ensure each lazy-loaded component has a `default` export. Check:
- ContactImportStep.tsx — needs `export default ContactImportStep`
- MadLibsProfileStep.tsx — already has `export default MadLibsProfileStep`
- SyncConfigStep.tsx — needs `export default SyncConfigStep`

Add default exports to any components that are missing them. Named exports
should remain for backwards compatibility with any existing imports.

**5. Clean up the ClientsStep reference**

- Remove the `import { ClientsStep } from './ClientsStep'` line
- Remove the 'clients' case from the switch statement
- Remove 'clients' from the WizardStep type union
- Do NOT delete ClientsStep.tsx itself — it may be used in Settings or elsewhere.
  Just add a deprecation comment at the top similar to AboutYouStep.tsx.

## Files to Modify

- `src/app/onboarding/components/OnboardingWizard.tsx` — Main changes:
  reorder STEPS, remove clients, add lazy loading, add Suspense wrapper
- `src/app/onboarding/components/ClientsStep.tsx` — Add deprecation comment
- `src/app/onboarding/components/ContactImportStep.tsx` — Ensure default export exists
- `src/app/onboarding/components/SyncConfigStep.tsx` — Ensure default export exists,
  verify "Finish Setup" button text works as last step

## Files to Update (Documentation)

- `docs/ARCHITECTURE.md` — Update step flow comment, mention lazy loading
- `plan.md` — Mark Phase 4 as done

## Existing Patterns to Follow

- **Component style**: Look at existing onboarding components for the pattern
- **Logging**: Use `createLogger('OnboardingWizard')` — already present
- **React.lazy**: Standard React pattern, no special library needed
- **Icons**: Use Lucide React icons (`lucide-react`)

## Edge Cases

1. **OAuth return**: When returning from Google OAuth with scope_added=true, the wizard
   should still jump to the VIP Contacts step. Verify this works after reorder.
2. **Back navigation**: After removing Clients, Back from VIP Contacts should go to
   Accounts. Back from Mad Libs Profile should go to VIP Contacts. Verify the
   goToPreviousStep function works correctly with the new step order.
3. **Lazy load race condition**: If a user somehow navigates very quickly, the Suspense
   fallback should display cleanly. The spinner/skeleton should be visible but brief.
4. **Step indicator**: The step circles at the top should show 5 circles instead of 6.
   Verify the renderStepIndicator function adapts to the shorter STEPS array.

## Verification

After implementing, verify:

**Step order:**
1. Navigate to /onboarding — should see Welcome step (1 of 5)
2. Click Next → Accounts (2 of 5)
3. Click Next → VIP Contacts (3 of 5) — NO Clients step!
4. Click Next → Mad Libs Profile (4 of 5)
5. Click Next → Sync Config (5 of 5) with "Finish Setup" button

**Lazy loading:**
1. Open browser DevTools → Network tab
2. Load onboarding — only WelcomeStep and AccountsStep bundles loaded
3. Navigate forward — ContactImportStep, MadLibsProfileStep, SyncConfigStep
   load on demand

**Back navigation:**
1. From VIP Contacts → Back → should go to Accounts (not Clients)
2. From Mad Libs Profile → Back → should go to VIP Contacts
3. From Sync Config → Back → should go to Mad Libs Profile

**OAuth return:**
1. Return from OAuth with ?scope_added=true
2. Should land on VIP Contacts step (now step 3)

Commit your work with clear messages and push to your branch when done.
```
