You are working on the IdeaBox app (Next.js 14 App Router, TypeScript, Supabase, Tailwind).
Your task is Phase 2 of the onboarding overhaul: Build AI-powered profile autofill.
Read plan.md for full context, and read docs/ARCHITECTURE.md and docs/DATABASE_SCHEMA.md
to understand the codebase. Make sure to have great logging for troubleshooting and excellent
comments. At the end update all documentation too.

## Target User
Solopreneur, 1-3 Gmail accounts (personal / day job / side business). Busy, impatient.
50-500 Google contacts. Moderate email volume.

## Problem
The current "About You" onboarding step makes users manually type their role, company, VIP
emails, and priorities — all cold, with no intelligence applied. The app already has AI
analyzers and can read the user's emails, but it doesn't use any of that during onboarding.
Users abandon the form or provide minimal info, which degrades AI personalization later.

## Goal
Build a `POST /api/onboarding/profile-suggestions` endpoint that analyzes a small sample
of the user's recently synced emails + contacts to extract profile data. This powers the
future "Mad Libs" profile card (Phase 3) with smart defaults.

## What This Endpoint Returns
```typescript
interface ProfileSuggestions {
  /** Detected role/title (e.g., "Freelance Designer", "Product Manager") */
  role: { value: string; confidence: number; source: string } | null;

  /** Detected company (e.g., "Acme Corp", "Self-employed") */
  company: { value: string; confidence: number; source: string } | null;

  /** Detected industry (e.g., "Technology", "Marketing", "Education") */
  industry: { value: string; confidence: number; source: string } | null;

  /** Inferred work hours from email send-time distribution */
  workHours: {
    start: string;   // "09:00"
    end: string;     // "17:00"
    days: number[];  // [1,2,3,4,5] = Mon-Fri
    confidence: number;
    source: string;
  } | null;

  /** Key projects extracted from email subjects + content */
  projects: Array<{
    name: string;
    confidence: number;
    mentionCount: number;
  }>;

  /** Suggested priorities based on email patterns */
  priorities: Array<{
    label: string;
    confidence: number;
  }>;

  /** Overall analysis metadata */
  meta: {
    emailsAnalyzed: number;
    accountsUsed: string[];      // account emails analyzed
    processingTimeMs: number;
    totalTokensUsed: number;
    estimatedCost: number;
  };
}
```

## Architecture

### New Files to Create

**1. `src/services/onboarding/profile-analyzer.ts`** — The core AI analysis service

This is NOT a BaseAnalyzer subclass (those operate on individual emails). This is a
standalone service that:
- Takes a batch of ~10-20 recent sent emails
- Feeds them to GPT-4.1-mini in a single function-calling request
- Extracts profile signals from the corpus

Structure:
```typescript
import { analyzeWithFunction, type FunctionSchema } from '@/lib/ai/openai-client';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('ProfileAnalyzer');

export interface ProfileAnalysisInput {
  userId: string;
  sentEmails: SentEmailSummary[];    // Pre-formatted email summaries
  contacts: ContactSummary[];         // Top contacts with metadata
  accountEmails: string[];            // User's own email addresses
}

interface SentEmailSummary {
  subject: string;
  recipientEmail: string;
  recipientName: string | null;
  date: string;
  snippet: string;             // Just snippet, not full body (save tokens)
  bodySignature?: string;      // Last 500 chars of body (signature area)
}

interface ContactSummary {
  email: string;
  name: string | null;
  emailCount: number;
  isVip: boolean;
  isGoogleStarred: boolean;
  company: string | null;
  relationshipType: string | null;
}

export async function analyzeProfileFromEmails(
  input: ProfileAnalysisInput
): Promise<ProfileSuggestions> { ... }
```

