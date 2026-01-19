# Enhanced Email Intelligence - Next Steps

> **Last Updated:** January 19, 2026
>
> **Status:** Phases B & C Complete - User Context Service & Email Processor Integration

This document tracks the remaining implementation work for the Enhanced Email Intelligence feature.

---

## ✅ Completed Work

### Phase A: Foundation (COMPLETE)

1. **Database Migrations** ✅
   - `011_user_context.sql` - User preferences table
   - `012_contacts.sql` - Contact tracking with enrichment
   - `013_extracted_dates.sql` - Timeline dates storage
   - ⚠️ **ACTION NEEDED:** Run migrations on production

2. **Type System** ✅
   - `EmailLabel` type with 27 secondary labels
   - `DateType` for extracted dates
   - `ContactRelationshipType` for contact relationships
   - `UserContext` type with all foundational fields

3. **Analyzers** ✅
   - `DateExtractorAnalyzer` - Extracts deadlines, payments, birthdays, etc.
   - `ContactEnricherAnalyzer` - Extracts contact info from signatures
   - Updated `CategorizerAnalyzer` - Now includes summary, quickAction, labels

4. **Config** ✅
   - `config/analyzers.ts` updated with new analyzer configs

### Phase B: User Context Service (COMPLETE ✅)

1. **User Context Service** ✅
   - Location: `src/services/user-context/user-context-service.ts`
   - Features:
     - In-memory cache with 5-minute TTL
     - `getUserContext()` - Get context for AI analysis (cached)
     - `getUserContextRow()` - Get raw database row (for APIs)
     - `updateUserContext()` - Update context fields
     - `createUserContext()` - Create new context record
     - `advanceOnboardingStep()` - Track onboarding progress
     - `completeOnboarding()` - Mark onboarding complete
     - `isVipEmail()` - Check if email is from VIP
     - `isLocalEvent()` - Check if location is local
     - Cache management functions

2. **User Context API Endpoints** ✅
   - `GET /api/user/context` - Fetch user context
   - `PUT /api/user/context` - Update user context
   - `POST /api/user/context/onboarding` - Advance onboarding step

3. **Validation Schemas** ✅
   - `userContextUpdateSchema` - Validates context updates
   - `userContextOnboardingSchema` - Validates onboarding step data

### Phase C: Email Processor Integration (COMPLETE ✅)

1. **Updated Email Processor** ✅
   - Location: `src/services/processors/email-processor.ts`
   - Version: 2.0.0
   - Changes:
     - Integrated `getUserContext()` in Phase 0
     - Added `DateExtractor` to core analyzers (Phase 1)
     - Added `ContactEnricher` as selective analyzer (Phase 2)
     - Added `saveExtractedDates()` to persist dates
     - Added `updateContactEnrichment()` to persist contact data
     - Automatic contact upsert for all processed emails
     - Full error logging and graceful degradation

---

## 🔄 Remaining Work

### Priority 1: Run Migrations (BLOCKING)

**⚠️ CRITICAL:** Apply database migrations before testing new features.

```bash
# Option 1: Push migrations to Supabase
npx supabase db push

# Option 2: Run migrations directly
npx supabase migration up

# Option 3: Apply migrations manually via SQL console
# Copy content from each migration file in order (011, 012, 013)
```

**Files to apply:**
- `supabase/migrations/011_user_context.sql`
- `supabase/migrations/012_contacts.sql`
- `supabase/migrations/013_extracted_dates.sql`

### Priority 2: Create Onboarding Flow UI

**Effort:** Large (Primary UI work remaining)

Build the 7-step onboarding wizard for collecting user context.

**Files to create:**
```
src/app/onboarding/context/page.tsx  (or update existing wizard)
src/components/onboarding/
├── RoleStep.tsx           # Step 1: Role & Company
├── PrioritiesStep.tsx     # Step 2: Priorities (drag to reorder)
├── ProjectsStep.tsx       # Step 3: Active projects
├── VIPsStep.tsx           # Step 4: VIP contacts
├── LocationStep.tsx       # Step 5: City/metro area
├── InterestsStep.tsx      # Step 6: Topics of interest
├── WorkHoursStep.tsx      # Step 7: Work schedule
└── OnboardingWizard.tsx   # Wrapper with progress bar
```

**API to use:**
```typescript
// Save each step's data
POST /api/user/context/onboarding
{
  "step": 1,
  "data": {
    "role": "Developer",
    "company": "Acme Corp"
  }
}
```

### Priority 3: Create Remaining API Endpoints

**Effort:** Medium

**Contacts API** (`src/app/api/contacts/`):
- `GET /api/contacts` - List contacts with stats and pagination
- `GET /api/contacts/:id` - Get contact details
- `PUT /api/contacts/:id` - Update contact (VIP, mute, relationship type)
- `POST /api/contacts/:id/enrich` - Trigger manual AI enrichment

**Extracted Dates API** (`src/app/api/dates/`):
- `GET /api/dates` - Get upcoming dates (with filters for type, date range)
- `POST /api/dates/:id/acknowledge` - Mark date as handled
- `POST /api/dates/:id/snooze` - Snooze date
- `POST /api/dates/:id/hide` - Hide date

### Priority 4: Update Hub Priority Service

**Effort:** Medium

**File:** `src/services/hub/hub-priority-service.ts`

**Changes needed:**
1. Query `extracted_dates` table for upcoming deadlines
2. Factor dates into priority scoring
3. Surface deadline-related items in "Next 3-5 Things" view
4. Add birthday/anniversary alerts

### Priority 5: Backfill Contacts

**Effort:** Small

Create a script or admin endpoint to backfill contacts for existing users.

