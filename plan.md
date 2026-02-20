# Onboarding Overhaul Plan

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

## Proposed Changes

### Phase 1: Fix Contacts Import (Make it actually work)

**1a. Fix VIP Suggestions to include imported contacts**
- In `contact-service.ts` fallback query: add `OR is_google_starred = true` alongside
  the `email_count >= 3` filter
- Prioritize starred contacts above frequency-based suggestions
- Add suggestion reasons: "Starred in Google Contacts", "Frequent + Starred"

**1b. Check contacts scope upfront**
- In `ContactImportStep`, check `hasContactsPermission` on load (already fetched from
  vip-suggestions API)
- If no permission: show a clear "Grant Access" card explaining what it does, instead of
  silently failing on import click and then redirecting
- If permission already granted: show "Import" button directly

**1c. Pre-populate from contacts scope on return**
- After OAuth return with `scope_added=true`, auto-import fires (already fixed), then
  reload suggestions with a brief "Importing your contacts..." status indicator
- Show imported contacts immediately since the fix in 1a will make them visible

### Phase 2: AI-Powered Profile Autofill

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

**2b. Run this after the initial sync fires (background)**
- Since we now fire the initial sync in the background on wizard completion,
  this can also run as a follow-up
- Or: run it earlier (after Accounts step) on a small sample of sent emails
  to have suggestions ready by the time the user reaches "About You"

### Phase 3: "Mad Libs" Profile Card

Replace the current AboutYouStep form with an interactive fill-in-the-blank card.

**Concept:**
```
I'm a [__Product Manager__] at [__Acme Corp__] in the [__SaaS__] industry.

My top priorities right now are [__Q1 launch__] and [__hiring__].

I typically work [__Mon-Fri__], [__9am__] to [__6pm__].

The people I care most about hearing from:
  [john@acme.com ×] [sarah@client.co ×] [+ add]
```

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
| company | AI from email domain/sig | "at [___]" |
| industry | AI inference | "in the [___] industry" |
| priorities | Manual (with AI suggestions) | "My priorities are [___] and [___]" |
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

## Implementation Order

1. **Phase 1** (fix what's broken): Fix VIP suggestions query, improve contacts
   permission UX, ensure imported contacts actually appear
2. **Phase 3** (highest UX impact): Build the Mad Libs card component, wire up to
   existing user_context fields, pre-populate VIPs from previous step
3. **Phase 2** (AI autofill): Build the profile-suggestions API to power the Mad Libs
   defaults. This can be done incrementally — start with role/company extraction, add
   work hours and projects later.
4. **Phase 4** (step reorder): Reorder steps and remove Clients step. This is the
   final polish once the new components are working.

---

## Files Affected

### Phase 1
- `src/services/contacts/contact-service.ts` — Fix VIP suggestions query
- `src/app/onboarding/components/ContactImportStep.tsx` — Improve permission UX

### Phase 2
- `src/app/api/onboarding/profile-suggestions/route.ts` — New endpoint
- `src/services/onboarding/profile-analyzer.ts` — New service (or extend existing)

### Phase 3
- `src/app/onboarding/components/MadLibsProfileStep.tsx` — New component (replaces AboutYouStep)
- `src/app/onboarding/components/MadLibsField.tsx` — Reusable inline-edit blank component

### Phase 4
- `src/app/onboarding/components/OnboardingWizard.tsx` — Reorder steps, remove ClientsStep
