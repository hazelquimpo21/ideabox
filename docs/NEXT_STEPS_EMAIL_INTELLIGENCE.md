# Enhanced Email Intelligence - Next Steps

> **Last Updated:** January 19, 2026
>
> **Status:** ✅ COMPLETE - All phases implemented
>
> **Feature Branch:** `claude/plan-email-intelligence-I09HY`

This document tracks the implementation work for the Enhanced Email Intelligence feature.

---

## ✅ Completed Work Summary

| Phase | Component | Status |
|-------|-----------|--------|
| A | Database Migrations | ✅ Created (011-013) |
| B | User Context Service | ✅ Complete |
| C | Email Processor Integration | ✅ Complete |
| D | Onboarding UI & APIs | ✅ Complete |
| P1 | Run Migrations | ⚠️ **Manual step required** |
| P2 | Hub Priority Service Update | ✅ Complete |
| P3 | Contact Backfill Endpoint | ✅ Complete |
| P4 | Test Suite | ✅ Complete |
| P5 | UI Pages (Contacts, Timeline) | ✅ **Complete (this session)** |

---

## 🆕 Work Completed This Session (January 19, 2026)

### Priority 2: Hub Priority Service Update ✅ COMPLETE

**File:** `src/services/hub/hub-priority-service.ts`

**Changes Made:**
1. Added `extracted_date` to `HubItemType` union
2. Added `extractedDatesConsidered` to stats
3. Added `dateTypeWeights` configuration:
   - deadline: 1.6, payment_due: 1.5, expiration: 1.4, appointment: 1.3
   - follow_up: 1.2, event: 1.1, birthday: 1.0, anniversary: 0.9
   - reminder: 0.8, recurring: 0.7, other: 0.6
4. Added `extractedDateBaseWeight: 13` (between actions=15 and events=12)
5. Added `fetchExtractedDateCandidates()` function with:
   - Date range filtering (today + 7 days)
   - Acknowledged/hidden/snoozed filtering
   - Full error logging and graceful degradation
6. Added `scoreExtractedDate()` function with:
   - Date type weight application
   - Deadline proximity multipliers (overdue, critical, urgent, etc.)
   - Recurring item reduction (0.85x)
   - Low confidence reduction (0.9x for confidence < 0.7)
7. Added date-type-specific importance reasons:
   - `extractedDeadline()`, `paymentDue()`, `birthday()`, `anniversary()`
   - `expiration()`, `appointment()`, `followUp()`, `genericDate()`
8. Added `mapDateTypeToSuggestedAction()` helper
9. Full integration with main `getTopPriorityItems()` function

**Lines added:** ~400 lines with comprehensive documentation

### Priority 3: Contact Backfill ✅ COMPLETE

**New Files Created:**

1. **Admin API Endpoint:**
   - `src/app/api/admin/backfill-contacts/route.ts`
   - POST endpoint to trigger backfill for authenticated user
   - GET endpoint returns usage instructions
   - Full authentication and authorization
   - Calls `backfill_contacts_from_emails` database function
   - Comprehensive error handling and logging

2. **One-Time Script:**
   - `scripts/backfill-contacts.ts`
   - Run with: `npx tsx scripts/backfill-contacts.ts`
   - Options: `--user-id=<uuid>`, `--dry-run`, `--help`
   - Requires `SUPABASE_SERVICE_ROLE_KEY` environment variable
   - Progress logging and summary output

### Priority 4: Test Suite ✅ COMPLETE

**New Test Files Created:**

1. **Hub Priority Service Tests:**
   - `src/services/hub/__tests__/hub-priority-service.test.ts`
   - Tests for:
     - Configuration validation (date type weights)
     - `getTopPriorityItems()` function
     - Extracted dates in stats
     - Error handling (graceful degradation)
     - Time/day context helpers
     - Extracted date scoring (overdue, deadlines, birthdays)
     - Recurring item scoring
     - Low confidence scoring
     - Suggested action mapping