**Option A: Run SQL directly**
```sql
SELECT backfill_contacts_from_emails('user-uuid-here');
```

**Option B: Create admin endpoint**
```
POST /api/admin/backfill-contacts
{ "user_id": "..." }
```

### Priority 6: Testing

**Unit Tests:**
- `user-context-service.test.ts`
- `email-processor.test.ts` (update for new analyzers)

**Integration Tests:**
- User context API endpoints
- Onboarding flow
- Date extraction → database persistence
- Contact enrichment → database persistence

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Email Processing Flow                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Email Received                                                    │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────┐                                              │
│   │ Load UserContext│──────────────────────────────┐               │
│   │ (cached 5min)   │                              │               │
│   └────────┬────────┘                              │               │
│            │                                        │               │
│            ▼                                        ▼               │
│   ┌─────────────────┐                    ┌─────────────────┐       │
│   │ Upsert Contact  │                    │ Pass to         │       │
│   │ for Sender      │                    │ Analyzers       │       │
│   └────────┬────────┘                    └────────┬────────┘       │
│            │                                      │                │
│            ▼                                      ▼                │
│   ┌─────────────────────────────────────────────────────────┐     │
│   │              PHASE 1: Core Analyzers (Parallel)          │     │
│   ├─────────────────────────────────────────────────────────┤     │
│   │ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │     │
│   │ │  Categorizer  │ │    Action     │ │    Client     │   │     │
│   │ │  + summary    │ │   Extractor   │ │    Tagger     │   │     │
│   │ │  + labels     │ │               │ │               │   │     │
│   │ └───────────────┘ └───────────────┘ └───────────────┘   │     │
│   │ ┌───────────────┐                                       │     │
│   │ │     Date      │                                       │     │
│   │ │   Extractor   │                                       │     │
│   │ └───────────────┘                                       │     │
│   └─────────────────────────────────────────────────────────┘     │
│            │                                                       │
│            ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐     │
│   │            PHASE 2: Conditional Analyzers                │     │
│   ├─────────────────────────────────────────────────────────┤     │
│   │ ┌───────────────┐ ┌───────────────┐                     │     │
│   │ │    Event      │ │   Contact     │                     │     │
│   │ │   Detector    │ │   Enricher    │                     │     │
│   │ │ (if event)    │ │ (if needed)   │                     │     │
│   │ └───────────────┘ └───────────────┘                     │     │
│   └─────────────────────────────────────────────────────────┘     │
│            │                                                       │
│            ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐     │
│   │                  PHASE 3: Persistence                    │     │
│   ├─────────────────────────────────────────────────────────┤     │
│   │ • Save to email_analyses table                          │     │
│   │ • Save extracted dates to extracted_dates table         │     │
│   │ • Update email category                                 │     │
│   │ • Link to client if matched                            │     │
│   │ • Update contact enrichment data                        │     │
│   │ • Create action record if detected                      │     │
│   └─────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Reference

### New Files (Phase B & C)

| File | Purpose |
|------|---------|
| `src/services/user-context/user-context-service.ts` | User context service with caching |
| `src/services/user-context/index.ts` | Barrel export |
| `src/app/api/user/context/route.ts` | GET/PUT user context |
| `src/app/api/user/context/onboarding/route.ts` | POST onboarding step |
| `src/lib/api/schemas.ts` | Added userContextUpdateSchema, userContextOnboardingSchema |

### Modified Files

| File | Changes |
|------|---------|
| `src/services/processors/email-processor.ts` | v2.0.0 - Full analyzer integration |
| `src/services/index.ts` | Added user-context export |

### Existing Files (Reference)

| File | Purpose |
|------|---------|
| `src/services/analyzers/date-extractor.ts` | Date extraction analyzer |
| `src/services/analyzers/contact-enricher.ts` | Contact enrichment analyzer |
| `src/services/analyzers/categorizer.ts` | Updated with summary, labels |
| `supabase/migrations/011_user_context.sql` | User context table |
| `supabase/migrations/012_contacts.sql` | Contacts table |
| `supabase/migrations/013_extracted_dates.sql` | Extracted dates table |

---

## Notes for Next Developer

### Key Design Decisions

1. **User Context Cache**: 5-minute TTL in-memory cache. Consider Redis for multi-instance deployments.

2. **Contact Enrichment**: Only runs when `shouldEnrichContact()` returns true (3+ emails, low confidence, or stale data).

3. **Date Extraction**: Always runs on every email. Dates are deduplicated by (email_id, date_type, date, title).

4. **Error Handling**: Individual analyzer failures don't stop the pipeline. Partial results are saved.

5. **Database Constraints**: The `extracted_dates` table has a unique constraint for deduplication. Upserts ignore duplicates.

### Potential Issues

1. **TypeScript Types**: Supabase types may not be generated for new tables. Use `@ts-nocheck` temporarily if needed.

2. **Contact Upsert Function**: The `upsert_contact_from_email` RPC function must exist in the database (created in migration 012).

3. **Date Parsing**: Relative dates ("next Friday") are parsed by the AI. Timezone-aware parsing may need refinement.

### Quick Verification Steps

```bash
# 1. Check migrations are applied
npx supabase db diff

# 2. Verify tables exist
# (run in Supabase SQL console)
SELECT * FROM user_context LIMIT 1;
SELECT * FROM contacts LIMIT 1;
SELECT * FROM extracted_dates LIMIT 1;

# 3. Test user context API
curl -X GET /api/user/context

# 4. Test email processing
# (trigger a sync or use the /discover page)
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

Contact the previous developer or check:
- `docs/ENHANCED_EMAIL_INTELLIGENCE.md` - Full feature documentation
- `docs/IMPLEMENTATION_STATUS.md` - Implementation history
- Git history for this branch
