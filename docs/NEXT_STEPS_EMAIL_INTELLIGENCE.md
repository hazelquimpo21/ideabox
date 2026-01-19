# Next Steps: Enhanced Email Intelligence

This document provides instructions for the next developer continuing the Enhanced Email Intelligence implementation.

## What's Been Completed

### 1. Documentation
- [x] `docs/ENHANCED_EMAIL_INTELLIGENCE.md` - Full implementation spec

### 2. Database Migrations
- [x] `supabase/migrations/011_user_context.sql` - User foundational info for personalized AI
- [x] `supabase/migrations/012_contacts.sql` - Auto-populated contact intelligence
- [x] `supabase/migrations/013_extracted_dates.sql` - Timeline data for Hub

### 3. Type System Updates
- [x] `src/services/analyzers/types.ts` - Added:
  - `EmailLabel` type and `EMAIL_LABELS` constant (28 labels)
  - `DateType` and `DATE_TYPES` constant (11 date types)
  - `ContactRelationshipType` and `RELATIONSHIP_TYPES` constant
  - `ExtractedDate`, `DateExtractionData`, `DateExtractionResult`
  - `ContactEnrichmentData`, `ContactEnrichmentResult`
  - Enhanced `UserContext` with foundational fields
  - Updated `CategorizationData` with `labels: EmailLabel[]`
  - Updated `AggregatedAnalysis` with new analyzer results

### 4. Analyzer Config
- [x] `src/config/analyzers.ts` - Added configs for:
  - `dateExtractor` - Timeline date extraction
  - `contactEnricher` - Contact metadata extraction

### 5. Analyzers
- [x] `src/services/analyzers/categorizer.ts` - Updated with:
  - Multi-label support (0-5 labels per email)
  - User context injection for personalized labeling (VIPs, location, family)
  - `buildSystemPrompt()` function for context-aware prompts
- [x] `src/services/analyzers/date-extractor.ts` - NEW: Extracts timeline dates
- [x] `src/services/analyzers/contact-enricher.ts` - NEW: Extracts contact metadata
- [x] `src/services/analyzers/index.ts` - Updated exports

---

## What Needs To Be Done

### Priority 1: Run Migrations

```bash
# Apply the new migrations to your Supabase instance
npx supabase db push

# Or if using migration files directly
npx supabase migration up
```

### Priority 2: Create User Context Service

Create `src/services/user-context/user-context-service.ts`:

```typescript
// Service to fetch and cache user context for analyzer prompts

import { createServerClient } from '@/lib/supabase/server';
import type { UserContext } from '@/services/analyzers';

export async function getUserContext(userId: string): Promise<UserContext> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('user_context')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { userId }; // Return minimal context
  }

  return {
    userId,
    role: data.role,
    company: data.company,
    locationCity: data.location_city,
    locationMetro: data.location_metro,
    priorities: data.priorities,
    projects: data.projects,
    vipEmails: data.vip_emails,
    vipDomains: data.vip_domains,
    interests: data.interests,
    familyContext: data.family_context,
    workHours: {
      start: data.work_hours_start,
      end: data.work_hours_end,
      days: data.work_days,
    },
    timezone: 'America/Chicago', // TODO: Add to user_context table
    onboardingCompleted: data.onboarding_completed,
  };
}
```

### Priority 3: Update Email Processor

Update `src/services/processors/email-processor.ts` to:

1. Fetch user context before running analyzers
2. Pass context to categorizer's `analyze()` method
3. Run DateExtractor analyzer
4. Run ContactEnricher selectively
5. Save extracted dates to `extracted_dates` table
6. Update contact stats in `contacts` table

```typescript
// Pseudo-code for email processing pipeline

async function processEmail(email: Email, userId: string) {
  // 1. Get user context for personalized analysis
  const context = await getUserContext(userId);

  // 2. Run categorizer with context (enables VIP detection, local events, etc.)
  const categorizationResult = await categorizer.analyze(emailInput, context);

  // 3. Run date extractor (always runs)
  const dateResult = await dateExtractor.analyze(emailInput, context);

  // 4. Save extracted dates
  if (dateResult.success && dateResult.data.hasDates) {
    await saveExtractedDates(userId, email.id, dateResult.data.dates);
  }

  // 5. Update/create contact
  const contact = await upsertContact(userId, email.sender_email, email.sender_name);

  // 6. Run contact enricher (selective)
  if (shouldEnrichContact(contact)) {
    const enrichResult = await contactEnricher.analyze(emailInput);
    if (enrichResult.success && enrichResult.data.hasEnrichment) {
      await updateContactEnrichment(contact.id, enrichResult.data);
    }
  }

  // ... rest of processing
}
```