2. **Backfill Contacts API Tests:**
   - `src/app/api/admin/backfill-contacts/__tests__/route.test.ts`
   - Tests for:
     - GET handler (usage instructions)
     - Authentication (401 errors)
     - Authorization (403 for other users)
     - Successful backfill
     - Database errors
     - Malformed JSON handling
     - Response format validation

---

## ⚠️ BLOCKING: Run Database Migrations

**This must be done before testing any new features!**

```bash
# Option 1: Push migrations to Supabase
npx supabase db push

# Option 2: Run migrations directly
npx supabase migration up

# Option 3: Apply manually via SQL console (in order!)
# 1. supabase/migrations/011_user_context.sql
# 2. supabase/migrations/012_contacts.sql
# 3. supabase/migrations/013_extracted_dates.sql
```

**Verify tables exist:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_context', 'contacts', 'extracted_dates');
```

---

## ✅ Priority 5 - UI Pages COMPLETE (This Session)

### Contacts Page ✅

**File created:** `src/app/(auth)/contacts/page.tsx` (~550 lines)

**Components implemented:**
1. ✅ `useContacts` hook in `src/hooks/useContacts.ts` (~500 lines)
2. ✅ Contact types in `src/hooks/useContacts.ts`
3. ✅ Page features:
   - List contacts with search/filter (VIP, muted, relationship type)
   - VIP badges (star icon) with toggle
   - Muted badges (volume icon) with toggle
   - Email count and last contact date
   - Quick actions: Mark as VIP, Mute, View emails
   - Relationship type display
   - Debounced search
   - Sorting by email count, last seen, or name

### Timeline Page ✅

**File created:** `src/app/(auth)/timeline/page.tsx` (~650 lines)

**Components implemented:**
1. ✅ `useExtractedDates` hook in `src/hooks/useExtractedDates.ts` (~550 lines)
2. ✅ ExtractedDate types in `src/hooks/useExtractedDates.ts`
3. ✅ Page features:
   - Grouped list view (Overdue, Today, Tomorrow, This Week, Next Week, Later)
   - Filter by date type (deadlines, birthdays, payments, etc.)
   - Color-coded by date type
   - Urgency styling for overdue items
   - Acknowledge, snooze (with presets), and hide actions
   - Link to source email
   - Show/hide done dates toggle
   - Stats banner with overdue count

### Hub Page Enhancement ✅

**File updated:** `src/app/(auth)/hub/page.tsx`

**Changes made:**
1. ✅ Added `extracted_date` to `TYPE_CONFIG` with CalendarClock icon
2. ✅ Updated `StatsBanner` to show extracted dates count
3. ✅ Type: 'extracted_date' now renders correctly in priority cards
4. ✅ Links to timeline view for extracted date items

### Hooks Index Updated ✅

**File updated:** `src/hooks/index.ts`

**New exports:**
- `useContacts`, `Contact`, `ContactRelationshipType`, `ContactStats`
- `useExtractedDates`, `ExtractedDate`, `DateType`, `DateStats`, `GroupedDates`

---

## File Reference - New/Modified Files

### New Files (P5 Session - UI Pages)

| File | Lines | Purpose |
|------|-------|---------|
| `src/hooks/useContacts.ts` | ~500 | Hook for fetching/managing contacts |
| `src/hooks/useExtractedDates.ts` | ~550 | Hook for fetching/managing timeline dates |
| `src/app/(auth)/contacts/page.tsx` | ~550 | Contacts page with VIP/muted management |
| `src/app/(auth)/timeline/page.tsx` | ~650 | Timeline page with date grouping |
| `docs/P5_UI_IMPLEMENTATION_PLAN.md` | ~400 | Implementation plan for P5 |

### Modified Files (P5 Session)

| File | Changes |
|------|---------|
| `src/app/(auth)/hub/page.tsx` | Added extracted_date type, updated StatsBanner |
| `src/hooks/index.ts` | Added exports for useContacts, useExtractedDates |
| `docs/NEXT_STEPS_EMAIL_INTELLIGENCE.md` | Updated to mark P5 complete |

### Previous Session Files

| File | Purpose |
|------|---------|
| `src/app/api/admin/backfill-contacts/route.ts` | Admin endpoint for contact backfill |
| `scripts/backfill-contacts.ts` | CLI script for bulk contact backfill |
| `src/services/hub/__tests__/hub-priority-service.test.ts` | Hub service tests |
| `src/app/api/admin/backfill-contacts/__tests__/route.test.ts` | Backfill API tests |
| `docs/IMPLEMENTATION_PLAN_EMAIL_INTELLIGENCE.md` | Detailed implementation plan |
| `src/services/hub/hub-priority-service.ts` | Added extracted dates integration (~400 lines) |

### Key Existing Files (Reference)

| File | Purpose |
|------|---------|
| `src/services/user-context/user-context-service.ts` | User context service with caching |
| `src/app/api/contacts/route.ts` | GET contacts list |
| `src/app/api/contacts/[id]/route.ts` | GET/PUT/DELETE single contact |
| `src/app/api/dates/route.ts` | GET extracted dates list |
| `src/app/api/dates/[id]/route.ts` | GET/POST/DELETE single date |
| `supabase/migrations/012_contacts.sql` | Contacts table + backfill function |
| `supabase/migrations/013_extracted_dates.sql` | Extracted dates table |

---

## Quick Verification Checklist

After applying migrations, verify the following:

```bash
# 1. Run tests to verify Hub Priority Service
npx vitest run src/services/hub/__tests__/

