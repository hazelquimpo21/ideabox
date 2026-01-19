# Enhanced Email Intelligence - Next Steps

> **Last Updated:** January 19, 2026
>
> **Status:** Phases B, C, D Complete - Onboarding UI & APIs Implemented

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

### Phase D: Onboarding UI & API Endpoints (COMPLETE ✅ - NEW!)

1. **7-Step User Context Onboarding Wizard** ✅
   - Location: `src/components/onboarding/`
   - Main wizard: `UserContextWizard.tsx`
   - Individual steps:
     - `RoleStep.tsx` - Professional identity (role & company)
     - `PrioritiesStep.tsx` - Priority ordering with drag support
     - `ProjectsStep.tsx` - Active project names
     - `VIPsStep.tsx` - VIP email addresses and domains
     - `LocationStep.tsx` - City and metro area
     - `InterestsStep.tsx` - Topics of interest
     - `WorkHoursStep.tsx` - Work schedule configuration
   - Features:
     - Incremental save after each step
     - Skip option for optional steps
     - Progress indicator
     - Form validation
     - Error handling with toasts

2. **Onboarding Page** ✅
   - Location: `src/app/onboarding/context/page.tsx`
   - Route: `/onboarding/context`
   - Renders UserContextWizard
   - Redirects to `/discover` on completion

3. **Contacts API** ✅
   - Location: `src/app/api/contacts/`
   - Endpoints:
     - `GET /api/contacts` - List with filters (VIP, muted, relationship, search)
     - `GET /api/contacts/[id]` - Get contact details with stats
     - `PUT /api/contacts/[id]` - Update (VIP, muted, relationship, name)
     - `DELETE /api/contacts/[id]` - Delete contact

4. **Extracted Dates API** ✅
   - Location: `src/app/api/dates/`
   - Endpoints:
     - `GET /api/dates` - List with filters (type, date range, acknowledged)
     - `GET /api/dates/[id]` - Get date with related email/contact
     - `POST /api/dates/[id]` - Actions (acknowledge, snooze, hide)
     - `DELETE /api/dates/[id]` - Delete extracted date

5. **API Schemas** ✅
   - Location: `src/lib/api/schemas.ts`
   - Added schemas:
     - `contactRelationshipTypeSchema`
     - `contactQuerySchema`
     - `contactUpdateSchema`
     - `dateTypeSchema`
     - `extractedDatesQuerySchema`
     - `extractedDateActionSchema`

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

### Priority 2: Update Hub Priority Service

**Effort:** Medium

**File:** `src/services/hub/hub-priority-service.ts`

**Changes needed:**
1. Query `extracted_dates` table for upcoming deadlines
2. Factor dates into priority scoring
3. Surface deadline-related items in "Next 3-5 Things" view
4. Add birthday/anniversary alerts

### Priority 3: Backfill Contacts

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

### Priority 4: Testing

**Unit Tests:**
- `user-context-service.test.ts`
- `email-processor.test.ts` (update for new analyzers)
- `contacts-api.test.ts` (NEW)
- `dates-api.test.ts` (NEW)

**Integration Tests:**
- User context API endpoints
- Onboarding flow (7 steps)
- Date extraction → database persistence
- Contact enrichment → database persistence

### Priority 5: UI Enhancements (Optional)

**Contacts Page:**
- Create `src/app/(auth)/contacts/page.tsx`
- Display contacts list with VIP/muted badges
- Allow marking contacts as VIP from UI

**Timeline View:**
- Create `src/app/(auth)/timeline/page.tsx`
- Display extracted dates in calendar/list format
- Allow acknowledging/snoozing from UI

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

### New Files (Phase D - This Session)

