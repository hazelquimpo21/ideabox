# Implementation Plan: Email Intelligence Next Steps

> **Created:** January 19, 2026
> **Status:** Planning Document for Remaining Work
> **Branch:** `claude/plan-email-intelligence-JXEnb`

This document provides a detailed, actionable implementation plan for completing the Enhanced Email Intelligence feature based on `NEXT_STEPS_EMAIL_INTELLIGENCE.md`.

---

## Executive Summary

### Current State (Completed)
- ✅ Phase A: Database migrations created (011-013)
- ✅ Phase B: User context service with caching
- ✅ Phase C: Email processor integration
- ✅ Phase D: 7-step onboarding wizard + Contacts/Dates APIs

### Remaining Work (5 Priorities)
| Priority | Task | Effort | Status |
|----------|------|--------|--------|
| P1 | Run Database Migrations | Small | **BLOCKING** |
| P2 | Update Hub Priority Service | Medium | Ready |
| P3 | Backfill Contacts | Small | Ready |
| P4 | Testing | Medium | Ready |
| P5 | UI Enhancements (Optional) | Large | Optional |

---

## Priority 1: Run Database Migrations (BLOCKING)

### What
Apply the three new database migrations to create the `user_context`, `contacts`, and `extracted_dates` tables.

### Why This is Blocking
All other features depend on these tables existing in the database. The APIs and services are already written but will fail without the schema.

### Files to Apply
```
supabase/migrations/011_user_context.sql
supabase/migrations/012_contacts.sql
supabase/migrations/013_extracted_dates.sql
```

### Implementation Steps

1. **Check current migration status**
   ```bash
   npx supabase db diff
   ```

2. **Option A: Push to Supabase (Recommended)**
   ```bash
   npx supabase db push
   ```

3. **Option B: Run migrations directly**
   ```bash
   npx supabase migration up
   ```

4. **Option C: Apply manually via SQL console**
   - Go to Supabase Dashboard > SQL Editor
   - Copy and execute each migration file in order (011, 012, 013)

5. **Verify tables exist**
   ```sql
   -- Run in Supabase SQL console
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('user_context', 'contacts', 'extracted_dates');
   ```

### Acceptance Criteria
- [ ] All three tables exist in the database
- [ ] Row Level Security policies are active
- [ ] Helper functions are available (e.g., `upsert_contact_from_email`, `get_upcoming_dates`)
- [ ] Triggers for `updated_at` are working

---

## Priority 2: Update Hub Priority Service

### What
Enhance the Hub Priority Service (`src/services/hub/hub-priority-service.ts`) to incorporate extracted dates into the "Next 3-5 Things" prioritization.

### Why
The Hub is the centerpiece of IdeaBox - it needs to surface deadlines, birthdays, payments due, and other date-based items from the `extracted_dates` table.

### Current State Analysis
The existing `hub-priority-service.ts` (944 lines) already:
- Fetches emails, actions, and events as candidates
- Calculates composite priority scores
- Generates "why important" explanations

It's missing:
- Extracted dates as a candidate source
- Date-type-specific scoring (deadlines vs birthdays)
- Integration with the `extracted_dates` table

### Implementation Steps

#### Step 2.1: Add ExtractedDate Type and Candidate Interface

**File:** `src/services/hub/hub-priority-service.ts`

```typescript
// Add to HubItemType union
export type HubItemType = 'email' | 'action' | 'event' | 'extracted_date';

// Add new candidate interface
interface ExtractedDateCandidate {
  id: string;
  date_type: string;
  date: string;
  time: string | null;
  title: string;
  description: string | null;
  priority_score: number;
  email_id: string | null;
  contact_id: string | null;
  is_recurring: boolean;
  related_entity: string | null;
}
```

#### Step 2.2: Add Date Type Scoring Configuration

**Add to `HUB_SCORING_CONFIG`:**