# 2. Run tests to verify Backfill API
npx vitest run src/app/api/admin/backfill-contacts/__tests__/

# 3. Test backfill endpoint (requires auth)
curl -X GET http://localhost:3000/api/admin/backfill-contacts

# 4. Test contacts API
curl http://localhost:3000/api/contacts

# 5. Test dates API
curl http://localhost:3000/api/dates

# 6. Verify Hub includes extracted dates
curl http://localhost:3000/api/hub/priorities
```

---

## Architecture: Hub Priority Service with Extracted Dates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Hub Priority Service Flow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   getTopPriorityItems(userId)                                               │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              STEP 1: Fetch All Candidates (Parallel)                 │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│   │  │   Emails    │ │   Actions   │ │   Events    │ │ Extracted   │   │   │
│   │  │ (20 limit)  │ │ (15 limit)  │ │ (10 limit)  │ │   Dates     │   │   │
│   │  │             │ │             │ │             │ │ (15 limit)  │   │   │
│   │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│   │  ┌─────────────┐                                                    │   │
│   │  │  Clients    │  (for priority multipliers)                        │   │
│   │  └─────────────┘                                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              STEP 2: Score All Candidates                            │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │  scoreEmail()        - Base: 10, Category boost, Client factor       │   │
│   │  scoreAction()       - Base: 15, Deadline factor, Client factor      │   │
│   │  scoreEvent()        - Base: 12, RSVP boost, Time proximity          │   │
│   │  scoreExtractedDate() - Base: 13, DateType weight, Deadline factor   │   │
│   │                                                                      │   │
│   │  All use:                                                            │   │
│   │  - Deadline multipliers (overdue=3.0, critical=2.5, urgent=2.0)     │   │
│   │  - Staleness multipliers (veryStale=1.4, stale=1.25, aging=1.1)     │   │
│   │  - Time context boost (morning/afternoon/evening)                    │   │
│   │                                                                      │   │
│   │  Extracted Date specific:                                            │   │
│   │  - DateType weights (deadline=1.6, birthday=1.0, etc.)              │   │
│   │  - Recurring reduction (0.85x)                                       │   │
│   │  - Low confidence reduction (0.9x if confidence < 0.7)              │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              STEP 3: Sort & Return Top N                             │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │  Sort by priorityScore (descending)                                  │   │
│   │  Take first N items (default: 3)                                     │   │
│   │  Apply Friday context (boost stale items for week cleanup)           │   │
│   │                                                                      │   │
│   │  Return:                                                             │   │
│   │  {                                                                   │   │
│   │    items: HubPriorityItem[],  // Scored and sorted items            │   │
│   │    stats: {                                                          │   │
│   │      totalCandidates,                                                │   │
│   │      emailsConsidered,                                               │   │
│   │      actionsConsidered,                                              │   │
│   │      eventsConsidered,                                               │   │
│   │      extractedDatesConsidered,  // NEW                               │   │
│   │      processingTimeMs                                                │   │
│   │    },                                                                │   │
│   │    lastUpdated                                                       │   │
│   │  }                                                                   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 What's Next for Future Developers

The Email Intelligence feature is now complete. Here are suggested next priorities:

### High Priority

1. **E2E Testing for New Pages**
   - Test Contacts page filtering, VIP/muted toggles
   - Test Timeline page date grouping, snooze/acknowledge actions
   - Test Hub with extracted dates rendering

2. **Sidebar Navigation Update**
   - Add "Contacts" link to sidebar
   - Add "Timeline" link to sidebar
   - Update category counts to include timeline dates

3. **Performance Optimization**
   - Add caching for contacts list
   - Implement virtual scrolling for large contact lists
   - Profile and optimize timeline date queries

### Medium Priority

4. **Calendar View for Timeline**
   - Add month/week calendar view option
   - Integrate with user's calendar export

5. **Contact Detail Page**
   - Create `/contacts/[id]` page
   - Show email history with contact
   - Editable contact details

6. **Timeline Notifications**
   - Email reminders for upcoming dates
   - Browser push notifications for deadlines

### Low Priority

7. **Contact Merging**
   - Detect duplicate contacts
   - Merge contacts UI

8. **Smart Contact Suggestions**
   - Suggest relationship types based on email patterns
   - Suggest VIP status for frequent contacts

---

## Notes for Next Developer

### Key Design Decisions Made

1. **Extracted Date Scoring:**
   - Base weight of 13 (between actions=15 and events=12)
   - Date types have different weights (deadlines highest, anniversaries lowest)
   - Recurring items are deprioritized (0.85x) since they repeat
   - Low confidence extractions are deprioritized (0.9x)

2. **Error Handling:**
   - Individual scoring failures are logged but don't break the Hub
   - Database errors return empty arrays (graceful degradation)
   - Full error context logged for debugging
   - All hooks use optimistic updates with rollback on error

3. **UI Patterns Used:**
   - Hooks follow `useEmails` pattern for consistency
   - Pages follow `inbox/page.tsx` pattern for consistency
   - Thorough JSDoc comments throughout
   - Comprehensive error logging with `createLogger`

4. **Test Strategy:**
   - Proxy-based chainable mocks for Supabase queries
   - Comprehensive scoring tests for extracted dates
   - Error handling tests for graceful degradation

### Potential Issues to Watch

1. **Extracted Dates Table:** Must exist before Hub can fetch dates. Run migrations!

2. **Date Parsing:** The `scoreExtractedDate` function handles invalid dates gracefully, but logs warnings. Monitor logs for parsing issues.

3. **Supabase OR Filter:** The extracted dates query uses `.or()` for snooze handling. Verify syntax works with your Supabase version.

4. **Type Conflicts:** If TypeScript complains about `HubItemType`, ensure `extracted_date` is in the union type.

5. **Snooze Implementation:** Currently marks as acknowledged with description. Future enhancement could use a proper snooze_until column.

### Cost Impact

No additional AI API costs - the Hub Priority Service, Contacts page, and Timeline page only query the database, they don't call any AI APIs.

---

## Contact

For questions about this implementation:
- Check git history on branch `claude/plan-email-intelligence-I09HY`
- Review `docs/IMPLEMENTATION_PLAN_EMAIL_INTELLIGENCE.md` for detailed code examples
- Review `docs/P5_UI_IMPLEMENTATION_PLAN.md` for UI implementation details
- Review test files for expected behavior