Key implementation details:
- Use `analyzeWithFunction<ProfileSuggestions>()` from `src/lib/ai/openai-client.ts`
- Define a `FunctionSchema` named `extract_user_profile`
- System prompt should instruct GPT-4.1-mini to act as a "professional profile detective"
- Include the user's own email addresses in the prompt so the AI knows which sender is "the user"
- Extract role/title from email signatures (last 500 chars of sent emails)
- Extract company from email domain, signature, or Google Workspace org
- Infer industry from company name + recipient domains + email content patterns
- The AI doesn't need to infer work hours — that's done statistically (see below)

**2. `src/services/onboarding/work-hours-analyzer.ts`** — Statistical work hours inference

This does NOT use AI. It's a pure statistical function:
```typescript
export function inferWorkHours(
  sentEmailDates: Date[]
): { start: string; end: string; days: number[]; confidence: number }
```

Logic:
- Bucket sent email timestamps by hour-of-day (in user's timezone)
- Find the contiguous block of hours that contains 80%+ of emails
- Start = earliest hour in that block, End = latest
- Days = which days of week have >10% of total emails
- Confidence = based on sample size and distribution clarity
- Edge case: if user sends emails 24/7, confidence is low, default to 9-5 Mon-Fri

**3. `src/app/api/onboarding/profile-suggestions/route.ts`** — The API endpoint

```
POST /api/onboarding/profile-suggestions
Body (optional): { maxEmails?: number, accountId?: string }
Returns: ProfileSuggestions
```

Steps:
1. Authenticate user via `requireAuth()`
2. Get user's gmail accounts (all, or specific one if `accountId` provided)
3. For each account, get a valid access token via `TokenManager`
4. Query the database for recent sent emails:
   ```sql
   SELECT id, subject, sender_email, sender_name, recipient_email, date, snippet, body_text
   FROM emails
   WHERE user_id = $1
     AND gmail_labels @> ARRAY['SENT']
   ORDER BY date DESC
   LIMIT 20
   ```
   **Important:** Query the LOCAL database (emails table), not the Gmail API directly.
   Emails should already be synced from the initial sync step.
5. Extract the signature area from each email (last 500 chars of body_text)
6. Get top contacts from the contacts table (top 20 by email_count)
7. Call `analyzeProfileFromEmails()` with the email summaries + contacts
8. Call `inferWorkHours()` with the sent email timestamps
9. Merge AI results + work hours into the `ProfileSuggestions` response
10. Return with appropriate error handling

**Important considerations:**
- The endpoint should be FAST (<5 seconds). It makes ONE AI call with a small payload.
- If no sent emails exist yet (user hasn't synced), return null fields with a message.
- If the initial sync hasn't completed, the endpoint should still work with whatever
  emails are available (even zero — just return empty suggestions).
- Log token usage and cost for monitoring.

### Existing Files to Modify

**4. `src/services/user-context/user-context-service.ts`** — Add method to save AI suggestions

Add a new method:
```typescript
export async function saveProfileSuggestions(
  userId: string,
  suggestions: ProfileSuggestions
): Promise<void>
```

This saves the raw suggestions to a new JSONB column `profile_suggestions` on the
`user_context` table. The Mad Libs step (Phase 3) will read these suggestions and
let the user confirm/edit them before saving to the individual fields.

**DO NOT** auto-save suggestions to `role`, `company`, etc. directly. Those fields
are only written when the user explicitly confirms in the Mad Libs step.

**5. `src/types/database.ts`** — Add the ProfileSuggestions type export

Export the `ProfileSuggestions` interface so it's available to the frontend.

## AI Prompt Design

The system prompt for `extract_user_profile` should be carefully crafted:

```
You are a professional profile detective. Given a set of recently sent emails from a user,
extract their likely professional profile.

ABOUT THE USER:
- Their email addresses: {accountEmails}
- They are likely a solopreneur or small business owner
- They may have multiple roles (day job + side business)

WHAT TO EXTRACT:
1. Role/Title: Look at email signatures, how they introduce themselves, how others address them
2. Company: Look at email domain, signature, letterhead references
3. Industry: Infer from company, email content, recipient types
4. Projects: Recurring project names, client references, deliverable mentions
5. Priorities: What themes dominate their recent email activity

RULES:
- If you find a clear email signature, prioritize that for role and company
- "Self-employed" or "Freelancer" is a valid company if no company is evident
- For solopreneurs, the "company" might be their own name or brand
- Return confidence 0.0-1.0 for each field (1.0 = found in signature, 0.5 = inferred)
- For projects, only return items mentioned 2+ times
- For priorities, suggest 2-4 high-level themes (e.g., "Client acquisition", "Project delivery")
- If you can't determine something, return null — don't guess
```

The function schema should accept the email summaries (subjects, snippets, signatures)
and contact list as structured input.

## Database Migration

Create a migration file `supabase/migrations/029_profile_suggestions.sql`:
```sql
-- Add profile_suggestions JSONB column to user_context
-- Stores AI-generated profile suggestions for the Mad Libs onboarding step
ALTER TABLE user_context ADD COLUMN IF NOT EXISTS
  profile_suggestions JSONB DEFAULT NULL;

-- Add profile_suggestions_generated_at timestamp
ALTER TABLE user_context ADD COLUMN IF NOT EXISTS
  profile_suggestions_generated_at TIMESTAMPTZ DEFAULT NULL;
```

This is a lightweight migration — just two nullable columns.

## Important Context

### Existing Patterns to Follow
- **AI calls:** Use `analyzeWithFunction<T>()` from `src/lib/ai/openai-client.ts`.
  It handles retries, cost tracking, and structured JSON output via function calling.
- **Logging:** Use `createLogger('ServiceName')` from `src/lib/utils/logger.ts`.
  Log at appropriate levels: `logger.info()` for key milestones, `logger.debug()` for
  details, `logger.error()` for failures. Include relevant IDs truncated to 8 chars.
- **Auth:** Use `requireAuth(supabase)` from `src/lib/api/utils` in API routes.
  Returns user object or Response (401).
- **Token management:** Use `new TokenManager(supabase).getValidToken(account)` to get
  a valid OAuth access token for a Gmail account.
- **Database queries:** Use Supabase JS client. No ORM. Type the results.
- **Error handling:** Return partial results on failure. Never throw from API routes.
  Wrap in try/catch and return appropriate HTTP status codes.

### What Already Exists
- `src/services/analyzers/base-analyzer.ts` — Abstract base class for per-email analyzers.
  **Do NOT extend this** for the profile analyzer. It's designed for single-email analysis.
  The profile analyzer works on a batch of emails in one AI call.
- `src/services/user-context/user-context-service.ts` — Has `getUserContext()`,
  `updateUserContext()`, `getUserContextRow()`, cache management. Add the
  `saveProfileSuggestions()` method here.
- `src/services/contacts/contact-service.ts` — Has `getFrequentContacts()` which returns
  top contacts by email count. Use this to get the contact summaries.
- `src/lib/ai/openai-client.ts` — Has `analyzeWithFunction<T>()`,
  `withRetry()`, `truncateBody()`, `FunctionSchema` type.
- `src/config/analyzers.ts` — Has `calculateCost()` and model pricing. Use this for
  cost tracking in the response metadata.
- The `emails` table has a `gmail_labels` column (TEXT[]) — filter sent emails with
  `gmail_labels` containing 'SENT'.

### What Does NOT Exist Yet
- The `profile_suggestions` column on `user_context` — create the migration
- The API route at `/api/onboarding/profile-suggestions` — create it
- The `ProfileAnalyzer` service — create it
- The `WorkHoursAnalyzer` — create it

### User Context Fields (Already in DB)
These exist in `user_context` and will eventually be populated from the suggestions:
- `role TEXT` — User's role/title
- `company TEXT` — User's company
- `industry TEXT` — User's industry
- `priorities TEXT[]` — User's priorities
- `projects TEXT[]` — User's active projects
- `work_hours_start TIME` — Start of work day
- `work_hours_end TIME` — End of work day
- `work_days INTEGER[]` — Work days (1=Mon, 7=Sun)

### The UserContext TypeScript Interface
Located at `src/services/analyzers/types.ts`:
```typescript
export interface UserContext {
  userId: string;
  clients?: Client[];
  timezone?: string;
  role?: string;
  company?: string;
  locationCity?: string;
  locationMetro?: string;
  priorities?: string[];
  projects?: string[];
  vipEmails?: string[];
  vipDomains?: string[];
  interests?: string[];
  familyContext?: { spouseName?: string; kidsCount?: number; familyNames?: string[] };
  workHours?: { start: string; end: string; days: number[] };
}
```

## Performance Constraints
1. **One AI call** — batch all 10-20 emails into a single function-calling request.
   Do NOT call the AI per-email. Target: 2-4 seconds for the AI call.
2. **Snippets, not full bodies** — send subjects, snippets, and signature areas only.
   Full email bodies waste tokens and add latency. Budget: ~2000 tokens input.
3. **Query local DB, not Gmail API** — emails should already be synced. If not, return
   empty suggestions gracefully (don't fetch from Gmail in this endpoint).
4. **Cache-friendly** — store results in `user_context.profile_suggestions` so repeated
   calls don't re-analyze. Return cached results if they exist and are < 1 hour old.

## Edge Cases to Handle
1. **No sent emails:** User just connected accounts but hasn't synced yet. Return null
   fields with `meta.emailsAnalyzed: 0` and a message suggesting they complete the sync.
2. **Only personal email:** User has 1 personal Gmail with no work context. AI should
   still extract what it can (name, interests) and return low confidence for role/company.
3. **Multiple accounts:** Analyze sent emails from ALL accounts. The AI prompt includes
   all the user's email addresses so it knows which sender is "the user."
4. **Signature not found:** If no email signature is detected, confidence for role/company
   should be low (<0.3). Don't fabricate.
5. **AI returns garbage:** Validate the response. If confidence is 0 or fields are
   clearly wrong (e.g., role = "null"), filter them out before returning.
6. **Timezone unknown:** Default to UTC for work hours analysis if user timezone isn't set.
   Use `user_profiles.timezone` if available.

## Verification

After implementing, verify:

**Happy path (user with synced emails):**
1. User has completed initial sync with 50+ emails
2. POST to `/api/onboarding/profile-suggestions` returns suggestions
3. Response includes role, company with confidence scores
4. Work hours are reasonable (not 0:00-23:59)
5. Projects list contains real project names from email subjects
6. `meta` shows reasonable token usage (<5000 tokens) and cost (<$0.01)
7. Repeated call returns cached results (fast, no AI call)

**Edge case (no emails):**
1. User just connected accounts, no sync yet
2. POST returns empty suggestions with `meta.emailsAnalyzed: 0`
3. No AI call made (no tokens used)
4. No error thrown

**Edge case (personal email only):**
1. User has 1 personal Gmail
2. POST returns low-confidence suggestions
3. Role/company may be null
4. Work hours still inferred from send times

## Files to Create
- `src/services/onboarding/profile-analyzer.ts`
- `src/services/onboarding/work-hours-analyzer.ts`
- `src/app/api/onboarding/profile-suggestions/route.ts`
- `supabase/migrations/029_profile_suggestions.sql`

## Files to Modify
- `src/services/user-context/user-context-service.ts` — add `saveProfileSuggestions()`
- `src/types/database.ts` — add ProfileSuggestions type
- `docs/ARCHITECTURE.md` — document the new endpoint and service
- `docs/DATABASE_SCHEMA.md` — document the new columns
- `plan.md` — mark Phase 2 as done

Commit your work with clear messages and push to your branch when done.