```typescript
// Date type weights (some dates are more urgent than others)
dateTypeWeights: {
  deadline: 1.6,        // Deadlines are critical
  payment_due: 1.5,     // Financial obligations
  expiration: 1.4,      // Time-sensitive
  appointment: 1.3,     // Scheduled commitments
  event: 1.2,           // General events
  follow_up: 1.1,       // Suggested follow-ups
  birthday: 1.0,        // Nice to know, but not urgent
  anniversary: 0.9,     // Lower urgency
  reminder: 0.8,        // General reminders
  recurring: 0.7,       // Recurring items are less urgent individually
  other: 0.6,
},

// Fetch limit for extracted dates
fetchLimits: {
  // ... existing limits
  extractedDates: 15,
},
```

#### Step 2.3: Implement fetchExtractedDateCandidates Function

```typescript
async function fetchExtractedDateCandidates(
  supabase: any,
  userId: string
): Promise<ExtractedDateCandidate[]> {
  // Get dates within the next 7 days
  const today = new Date();
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const { data, error } = await supabase
    .from('extracted_dates')
    .select(`
      id, date_type, date, time, title, description,
      priority_score, email_id, contact_id, is_recurring, related_entity
    `)
    .eq('user_id', userId)
    .eq('is_acknowledged', false)
    .eq('is_hidden', false)
    .or('snoozed_until.is.null,snoozed_until.lte.' + new Date().toISOString())
    .gte('date', today.toISOString().split('T')[0])
    .lte('date', weekFromNow.toISOString().split('T')[0])
    .order('date', { ascending: true })
    .limit(HUB_SCORING_CONFIG.fetchLimits.extractedDates);

  if (error) {
    logger.warn('Failed to fetch extracted date candidates', { error: error.message });
    return [];
  }

  return data || [];
}
```

#### Step 2.4: Implement scoreExtractedDate Function

```typescript
function scoreExtractedDate(
  extractedDate: ExtractedDateCandidate,
  now: Date,
  timeContext: 'morning' | 'afternoon' | 'evening'
): HubPriorityItem {
  const config = HUB_SCORING_CONFIG;

  // Base score
  let baseScore = 12; // Similar to events

  // Date type weight
  const dateTypeWeight = config.dateTypeWeights[extractedDate.date_type as keyof typeof config.dateTypeWeights] ?? 1.0;
  baseScore *= dateTypeWeight;

  // Calculate hours until date
  const dateTime = new Date(
    extractedDate.date + (extractedDate.time ? `T${extractedDate.time}` : 'T09:00:00')
  );
  const hoursUntil = (dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Deadline factor
  let deadlineFactor = config.deadlineMultipliers.normal;
  let timeRemaining: string | undefined;

  if (hoursUntil < 0) {
    deadlineFactor = config.deadlineMultipliers.overdue;
    timeRemaining = 'Overdue!';
  } else if (hoursUntil < 4) {
    deadlineFactor = config.deadlineMultipliers.critical;
    timeRemaining = `${Math.ceil(hoursUntil)} hours`;
  } else if (hoursUntil < 24) {
    deadlineFactor = config.deadlineMultipliers.urgent;
    timeRemaining = `${Math.ceil(hoursUntil)} hours`;
  } else if (hoursUntil < 48) {
    deadlineFactor = config.deadlineMultipliers.soon;
    timeRemaining = 'Tomorrow';
  } else if (hoursUntil < 72) {
    deadlineFactor = config.deadlineMultipliers.approaching;
    timeRemaining = `${Math.round(hoursUntil / 24)} days`;
  } else {
    timeRemaining = `${Math.round(hoursUntil / 24)} days`;
  }

  // Recurring items get slight reduction
  if (extractedDate.is_recurring) {
    baseScore *= 0.85;
  }

  // Time context
  const timeBoost = config.timeContextBoosts[timeContext].event;

  // Composite score
  const rawScore = baseScore * deadlineFactor * timeBoost;
  const priorityScore = Math.min(config.maxScore, Math.round(rawScore * 4));

  // Generate "why important" based on date type
  let whyImportant: string;
  switch (extractedDate.date_type) {
    case 'deadline':
      whyImportant = hoursUntil < 24
        ? IMPORTANCE_REASONS.deadlineUrgent(hoursUntil)
        : IMPORTANCE_REASONS.deadlineSoon(hoursUntil / 24);
      break;
    case 'payment_due':
      whyImportant = `Payment due ${timeRemaining} - avoid late fees.`;
      break;
    case 'birthday':
      whyImportant = `${extractedDate.related_entity || 'Someone'}'s birthday ${timeRemaining} - don't forget!`;
      break;
    case 'expiration':
      whyImportant = `Expires ${timeRemaining} - take action before it's too late.`;
      break;
    case 'appointment':
      whyImportant = `Appointment ${timeRemaining} - prepare accordingly.`;
      break;
    default:
      whyImportant = `Upcoming ${extractedDate.date_type}: ${timeRemaining}`;
  }

  return {
    id: `date-${extractedDate.id}`,
    type: 'extracted_date',
    title: extractedDate.title,
    description: extractedDate.description || '',
    whyImportant,
    suggestedAction: mapDateTypeToAction(extractedDate.date_type),
    priorityScore,
    scoreFactors: {
      base: baseScore,
      deadline: deadlineFactor,
      client: 1.0, // No client factor for dates
      staleness: 1.0,
      momentum: 1.0,
    },
    deadline: dateTime.toISOString(),
    timeRemaining,
    originalId: extractedDate.id,
    href: `/timeline?date=${extractedDate.id}`,
    date: extractedDate.date,
  };
}