### Priority 4: Update Hub Priority Service

Update `src/services/hub/hub-priority-service.ts` to:

1. Fetch from `extracted_dates` table
2. Include dates in the priority scoring
3. Surface birthdays, deadlines, payments in "Next 3-5 Things"

```typescript
// Add to getTopPriorityItems function

// Fetch upcoming dates
const upcomingDates = await supabase.rpc('get_upcoming_dates', {
  p_user_id: userId,
  p_days_ahead: 7,
  p_limit: 10,
});

// Convert dates to HubPriorityItem format
for (const date of upcomingDates) {
  scoredItems.push({
    id: `date-${date.id}`,
    type: mapDateTypeToHubType(date.date_type), // 'deadline' | 'birthday' | etc.
    title: date.title,
    description: date.description,
    priorityScore: calculateDateScore(date),
    // ... etc
  });
}
```

### Priority 5: Create Onboarding Flow

Build the onboarding wizard UI (7 steps):

1. Role & Company selection
2. Priorities multi-select
3. Projects input
4. VIP contacts input
5. Location input
6. Interests multi-select
7. Work hours selection

Location: `src/app/onboarding/page.tsx` and `src/components/onboarding/`

### Priority 6: Backfill Contacts

Run the backfill function for existing users:

```sql
-- Run for each user
SELECT backfill_contacts_from_emails('user-uuid-here');
```

Or create an admin endpoint/script to backfill all users.

---

## API Endpoints To Create

### User Context
```
GET    /api/user/context              - Get user's context
PUT    /api/user/context              - Update context
POST   /api/user/context/onboarding   - Complete onboarding step
```

### Contacts
```
GET    /api/contacts                  - List contacts with stats
GET    /api/contacts/:id              - Get contact details
PUT    /api/contacts/:id              - Update contact (VIP, mute, etc.)
POST   /api/contacts/:id/enrich       - Trigger AI enrichment
```

### Extracted Dates
```
GET    /api/dates                     - Get upcoming dates
POST   /api/dates/:id/acknowledge     - Mark date as handled
POST   /api/dates/:id/snooze          - Snooze date
POST   /api/dates/:id/hide            - Hide date
```

---

## Testing Checklist

### Unit Tests
- [ ] Categorizer label extraction
- [ ] DateExtractor date parsing
- [ ] ContactEnricher signature detection
- [ ] Hub scoring with new data sources

### Integration Tests
- [ ] Full email processing with new analyzers
- [ ] User context injection into prompts
- [ ] Contact auto-population
- [ ] Date extraction → Hub display

### Manual Testing
1. Send yourself an email with a deadline → verify it appears in Hub
2. Add a VIP email in onboarding → verify emails get `from_vip` label
3. Check contact list for email frequency stats
4. Trigger contact enrichment → verify company/title extraction

---

## Files Modified

```
src/services/analyzers/
├── types.ts                    # Major additions
├── categorizer.ts              # Labels + context
├── date-extractor.ts           # NEW
├── contact-enricher.ts         # NEW
└── index.ts                    # Updated exports

src/config/
└── analyzers.ts                # New analyzer configs

supabase/migrations/
├── 011_user_context.sql        # NEW
├── 012_contacts.sql            # NEW
└── 013_extracted_dates.sql     # NEW

docs/
├── ENHANCED_EMAIL_INTELLIGENCE.md  # NEW - Full spec
└── NEXT_STEPS_EMAIL_INTELLIGENCE.md # NEW - This file
```

---

## Cost Impact

The new analyzers add minimal cost:

| Change | Impact |
|--------|--------|
| Labels in categorizer | +50 tokens/email (~$0.00001) |
| DateExtractor | +400 tokens/email (~$0.00012) |
| ContactEnricher | +500 tokens/email, but runs on ~5% of emails |

**Estimated total increase: ~$0.0001/email** (from ~$0.0005 to ~$0.0006)

---

## Questions?

If you have questions about the implementation:

1. Check `docs/ENHANCED_EMAIL_INTELLIGENCE.md` for the full spec
2. Check the analyzer source files for detailed comments
3. Review the SQL migrations for table structure details

The system is designed to be incrementally deployable - you can enable features one at a time.