| File | Purpose |
|------|---------|
| `src/components/onboarding/RoleStep.tsx` | Step 1: Role & company selection |
| `src/components/onboarding/PrioritiesStep.tsx` | Step 2: Priority ordering |
| `src/components/onboarding/ProjectsStep.tsx` | Step 3: Active projects |
| `src/components/onboarding/VIPsStep.tsx` | Step 4: VIP contacts |
| `src/components/onboarding/LocationStep.tsx` | Step 5: City & metro area |
| `src/components/onboarding/InterestsStep.tsx` | Step 6: Topic interests |
| `src/components/onboarding/WorkHoursStep.tsx` | Step 7: Work schedule |
| `src/components/onboarding/UserContextWizard.tsx` | 7-step wizard orchestrator |
| `src/components/onboarding/index.ts` | Barrel export for components |
| `src/app/onboarding/context/page.tsx` | Onboarding context page |
| `src/app/api/contacts/route.ts` | GET contacts list |
| `src/app/api/contacts/[id]/route.ts` | GET/PUT/DELETE single contact |
| `src/app/api/dates/route.ts` | GET extracted dates list |
| `src/app/api/dates/[id]/route.ts` | GET/POST/DELETE single date |

### Modified Files (This Session)

| File | Changes |
|------|---------|
| `src/lib/api/schemas.ts` | Added contact and date schemas |

### Existing Files (Reference)

| File | Purpose |
|------|---------|
| `src/services/user-context/user-context-service.ts` | User context service with caching |
| `src/services/user-context/index.ts` | Barrel export |
| `src/app/api/user/context/route.ts` | GET/PUT user context |
| `src/app/api/user/context/onboarding/route.ts` | POST onboarding step |
| `src/services/analyzers/date-extractor.ts` | Date extraction analyzer |
| `src/services/analyzers/contact-enricher.ts` | Contact enrichment analyzer |
| `src/services/analyzers/categorizer.ts` | Updated with summary, labels |
| `src/services/processors/email-processor.ts` | v2.0.0 - Full analyzer integration |
| `supabase/migrations/011_user_context.sql` | User context table |
| `supabase/migrations/012_contacts.sql` | Contacts table |
| `supabase/migrations/013_extracted_dates.sql` | Extracted dates table |

---

## API Quick Reference

### User Context
```
GET    /api/user/context              # Fetch user context
PUT    /api/user/context              # Update user context
POST   /api/user/context/onboarding   # Save onboarding step data
```

### Contacts
```
GET    /api/contacts                  # List contacts (filters: isVip, isMuted, relationshipType, search)
GET    /api/contacts/:id              # Get contact details
PUT    /api/contacts/:id              # Update contact (is_vip, is_muted, relationship_type, name)
DELETE /api/contacts/:id              # Delete contact
```

### Extracted Dates
```
GET    /api/dates                     # List dates (filters: type, from, to, isAcknowledged)
GET    /api/dates/:id                 # Get date with related email/contact
POST   /api/dates/:id                 # Action: acknowledge, snooze, hide
DELETE /api/dates/:id                 # Delete extracted date
```

---

## Notes for Next Developer

### Key Design Decisions

1. **User Context Cache**: 5-minute TTL in-memory cache. Consider Redis for multi-instance deployments.

2. **Contact Enrichment**: Only runs when `shouldEnrichContact()` returns true (3+ emails, low confidence, or stale data).

3. **Date Extraction**: Always runs on every email. Dates are deduplicated by (email_id, date_type, date, title).

4. **Error Handling**: Individual analyzer failures don't stop the pipeline. Partial results are saved.

5. **Database Constraints**: The `extracted_dates` table has a unique constraint for deduplication. Upserts ignore duplicates.

6. **Onboarding Wizard**: Data is saved incrementally after each step via POST /api/user/context/onboarding. This ensures data isn't lost if user closes browser.

### Potential Issues

1. **TypeScript Types**: Supabase types may not be generated for new tables. Use `@ts-nocheck` temporarily if needed.

2. **Contact Upsert Function**: The `upsert_contact_from_email` RPC function must exist in the database (created in migration 012).

3. **Date Parsing**: Relative dates ("next Friday") are parsed by the AI. Timezone-aware parsing may need refinement.

4. **Onboarding Route**: The `/onboarding/context` route uses the minimal onboarding layout. Make sure it integrates with the existing onboarding flow.

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

# 4. Test contacts API
curl -X GET /api/contacts

# 5. Test dates API
curl -X GET /api/dates

# 6. Test onboarding wizard
# Navigate to /onboarding/context in browser
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