function mapDateTypeToAction(dateType: string): HubPriorityItem['suggestedAction'] {
  switch (dateType) {
    case 'deadline':
    case 'payment_due':
      return 'decide';
    case 'appointment':
    case 'event':
      return 'attend';
    case 'follow_up':
      return 'respond';
    default:
      return 'review';
  }
}
```

#### Step 2.5: Update getTopPriorityItems Function

**Modify the Promise.all to include extracted dates:**

```typescript
const [emailCandidates, actionCandidates, eventCandidates, extractedDateCandidates, clientMap] =
  await Promise.all([
    fetchEmailCandidates(supabase, userId),
    fetchActionCandidates(supabase, userId),
    fetchEventCandidates(supabase, userId),
    fetchExtractedDateCandidates(supabase, userId),
    fetchClientMap(supabase, userId),
  ]);

const stats = {
  // ... existing stats
  extractedDatesConsidered: extractedDateCandidates.length,
};

// Score extracted dates
for (const extractedDate of extractedDateCandidates) {
  const scored = scoreExtractedDate(extractedDate, now, actualTimeContext);
  if (scored.priorityScore > 0) {
    scoredItems.push(scored);
  }
}
```

### Acceptance Criteria
- [ ] Extracted dates appear in Hub priority items
- [ ] Deadlines are scored higher than birthdays
- [ ] Overdue items have highest priority
- [ ] "Why important" messages are date-type-specific
- [ ] Date items link to `/timeline` view

---

## Priority 3: Backfill Contacts

### What
Create a mechanism to populate the `contacts` table from existing email data for users who signed up before this feature existed.

### Why
Existing users have email history but no contacts. The contact intelligence features won't work without this data.

### Implementation Options

#### Option A: Admin API Endpoint (Recommended)

**File:** `src/app/api/admin/backfill-contacts/route.ts`

```typescript
/**
 * Admin endpoint to backfill contacts from existing emails.
 *
 * POST /api/admin/backfill-contacts
 * Body: { "userId": "uuid" } or {} for all users
 *
 * @module api/admin/backfill-contacts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('BackfillContacts');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Get authenticated user (must be admin in production)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = body.userId || user.id;

    logger.start('Backfilling contacts', { targetUserId });

    // Call the database function
    const { data, error } = await supabase.rpc('backfill_contacts_from_emails', {
      p_user_id: targetUserId,
    });

    if (error) {
      logger.error('Backfill failed', { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.success('Backfill complete', { contactsCreated: data });

    return NextResponse.json({
      success: true,
      contactsCreated: data,
      message: `Backfilled ${data} contacts for user ${targetUserId}`,
    });
  } catch (error) {
    logger.error('Backfill error', { error: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### Option B: One-Time Script

**File:** `scripts/backfill-contacts.ts`

```typescript
/**
 * One-time script to backfill contacts for all users.
 * Run with: npx tsx scripts/backfill-contacts.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Needs service role for admin operations
);

async function main() {
  console.log('Starting contact backfill...');

  // Get all user IDs
  const { data: users, error: userError } = await supabase
    .from('user_profiles')
    .select('id');

  if (userError) {
    console.error('Failed to fetch users:', userError);
    process.exit(1);
  }

  console.log(`Found ${users.length} users to process`);

  for (const user of users) {
    console.log(`Processing user ${user.id}...`);

    const { data, error } = await supabase.rpc('backfill_contacts_from_emails', {
      p_user_id: user.id,
    });

    if (error) {
      console.error(`Failed for user ${user.id}:`, error.message);
    } else {
      console.log(`  Created/updated ${data} contacts`);
    }
  }

  console.log('Backfill complete!');
}

main();
```

### Acceptance Criteria
- [ ] Endpoint/script can be triggered manually
- [ ] Creates contacts from all email senders
- [ ] Updates email_count, first_seen_at, last_seen_at correctly
- [ ] Handles existing contacts (upsert, not duplicate)
- [ ] Logs progress and results

---

## Priority 4: Testing

### What
Create comprehensive tests for the new services and APIs.

### Test Files to Create

| Test File | Tests For |
|-----------|-----------|
| `src/services/user-context/__tests__/user-context-service.test.ts` | User context service |
| `src/services/processors/__tests__/email-processor.test.ts` | Email processor (update) |
| `src/app/api/contacts/__tests__/contacts-api.test.ts` | Contacts API |
| `src/app/api/dates/__tests__/dates-api.test.ts` | Extracted dates API |

### Test Coverage Targets
- Services: 80%+ coverage
- API routes: 70%+ coverage
- Analyzers: 90%+ coverage

### User Context Service Tests

**File:** `src/services/user-context/__tests__/user-context-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getUserContext,
  getUserContextRow,
  updateUserContext,
  createUserContext,
  advanceOnboardingStep,
  completeOnboarding,
  isVipEmail,
  isLocalEvent,
  invalidateUserContextCache,
} from '../user-context-service';

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: mockUserContext, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ data: mockUserContext, error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({ data: mockUserContext, error: null })),
        })),
      })),
    })),
  })),
}));

const mockUserContext = {
  id: 'ctx-123',
  user_id: 'user-123',
  role: 'Developer',
  company: 'Acme Inc',
  location_city: 'Milwaukee, WI',
  location_metro: 'Milwaukee metro',
  priorities: ['Client work', 'Learning'],
  projects: ['IdeaBox', 'PodcastPipeline'],
  vip_emails: ['boss@company.com'],
  vip_domains: ['@vip-client.com'],
  interests: ['AI', 'TypeScript'],
  onboarding_completed: true,
  onboarding_step: 7,
};

describe('UserContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateUserContextCache('user-123');
  });

  describe('getUserContext', () => {
    it('should return formatted user context', async () => {
      const result = await getUserContext('user-123');
      expect(result).toBeDefined();
      expect(result?.role).toBe('Developer');
    });

    it('should use cache on subsequent calls', async () => {
      await getUserContext('user-123');
      await getUserContext('user-123');
      // Verify Supabase was only called once
    });
  });

  describe('isVipEmail', () => {
    it('should return true for exact email match', async () => {
      const result = await isVipEmail('user-123', 'boss@company.com');
      expect(result).toBe(true);
    });

    it('should return true for domain match', async () => {
      const result = await isVipEmail('user-123', 'anyone@vip-client.com');
      expect(result).toBe(true);
    });

    it('should return false for non-VIP email', async () => {
      const result = await isVipEmail('user-123', 'random@example.com');
      expect(result).toBe(false);
    });
  });

  describe('isLocalEvent', () => {
    it('should return true for exact city match', async () => {
      const result = await isLocalEvent('user-123', 'Milwaukee, WI');
      expect(result).toBe(true);
    });

    it('should return true for metro area match', async () => {
      const result = await isLocalEvent('user-123', 'Event in Milwaukee metro area');
      expect(result).toBe(true);
    });

    it('should return false for different location', async () => {
      const result = await isLocalEvent('user-123', 'New York, NY');
      expect(result).toBe(false);
    });
  });

  describe('advanceOnboardingStep', () => {
    it('should update step and save step data', async () => {
      const result = await advanceOnboardingStep('user-123', 2, { role: 'Manager' });
      expect(result).toBe(true);
    });
  });

  describe('completeOnboarding', () => {
    it('should mark onboarding as complete', async () => {
      const result = await completeOnboarding('user-123');
      expect(result).toBe(true);
    });
  });
});
```

### Contacts API Tests

**File:** `src/app/api/contacts/__tests__/contacts-api.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { GET as GET_SINGLE, PUT, DELETE } from '../[id]/route';
import { NextRequest } from 'next/server';

describe('Contacts API', () => {
  describe('GET /api/contacts', () => {
    it('should return paginated contacts list', async () => {
      const request = new NextRequest('http://localhost/api/contacts');
      const response = await GET(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('contacts');
      expect(Array.isArray(data.contacts)).toBe(true);
    });

    it('should filter by VIP status', async () => {
      const request = new NextRequest('http://localhost/api/contacts?isVip=true');
      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should search by name or email', async () => {
      const request = new NextRequest('http://localhost/api/contacts?search=john');
      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('PUT /api/contacts/:id', () => {
    it('should update contact VIP status', async () => {
      const request = new NextRequest('http://localhost/api/contacts/123', {
        method: 'PUT',
        body: JSON.stringify({ is_vip: true }),
      });
      const response = await PUT(request, { params: { id: '123' } });
      expect(response.status).toBe(200);
    });

    it('should update relationship type', async () => {
      const request = new NextRequest('http://localhost/api/contacts/123', {
        method: 'PUT',
        body: JSON.stringify({ relationship_type: 'client' }),
      });
      const response = await PUT(request, { params: { id: '123' } });
      expect(response.status).toBe(200);
    });
  });
});
```

### Integration Tests

**File:** `tests/integration/onboarding-flow.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Onboarding Flow Integration', () => {
  it('should complete all 7 onboarding steps', async () => {
    // Step 1: Role & Company
    // Step 2: Priorities
    // Step 3: Projects
    // Step 4: VIPs
    // Step 5: Location
    // Step 6: Interests
    // Step 7: Work Hours
    // Verify user_context is populated correctly
  });

  it('should handle skip on optional steps', async () => {
    // Some steps can be skipped
    // Verify default values are used
  });

  it('should persist data incrementally', async () => {
    // Data should be saved after each step
    // If user closes browser, progress is not lost
  });
});
```

### Acceptance Criteria
- [ ] All test files created
- [ ] 80%+ coverage on user-context-service
- [ ] 70%+ coverage on API routes
- [ ] Tests pass in CI pipeline

---

## Priority 5: UI Enhancements (Optional)

### What
Create new pages to surface the contact and date data collected by the system.

### Contacts Page

**File:** `src/app/(auth)/contacts/page.tsx`

**Features:**
- List all contacts with search/filter
- VIP/muted badges
- Email count and last contact date
- Quick actions: Mark as VIP, Mute, View emails
- Relationship type badges (client, colleague, etc.)

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  Contacts                               [Search...] [Filters]│
├─────────────────────────────────────────────────────────────┤
│  VIP (5)   All (127)   Muted (12)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ⭐ John Smith          john@acme.com                │    │
│  │    Client • Acme Corp • 47 emails • Last: 2d ago   │    │
│  │    [View Emails] [Mute]                            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │    Sarah Johnson       sarah@company.com            │    │
│  │    Colleague • 23 emails • Last: 1w ago            │    │
│  │    [View Emails] [Mark VIP] [Mute]                 │    │
│  └─────────────────────────────────────────────────────┘    │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

### Timeline Page

**File:** `src/app/(auth)/timeline/page.tsx`

**Features:**
- Calendar view or list view toggle
- Filter by date type (deadlines, birthdays, payments)
- Acknowledge/snooze/hide actions
- Link to source email
- Upcoming vs past toggle

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  Timeline                    [Calendar | List] [Filters]    │
├─────────────────────────────────────────────────────────────┤
│  TODAY - January 19                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔴 Invoice #1234 due          Payment Due           │    │
│  │    From: billing@vendor.com   [View Email] [Done]   │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  TOMORROW - January 20                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟡 Submit proposal            Deadline              │    │
│  │    Client: Acme Corp          [View Email] [Snooze] │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  NEXT WEEK                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🎂 Sarah's Birthday           Birthday • Jan 25     │    │
│  │                               [Acknowledge]         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Hub Page Update

**File:** `src/app/(auth)/hub/page.tsx` (may need to create)

**Features:**
- "Next 3-5 Things" view using `getTopPriorityItems`
- Cards with priority scores and "why important"
- Quick actions on each item
- Refresh button

### Implementation Order

1. **Contacts Page** - Most useful for contact management
2. **Timeline Page** - Visualizes extracted dates
3. **Hub Page** - The "magic" centerpiece view

### Acceptance Criteria
- [ ] Contacts page renders and functions
- [ ] Timeline page shows extracted dates
- [ ] Hub page uses priority service
- [ ] All pages are mobile responsive
- [ ] Loading and empty states implemented

---

## Implementation Timeline Recommendation

### Phase 1: Foundation (First)
1. ✅ Run database migrations (P1) - Unblocks everything

### Phase 2: Core Functionality (Second)
2. Update Hub Priority Service (P2) - Makes the feature useful
3. Backfill Contacts (P3) - Enables contact intelligence for existing users

### Phase 3: Quality (Third)
4. Testing (P4) - Ensures reliability

### Phase 4: Polish (Last)
5. UI Enhancements (P5) - Nice to have

---

## Risk Considerations

### Migration Risks
- **Risk:** Migration fails on production
- **Mitigation:** Test on staging first, have rollback plan

### Performance Risks
- **Risk:** Hub query becomes slow with many extracted dates
- **Mitigation:** The `idx_extracted_dates_hub` index is designed for this query; monitor query times

### Data Risks
- **Risk:** Contact backfill creates duplicates
- **Mitigation:** The `upsert_contact_from_email` function uses ON CONFLICT; verify with small batch first

---

## Questions for Product Decision

1. **Hub item limit:** Should we show 3, 5, or make it configurable?
2. **Birthday visibility:** Should birthdays from contacts appear in Hub by default?
3. **Contact enrichment:** Should we auto-trigger contact enrichment for high-frequency contacts?
4. **Onboarding skip:** Should users be able to skip the entire context onboarding?

---

## Appendix: File Quick Reference

### Existing Files (Reference)
| File | Purpose |
|------|---------|
| `src/services/hub/hub-priority-service.ts` | Hub priority calculations (944 lines) |
| `src/services/user-context/user-context-service.ts` | User context with caching |
| `src/app/api/contacts/route.ts` | Contacts list API |
| `src/app/api/dates/route.ts` | Extracted dates list API |
| `supabase/migrations/011_user_context.sql` | User context table |
| `supabase/migrations/012_contacts.sql` | Contacts table |
| `supabase/migrations/013_extracted_dates.sql` | Extracted dates table |

### Files to Create/Modify
| File | Action | Priority |
|------|--------|----------|
| `src/services/hub/hub-priority-service.ts` | Modify | P2 |
| `src/app/api/admin/backfill-contacts/route.ts` | Create | P3 |
| `scripts/backfill-contacts.ts` | Create | P3 |
| `src/services/user-context/__tests__/` | Create | P4 |
| `src/app/api/contacts/__tests__/` | Create | P4 |
| `src/app/api/dates/__tests__/` | Create | P4 |
| `src/app/(auth)/contacts/page.tsx` | Create | P5 |
| `src/app/(auth)/timeline/page.tsx` | Create | P5 |
| `src/app/(auth)/hub/page.tsx` | Create | P5 |
